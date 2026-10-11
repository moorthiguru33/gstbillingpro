// Unit tests for shared/accounting.js. Run: node scripts/acc-test.mjs
import assert from 'node:assert/strict';
import {
  deriveVouchers, planSync, voucherTotals, validateVoucher, cleanVoucher, openingVoucher, chartOfAccounts, expenseAccountFor, modeAccount,
  accountBalances, ledger, partyBalances, trialBalance, profitAndLoss, balanceSheet, fyStartYear, fyRange, fyList, dayBook,
} from '../shared/accounting.js';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

const bills = [
  { id: 'b1', invoiceNumber: 'INV-1', invoiceDate: '2026-05-10', clientName: 'Lakshmi R', totalAmount: 1180, data: { totals: { cgst: 90, sgst: 90, igst: 0 } },
    payments: [{ id: 'p1', amount: 500, date: '2026-05-10', mode: 'cash' }, { amount: 300, date: '2026-05-20', mode: 'upi', receiptNo: 'R-1' }] },
  { id: 'b2', invoiceNumber: 'INV-2', invoiceDate: '2026-06-01', clientName: 'Shree Balaji', totalAmount: 1120, data: { totals: { igst: 120 } } },
  { id: 'b3', invoiceNumber: 'CN-1', invoiceType: 'credit-note', invoiceDate: '2026-06-05', clientName: 'Lakshmi R', totalAmount: 118, data: { totals: { cgst: 9, sgst: 9 } } },
  { id: 'b4', invoiceNumber: 'QT-1', invoiceType: 'quotation', invoiceDate: '2026-06-05', clientName: 'X', totalAmount: 9999 },
  { id: 'b5', invoiceNumber: 'INV-3', invoiceDate: '2026-06-06', clientName: 'Y', totalAmount: 500, status: 'cancelled' },
];
const receipts = [{ id: 'r1', receiptNo: 'R-1', clientName: 'Lakshmi R', amount: 300, date: '2026-05-20', paymentMode: 'UPI' }];
const purchases = [
  { id: 'pu1', supplierName: 'Metro Wholesale', invoiceNumber: 'MW-9', date: '2026-04-15', totalAmount: 1120, totalTax: 120, interstate: true, paymentStatus: 'Paid' },
  { id: 'pu2', supplierName: 'Ramesh Agencies', invoiceNumber: 'RA-1', date: '2026-05-01', totalAmount: 590, totalTax: 90, paymentStatus: 'Unpaid' },
];
const expenses = [
  { id: 'e1', date: '2026-05-02', category: 'Office Rent', amount: 10000, paymentMode: 'Bank Transfer' },
  { id: 'e2', date: '2026-05-03', category: 'Shipping & Courier', amount: 118, gstAmount: 18, paymentMode: 'Cash' },
  { id: 'e3', date: '2026-05-04', category: 'Pooja Items', amount: 200, paymentMode: 'Cash' },
];
const derived = deriveVouchers({ bills, purchases, expenses, receipts, bankId: 'bank_hdfc' });

test('derives the right vouchers, every one balanced', () => {
  const ids = derived.map(v => v.id).sort();
  assert.deepEqual(ids, ['auto:bill:b1', 'auto:bill:b2', 'auto:bill:b3', 'auto:billpay:b1:p1', 'auto:exp:e1', 'auto:exp:e2', 'auto:exp:e3', 'auto:pur:pu1', 'auto:pur:pu2', 'auto:purpay:pu1', 'auto:rcpt:r1'].sort());
  for (const v of derived) { const t = voucherTotals(v); assert.equal(t.dr, t.cr, v.id); assert.equal(validateVoucher(v), '', v.id); }
  const s1 = derived.find(v => v.id === 'auto:bill:b1');
  assert.deepEqual(s1.lines.map(l => [l.a, l.dr, l.cr]), [['debtors', 1180, 0], ['sales', 0, 1000], ['out_cgst', 0, 90], ['out_sgst', 0, 90]]);
  assert.equal(s1.lines[0].p, 'Lakshmi R');
  const cn = derived.find(v => v.id === 'auto:bill:b3');
  assert.equal(cn.type, 'credit_note'); assert.deepEqual(cn.lines.find(l => l.a === 'debtors'), { a: 'debtors', dr: 0, cr: 118, p: 'Lakshmi R' });
  assert.equal(derived.find(v => v.id === 'auto:rcpt:r1').lines[0].a, 'bank_hdfc');
  assert.equal(derived.find(v => v.id === 'auto:pur:pu1').lines.find(l => l.a === 'in_igst').dr, 120);
  const e2 = derived.find(v => v.id === 'auto:exp:e2');
  assert.deepEqual(e2.lines.map(l => [l.a, l.dr, l.cr]), [['freight', 100, 0], ['in_cgst', 9, 0], ['in_sgst', 9, 0], ['cash', 0, 118]]);
  assert.equal(derived.find(v => v.id === 'auto:exp:e3').lines[0].a, 'exp:pooja_items');
});

test('planSync is idempotent and removes stale auto vouchers only', () => {
  const first = planSync(derived, []);
  assert.equal(first.upserts.length, derived.length); assert.equal(first.deletes.length, 0);
  const stored = [...derived.map(v => JSON.parse(JSON.stringify(v))), { id: 'auto:bill:gone', source: 'auto', lines: [] }, { id: 'jv1', source: 'manual', lines: [] }];
  const again = planSync(derived, stored);
  assert.equal(again.upserts.length, 0); assert.deepEqual(again.deletes, ['auto:bill:gone']);
  const changed = deriveVouchers({ bills: [{ ...bills[0], totalAmount: 1190, data: { totals: { cgst: 90, sgst: 90 } } }], bankId: 'bank_hdfc' });
  assert.equal(planSync(changed, stored).upserts.length, 1);
});

