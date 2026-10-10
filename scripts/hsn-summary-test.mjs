// Unit tests for the GSTR-1 Table 12 HSN summary (src/utils/hsnSummary.js).
import assert from 'node:assert/strict';
import { buildHsnSummary, normalizeHsn } from '../src/utils/hsnSummary.js';

let passed = 0;
const t = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n`, e); process.exitCode = 1; }
};

// Simple intra-state split: taxable = qty*rate, CGST = SGST = half the tax.
const split = (item, bill) => {
  const taxable = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
  const tax = taxable * (Number(item.taxPercent) || 0) / 100;
  return bill.inter
    ? { taxable, cgst: 0, sgst: 0, utgst: 0, igst: tax, cess: 0 }
    : { taxable, cgst: tax / 2, sgst: tax / 2, utgst: 0, igst: 0, cess: 0 };
};
const sign = (bill) => (bill.invoiceType === 'credit-note' ? -1 : 1);
const bill = (no, items, extra = {}) => ({ invoiceNumber: no, invoiceType: 'tax-invoice', data: { items }, ...extra });

t('normalizeHsn', () => {
  assert.equal(normalizeHsn(' 4802 '), '4802');
  assert.equal(normalizeHsn('48 02.10'), '480210');
  assert.equal(normalizeHsn('N/A'), '');
  assert.equal(normalizeHsn('123'), '');
  assert.equal(normalizeHsn('12345'), '');
  assert.equal(normalizeHsn(''), '');
});

const bills = [
  bill('INV-1', [
    { name: 'A4 Paper', hsn: '4802', quantity: 2, rate: 100, taxPercent: 12, unit: 'Nos' },
    { name: 'A4 Paper Bundle', hsn: '4802 ', quantity: 1, rate: 50, taxPercent: 12, unit: 'NOS' },
    { name: 'Pen', hsn: '9608', quantity: 10, rate: 5, taxPercent: 18, unit: 'pcs' },
    { name: 'Loose item', hsn: '', quantity: 1, rate: 40, taxPercent: 18, unit: 'Nos' },
  ]),
  bill('INV-2', [
    { name: 'A4 Paper', hsn: '4802', quantity: 3, rate: 100, taxPercent: 12, unit: 'Nos' },
    { name: 'Repair', hsn: 'N/A', quantity: 1, rate: 100, taxPercent: 18, unit: 'Nos' },
  ], { inter: true }),
  bill('CN-1', [
    { name: 'A4 Paper', hsn: '4802', quantity: 1, rate: 100, taxPercent: 12, unit: 'Nos' },
  ], { invoiceType: 'credit-note' }),
];
const rows = buildHsnSummary(bills, { split, sign });

t('one row per HSN + rate + UQC (spaces / case of unit ignored)', () => {
  const paper = rows.filter((r) => r.hsn === '4802');
  assert.equal(paper.length, 1);
  assert.equal(paper[0].uqc, 'NOS');
  // 2 + 1 + 3 - 1 (credit note)
  assert.equal(paper[0].quantity, 5);
  assert.equal(paper[0].taxable, 200 + 50 + 300 - 100);
  assert.equal(paper[0].igst, 36);           // INV-2 inter-state: 300 * 12%
  assert.equal(paper[0].cgst, 12 + 3 - 6);   // intra: (200+50)*6% - CN 100*6%
});
t('UQC from unit label (pcs -> PCS)', () => assert.equal(rows.find((r) => r.hsn === '9608').uqc, 'PCS'));
t('HSN description from the HSN table, not a random product name', () => {
  assert.notEqual(rows.find((r) => r.hsn === '9608').description, '');
});
t('missing HSN items grouped into one flagged row, listed last', () => {
  const missing = rows.filter((r) => r.missing);
  assert.equal(missing.length, 1); // both are 18% / NOS
  assert.equal(rows[rows.length - 1].missing, true);
  assert.deepEqual(missing[0].itemNames.sort(), ['Loose item', 'Repair']);
  assert.deepEqual(missing[0].invoiceNumbers.sort(), ['INV-1', 'INV-2']);
  assert.equal(missing[0].taxable, 140);
  assert.match(missing[0].description, /Missing HSN\/SAC — 2 items on 2 invoices/);
});
t('sorted by HSN', () => {
  const codes = rows.filter((r) => !r.missing).map((r) => r.hsn);
  assert.deepEqual(codes, [...codes].sort());
});
t('totals preserved', () => {
  const sum = rows.reduce((s, r) => s + r.taxable, 0);
  assert.equal(sum, 200 + 50 + 50 + 40 + 300 + 100 - 100);
});
t('same HSN at two rates gives two rows', () => {
  const r = buildHsnSummary([bill('X', [
    { name: 'a', hsn: '1905', quantity: 1, rate: 10, taxPercent: 5, unit: 'Nos' },
    { name: 'b', hsn: '1905', quantity: 1, rate: 10, taxPercent: 18, unit: 'Nos' },
  ])], { split });
  assert.equal(r.length, 2);
  assert.notEqual(r[0].key, r[1].key);
});
t('empty input', () => assert.deepEqual(buildHsnSummary([], { split }), []));

console.log(`hsn-summary-test: ${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
