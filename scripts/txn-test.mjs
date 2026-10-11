// Unit tests for shared/txn.js (biz_docs: payment-out, returns, orders, cheques, cash, loans)
// and the profile-completion helper. Run: node scripts/txn-test.mjs
import assert from 'node:assert/strict';
import {
  nextDocNo, itemsTotal, cleanDoc, loanSummary, paidOutFor, deriveDocVouchers, purchasesPaidByDocs,
  applyPaymentToBill, billDue, purchaseDue, saleOrderToDraft, purchaseOrderToBill, returnStockEffect,
} from '../shared/txn.js';
import { topSellers, keypad } from '../src/lib/posPicks.js';
import { deriveVouchers } from '../shared/accounting.js';
import { profileCompletion, PROFILE_CHECKS } from '../src/components/mobile/profileCard.js';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const r2 = (v) => Math.round(v * 100) / 100;

test('nextDocNo uses max+1 per kind', () => {
  const docs = [{ kind: 'sale_order', no: 'SO-3' }, { kind: 'sale_order', no: 'SO-11' }, { kind: 'cheque', no: 'CHQ-40' }];
  assert.equal(nextDocNo(docs, 'sale_order'), 'SO-12');
  assert.equal(nextDocNo(docs, 'purchase_order'), 'PO-1');
  assert.equal(nextDocNo([], 'payment_out'), 'PAYOUT-1');
  assert.equal(nextDocNo([], 'loan_txn'), 'EMI-1');
});

test('itemsTotal adds tax per line', () => {
  assert.deepEqual(itemsTotal([{ qty: 2, rate: 100, taxPercent: 18 }, { qty: 1, rate: 50 }]), { subtotal: 250, tax: 36, total: 286 });
});

test('cleanDoc validates', () => {
  const base = { date: '2026-10-01', party: ' Ramesh  Agencies ', amount: 500 };
  assert.throws(() => cleanDoc({ ...base, kind: 'nope' }), /bad_kind/);
  assert.throws(() => cleanDoc({ ...base, kind: 'payment_out', date: 'x' }), /bad_date/);
  assert.throws(() => cleanDoc({ ...base, kind: 'payment_out', party: ' ' }), /need_party/);
  assert.throws(() => cleanDoc({ ...base, kind: 'payment_out', amount: 0 }), /need_amount/);
  assert.throws(() => cleanDoc({ ...base, kind: 'sale_order', items: [{ name: '' }] }), /need_items/);
  assert.throws(() => cleanDoc({ kind: 'loan_txn', date: '2026-10-01', amount: 10 }), /need_loan/);
  const p = cleanDoc({ ...base, kind: 'payment_out', mode: 'weird' });
  assert.equal(p.party, 'Ramesh Agencies'); assert.equal(p.mode, 'cash');
  const so = cleanDoc({ ...base, kind: 'sale_order', items: [{ name: 'Pen', qty: 10, rate: 5, taxPercent: 18 }] });
  assert.equal(so.amount, 59); assert.equal(so.status, 'open');
  assert.equal(cleanDoc({ kind: 'cash_adj', date: '2026-10-01', amount: 100 }).direction, 'add');
  const pr = cleanDoc({ ...base, kind: 'purchase_return', tax: 9999 });
  assert.equal(pr.tax, 500);
  const ch = cleanDoc({ ...base, kind: 'cheque', status: 'zzz' });
  assert.equal(ch.status, 'pending'); assert.equal(ch.direction, 'received');
  const t = cleanDoc({ kind: 'loan_txn', loanId: 'l1', date: '2026-10-01', amount: 1000, interest: 200 });
  assert.equal(t.principal, 800);
});

