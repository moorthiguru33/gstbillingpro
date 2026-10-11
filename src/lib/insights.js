import { isCancelledBill } from '../utils';

const num = (v) => Number(v) || 0;
const isCash = (m) => /cash/i.test(String(m || ''));
const SALES_TYPES = ['tax-invoice', 'bill-of-supply', 'composition', '', undefined];

/** Cash / bank from payments when the books (Accounting) are not in use. */
export function estimateCashBank({ bills = [], expenses = [], purchases = [], docs = [] }) {
  let cash = 0; let bank = 0;
  const add = (mode, amt) => { if (isCash(mode)) cash += amt; else bank += amt; };
  for (const b of bills) {
    if (isCancelledBill(b) || !SALES_TYPES.includes(b.invoiceType)) continue;
    for (const p of b.payments || []) if (!/credit/.test(String(p.mode || ''))) add(p.mode, num(p.amount));
  }
  for (const e of expenses) add(e.paymentMode, -num(e.amount));
  for (const pu of purchases) if (String(pu.paymentStatus || '').toLowerCase() === 'paid' && !docs.some(d => d.kind === 'payment_out' && d.purchaseId === pu.id)) add(pu.paymentMode || 'bank', -num(pu.totalAmount ?? pu.total));
  for (const d of docs) {
    if (d.kind === 'payment_out') add(d.mode, -num(d.amount));
    else if (d.kind === 'cash_adj') cash += d.direction === 'reduce' ? -num(d.amount) : num(d.amount);
    else if (d.kind === 'loan') add(d.mode, d.direction === 'given' ? -num(d.amount) : num(d.amount));
    else if (d.kind === 'loan_txn') add(d.mode, -num(d.amount));
  }
  return { cash: Math.round(cash * 100) / 100, bank: Math.round(bank * 100) / 100 };
}