test('validation and cleaning of manual vouchers', () => {
  assert.equal(validateVoucher({ date: '2026-05-01', lines: [{ a: 'cash', dr: 100 }, { a: 'capital', cr: 90 }] }), 'not_balanced');
  assert.equal(validateVoucher({ date: '2026-05-01', lines: [{ a: 'cash', dr: 100 }] }), 'need_two_lines');
  assert.equal(validateVoucher({ date: 'x', lines: [] }), 'bad_date');
  assert.equal(validateVoucher({ date: '2026-05-01', lines: [{ a: '', dr: 1 }, { a: 'x', cr: 1 }] }), 'need_account');
  assert.equal(validateVoucher({ date: '2026-05-01', lines: [{ a: 'cash', dr: 1, cr: 1 }, { a: 'x', cr: 0, dr: 0 }, { a: 'y', cr: 1 }] }), 'bad_amount');
  const c = cleanVoucher({ date: '2026-05-01T10:00', lines: [{ a: 'cash', dr: '100.005' }, { a: 'capital', cr: '100.005' }, { a: 'x' }] });
  assert.equal(c.date, '2026-05-01'); assert.equal(c.lines.length, 2); assert.equal(validateVoucher(c), '');
  const ob = openingVoucher([{ a: 'cash', dr: 5000 }, { a: 'debtors', dr: 2000, p: 'Old Party' }, { a: 'capital', cr: 6000 }], '2026-04-01');
  assert.equal(ob.lines.find(l => l.a === 'ob_diff').cr, 1000); assert.equal(validateVoucher(ob), '');
});

test('chart, mappings and FY helpers', () => {
  const ch = chartOfAccounts([{ id: 'bank_hdfc', name: 'HDFC Current', type: 'asset', group: 'bank' }, { id: 'cash', name: 'Galla' }, { id: '_settings:X', kind: 'settings' }], derived);
  assert.equal(ch.find(a => a.id === 'cash').name, 'Galla');
  assert.equal(ch.find(a => a.id === 'bank_hdfc').group, 'bank');
  assert.equal(ch.find(a => a.id === 'exp:pooja_items').name, 'Pooja Items');
  assert.ok(!ch.some(a => a.id.startsWith('_settings')));
  assert.equal(expenseAccountFor('Asset Purchase').a, 'fixed_assets'); assert.equal(expenseAccountFor('Personal / Drawings').a, 'drawings');
  assert.equal(expenseAccountFor('Other').a, 'misc_exp'); assert.equal(modeAccount('Cash', 'b'), 'cash'); assert.equal(modeAccount('upi', 'b'), 'b');
  assert.equal(fyStartYear('2026-03-31'), 2025); assert.equal(fyStartYear('2026-04-01'), 2026);
  assert.deepEqual(fyRange(2026), { from: '2026-04-01', to: '2027-03-31' });
  assert.deepEqual(fyList([{ date: '2025-01-01' }], '2026-10-11'), [2026, 2024]);
});

const ob = openingVoucher([{ a: 'cash', dr: 5000 }, { a: 'stock', dr: 3000 }, { a: 'capital', cr: 8000 }], '2025-04-01');
const prior = { id: 'jvp', date: '2025-08-01', type: 'journal', source: 'manual', lines: [{ a: 'cash', dr: 700 }, { a: 'other_income', cr: 700 }] };
const all = [ob, prior, ...derived];
const chart = chartOfAccounts([{ id: 'bank_hdfc', name: 'HDFC', type: 'asset', group: 'bank' }], all);
const range = fyRange(2026);

test('ledgers, cash book and party balances', () => {
  const cash = ledger(all, 'cash', range);
  assert.equal(cash.opening, 5700);
  assert.equal(cash.closing, r(5700 + 500 - 118 - 200));
  const lak = ledger(all, ['debtors', 'creditors'], { ...range, party: 'lakshmi r' });
  assert.equal(lak.closing, r(1180 - 500 - 300 - 118));
  const parties = partyBalances(all);
  assert.equal(parties.find(p => p.name === 'Ramesh Agencies').net, -590);
  assert.equal(parties.find(p => p.name === 'Metro Wholesale').net, 0);
  assert.equal(dayBook(all, { from: '2026-05-10', to: '2026-05-10' }).length, 2);
  const bal = accountBalances(all, { to: range.to });
  assert.equal(bal.get('bank_hdfc').close, r(300 - 1120 - 10000));
});
function r(x) { return Math.round(x * 100) / 100; }

test('trial balance balances; P&L and balance sheet tie out (with stock + prior year)', () => {
  const tb = trialBalance(all, chart, range);
  assert.equal(tb.diff, 0);
  assert.ok(tb.rows.some(x => x.id === '_retained' && x.cr === 700));
  const pl = profitAndLoss(all, chart, { ...range, closingStock: 4000 });
  // sales 1000 + 1000 − returns 100 − purchases (1000 + 500) − freight 100 + (4000 − 3000)
  assert.equal(pl.grossProfit, 1300);
  assert.equal(pl.netProfit, r(1300 - 10000 - 200));
  for (const cs of [4000, undefined, 0]) {
    const bs = balanceSheet(all, chart, { ...range, closingStock: cs });
    assert.equal(bs.diff, 0, `closing stock ${cs}`);
  }
  const bs2 = balanceSheet(all, chart, { ...range, closingStock: 4500, openingStock: 3500 });
  assert.equal(bs2.diff, 0);
  const prev = balanceSheet(all, chart, fyRange(2025));
  assert.equal(prev.diff, 0); assert.equal(prev.netProfit, 700);
});

console.log(`acc-test: ${n} groups passed`);
