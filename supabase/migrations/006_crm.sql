-- ============================================================
-- 006_crm.sql — CRM (basic): leads + activities (notes / follow-ups)
-- ============================================================
-- Run AFTER 005 in the Supabase SQL editor. Idempotent: safe to run again.
-- Until this runs, the app shows CRM as "being set up"; nothing else changes.
--
--   crm_leads       one row per lead (status pipeline New → Contacted →
--                   Quoted → Won / Lost, value, next follow-up; details and
--                   notes in data)
--   crm_activities  notes and follow-up reminders for a lead or a customer
--                   (ref_type 'lead' | 'client'); due follow-ups show on the
--                   dashboard
-- Plan gating: Starter+ (shared/modules.js). Billers may work leads; only
-- owners / managers delete. Same org model as 003 (user_id = org owner).
-- ============================================================

CREATE OR REPLACE FUNCTION public.gbp_module_ok(p_owner UUID, p_min_tier TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rank FROM public.plan_limits WHERE tier = public.gbp_effective_tier(p_owner)), 0)
      >= COALESCE((SELECT rank FROM public.plan_limits WHERE tier = p_min_tier), 99);
$$;
REVOKE ALL ON FUNCTION public.gbp_module_ok(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gbp_module_ok(UUID, TEXT) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id             TEXT NOT NULL,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  value          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  next_follow_up DATE,
  data           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS crm_leads_status_idx ON public.crm_leads(user_id, status);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ref_type   TEXT NOT NULL CHECK (ref_type IN ('lead', 'client')),
  ref_id     TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'call', 'followup')),
  due_date   DATE,
  done       BOOLEAN NOT NULL DEFAULT false,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS crm_activities_ref_idx ON public.crm_activities(user_id, ref_type, ref_id);
CREATE INDEX IF NOT EXISTS crm_activities_due_idx ON public.crm_activities(user_id, due_date) WHERE kind = 'followup' AND NOT done;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_leads', 'crm_activities'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "CRM: members read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "CRM: members read" ON public.%I FOR SELECT TO authenticated USING (public.gbp_can_read(user_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "CRM: billers insert" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "CRM: billers insert" ON public.%I FOR INSERT TO authenticated
      WITH CHECK (public.gbp_member_role(user_id) IN ('owner', 'manager', 'biller') AND public.gbp_module_ok(user_id, 'starter'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "CRM: billers update" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "CRM: billers update" ON public.%I FOR UPDATE TO authenticated
      USING (public.gbp_member_role(user_id) IN ('owner', 'manager', 'biller'))
      WITH CHECK (public.gbp_member_role(user_id) IN ('owner', 'manager', 'biller') AND public.gbp_module_ok(user_id, 'starter'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "CRM: managers delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "CRM: managers delete" ON public.%I FOR DELETE TO authenticated USING (public.gbp_can_delete(user_id))', t);
  END LOOP;
END $$;

-- ============================================================
-- Done. CRM appears under More → CRM in the app.
-- ============================================================
