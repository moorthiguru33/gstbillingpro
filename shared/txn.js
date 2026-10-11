// ============================================================
// Business documents beyond bills (migration 009, table biz_docs):
// payment-out, purchase return / debit note, sale & purchase orders,
// cheques, cash-in-hand adjustments, loan accounts and loan payments.
// Pure helpers: validation, numbering, loan maths and the accounting
// vouchers each document posts (merged into the accounting sync).
// ============================================================
import { r2 } from './accounting.js';

export const DOC_KINDS = Object.freeze(['payment_out', 'purchase_return', 'sale_order', 'purchase_order', 'cheque', 'cash_adj', 'loan', 'loan_txn']);
export const PAY_MODES = Object.freeze(['cash', 'upi', 'bank', 'cheque', 'card']);
export const ORDER_STATUSES = Object.freeze(['open', 'converted', 'cancelled']);
export const CHEQUE_STATUSES = Object.freeze(['pending', 'cleared', 'bounced']);
const PREFIX = { payment_out: 'PAYOUT', purchase_return: 'DN', sale_order: 'SO', purchase_order: 'PO', cheque: 'CHQ', cash_adj: 'CA', loan: 'LN', loan_txn: 'EMI' };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const day = (d) => String(d || '').slice(0, 10);
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');

/** Next document number for a kind, e.g. SO-12 (max existing + 1). */
export function nextDocNo(docs, kind) {
  let max = 0;
  for (const d of docs) {
    if (d.kind !== kind) continue;
    const m = /-(\d+)$/.exec(d.no || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${PREFIX[kind] || 'DOC'}-${max + 1}`;
}

export function itemsTotal(items = []) {
  let sub = 0; let tax = 0;
  for (const it of items) {
    const line = num(it.qty) * num(it.rate);
    sub += line; tax += line * num(it.taxPercent) / 100;
  }
  return { subtotal: r2(sub), tax: r2(tax), total: r2(sub + tax) };
}

/** Validates and normalises a document. Throws Error(code). */
export function cleanDoc(input = {}) {
  const kind = input.kind;
  if (!DOC_KINDS.includes(kind)) throw new Error('bad_kind');
  const date = day(input.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad_date');
  const party = norm(input.party).slice(0, 120);
  const d = { ...input, kind, date, party, note: String(input.note || '').trim().slice(0, 500) };
  if (kind !== 'cash_adj' && kind !== 'loan_txn' && !party) throw new Error('need_party');
  const lineItems = () => (input.items || []).filter(i => norm(i.name)).map(i => ({ name: norm(i.name).slice(0, 120), qty: num(i.qty) || 1, rate: r2(i.rate), taxPercent: num(i.taxPercent), unit: i.unit || 'Nos', productId: i.productId || undefined }));
  if (kind === 'sale_order' || kind === 'purchase_order') {
    d.items = lineItems();
    if (!d.items.length) throw new Error('need_items');
    d.amount = itemsTotal(d.items).total;
    d.status = ORDER_STATUSES.includes(input.status) ? input.status : 'open';
  } else if (kind === 'purchase_return' && lineItems().length) {
    // Itemised return: amount and GST come from the lines; stock goes down.
    d.items = lineItems();
    const t = itemsTotal(d.items);
    d.amount = t.total; d.tax = t.tax;
    if (!(d.amount > 0)) throw new Error('need_amount');
  } else {
    if (kind === 'purchase_return') delete d.items;
    d.amount = r2(input.amount);
    if (!(d.amount > 0)) throw new Error('need_amount');
  }
  if (kind === 'purchase_return' && !d.items) d.tax = Math.min(r2(input.tax), d.amount);
  if (['payment_out', 'loan', 'loan_txn'].includes(kind)) d.mode = PAY_MODES.includes(input.mode) ? input.mode : 'cash';
  if (kind === 'cheque') {
    d.direction = input.direction === 'issued' ? 'issued' : 'received';
    d.status = CHEQUE_STATUSES.includes(input.status) ? input.status : 'pending';
    d.chequeNo = String(input.chequeNo || '').trim().slice(0, 30);
  }
  if (kind === 'cash_adj') d.direction = input.direction === 'reduce' ? 'reduce' : 'add';
  if (kind === 'loan') {
    d.direction = input.direction === 'given' ? 'given' : 'taken';
    d.rate = Math.max(0, num(input.rate)); d.emi = r2(Math.max(0, num(input.emi)));
  }
  if (kind === 'loan_txn') {
    if (!input.loanId) throw new Error('need_loan');
    d.interest = r2(Math.max(0, num(input.interest)));
    d.principal = r2(Math.max(0, d.amount - d.interest));
  }
  return d;
}

/** Stock change a purchase return makes: { productId: -qty } (cancelled = none). */
export function returnStockEffect(doc) {
  const out = {};
  if (doc?.kind !== 'purchase_return' || doc.status === 'cancelled') return out;
  for (const it of doc.items || []) {
    if (!it.productId) continue;
    out[it.productId] = Math.round(((out[it.productId] || 0) - num(it.qty)) * 1000) / 1000;
  }
  return out;
}

/** Outstanding principal and totals for a loan. */
export function loanSummary(loan, docs = []) {
  const txns = docs.filter(d => d.kind === 'loan_txn' && d.loanId === loan.id);
  const principalPaid = r2(txns.reduce((s, t) => s + num(t.principal), 0));
  const interestPaid = r2(txns.reduce((s, t) => s + num(t.interest), 0));
  return { principal: r2(loan.amount), principalPaid, interestPaid, outstanding: r2(num(loan.amount) - principalPaid), payments: txns.length };
}

/** Amount already paid against a purchase bill by payment-out documents. */
export const paidOutFor = (purchaseId, docs = []) => r2(docs.filter(d => d.kind === 'payment_out' && d.purchaseId === purchaseId).reduce((s, d) => s + num(d.amount), 0));

const acc = (mode, bankId) => (mode === 'cash' ? 'cash' : (bankId || 'bank'));
const L = (a, dr, cr, p) => ({ a, dr: r2(dr), cr: r2(cr), ...(p ? { p } : {}) });

/** Accounting vouchers for documents (ids 'auto:doc:<id>'). Orders post nothing. */
export function deriveDocVouchers(docs = [], { bankId = 'bank' } = {}) {
  const loans = new Map(docs.filter(d => d.kind === 'loan').map(d => [d.id, d]));
  const out = [];
  const push = (d, type, narration, lines) => out.push({ id: `auto:doc:${d.id}`, date: d.date, type, no: d.no || '', narration, source: 'auto', ref: d.id, lines: lines.filter(l => l.dr || l.cr) });
  for (const d of docs) {
    const amt = r2(d.amount);
    if (!d.id || !(amt > 0) || !d.date) continue;
    if (d.kind === 'payment_out') push(d, 'payment', `Payment out — ${d.party}`, [L('creditors', amt, 0, d.party), L(acc(d.mode, bankId), 0, amt)]);
    else if (d.kind === 'purchase_return') {
      const tax = r2(d.tax); const interstate = !!d.interstate; const half = r2(tax / 2);
      push(d, 'journal', `Purchase return — ${d.party}`, [L('creditors', amt, 0, d.party), L('purchases', 0, amt - tax),
        L('in_cgst', 0, interstate ? 0 : half), L('in_sgst', 0, interstate ? 0 : tax - half), L('in_igst', 0, interstate ? tax : 0)]);
    } else if (d.kind === 'cheque' && d.status === 'cleared' && !d.linked) {
      const on = { ...d, date: d.clearedOn || d.date };
      if (d.direction === 'received') push(on, 'receipt', `Cheque ${d.chequeNo || ''} cleared — ${d.party}`, [L(bankId, amt, 0), L('debtors', 0, amt, d.party)]);
      else push(on, 'payment', `Cheque ${d.chequeNo || ''} cleared — ${d.party}`, [L('creditors', amt, 0, d.party), L(bankId, 0, amt)]);
    } else if (d.kind === 'cash_adj') {
      if (d.direction === 'reduce') push(d, 'journal', `Cash reduced${d.note ? ` — ${d.note}` : ''}`, [L('drawings', amt, 0), L('cash', 0, amt)]);
      else push(d, 'journal', `Cash added${d.note ? ` — ${d.note}` : ''}`, [L('cash', amt, 0), L('capital', 0, amt)]);
    } else if (d.kind === 'loan') {
      if (d.direction === 'given') push(d, 'payment', `Loan given — ${d.party}`, [L('loans_adv', amt, 0, d.party), L(acc(d.mode, bankId), 0, amt)]);
      else push(d, 'receipt', `Loan taken — ${d.party}`, [L(acc(d.mode, bankId), amt, 0), L('borrowings', 0, amt, d.party)]);
    } else if (d.kind === 'loan_txn') {
      const loan = loans.get(d.loanId);
      if (!loan) continue;
      const principal = r2(amt - r2(d.interest)); const interest = r2(d.interest);
      if (loan.direction === 'given') push(d, 'receipt', `Loan repayment — ${loan.party}`, [L(acc(d.mode, bankId), amt, 0), L('loans_adv', 0, principal, loan.party), L('interest_income', 0, interest)]);
      else push(d, 'payment', `Loan EMI — ${loan.party}`, [L('borrowings', principal, 0, loan.party), L('interest_exp', interest, 0), L(acc(d.mode, bankId), 0, amt)]);
    }
  }
  return out;
}

/** Purchase ids whose payment is recorded by payment-out docs (accounting must not post them again). */
export const purchasesPaidByDocs = (docs = []) => new Set(docs.filter(d => d.kind === 'payment_out' && d.purchaseId).map(d => d.purchaseId));

/** Bill payment helper (Payment-In against an invoice): returns the updated bill. */
export function applyPaymentToBill(bill, { amount, date, mode, receiptNo, note }) {
  const prior = bill.payments || [];
  const idx = prior.findIndex(p => p.receiptNo && p.receiptNo === receiptNo);
  const entry = { amount: r2(amount), date, mode, note: note || `Receipt ${receiptNo}`, recordedAt: idx >= 0 ? prior[idx].recordedAt : new Date().toISOString(), receiptNo };
  const payments = idx >= 0 ? prior.map((p, i) => (i === idx ? entry : p)) : [...prior, entry];
  const paid = r2(payments.reduce((s, p) => s + num(p.amount), 0));
  const status = paid >= num(bill.totalAmount) - 0.005 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
  return { ...bill, payments, paidAmount: paid, status };
}

/** Outstanding of a sales bill. */
export const billDue = (b) => r2(Math.max(0, num(b.totalAmount) - num(b.paidAmount)));
/** Outstanding of a purchase bill given payment-out docs. */
export function purchaseDue(p, docs = []) {
  const total = num(p.totalAmount ?? p.total);
  if (String(p.paymentStatus || '').toLowerCase() === 'paid' && !paidOutFor(p.id, docs)) return 0;
  return r2(Math.max(0, total - paidOutFor(p.id, docs)));
}

/** Sale order -> invoice editor draft (opened as a duplicate, fresh number). */
export function saleOrderToDraft(doc, products = []) {
  const byId = new Map(products.map(p => [String(p.id), p]));
  const items = (doc.items || []).map((it, i) => {
    const p = byId.get(String(it.productId)) || {};
    return { id: `item_${Date.now().toString(36)}_${i}`, productId: p.id || undefined, name: it.name, hsn: p.hsn || '', quantity: num(it.qty) || 1, unit: it.unit || p.unit || 'NOS', rate: num(it.rate), mrp: num(p.mrp), discount: 0, taxPercent: num(it.taxPercent), cessPercent: 0 };
  });
  const client = { name: doc.party || '', phone: doc.phone || '', address: '' };
  return { _isDuplicate: true, _fromSaleOrder: doc.id, clientName: client.name, invoiceType: 'tax-invoice', data: { client, items, details: {}, invoiceType: 'tax-invoice', customNotes: `Sale order ${doc.no || ''}`.trim() } };
}

/** Purchase order -> purchase bill record (same shape PurchaseBills saves). */
export function purchaseOrderToBill(doc, profile = {}, today = day(new Date().toISOString())) {
  const items = (doc.items || []).map(i => ({ name: i.name, hsn: '', quantity: num(i.qty), rate: num(i.rate), taxPercent: num(i.taxPercent), cessPercent: 0 }));
  const t = itemsTotal(doc.items);
  return {
    date: today, supplierName: doc.party, supplierAddress: '', supplierGstin: doc.gstin || '', invoiceNumber: doc.no || '',
    ownerGstin: profile?.gstin || '', ownerName: profile?.businessName || '', items,
    totalAmount: t.total, totalTax: t.tax, taxableAmount: t.subtotal, applyRoundOff: false, roundOff: 0,
    paymentStatus: 'Unpaid', interstate: !!doc.interstate, note: `From purchase order ${doc.no || ''}`.trim(),
  };
}
