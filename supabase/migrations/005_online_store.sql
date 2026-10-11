-- ============================================================
-- 005_online_store.sql — Online Store (public shop page + online orders)
-- ============================================================
-- Run AFTER 001-004 in the Supabase SQL editor. Idempotent: safe to run
-- again. Until this runs, the app shows the Online Store as "being set up"
-- and /s/<slug> answers "shop not found" — nothing else is affected.
--
--   store_shops   one shop per org owner: public slug, on/off, the details
--                 shown on the public page and per-product visibility/photos
--   store_orders  orders placed on the public page. Created ONLY by the
--                 server (/api/store/order, service role) after validating
--                 prices against the products table and rate limiting.
--   storage bucket "store-images" (public read) for product photos / logo;
--                 owners and managers upload into their own folder.
-- Plan gating: Starter+ (shared/modules.js). Writes below the tier are
-- refused by gbp_module_ok(); existing data stays readable.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Module plan helper (also re-declared by 006-008; identical)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gbp_module_ok(p_owner UUID, p_min_tier TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rank FROM public.plan_limits WHERE tier = public.gbp_effective_tier(p_owner)), 0)
      >= COALESCE((SELECT rank FROM public.plan_limits WHERE tier = p_min_tier), 99);
$$;
REVOKE ALL ON FUNCTION public.gbp_module_ok(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gbp_module_ok(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 1. Shops
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_shops (
  owner_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  enabled    BOOLEAN NOT NULL DEFAULT true,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.store_shops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_shops FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_shops TO authenticated;
GRANT ALL ON public.store_shops TO service_role;

DROP POLICY IF EXISTS "Shop: members read" ON public.store_shops;
CREATE POLICY "Shop: members read" ON public.store_shops FOR SELECT TO authenticated
  USING (public.gbp_can_read(owner_id));
DROP POLICY IF EXISTS "Shop: managers insert" ON public.store_shops;
CREATE POLICY "Shop: managers insert" ON public.store_shops FOR INSERT TO authenticated
  WITH CHECK (public.gbp_member_role(owner_id) IN ('owner', 'manager') AND public.gbp_module_ok(owner_id, 'starter'));
DROP POLICY IF EXISTS "Shop: managers update" ON public.store_shops;
CREATE POLICY "Shop: managers update" ON public.store_shops FOR UPDATE TO authenticated
  USING (public.gbp_member_role(owner_id) IN ('owner', 'manager'))
  WITH CHECK (public.gbp_member_role(owner_id) IN ('owner', 'manager') AND public.gbp_module_ok(owner_id, 'starter'));
DROP POLICY IF EXISTS "Shop: managers delete" ON public.store_shops;
CREATE POLICY "Shop: managers delete" ON public.store_shops FOR DELETE TO authenticated
  USING (public.gbp_member_role(owner_id) IN ('owner', 'manager'));

-- ------------------------------------------------------------
-- 2. Online orders
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_no       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'invoiced', 'cancelled')),
  customer_name  TEXT NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 80),
  customer_phone TEXT NOT NULL CHECK (customer_phone ~ '^[0-9]{8,15}$'),
  total          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  data           JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash        TEXT,
  bill_id        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS store_orders_owner_idx ON public.store_orders(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS store_orders_ip_idx ON public.store_orders(ip_hash, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS store_orders_owner_no_uq ON public.store_orders(owner_id, order_no);
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_orders FROM anon;
REVOKE INSERT, TRUNCATE ON public.store_orders FROM authenticated;
GRANT SELECT, UPDATE, DELETE ON public.store_orders TO authenticated;
GRANT ALL ON public.store_orders TO service_role;

DROP POLICY IF EXISTS "Orders: members read" ON public.store_orders;
CREATE POLICY "Orders: members read" ON public.store_orders FOR SELECT TO authenticated
  USING (public.gbp_can_read(owner_id));
DROP POLICY IF EXISTS "Orders: billers update" ON public.store_orders;
CREATE POLICY "Orders: billers update" ON public.store_orders FOR UPDATE TO authenticated
  USING (public.gbp_member_role(owner_id) IN ('owner', 'manager', 'biller'))
  WITH CHECK (public.gbp_member_role(owner_id) IN ('owner', 'manager', 'biller'));
DROP POLICY IF EXISTS "Orders: managers delete" ON public.store_orders;
CREATE POLICY "Orders: managers delete" ON public.store_orders FOR DELETE TO authenticated
  USING (public.gbp_can_delete(owner_id));

-- Members may only change the workflow fields of an order, never what the
-- customer ordered or the amount.
CREATE OR REPLACE FUNCTION public.gbp_store_order_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.owner_id <> OLD.owner_id OR NEW.order_no <> OLD.order_no OR NEW.total <> OLD.total
     OR NEW.customer_name <> OLD.customer_name OR NEW.customer_phone <> OLD.customer_phone
     OR (NEW.data - 'ownerNote') <> (OLD.data - 'ownerNote') OR NEW.created_at <> OLD.created_at
     OR NEW.ip_hash IS DISTINCT FROM OLD.ip_hash THEN
    RAISE EXCEPTION 'order details cannot be changed' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gbp_store_order_guard ON public.store_orders;
CREATE TRIGGER gbp_store_order_guard BEFORE UPDATE ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.gbp_store_order_guard();

-- ------------------------------------------------------------
-- 3. Product photos: public bucket, writes only into the org's own folder
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('store-images', 'store-images', true, 524288, ARRAY['image/jpeg', 'image/png', 'image/webp'])
  ON CONFLICT (id) DO NOTHING;
  EXECUTE 'DROP POLICY IF EXISTS "Store images: managers upload" ON storage.objects';
  EXECUTE $p$CREATE POLICY "Store images: managers upload" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'store-images' AND public.gbp_member_role(public.gbp_try_uuid((storage.foldername(name))[1])) IN ('owner', 'manager'))$p$;
  EXECUTE 'DROP POLICY IF EXISTS "Store images: managers update" ON storage.objects';
  EXECUTE $p$CREATE POLICY "Store images: managers update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'store-images' AND public.gbp_member_role(public.gbp_try_uuid((storage.foldername(name))[1])) IN ('owner', 'manager'))$p$;
  EXECUTE 'DROP POLICY IF EXISTS "Store images: managers delete" ON storage.objects';
  EXECUTE $p$CREATE POLICY "Store images: managers delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'store-images' AND public.gbp_member_role(public.gbp_try_uuid((storage.foldername(name))[1])) IN ('owner', 'manager'))$p$;
END $$;

-- ============================================================
-- Done. Owners open "Online Store" in the app, pick a shop link and share it.
-- ============================================================

-- Slug availability check for the app (does not reveal who owns a slug).
CREATE OR REPLACE FUNCTION public.gbp_store_slug_free(p_slug TEXT, p_owner UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.store_shops WHERE slug = lower(p_slug) AND owner_id <> p_owner);
$$;
REVOKE ALL ON FUNCTION public.gbp_store_slug_free(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gbp_store_slug_free(TEXT, UUID) TO authenticated;
