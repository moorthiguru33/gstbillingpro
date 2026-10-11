-- ============================================================
-- 003_staff_roles.sql — Staff & CA access, activity log, bill share links
-- ============================================================
-- Run AFTER 001 and 002 in the Supabase SQL editor. Idempotent: safe to run
-- again (CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
--
-- Model ("org = owner"):
--   * Every account owns exactly one organisation whose id IS the owner's
--     user id. All business data keeps its existing user_id column (= the
--     org owner), so no data moves and every existing account keeps working
--     unchanged: each existing user becomes owner of their own org.
--   * org_members lists invited / active staff with a role:
--       owner      — everything
--       manager    — everything except managing the plan / owner
--       biller     — create & edit bills, clients, products (POS); no delete,
--                    no reports/settings in the UI
--       accountant — read-only (CA) + GST exports in the UI
--   * Extra permissive RLS policies let members reach the owner's rows
--     according to their role. The original "auth.uid() = user_id" owner
--     policies are untouched.
--   * Staff seats come from plan_limits.staff_users (Pro 2 + owner = 3 users,
--     Business 10). One CA (accountant) login is free on every paid plan
--     (and during the trial); the Free plan has no staff.
--   * activity_log records creates / edits / deletes on business tables.
--   * bill_links: unguessable tokens for the public /b/<token> bill page.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Orgs + members
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orgs (
  owner_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.org_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.orgs(owner_id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT CHECK (email IS NULL OR email = lower(email)),
  phone        TEXT,
  name         TEXT,
  role         TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'biller', 'accountant')),
  status       TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),
  invite_token TEXT UNIQUE CHECK (invite_token IS NULL OR length(invite_token) >= 24),
  invited_by   UUID,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_members_owner_user_uq ON public.org_members(owner_id, user_id) WHERE user_id IS NOT NULL AND status <> 'removed';
CREATE UNIQUE INDEX IF NOT EXISTS org_members_owner_email_uq ON public.org_members(owner_id, email) WHERE email IS NOT NULL AND status <> 'removed';
CREATE INDEX IF NOT EXISTS org_members_user_idx ON public.org_members(user_id) WHERE status = 'active';

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orgs, public.org_members FROM anon, authenticated;
GRANT SELECT ON public.orgs, public.org_members TO authenticated;
GRANT ALL ON public.orgs, public.org_members TO service_role;

-- Every existing account owns its own org (existing data keeps working).
INSERT INTO public.orgs (owner_id, name)
SELECT u.id, NULL FROM auth.users u
ON CONFLICT (owner_id) DO NOTHING;
INSERT INTO public.org_members (owner_id, user_id, email, role, status, accepted_at)
SELECT u.id, u.id, lower(u.email), 'owner', 'active', NOW() FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.owner_id = u.id AND m.user_id = u.id AND m.status <> 'removed');

-- New accounts get their org automatically.
CREATE OR REPLACE FUNCTION public.gbp_create_own_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orgs (owner_id) VALUES (NEW.id) ON CONFLICT (owner_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.org_members WHERE owner_id = NEW.id AND user_id = NEW.id AND status <> 'removed') THEN
    INSERT INTO public.org_members (owner_id, user_id, email, role, status, accepted_at)
    VALUES (NEW.id, NEW.id, lower(NEW.email), 'owner', 'active', NOW());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gbp_on_auth_user_org ON auth.users;
CREATE TRIGGER gbp_on_auth_user_org AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.gbp_create_own_org();

