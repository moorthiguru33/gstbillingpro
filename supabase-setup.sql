-- ============================================================
-- GST Billing Pro - Supabase Database Setup (fresh project)
-- Run this entire file in Supabase SQL Editor.
-- Existing projects: run supabase/migrations/001_security_fixes.sql and
-- then 002_plans_admin_emails.sql instead (both are included verbatim at
-- the end of this file).
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SUBSCRIPTIONS TABLE
-- Tracks trial & paid status for each user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT,
  trial_start TIMESTAMPTZ DEFAULT NOW(),
  trial_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  status TEXT DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
  razorpay_subscription_id TEXT,
  razorpay_customer_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  current_period_end TIMESTAMPTZ,
  plan TEXT DEFAULT 'monthly',
  amount INTEGER,                 -- last amount paid, in paise
  last_payment_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROFILES TABLE (Business Info per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  business_name TEXT DEFAULT '',
  address TEXT DEFAULT '',
  state TEXT DEFAULT '',
  gstin TEXT DEFAULT '',
  pan TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  account_number TEXT DEFAULT '',
  ifsc TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  signature_url TEXT DEFAULT '',
  upi_id TEXT DEFAULT '',
  google_client_id TEXT DEFAULT '',
  google_drive_folder TEXT DEFAULT 'GST Billing Invoices',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BILLS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bills (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT,
  invoice_date TEXT,
  client_name TEXT,
  client_gstin TEXT,
  status TEXT DEFAULT 'unpaid',
  invoice_type TEXT,
  total NUMERIC DEFAULT 0,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- CLIENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT DEFAULT '',
  gstin TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  state TEXT DEFAULT '',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT DEFAULT '',
  hsn TEXT DEFAULT '',
  price NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  stock NUMERIC,
  unit TEXT DEFAULT 'NOS',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- EXPENSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  description TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0,
  date TEXT,
  category TEXT DEFAULT '',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- PURCHASES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.purchases (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  supplier_name TEXT DEFAULT '',
  invoice_number TEXT DEFAULT '',
  date TEXT,
  total NUMERIC DEFAULT 0,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- RECURRING TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.recurring (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT DEFAULT '',
  frequency TEXT DEFAULT 'monthly',
  next_date TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- RECEIPTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.receipts (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0,
  date TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- TEMPLATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.templates (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT DEFAULT '',
  content TEXT DEFAULT '',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- BUSINESS_PROFILES TABLE (Multi-business support)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_name TEXT DEFAULT '',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- META TABLE (Counters, settings per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- ============================================================
-- TRASH TABLE (Soft-deleted bills)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trash (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  data JSONB DEFAULT '{}',
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ============================================================
-- PAYMENT_LOGS TABLE (Audit trail for payments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  amount INTEGER,
  status TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATOMIC INCREMENT FUNCTION (for invoice numbers)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_meta_counter(
  p_user_id UUID,
  p_key TEXT,
  p_start INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_current INTEGER;
  v_next INTEGER;
BEGIN
  -- Lock the row for this user+key to prevent race conditions
  SELECT (value->>'count')::INTEGER INTO v_current
  FROM meta
  WHERE user_id = p_user_id AND key = p_key
  FOR UPDATE;

  IF NOT FOUND OR v_current IS NULL THEN
    v_next := p_start;
  ELSE
    v_next := v_current + 1;
  END IF;

  INSERT INTO meta (user_id, key, value)
  VALUES (p_user_id, p_key, jsonb_build_object('count', v_next))
  ON CONFLICT (user_id, key)
  DO UPDATE SET
    value = jsonb_build_object('count', v_next),
    updated_at = NOW();

  RETURN v_next;
END;
$$;

-- ============================================================
-- TRIGGER: Auto-create subscription on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create subscription with 30-day trial
  INSERT INTO public.subscriptions (user_id, email, status)
  VALUES (NEW.id, NEW.email, 'trial')
  ON CONFLICT (user_id) DO NOTHING;

  -- Create empty profile
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — Each user sees ONLY their data
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

-- Subscriptions policies
-- (Read-only for users. Only the server functions — service role — may
--  change a subscription. Policies are (re)created in the migration below.)

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Bills policies
CREATE POLICY "Users can view own bills" ON public.bills FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bills" ON public.bills FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bills" ON public.bills FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own bills" ON public.bills FOR DELETE USING (auth.uid() = user_id);

-- Clients policies
CREATE POLICY "Users can view own clients" ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clients" ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clients" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clients" ON public.clients FOR DELETE USING (auth.uid() = user_id);

-- Products policies
CREATE POLICY "Users can view own products" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON public.products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON public.products FOR DELETE USING (auth.uid() = user_id);

-- Expenses policies
CREATE POLICY "Users can view own expenses" ON public.expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own expenses" ON public.expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own expenses" ON public.expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own expenses" ON public.expenses FOR DELETE USING (auth.uid() = user_id);

-- Purchases policies
CREATE POLICY "Users can view own purchases" ON public.purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own purchases" ON public.purchases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own purchases" ON public.purchases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own purchases" ON public.purchases FOR DELETE USING (auth.uid() = user_id);

-- Recurring policies
CREATE POLICY "Users can view own recurring" ON public.recurring FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recurring" ON public.recurring FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recurring" ON public.recurring FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recurring" ON public.recurring FOR DELETE USING (auth.uid() = user_id);

-- Receipts policies
CREATE POLICY "Users can view own receipts" ON public.receipts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own receipts" ON public.receipts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own receipts" ON public.receipts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own receipts" ON public.receipts FOR DELETE USING (auth.uid() = user_id);

-- Templates policies
CREATE POLICY "Users can view own templates" ON public.templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON public.templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON public.templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON public.templates FOR DELETE USING (auth.uid() = user_id);

-- Business profiles policies
CREATE POLICY "Users can view own business profiles" ON public.business_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own business profiles" ON public.business_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own business profiles" ON public.business_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own business profiles" ON public.business_profiles FOR DELETE USING (auth.uid() = user_id);

-- Meta policies
CREATE POLICY "Users can view own meta" ON public.meta FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meta" ON public.meta FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meta" ON public.meta FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meta" ON public.meta FOR DELETE USING (auth.uid() = user_id);

-- Trash policies
CREATE POLICY "Users can view own trash" ON public.trash FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trash" ON public.trash FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own trash" ON public.trash FOR DELETE USING (auth.uid() = user_id);

-- Payment logs: read-only for users; written only by the server
-- (service role bypasses RLS and needs NO permissive policy — a
-- `USING (true)` policy would apply to every user). See migration below.

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS bills_user_id_idx ON public.bills(user_id);
CREATE INDEX IF NOT EXISTS bills_invoice_date_idx ON public.bills(invoice_date DESC);
CREATE INDEX IF NOT EXISTS clients_user_id_idx ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS products_user_id_idx ON public.products(user_id);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS meta_user_key_idx ON public.meta(user_id, key);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);

-- ============================================================
-- SECURITY FIXES (verbatim copy of supabase/migrations/001_security_fixes.sql)
-- ============================================================
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

-- PHASE 2 (verbatim copy of supabase/migrations/002_plans_admin_emails.sql — regenerate with: node scripts/gen-plan-sql.mjs --write)
-- ============================================================
-- 002_plans_admin_emails.sql  —  Phase 2: plans, limits, coupons,
-- referrals, admin panel, transactional e-mail.
--
-- Run AFTER 001_security_fixes.sql, in the Supabase SQL editor.
-- Idempotent: safe to run more than once (IF NOT EXISTS / OR REPLACE /
-- DROP ... IF EXISTS everywhere; the plan_limits rows are upserted).
--
-- What it does
--   1. subscriptions: `tier` + `lifetime` columns, new status 'free'
--      (after the 30-day trial unpaid users drop to Free, not locked out)
--   2. plan_limits (generated from shared/plans.js) + gbp_effective_tier()
--   3. Free-plan limits enforced IN THE DATABASE:
--        bills             BEFORE INSERT → 50 invoices / IST calendar month
--        business_profiles BEFORE INSERT → businesses per plan
--      (edits / upserts of an existing row are never blocked)
--   4. my_plan() for the in-app usage meter, founder_slots_left()
--   5. coupons + coupon_redemptions, referral_codes + referrals
--   6. admins + admin_actions (read/written only by the service role)
--   7. email_log (de-duplicates transactional e-mails)
--   8. payment_orders: coupon / GST breakdown / sequential receipt number
--
-- AFTER RUNNING: add yourself as admin (replace the e-mail):
--   INSERT INTO public.admins (email, note) VALUES (lower('you@example.com'), 'owner')
--   ON CONFLICT (email) DO NOTHING;
-- ============================================================
BEGIN;

-- ------------------------------------------------------------
-- 1. subscriptions
-- ------------------------------------------------------------
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS tier     TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS lifetime BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'free'));
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IS NULL OR tier IN ('free', 'starter', 'pro', 'business'));

-- Everybody who paid before Phase 2 bought the ₹99 / ₹999 plan = Starter.
UPDATE public.subscriptions SET tier = 'starter'
 WHERE tier IS NULL AND (status = 'active' OR plan IN ('monthly', 'annual')) AND last_payment_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx ON public.subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS subscriptions_trial_end_idx ON public.subscriptions(trial_end);

-- ------------------------------------------------------------
-- 2. plan_limits — one row per tier (data from shared/plans.js)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_limits (
  tier               TEXT PRIMARY KEY,
  rank               INTEGER NOT NULL,
  invoices_per_month INTEGER,          -- NULL = unlimited
  businesses         INTEGER,          -- NULL = unlimited
  staff_users        INTEGER,
  features           JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read plan limits" ON public.plan_limits;
CREATE POLICY "Anyone can read plan limits" ON public.plan_limits FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.plan_limits FROM anon, authenticated;
GRANT SELECT ON public.plan_limits TO anon, authenticated;
GRANT ALL ON public.plan_limits TO service_role;

-- >>> GENERATED by scripts/gen-plan-sql.mjs from shared/plans.js — do not edit by hand
INSERT INTO public.plan_limits (tier, rank, invoices_per_month, businesses, staff_users, features) VALUES
  ('free', 0, 50, 1, 0, '{"removeBranding":false,"multiBusiness":false,"staffUsers":false,"whatsappAutomation":false,"eInvoice":false,"prioritySupport":false}'::jsonb),
  ('starter', 1, NULL, 1, 0, '{"removeBranding":true,"multiBusiness":false,"staffUsers":false,"whatsappAutomation":false,"eInvoice":false,"prioritySupport":false}'::jsonb),
  ('pro', 2, NULL, 3, 2, '{"removeBranding":true,"multiBusiness":true,"staffUsers":true,"whatsappAutomation":true,"eInvoice":false,"prioritySupport":false}'::jsonb),
  ('business', 3, NULL, 10, 10, '{"removeBranding":true,"multiBusiness":true,"staffUsers":true,"whatsappAutomation":true,"eInvoice":true,"prioritySupport":true}'::jsonb)
ON CONFLICT (tier) DO UPDATE SET rank = EXCLUDED.rank, invoices_per_month = EXCLUDED.invoices_per_month,
  businesses = EXCLUDED.businesses, staff_users = EXCLUDED.staff_users, features = EXCLUDED.features, updated_at = NOW();

CREATE OR REPLACE FUNCTION public.gbp_plan_const(p_key TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE p_key
    WHEN 'trial_tier' THEN 'pro'
    WHEN 'founder_cap' THEN '300'
    WHEN 'uncounted_invoice_types' THEN 'quotation,estimate,proforma,delivery-challan'
  END
$fn$;
-- <<< END GENERATED

-- Effective tier right now (mirrors effectivePlan() in shared/plans.js):
-- best of  active paid period · lifetime (Starter) · running trial (Pro)
-- otherwise 'free'. Internal: not callable by app users directly.
CREATE OR REPLACE FUNCTION public.gbp_effective_tier(p_user UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s         public.subscriptions%ROWTYPE;
  best      TEXT := 'free';
  best_rank INTEGER := 0;
  cand      TEXT;
  r         INTEGER;
  created   TIMESTAMPTZ;
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE user_id = p_user;
  IF NOT FOUND THEN
    -- No row yet (ensure_my_subscription() creates it on first load):
    -- treat a new account as being in its trial.
    SELECT u.created_at INTO created FROM auth.users u WHERE u.id = p_user;
    IF created IS NOT NULL AND created > NOW() - INTERVAL '30 days' THEN
      RETURN public.gbp_plan_const('trial_tier');
    END IF;
    RETURN 'free';
  END IF;

  FOREACH cand IN ARRAY ARRAY[
    CASE WHEN s.status = 'active' AND s.current_period_end > NOW() THEN COALESCE(s.tier, 'starter') END,
    CASE WHEN s.lifetime THEN 'starter' END,
    CASE WHEN s.status <> 'cancelled' AND s.trial_end > NOW() THEN public.gbp_plan_const('trial_tier') END
  ] LOOP
    IF cand IS NOT NULL THEN
      SELECT pl.rank INTO r FROM public.plan_limits pl WHERE pl.tier = cand;
      IF r IS NOT NULL AND r > best_rank THEN best := cand; best_rank := r; END IF;
    END IF;
  END LOOP;
  RETURN best;
END;
$$;
REVOKE ALL ON FUNCTION public.gbp_effective_tier(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gbp_effective_tier(UUID) TO service_role;

-- ------------------------------------------------------------
-- 3. Limits enforced in the database
-- ------------------------------------------------------------
-- Invoices created per IST calendar month. A counter (not COUNT(*)) so
-- deleting and re-creating bills cannot reset the monthly allowance.
CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,                      -- 'YYYY-MM' (Asia/Kolkata)
  invoices   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, period)
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage_counters;
CREATE POLICY "Users can view own usage" ON public.usage_counters FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.usage_counters FROM anon, authenticated;
GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;

CREATE OR REPLACE FUNCTION public.gbp_bills_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period TEXT := to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
  v_tier   TEXT;
  v_limit  INTEGER;
  v_used   INTEGER;
BEGIN
  -- Upsert of an existing bill (= an edit) also fires BEFORE INSERT: allow.
  IF EXISTS (SELECT 1 FROM public.bills b WHERE b.id = NEW.id AND b.user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  -- Quotations / estimates / proforma / delivery challans are free.
  IF COALESCE(NEW.invoice_type, 'tax-invoice') = ANY (string_to_array(public.gbp_plan_const('uncounted_invoice_types'), ',')) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.usage_counters (user_id, period) VALUES (NEW.user_id, v_period)
  ON CONFLICT (user_id, period) DO NOTHING;
  SELECT invoices INTO v_used FROM public.usage_counters
   WHERE user_id = NEW.user_id AND period = v_period FOR UPDATE;

  v_tier := public.gbp_effective_tier(NEW.user_id);
  SELECT invoices_per_month INTO v_limit FROM public.plan_limits WHERE tier = v_tier;
  IF v_limit IS NOT NULL AND v_used >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_INVOICES: the % plan allows % invoices per month', v_tier, v_limit
      USING ERRCODE = 'P0001', HINT = 'Upgrade your plan for unlimited invoices.';
  END IF;

  UPDATE public.usage_counters SET invoices = invoices + 1, updated_at = NOW()
   WHERE user_id = NEW.user_id AND period = v_period;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.gbp_bills_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gbp_bills_limit ON public.bills;
CREATE TRIGGER gbp_bills_limit BEFORE INSERT ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.gbp_bills_limit();

CREATE OR REPLACE FUNCTION public.gbp_business_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tier  TEXT;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.business_profiles p WHERE p.id = NEW.id AND p.user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  v_tier := public.gbp_effective_tier(NEW.user_id);
  SELECT businesses INTO v_limit FROM public.plan_limits WHERE tier = v_tier;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  -- Serialise concurrent inserts for the same user.
  PERFORM pg_advisory_xact_lock(hashtext('gbp_business_limit:' || NEW.user_id::text));
  SELECT COUNT(*) INTO v_count FROM public.business_profiles WHERE user_id = NEW.user_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_BUSINESSES: the % plan allows % business profile(s)', v_tier, v_limit
      USING ERRCODE = 'P0001', HINT = 'Upgrade to Pro or Business for more businesses.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.gbp_business_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gbp_business_limit ON public.business_profiles;
CREATE TRIGGER gbp_business_limit BEFORE INSERT ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.gbp_business_limit();

-- ------------------------------------------------------------
-- 4. Read helpers for the app
-- ------------------------------------------------------------
-- Usage meter: { tier, invoices_used, invoice_limit, businesses, business_limit, period }
CREATE OR REPLACE FUNCTION public.my_plan()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid      UUID := auth.uid();
  v_period TEXT := to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
  v_tier   TEXT;
  pl       public.plan_limits%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  v_tier := public.gbp_effective_tier(uid);
  SELECT * INTO pl FROM public.plan_limits WHERE tier = v_tier;
  RETURN jsonb_build_object(
    'tier', v_tier,
    'period', v_period,
    'invoices_used', COALESCE((SELECT invoices FROM public.usage_counters WHERE user_id = uid AND period = v_period), 0),
    'invoice_limit', pl.invoices_per_month,
    'businesses', (SELECT COUNT(*) FROM public.business_profiles WHERE user_id = uid),
    'business_limit', pl.businesses
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_plan() TO authenticated;

-- Founder Lifetime seats left (public: shown on the pricing page).
CREATE OR REPLACE FUNCTION public.founder_slots_left()
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(0, public.gbp_plan_const('founder_cap')::INTEGER - COUNT(*)::INTEGER)
    FROM public.payment_orders
   WHERE plan = 'founder_lifetime' AND status IN ('paid', 'processing');
$$;
REVOKE ALL ON FUNCTION public.founder_slots_left() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founder_slots_left() TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Coupons & referrals (server-only tables; the API validates)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  code            TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  kind            TEXT NOT NULL CHECK (kind IN ('percent', 'flat')),
  value           INTEGER NOT NULL CHECK (value > 0),   -- percent (1-90) or paise
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redeemed_count  INTEGER NOT NULL DEFAULT 0,
  valid_until     TIMESTAMPTZ,
  applies_to      TEXT[],                               -- plan ids / tiers; NULL = all
  active          BOOLEAN NOT NULL DEFAULT true,
  note            TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coupons_percent_range CHECK (kind <> 'percent' OR value <= 90)
);
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code       TEXT NOT NULL REFERENCES public.coupons(code) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id   TEXT,
  discount   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, user_id)
);

CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE CHECK (code ~ '^GBP[A-HJ-NP-Z2-9]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.referrals (
  referred_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'void')),
  order_id         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rewarded_at      TIMESTAMPTZ,
  CHECK (referred_user_id <> referrer_user_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_user_id);

-- ------------------------------------------------------------
-- 6. Admin panel
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
  email      TEXT PRIMARY KEY CHECK (email = lower(email)),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id             BIGSERIAL PRIMARY KEY,
  admin_email    TEXT NOT NULL,
  action         TEXT NOT NULL,
  target_user_id UUID,
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_actions_created_idx ON public.admin_actions(created_at DESC);

-- ------------------------------------------------------------
-- 7. Transactional e-mail log (dedupe_key makes every send idempotent)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  dedupe_key  TEXT NOT NULL UNIQUE,
  to_email    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  provider_id TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_log_user_idx ON public.email_log(user_id, created_at DESC);

-- All of section 5-7 is service-role only: RLS on, no policies for users.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['coupons', 'coupon_redemptions', 'referral_codes', 'referrals', 'admins', 'admin_actions', 'email_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.admin_actions_id_seq TO service_role;

-- ------------------------------------------------------------
-- 8. payment_orders: coupon, GST breakdown, receipt number
-- ------------------------------------------------------------
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS base_amount    INTEGER;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS discount       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS gst_amount     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS coupon_code    TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS receipt_number TEXT;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS note           TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_receipt_no_idx ON public.payment_orders(receipt_number) WHERE receipt_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_orders_plan_status_idx ON public.payment_orders(plan, status);

-- Sequential receipt numbers per Indian financial year: GBP/2026-27/00001
CREATE TABLE IF NOT EXISTS public.receipt_counters (
  fy      TEXT PRIMARY KEY,
  last_no INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_counters FROM anon, authenticated;
GRANT ALL ON public.receipt_counters TO service_role;

CREATE OR REPLACE FUNCTION public.next_receipt_number(p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d  DATE := (p_at AT TIME ZONE 'Asia/Kolkata')::DATE;
  y  INTEGER := CASE WHEN EXTRACT(MONTH FROM d) >= 4 THEN EXTRACT(YEAR FROM d)::INTEGER ELSE EXTRACT(YEAR FROM d)::INTEGER - 1 END;
  v_fy TEXT := y::TEXT || '-' || lpad(((y + 1) % 100)::TEXT, 2, '0');
  n  INTEGER;
BEGIN
  INSERT INTO public.receipt_counters AS rc (fy, last_no) VALUES (v_fy, 1)
  ON CONFLICT ON CONSTRAINT receipt_counters_pkey DO UPDATE SET last_no = rc.last_no + 1
  RETURNING rc.last_no INTO n;
  RETURN 'GBP/' || v_fy || '/' || lpad(n::TEXT, 5, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_receipt_number(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_receipt_number(TIMESTAMPTZ) TO service_role;

-- Atomic coupon redemption counter (called by the server on activation).
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.coupons SET redeemed_count = redeemed_count + 1, updated_at = NOW() WHERE code = p_code;
$$;
REVOKE ALL ON FUNCTION public.redeem_coupon(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(TEXT) TO service_role;

COMMIT;
