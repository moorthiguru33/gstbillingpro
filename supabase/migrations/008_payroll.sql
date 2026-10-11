-- ============================================================
-- 008_payroll.sql — Payroll: employees, attendance, advances, salaries
-- ============================================================
-- Run AFTER 007 in the Supabase SQL editor. Idempotent: safe to run again.
-- Until this runs, the app shows Payroll as "being set up".
--
--   pay_employees   name, phone, role, salary type (monthly/daily/hourly), amount
--   pay_attendance  one row per employee-month (id '<emp>:<YYYY-MM>'),
--                   data.days = { 'YYYY-MM-DD': 'P' | 'A' | 'H' | 'L' }
--   pay_advances    advances / loans given (recovered from salary)
--   pay_salaries    one row per employee-month once salary is marked paid
--                   (snapshot of the calculation); marking paid also posts
--                   an expense voucher to acc_vouchers (007) when present
-- Plan gating: Pro+ for writes. Access: owner and manager only (salaries
-- are private). user_id = org owner (003 org model).
-- ============================================================

CREATE OR REPLACE FUNCTION public.gbp_module_ok(p_owner UUID, p_min_tier TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rank FROM public.plan_limits WHERE tier = public.gbp_effective_tier(p_owner)), 0)
      >= COALESCE((SELECT rank FROM public.plan_limits WHERE tier = p_min_tier), 99);
$$;
REVOKE ALL ON FUNCTION public.gbp_module_ok(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gbp_module_ok(UUID, TEXT) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.pay_employees (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT true,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.pay_attendance (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emp_id     TEXT NOT NULL,
  month      TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS pay_attendance_month_idx ON public.pay_attendance(user_id, month);

CREATE TABLE IF NOT EXISTS public.pay_advances (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emp_id     TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.pay_salaries (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emp_id     TEXT NOT NULL,
  month      TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  status     TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('draft', 'paid')),
  net        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS pay_salaries_month_idx ON public.pay_salaries(user_id, month);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_employees', 'pay_attendance', 'pay_advances', 'pay_salaries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "PAY: read" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "PAY: read" ON public.%I FOR SELECT TO authenticated USING (public.gbp_member_role(user_id) IN ('owner', 'manager'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "PAY: insert" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "PAY: insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.gbp_member_role(user_id) IN ('owner', 'manager') AND public.gbp_module_ok(user_id, 'pro'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "PAY: update" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "PAY: update" ON public.%I FOR UPDATE TO authenticated USING (public.gbp_member_role(user_id) IN ('owner', 'manager')) WITH CHECK (public.gbp_member_role(user_id) IN ('owner', 'manager') AND public.gbp_module_ok(user_id, 'pro'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "PAY: delete" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "PAY: delete" ON public.%I FOR DELETE TO authenticated USING (public.gbp_member_role(user_id) IN ('owner', 'manager'))$p$, t);
  END LOOP;
END $$;

-- ============================================================
-- Done. Payroll appears under More → Payroll.
-- ============================================================