const docs = [
  { id: 'd1', kind: 'payment_out', date: '2026-10-01', party: 'Ramesh Agencies', amount: 300, mode: 'cash', purchaseId: 'pu2' },
  { id: 'd2', kind: 'purchase_return', date: '2026-10-02', party: 'Ramesh Agencies', amount: 118, tax: 18 },
  { id: 'd3', kind: 'purchase_return', date: '2026-10-02', party: 'Metro', amount: 112, tax: 12, interstate: true },
  { id: 'd4', kind: 'cheque', date: '2026-10-03', party: 'Lakshmi', amount: 1000, direction: 'received', status: 'cleared' },
  { id: 'd5', kind: 'cheque', date: '2026-10-03', party: 'Metro', amount: 400, direction: 'issued', status: 'cleared', clearedOn: '2026-10-05' },
  { id: 'd6', kind: 'cheque', date: '2026-10-03', party: 'X', amount: 50, direction: 'received', status: 'pending' },
  { id: 'd7', kind: 'cash_adj', date: '2026-10-04', amount: 2000, direction: 'add' },
  { id: 'd8', kind: 'cash_adj', date: '2026-10-04', amount: 500, direction: 'reduce' },
  { id: 'l1', kind: 'loan', date: '2026-10-01', party: 'SBI', amount: 100000, direction: 'taken', mode: 'bank' },
  { id: 'l2', kind: 'loan', date: '2026-10-01', party: 'Kumar', amount: 5000, direction: 'given', mode: 'cash' },
  { id: 'e1', kind: 'loan_txn', loanId: 'l1', date: '2026-10-10', amount: 9000, interest: 1000, principal: 8000, mode: 'bank' },
  { id: 'e2', kind: 'loan_txn', loanId: 'l2', date: '2026-10-10', amount: 1100, interest: 100, principal: 1000, mode: 'cash' },
  { id: 'o1', kind: 'sale_order', date: '2026-10-01', party: 'A', amount: 59, items: [] },
];

test('deriveDocVouchers: every voucher balances, orders/pending post nothing', () => {
  const v = deriveDocVouchers(docs, { bankId: 'bank' });
  const ids = v.map(x => x.id);
  assert.ok(!ids.includes('auto:doc:d6')); assert.ok(!ids.includes('auto:doc:o1'));
  assert.equal(v.length, 11);
  for (const x of v) {
    const dr = r2(x.lines.reduce((s, l) => s + l.dr, 0)); const cr = r2(x.lines.reduce((s, l) => s + l.cr, 0));
    assert.equal(dr, cr, `${x.id} dr ${dr} cr ${cr}`); assert.ok(dr > 0);
  }
  const d3 = v.find(x => x.id === 'auto:doc:d3');
  assert.ok(d3.lines.some(l => l.a === 'in_igst' && l.cr === 12));
  assert.equal(v.find(x => x.id === 'auto:doc:d5').date, '2026-10-05');
  const e1 = v.find(x => x.id === 'auto:doc:e1');
  assert.ok(e1.lines.some(l => l.a === 'interest_exp' && l.dr === 1000));
  assert.ok(v.find(x => x.id === 'auto:doc:e2').lines.some(l => l.a === 'interest_income' && l.cr === 100));
});

test('loanSummary', () => {
  assert.deepEqual(loanSummary(docs[8], docs), { principal: 100000, principalPaid: 8000, interestPaid: 1000, outstanding: 92000, payments: 1 });
});

test('purchase dues and paid-by-docs skip in accounting', () => {
  assert.equal(paidOutFor('pu2', docs), 300);
  assert.equal(purchaseDue({ id: 'pu2', totalAmount: 590 }, docs), 290);
  assert.equal(purchaseDue({ id: 'pu9', totalAmount: 590, paymentStatus: 'Paid' }, docs), 0);
  const paidBy = purchasesPaidByDocs(docs);
  assert.ok(paidBy.has('pu2'));
  const purchases = [{ id: 'pu2', supplierName: 'Ramesh Agencies', invoiceNumber: 'RA-1', date: '2026-05-01', totalAmount: 590, totalTax: 90, paymentStatus: 'Paid' }];
  const withSkip = deriveVouchers({ bills: [], receipts: [], purchases, expenses: [], paidByDocs: paidBy });
  const noSkip = deriveVouchers({ bills: [], receipts: [], purchases, expenses: [] });
  assert.ok(withSkip.length < noSkip.length, 'auto purchase payment skipped when paid via payment-out');
});

