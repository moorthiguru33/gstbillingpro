-- ============================================================
-- 007_accounting.sql — double-entry accounting (ledger behind existing data)
-- ============================================================
-- Run AFTER 006 in the Supabase SQL editor. Idempotent: safe to run again.
-- Until this runs, the app shows Accounting as "being set up".
--
--   acc_accounts  custom ledger accounts (extra bank accounts, expense heads)
--                 and renames of the built-in Indian SME chart; one row with
--                 id '_settings' (kind 'settings') keeps module settings
--   acc_vouchers  journal vouchers. source 'auto' rows are generated from
--                 bills / purchases / expenses / receipts with deterministic
--                 ids (auto:bill:<id> …) so back-fill is idempotent; 'manual'
--                 are journal / payment / receipt / contra / opening
--                 vouchers; 'payroll' are salary postings
-- Plan gating: Pro+ for writes. Access: owner, manager and accountant only
-- (billers do not see the books). user_id = org owner (003 org model).
-- ============================================================

CREATE OR REPLACE FUNCTION public.gbp_module_ok(p_owner UUID, p_min_tier TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rank FROM public.plan_limits WHERE tier = public.gbp_effective_tier(p_owner)), 0)
      >= COALESCE((SELECT rank FROM public.plan_limits WHERE tier = p_min_tier), 99);
$$;
REVOKE ALL ON FUNCTION public.gbp_module_ok(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gbp_module_ok(UUID, TEXT) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.acc_accounts (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'account' CHECK (kind IN ('account', 'settings')),
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.acc_vouchers (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vdate      DATE NOT NULL,
  vtype      TEXT NOT NULL DEFAULT 'journal',
  source     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual', 'payroll')),
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS acc_vouchers_date_idx ON public.acc_vouchers(user_id, vdate);
CREATE INDEX IF NOT EXISTS acc_vouchers_source_idx ON public.acc_vouchers(user_id, source);

CREATE OR REPLACE FUNCTION public.gbp_acc_role(p_owner UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gbp_member_role(p_owner) IN ('owner', 'manager', 'accountant');
$$;
REVOKE ALL ON FUNCTION public.gbp_acc_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gbp_acc_role(UUID) TO authenticated, service_role;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['acc_accounts', 'acc_vouchers'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "ACC: read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "ACC: read" ON public.%I FOR SELECT TO authenticated USING (public.gbp_acc_role(user_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "ACC: insert" ON public.%I', t);
    EXECUTE format('CREATE POLICY "ACC: insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.gbp_acc_role(user_id) AND public.gbp_module_ok(user_id, ''pro''))', t);
    EXECUTE format('DROP POLICY IF EXISTS "ACC: update" ON public.%I', t);
    EXECUTE format('CREATE POLICY "ACC: update" ON public.%I FOR UPDATE TO authenticated USING (public.gbp_acc_role(user_id)) WITH CHECK (public.gbp_acc_role(user_id) AND public.gbp_module_ok(user_id, ''pro''))', t);
    EXECUTE format('DROP POLICY IF EXISTS "ACC: delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "ACC: delete" ON public.%I FOR DELETE TO authenticated USING (public.gbp_acc_role(user_id))', t);
  END LOOP;
END $$;

-- ============================================================
-- Done. Accounting appears under More → Accounting. Open it and tap
-- "Sync from bills" once to back-fill journals from existing data.
-- ============================================================