-- ------------------------------------------------------------
-- 2. Role helpers (SECURITY DEFINER so they can read org_members under RLS)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gbp_member_role(p_owner UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR p_owner IS NULL THEN NULL
    WHEN p_owner = auth.uid() THEN 'owner'
    ELSE (SELECT m.role FROM public.org_members m
           WHERE m.owner_id = p_owner AND m.user_id = auth.uid() AND m.status = 'active'
           LIMIT 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_can_read(p_owner UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gbp_member_role(p_owner) IS NOT NULL;
$$;

-- p_table: which table is being written. Billers may write only what billing
-- and the POS need; accountants never write.
CREATE OR REPLACE FUNCTION public.gbp_can_write(p_owner UUID, p_table TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE public.gbp_member_role(p_owner)
    WHEN 'owner' THEN true
    WHEN 'manager' THEN true
    WHEN 'biller' THEN p_table IN ('bills', 'clients', 'products', 'meta', 'receipts')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_can_delete(p_owner UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gbp_member_role(p_owner) IN ('owner', 'manager');
$$;

CREATE OR REPLACE FUNCTION public.gbp_try_uuid(p TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p::UUID;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.gbp_member_role(UUID), public.gbp_can_read(UUID), public.gbp_can_write(UUID, TEXT), public.gbp_can_delete(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gbp_member_role(UUID), public.gbp_can_read(UUID), public.gbp_can_write(UUID, TEXT), public.gbp_can_delete(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gbp_try_uuid(TEXT) TO authenticated, service_role;

-- Members can see their own membership rows; owners/managers see the team.
DROP POLICY IF EXISTS "Members see own memberships" ON public.org_members;
CREATE POLICY "Members see own memberships" ON public.org_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.gbp_member_role(owner_id) IN ('owner', 'manager'));
DROP POLICY IF EXISTS "Members see their orgs" ON public.orgs;
CREATE POLICY "Members see their orgs" ON public.orgs FOR SELECT TO authenticated
  USING (public.gbp_can_read(owner_id));

-- ------------------------------------------------------------
-- 3. Member policies on business tables (in addition to owner policies)
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'bills', 'clients', 'products', 'expenses', 'purchases',
                           'recurring', 'receipts', 'templates', 'business_profiles', 'meta', 'trash']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Org members can view" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Org members can view" ON public.%I FOR SELECT TO authenticated USING (public.gbp_can_read(user_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Org members can insert" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Org members can insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.gbp_can_write(user_id, %L))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Org members can update" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Org members can update" ON public.%I FOR UPDATE TO authenticated USING (public.gbp_can_write(user_id, %L)) WITH CHECK (public.gbp_can_write(user_id, %L))', t, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Org managers can delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Org managers can delete" ON public.%I FOR DELETE TO authenticated USING (public.gbp_can_delete(user_id))', t);
  END LOOP;
END $$;

-- Invoice-number counters: members who may bill can advance the owner's counter.
CREATE OR REPLACE FUNCTION public.increment_meta_counter(
  p_user_id UUID,
  p_key TEXT,
  p_start INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_next INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.gbp_can_write(p_user_id, 'meta') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT (value->>'count')::INTEGER INTO v_current
  FROM public.meta
  WHERE user_id = p_user_id AND key = p_key
  FOR UPDATE;

  IF NOT FOUND OR v_current IS NULL THEN
    v_next := p_start;
  ELSE
    v_next := v_current + 1;
  END IF;

  INSERT INTO public.meta (user_id, key, value)
  VALUES (p_user_id, p_key, jsonb_build_object('count', v_next))
  ON CONFLICT (user_id, key)
  DO UPDATE SET value = jsonb_build_object('count', v_next), updated_at = NOW();

  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_meta_counter(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_meta_counter(UUID, TEXT, INTEGER) TO authenticated;

-- Plan + usage of an org the caller belongs to (staff see the owner's plan).
CREATE OR REPLACE FUNCTION public.org_plan(p_owner UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period TEXT := to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
  v_tier   TEXT;
  v_role   TEXT := public.gbp_member_role(p_owner);
  pl       public.plan_limits%ROWTYPE;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  v_tier := public.gbp_effective_tier(p_owner);
  SELECT * INTO pl FROM public.plan_limits WHERE tier = v_tier;
  RETURN jsonb_build_object(
    'tier', v_tier,
    'role', v_role,
    'period', v_period,
    'invoices_used', COALESCE((SELECT invoices FROM public.usage_counters WHERE user_id = p_owner AND period = v_period), 0),
    'invoice_limit', pl.invoices_per_month,
    'businesses', (SELECT COUNT(*) FROM public.business_profiles WHERE user_id = p_owner),
    'business_limit', pl.businesses,
    'staff_limit', pl.staff_users
  );
END;
$$;
REVOKE ALL ON FUNCTION public.org_plan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_plan(UUID) TO authenticated;

-- Orgs the caller can work in (own org first).
CREATE OR REPLACE FUNCTION public.my_orgs()
RETURNS TABLE (owner_id UUID, role TEXT, business_name TEXT, owner_email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.owner_id, m.role,
         COALESCE(o.name, (SELECT NULLIF(p.business_name, '') FROM public.profiles p WHERE p.user_id = m.owner_id LIMIT 1)),
         (SELECT lower(u.email) FROM auth.users u WHERE u.id = m.owner_id)
    FROM public.org_members m
    LEFT JOIN public.orgs o ON o.owner_id = m.owner_id
   WHERE m.user_id = auth.uid() AND m.status = 'active'
   ORDER BY (m.owner_id = auth.uid()) DESC, m.accepted_at;
$$;
REVOKE ALL ON FUNCTION public.my_orgs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_orgs() TO authenticated;

-- ------------------------------------------------------------
-- 4. Staff seat limits (enforced for every write path, incl. the API)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gbp_staff_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tier  TEXT;
  v_limit INTEGER;
  v_used  INTEGER;
BEGIN
  IF NEW.role = 'owner' OR NEW.status = 'removed' THEN RETURN NEW; END IF;
  -- Only check when a seat is newly taken (insert, re-activation or role change).
  IF TG_OP = 'UPDATE' AND OLD.status <> 'removed' AND OLD.role = NEW.role THEN RETURN NEW; END IF;
  v_tier := public.gbp_effective_tier(NEW.owner_id);
  IF NEW.role = 'accountant' THEN
    IF v_tier = 'free' THEN
      RAISE EXCEPTION 'PLAN_LIMIT_STAFF: CA access needs a paid plan' USING ERRCODE = 'P0001';
    END IF;
    SELECT COUNT(*) INTO v_used FROM public.org_members
     WHERE owner_id = NEW.owner_id AND role = 'accountant' AND status <> 'removed' AND id <> NEW.id;
    IF v_used >= 2 THEN
      RAISE EXCEPTION 'PLAN_LIMIT_STAFF: at most 2 CA logins' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  SELECT COALESCE(staff_users, 0) INTO v_limit FROM public.plan_limits WHERE tier = v_tier;
  SELECT COUNT(*) INTO v_used FROM public.org_members
   WHERE owner_id = NEW.owner_id AND role IN ('manager', 'biller') AND status <> 'removed' AND id <> NEW.id;
  IF v_used >= COALESCE(v_limit, 0) THEN
    RAISE EXCEPTION 'PLAN_LIMIT_STAFF: your plan allows % staff users', COALESCE(v_limit, 0) USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gbp_staff_limit ON public.org_members;
CREATE TRIGGER gbp_staff_limit BEFORE INSERT OR UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.gbp_staff_limit();

-- ------------------------------------------------------------
-- 5. Activity log (who created / edited / deleted what)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
  id          BIGSERIAL PRIMARY KEY,
  owner_id    UUID NOT NULL,
  actor_id    UUID,
  actor_email TEXT,
  action      TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_log_owner_idx ON public.activity_log(owner_id, created_at DESC);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.activity_log FROM anon, authenticated;
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.activity_log_id_seq TO service_role;
DROP POLICY IF EXISTS "Owners and managers read activity" ON public.activity_log;
CREATE POLICY "Owners and managers read activity" ON public.activity_log FOR SELECT TO authenticated
  USING (public.gbp_member_role(owner_id) IN ('owner', 'manager'));

CREATE OR REPLACE FUNCTION public.gbp_log_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j       JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_owner UUID := (j->>'user_id')::UUID;
  v_actor UUID := auth.uid();
  v_act   TEXT := CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END;
BEGIN
  -- Stock-only product updates from billing would flood the log: skip them.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'products'
     AND (to_jsonb(NEW) - 'stock' - 'updated_at' - 'data') = (to_jsonb(OLD) - 'stock' - 'updated_at' - 'data')
     AND (COALESCE(to_jsonb(NEW)->'data', '{}'::jsonb) - 'stock') = (COALESCE(to_jsonb(OLD)->'data', '{}'::jsonb) - 'stock') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.activity_log (owner_id, actor_id, actor_email, action, entity, entity_id, summary)
  VALUES (
    v_owner, v_actor,
    (SELECT lower(u.email) FROM auth.users u WHERE u.id = v_actor),
    v_act, TG_TABLE_NAME, j->>'id',
    left(COALESCE(j->>'invoice_number', j->'data'->>'invoiceNumber', j->>'name', j->'data'->>'name',
                  j->>'client_name', j->'data'->>'description', ''), 120)
  );
  RETURN NULL;
END;
$$;
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bills', 'clients', 'products', 'expenses', 'purchases', 'receipts']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS gbp_activity ON public.%I', t);
    EXECUTE format('CREATE TRIGGER gbp_activity AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.gbp_log_activity()', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6. Shareable bill links (/b/<token>)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bill_links (
  token          TEXT PRIMARY KEY CHECK (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bill_id        TEXT,
  pdf_path       TEXT NOT NULL,
  invoice_number TEXT,
  business_name  TEXT,
  client_name    TEXT,
  amount         NUMERIC(14, 2),
  amount_due     NUMERIC(14, 2),
  currency       TEXT NOT NULL DEFAULT 'INR',
  upi_id         TEXT,
  upi_name       TEXT,
  lang           TEXT,
  created_by     UUID DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  views          INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT bill_links_pdf_in_owner_folder CHECK (split_part(pdf_path, '/', 1) = owner_id::TEXT)
);
CREATE INDEX IF NOT EXISTS bill_links_owner_idx ON public.bill_links(owner_id, created_at DESC);
ALTER TABLE public.bill_links ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, TRUNCATE ON public.bill_links FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.bill_links TO authenticated;
GRANT ALL ON public.bill_links TO service_role;
DROP POLICY IF EXISTS "Members read bill links" ON public.bill_links;
CREATE POLICY "Members read bill links" ON public.bill_links FOR SELECT TO authenticated USING (public.gbp_can_read(owner_id));
DROP POLICY IF EXISTS "Billers create bill links" ON public.bill_links;
CREATE POLICY "Billers create bill links" ON public.bill_links FOR INSERT TO authenticated
  WITH CHECK (public.gbp_can_write(owner_id, 'bills') AND created_by = auth.uid());
DROP POLICY IF EXISTS "Managers delete bill links" ON public.bill_links;
CREATE POLICY "Managers delete bill links" ON public.bill_links FOR DELETE TO authenticated USING (public.gbp_can_delete(owner_id));

-- Storage: the private "invoices" bucket (001) — members may read the owner's
-- folder; billers+ may upload shared bill PDFs into it. Skipped when the
-- storage schema is absent (local test databases).
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false) ON CONFLICT (id) DO NOTHING;
  EXECUTE 'DROP POLICY IF EXISTS "Invoice PDFs: org members can read" ON storage.objects';
  EXECUTE $p$CREATE POLICY "Invoice PDFs: org members can read" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'invoices' AND public.gbp_can_read(public.gbp_try_uuid((storage.foldername(name))[1])))$p$;
  EXECUTE 'DROP POLICY IF EXISTS "Invoice PDFs: billers can upload" ON storage.objects';
  EXECUTE $p$CREATE POLICY "Invoice PDFs: billers can upload" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'invoices' AND public.gbp_can_write(public.gbp_try_uuid((storage.foldername(name))[1]), 'bills'))$p$;
END $$;

-- ============================================================
-- Done. Nothing to configure: existing users are now owners of their own
-- org. Invites are created through /api/staff (service role).
-- ============================================================