test('applyPaymentToBill / billDue', () => {
  const b = applyPaymentToBill({ totalAmount: 1000, payments: [] }, { amount: 400, date: '2026-10-01', mode: 'upi', receiptNo: 'R-1' });
  assert.equal(b.status, 'partial'); assert.equal(billDue(b), 600);
  const b2 = applyPaymentToBill(b, { amount: 1000, date: '2026-10-01', mode: 'upi', receiptNo: 'R-1' });
  assert.equal(b2.payments.length, 1); assert.equal(b2.status, 'paid');
});

test('order converters', () => {
  const so = { id: 'o1', no: 'SO-1', party: 'A', items: [{ name: 'Pen', qty: 2, rate: 5, taxPercent: 18, productId: 'p1' }] };
  const dr = saleOrderToDraft(so, [{ id: 'p1', hsn: '9608', unit: 'PCS' }]);
  assert.equal(dr._isDuplicate, true); assert.equal(dr.data.items[0].hsn, '9608'); assert.equal(dr.data.items[0].quantity, 2);
  const pb = purchaseOrderToBill({ no: 'PO-1', party: 'M', items: [{ name: 'Ink', qty: 3, rate: 100, taxPercent: 12 }] }, { gstin: 'G' }, '2026-10-11');
  assert.equal(pb.totalAmount, 336); assert.equal(pb.totalTax, 36); assert.equal(pb.paymentStatus, 'Unpaid'); assert.equal(pb.date, '2026-10-11');
});

test('profileCompletion', () => {
  assert.equal(PROFILE_CHECKS.length, 10);
  assert.equal(profileCompletion({}), 0);
  assert.equal(profileCompletion({ businessName: 'D Printers', phone: '9442745754', gstin: '33ABCDE1234F1Z5' }), 30);
});

test('purchase return: itemised amount/tax and stock effect', () => {
  const r = cleanDoc({ kind: 'purchase_return', date: '2026-10-11', party: 'Metro', items: [{ name: 'Ink', qty: 2, rate: 100, taxPercent: 18, productId: 'p1' }, { name: 'Ink', qty: 1, rate: 100, taxPercent: 18, productId: 'p1' }, { name: 'Misc', qty: 1, rate: 10 }] });
  assert.equal(r.amount, 364); assert.equal(r.tax, 54);
  assert.deepEqual(returnStockEffect(r), { p1: -3 });
  assert.deepEqual(returnStockEffect({ ...r, status: 'cancelled' }), {});
  const plain = cleanDoc({ kind: 'purchase_return', date: '2026-10-11', party: 'Metro', amount: 118, tax: 18, items: [] });
  assert.equal(plain.items, undefined); assert.equal(plain.tax, 18); assert.deepEqual(returnStockEffect(plain), {});
  const v = deriveDocVouchers([{ ...r, id: 'r1' }]);
  const dr = v[0].lines.reduce((s, l) => s + l.dr, 0); const cr = v[0].lines.reduce((s, l) => s + l.cr, 0);
  assert.equal(r2(dr), r2(cr));
});

test('phone POS: most-sold picks and cash keypad', () => {
  const products = [{ id: 'a', name: 'Rice' }, { id: 'b', name: 'Oil' }, { id: 'c', name: 'Salt' }];
  const bills = [{ items: [{ name: 'oil', quantity: 5 }, { name: 'Salt', quantity: 1 }] }, { status: 'cancelled', items: [{ name: 'Salt', quantity: 50 }] }];
  assert.deepEqual(topSellers(bills, products, 3).map(p => p.id), ['b', 'c', 'a']);
  assert.equal(topSellers([], products, 2).length, 2);
  let t = '';
  for (const k of ['5', '0', '0']) t = keypad(t, k);
  assert.equal(t, '500'); assert.equal(keypad(t, 'back'), '50'); assert.equal(keypad(t, 'C'), '');
  assert.equal(keypad('0', '7'), '7'); assert.equal(keypad('1.25', '5'), '1.25'); assert.equal(keypad('12', '.'), '12.');
});

console.log(`txn-test: ${n} passed`);
