-- ============================================================
-- 004: AI billing usage (voice / photo bills on Workers AI)
-- Idempotent: safe to run more than once.
-- Monthly quota per business (owner): Free 10, Starter 50, Pro 200,
-- Business 1000 — the limit is decided by the server (shared/ai.js) and
-- passed in; these functions only count atomically.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_usage (
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period     TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  voice      INTEGER NOT NULL DEFAULT 0 CHECK (voice >= 0),
  photo      INTEGER NOT NULL DEFAULT 0 CHECK (photo >= 0),
  total      INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, period)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

DROP POLICY IF EXISTS "Org members can view AI usage" ON public.ai_usage;
CREATE POLICY "Org members can view AI usage" ON public.ai_usage FOR SELECT TO authenticated
  USING (public.gbp_can_read(owner_id));

-- Count one AI call if still under p_limit. Returns the new total, or -1
-- when the monthly limit is already used up.
CREATE OR REPLACE FUNCTION public.ai_consume(p_owner UUID, p_kind TEXT, p_limit INTEGER, p_period TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total INTEGER;
BEGIN
  IF p_kind NOT IN ('voice', 'photo') OR p_limit IS NULL OR p_limit < 0 OR p_period !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'ai_consume: bad arguments';
  END IF;
  INSERT INTO public.ai_usage (owner_id, period) VALUES (p_owner, p_period) ON CONFLICT DO NOTHING;
  UPDATE public.ai_usage
     SET total = total + 1,
         voice = voice + CASE WHEN p_kind = 'voice' THEN 1 ELSE 0 END,
         photo = photo + CASE WHEN p_kind = 'photo' THEN 1 ELSE 0 END,
         updated_at = now()
   WHERE owner_id = p_owner AND period = p_period AND total < p_limit
  RETURNING total INTO v_total;
  RETURN COALESCE(v_total, -1);
END $$;

-- Give a call back when the model failed (the user got nothing).
CREATE OR REPLACE FUNCTION public.ai_refund(p_owner UUID, p_kind TEXT, p_period TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ai_usage
     SET total = GREATEST(total - 1, 0),
         voice = GREATEST(voice - CASE WHEN p_kind = 'voice' THEN 1 ELSE 0 END, 0),
         photo = GREATEST(photo - CASE WHEN p_kind = 'photo' THEN 1 ELSE 0 END, 0),
         updated_at = now()
   WHERE owner_id = p_owner AND period = p_period;
END $$;

-- Only the server (service role) may count usage.
REVOKE EXECUTE ON FUNCTION public.ai_consume(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_refund(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_consume(UUID, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_refund(UUID, TEXT, TEXT) TO service_role;
