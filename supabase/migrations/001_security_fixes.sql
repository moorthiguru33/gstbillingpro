-- ============================================================
-- GST Billing Pro — Migration 001: security & payment fixes
-- ------------------------------------------------------------
-- Safe to run more than once (idempotent). Run it in the Supabase
-- Dashboard → SQL Editor on the EXISTING project. It does not delete
-- any customer data.
--
-- What it fixes
--  1. Any logged-in user could UPDATE their own `subscriptions` row
--     (e.g. set status='active', current_period_end='2099-01-01')
--     straight from the browser with the public anon key.
--  2. The policy "Service role can update subscriptions" was
--     `FOR ALL USING (true)` — it applies to EVERY role, so any user
--     could read/modify/delete EVERY customer's subscription.
--     (The service role bypasses RLS anyway; it never needed a policy.)
--  3. "Service role can insert payment logs" `WITH CHECK (true)` let any
--     user forge payment log rows.
--  4. Adds the columns the payment functions write
--     (razorpay_payment_id, razorpay_order_id, plan, …).
--  5. Adds `payment_orders` — the server-side record of every Razorpay
--     order (who created it, which plan, exact amount) so that
--     /api/verify-payment and the webhook can never be tricked into
--     activating the wrong user / plan / amount, and are idempotent.
--  6. Private `invoices` storage bucket with per-user folder policies.
--  7. increment_meta_counter() refuses to touch another user's counter.
--  8. ensure_my_subscription(): creates the trial row server-side (with
--     dates from the database) when a user has none, so the client never
--     invents a trial.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1-3. Drop the dangerous policies
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own subscription"      ON public.subscriptions;
DROP POLICY IF EXISTS "Service role can update subscriptions"  ON public.subscriptions;
DROP POLICY IF EXISTS "Service role can insert payment logs"   ON public.payment_logs;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs  ENABLE ROW LEVEL SECURITY;

-- Users may only READ their own subscription / payment history.
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own payment logs" ON public.payment_logs;
CREATE POLICY "Users can view own payment logs"
  ON public.payment_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Belt and braces: browsers (anon / authenticated) can never write these.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_logs  FROM anon, authenticated;

-- ------------------------------------------------------------
-- 4. Missing columns
-- ------------------------------------------------------------
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS razorpay_order_id   TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan                TEXT DEFAULT 'monthly';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS amount              INTEGER;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_at     TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end  TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();
-- `amount` used to default to 99 (rupees) while Razorpay works in paise.
-- From now on it stores the last amount paid, in PAISE.
ALTER TABLE public.subscriptions ALTER COLUMN amount DROP DEFAULT;
COMMENT ON COLUMN public.subscriptions.amount IS 'Last amount paid, in paise (9900 = ₹99).';

ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS plan              TEXT;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'INR';
COMMENT ON COLUMN public.payment_logs.amount IS 'Amount in paise as captured by Razorpay.';

CREATE INDEX IF NOT EXISTS payment_logs_user_idx    ON public.payment_logs(user_id);
CREATE INDEX IF NOT EXISTS payment_logs_payment_idx ON public.payment_logs(razorpay_payment_id);

-- ------------------------------------------------------------
-- 5. payment_orders — written ONLY by the Cloudflare functions
--    (service role). Users may read their own rows.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_orders (
  order_id            TEXT PRIMARY KEY,               -- Razorpay order_xxx
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL,
  amount              INTEGER NOT NULL CHECK (amount > 0),  -- paise
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created', 'processing', 'paid', 'failed')),
  razorpay_payment_id TEXT UNIQUE,
  period_end          TIMESTAMPTZ,                    -- subscription end granted by this order
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at             TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_orders_user_idx ON public.payment_orders(user_id, created_at DESC);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own payment orders" ON public.payment_orders;
CREATE POLICY "Users can view own payment orders"
  ON public.payment_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_orders FROM anon, authenticated;
GRANT ALL ON public.payment_orders TO service_role;

-- ------------------------------------------------------------
-- 6. Storage: private `invoices` bucket, one folder per user
--    Path convention used by the app: <user_id>/<client>/<file>.pdf
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Invoice PDFs: owner can read"   ON storage.objects;
DROP POLICY IF EXISTS "Invoice PDFs: owner can upload" ON storage.objects;
DROP POLICY IF EXISTS "Invoice PDFs: owner can update" ON storage.objects;
DROP POLICY IF EXISTS "Invoice PDFs: owner can delete" ON storage.objects;

CREATE POLICY "Invoice PDFs: owner can read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Invoice PDFs: owner can upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Invoice PDFs: owner can update" ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Invoice PDFs: owner can delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- 7. Invoice counter: a user may only increment their own counter
-- ------------------------------------------------------------
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
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
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

-- ------------------------------------------------------------
-- 8. Trial row created by the DATABASE, never by the browser.
--    Trial = 30 days from the auth account's creation date, so deleting
--    local data or re-calling this can never restart a trial.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_my_subscription()
RETURNS SETOF public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_created TIMESTAMPTZ;
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT u.created_at, u.email INTO v_created, v_email FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.subscriptions (user_id, email, status, trial_start, trial_end)
  VALUES (v_uid, v_email, 'trial', COALESCE(v_created, NOW()), COALESCE(v_created, NOW()) + INTERVAL '30 days')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY SELECT * FROM public.subscriptions WHERE user_id = v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_my_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_subscription() TO authenticated;

-- handle_new_user(): pin search_path (SECURITY DEFINER best practice)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, email, status, trial_start, trial_end)
  VALUES (NEW.id, NEW.email, 'trial', NOW(), NOW() + INTERVAL '30 days')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMIT;

-- ------------------------------------------------------------
-- Verify (optional) — should list ONLY "Users can view own …" SELECT
-- policies on subscriptions / payment_logs / payment_orders:
--   SELECT tablename, policyname, cmd, roles, qual
--   FROM pg_policies
--   WHERE tablename IN ('subscriptions','payment_logs','payment_orders');
-- ------------------------------------------------------------
