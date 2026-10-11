-- ============================================================
-- 009_biz_docs.sql — Payment-out, purchase returns, sale/purchase orders,
-- cheques, cash-in-hand adjustments and loan accounts
-- ============================================================
-- Run AFTER 008 in the Supabase SQL editor. Idempotent: safe to run again.
-- Until this runs, those screens show "being set up"; everything else
-- (billing, Payment-In, sale returns / credit notes) works as before.
--
--   biz_docs  one row per document; kind is one of
--             payment_out | purchase_return | sale_order | purchase_order |
--             cheque | cash_adj | loan | loan_txn
--             (party, amount, items, status, mode … in data). Accounting
--             (007) posts journals from these automatically on sync.
-- Available on every plan (core billing). Owners, managers, billers and
-- accountants may write; only owners / managers delete. Same org model as
-- 003 (user_id = org owner).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.biz_docs (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('payment_out', 'purchase_return', 'sale_order', 'purchase_order', 'cheque', 'cash_adj', 'loan', 'loan_txn')),
  doc_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status     TEXT NOT NULL DEFAULT '',
  amount     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS biz_docs_kind_idx ON public.biz_docs(user_id, kind, doc_date);

ALTER TABLE public.biz_docs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.biz_docs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biz_docs TO authenticated;
GRANT ALL ON public.biz_docs TO service_role;

DROP POLICY IF EXISTS "Docs: members read" ON public.biz_docs;
CREATE POLICY "Docs: members read" ON public.biz_docs FOR SELECT TO authenticated
  USING (public.gbp_can_read(user_id));
DROP POLICY IF EXISTS "Docs: staff insert" ON public.biz_docs;
CREATE POLICY "Docs: staff insert" ON public.biz_docs FOR INSERT TO authenticated
  WITH CHECK (public.gbp_member_role(user_id) IN ('owner', 'manager', 'biller', 'accountant'));
DROP POLICY IF EXISTS "Docs: staff update" ON public.biz_docs;
CREATE POLICY "Docs: staff update" ON public.biz_docs FOR UPDATE TO authenticated
  USING (public.gbp_member_role(user_id) IN ('owner', 'manager', 'biller', 'accountant'))
  WITH CHECK (public.gbp_member_role(user_id) IN ('owner', 'manager', 'biller', 'accountant'));
DROP POLICY IF EXISTS "Docs: managers delete" ON public.biz_docs;
CREATE POLICY "Docs: managers delete" ON public.biz_docs FOR DELETE TO authenticated
  USING (public.gbp_can_delete(user_id));

-- ============================================================
-- Done. Menu → Purchase / Cash & Bank screens become active.
-- ============================================================
