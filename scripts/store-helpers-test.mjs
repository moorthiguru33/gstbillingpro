// Tests for pure helpers used by the hosted store: product/bill
// normalisation, recurring invoice generation, demo data shape.
// Run: node scripts/store-helpers-test.mjs
import { normalizeProduct, productSellingPrice, productTaxPercent } from '../src/utils/products.js';
import { normalizeBill } from '../src/utils/bills.js';
import { advanceDate, templateHasEnded, isTemplateDue, buildBillFromTemplate, prefixForInvoiceType, profileForTemplate } from '../src/utils/recurring.js';
import { DEMO_BILLS, DEMO_PRODUCTS, DEMO_PROFILE, DEMO_LAST_INVOICE_SEQ } from '../src/data/demoData.js';
import { STARTER_CATALOG } from '../src/data/starterCatalog.js';
import { INVOICE_TYPES, salesSign } from '../src/utils.js';

let failed = 0, passed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log('products');
let p = normalizeProduct({ name: 'Salt', price: 25, taxRate: 0 });
eq([p.sellingPrice, p.rate, p.price, p.taxPercent, p.taxRate], [25, 25, 25, 0, 0], 'catalogue shape → all aliases (0% kept)');
p = normalizeProduct({ name: 'Pen', sellingPrice: '10', rate: 8, taxPercent: '18' });
eq([p.sellingPrice, p.rate, p.taxPercent], [10, 10, 18], 'form shape: sellingPrice wins, strings → numbers');
eq(productTaxPercent({ name: 'x' }), undefined, 'missing GST stays undefined (shows -)');
eq(productSellingPrice({ rate: '' , price: 5 }), 5, 'empty rate falls back to price');
ok(STARTER_CATALOG.every(x => productSellingPrice(x) > 0 && productTaxPercent(x) !== undefined), 'every starter item has a rate and GST%');
ok(DEMO_PRODUCTS.every(x => x.sellingPrice > 0 && x.taxPercent !== undefined), 'demo products have rate and GST%');

console.log('bills');
const legacy = normalizeBill({ id: 'X1', invoiceType: 'regular', total: 1180, status: 'paid' });
eq([legacy.invoiceType, legacy.totalAmount], ['tax-invoice', 1180], 'legacy regular/total normalised');
eq(salesSign(legacy), 1, 'legacy bill now counts as a sale');
eq(normalizeBill({ id: 'Y', totalAmount: 0, total: 50 }).totalAmount, 0, 'explicit 0 totalAmount kept');
eq(normalizeBill({ id: 'Z', data: { totals: { total: 99, totalTaxAmount: 9 } } }).totalAmount, 99, 'totalAmount from data.totals');

console.log('demo data');
ok(DEMO_BILLS.length >= 3, 'demo has bills');
ok(DEMO_BILLS.every(b => INVOICE_TYPES[b.invoiceType]?.label), 'every demo bill type has a badge label');
ok(DEMO_BILLS.every(b => b.totalAmount > 0 && b.data?.totals?.total === b.totalAmount), 'demo totals non-zero and consistent');
ok(DEMO_BILLS.every(b => /^INV\/\d{4}-\d{2}\/\d{4}$/.test(b.invoiceNumber)), 'demo numbers use INV/FY/0001 format');
eq(Math.max(...DEMO_BILLS.map(b => Number(b.invoiceNumber.split('/').pop()))), DEMO_LAST_INVOICE_SEQ, 'DEMO_LAST_INVOICE_SEQ = highest sample number');
for (const b of DEMO_BILLS) {
  const paid = (b.payments || []).reduce((s, x) => s + x.amount, 0);
  const expect = paid >= b.totalAmount - 0.005 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  eq(b.status, expect, `${b.invoiceNumber} status matches payments`);
  eq(b.paidAmount, Math.round(paid * 100) / 100, `${b.invoiceNumber} paidAmount = sum(payments)`);
}
ok(!!DEMO_PROFILE.businessName, 'demo profile has businessName');

console.log('recurring');
eq(advanceDate('2026-01-31', 'monthly', 1), '2026-02-28', '31 Jan + 1 month = 28 Feb');
eq(advanceDate('2028-01-31', 'monthly', 1), '2028-02-29', 'leap year');
eq(advanceDate('2026-03-31', 'quarterly', 1), '2026-06-30', 'quarterly clamps');
eq(advanceDate('2026-10-11', 'weekly', 2), '2026-10-25', 'every 2 weeks');
eq(advanceDate('2026-10-11', 'yearly', 1), '2027-10-11', 'yearly');
eq(advanceDate('bad', 'monthly', 1), 'bad', 'bad date untouched');
ok(templateHasEnded({ endMode: 'afterN', maxOccurrences: 3, occurrencesCreated: 3 }, '2026-10-11'), 'afterN ended');
ok(!templateHasEnded({ endMode: 'onDate', endDate: '2026-12-31' }, '2026-10-11'), 'onDate not yet');
ok(isTemplateDue({ nextDate: '2026-10-11' }, '2026-10-11'), 'no active flag = active, due today');
ok(!isTemplateDue({ nextDate: '2026-10-11', active: false }, '2026-10-11'), 'paused not due');
eq(prefixForInvoiceType('proforma'), 'EST', 'proforma prefix'); eq(prefixForInvoiceType(undefined), 'INV', 'default prefix');
const profiles = [{ id: 'a', businessName: 'A', gstin: '33AAA' }, { id: 'b', businessName: 'B', gstin: '29BBB' }];
eq(profileForTemplate({ ownerGstin: '29BBB' }, profiles, profiles[0]).id, 'b', 'template bills for its own business');

const tpl = {
  id: 'rec_1', clientName: 'Sri Murugan Stores', clientState: 'Tamil Nadu', clientGstin: '33ABCDE1234F1Z5',
  frequency: 'monthly', interval: 1, nextDate: '2026-10-01', invoiceType: 'tax-invoice',
  items: [{ name: 'AMC', hsn: '998713', quantity: 1, rate: 1000, taxPercent: 18, discount: 0 }, { description: 'Old field', quantity: 2, rate: 100, taxPercent: 0 }],
};
const { bill, nextTemplate } = buildBillFromTemplate({
  tpl, profile: { businessName: 'D Printers', state: 'Tamil Nadu', gstin: '33AAAAA0000A1Z5' },
  invoiceNumber: 'INV/2026-27/0007', today: '2026-10-11', bills: [],
});
eq(bill.totalAmount, 1380, 'total = 1000 + 18% + 200');
eq(bill.totalTaxAmount, 180, 'tax 180');
ok(bill.data.totals.cgst === 90 && bill.data.totals.sgst === 90 && !bill.data.totals.igst, 'intrastate split CGST/SGST');
eq(bill.data.items[1].name, 'Old field', 'legacy description → name');
eq([bill.id, bill.invoiceNumber, bill.status, bill.generatedFrom], ['INV/2026-27/0007', 'INV/2026-27/0007', 'unpaid', 'rec_1'], 'bill identity');
eq([nextTemplate.nextDate, nextTemplate.occurrencesCreated, nextTemplate.lastGenerated], ['2026-11-01', 1, '2026-10-11'], 'template advanced');
const inter = buildBillFromTemplate({ tpl: { ...tpl, clientState: 'Karnataka' }, profile: { state: 'Tamil Nadu' }, invoiceNumber: 'X', today: '2026-10-11' }).bill;
ok(inter.data.totals.igst === 180 && !inter.data.totals.cgst, 'interstate → IGST');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
