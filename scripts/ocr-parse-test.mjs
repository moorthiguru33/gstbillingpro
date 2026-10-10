// Unit tests for the purchase-bill OCR text parser (src/utils/ocrParse.js).
import assert from 'node:assert/strict';
import {
  parseDateFrom, findDates, parseInvoiceNumber, parseSupplierName,
  parseLineItems, parseGrandTotal, heuristicParseBill,
} from '../src/utils/ocrParse.js';

let passed = 0;
const t = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n`, e); process.exitCode = 1; }
};

// ---- dates: DD/MM is the Indian default ----
t('DD/MM/YYYY', () => assert.equal(parseDateFrom('Date: 05/07/2026'), '2026-07-05'));
t('DD-MM-YY', () => assert.equal(parseDateFrom('Dt 14-07-26'), '2026-07-14'));
t('DD.MM.YYYY', () => assert.equal(parseDateFrom('Invoice Date 01.08.2026'), '2026-08-01'));
t('13/01 is 13 Jan, not invalid', () => assert.equal(parseDateFrom('13/01/2026'), '2026-01-13'));
t('MM/DD only when DD/MM impossible', () => assert.equal(parseDateFrom('07/14/2026'), '2026-07-14'));
t('31/02 rejected', () => assert.deepEqual(findDates('31/02/2026'), []));
t('named month', () => assert.equal(parseDateFrom('14 Jul 2026'), '2026-07-14'));
t('named month with dashes', () => assert.equal(parseDateFrom('14-Jul-2026'), '2026-07-14'));
t('US named', () => assert.equal(parseDateFrom('July 4, 2026'), '2026-07-04'));
t('invoice-number fragments are not dates', () => assert.equal(parseDateFrom('Invoice No: INV/24-25/001\nDate: 02/04/2026'), '2026-04-02'));
t('invoice date label beats an earlier due date', () => assert.equal(
  parseDateFrom('Due Date: 30/08/2026\nInvoice Date: 01/08/2026'), '2026-08-01'));
t('GSTIN digits are not a date', () => assert.deepEqual(findDates('33ABCDE1234F1Z5'), []));

// ---- invoice number ----
t('invoice no', () => assert.equal(parseInvoiceNumber('Invoice No: TN/123/26'), 'TN/123/26'));
t('bill no.', () => assert.equal(parseInvoiceNumber('Bill No. 4521'), '4521'));
t('TAX INVOICE heading is skipped', () => assert.equal(
  parseInvoiceNumber('TAX INVOICE\nORIGINAL FOR RECIPIENT\nInv # A-77'), 'A-77'));

// ---- supplier name ----
const header = `SRI MURUGAN TRADERS
12, Car Street, Chidambaram - 608001
Ph: 04144 222333
GSTIN: 33ABCDE1234F1Z5`;
t('supplier name is not "GSTIN:"', () => assert.equal(parseSupplierName(header), 'SRI MURUGAN TRADERS'));
t('GSTIN on its own line', () => assert.equal(parseSupplierName('TAX INVOICE\nKAVERI AGENCIES\nGSTIN:\n33ABCDE1234F1Z5'), 'KAVERI AGENCIES'));
t('M/S prefix stripped', () => assert.equal(parseSupplierName('M/S RAJ ENTERPRISES\nGSTIN 33ABCDE1234F1Z5'), 'RAJ ENTERPRISES'));

// ---- line items ----
const bill = `${header}
TAX INVOICE
Invoice No: 4521   Date: 14/07/2026
Sl No Description HSN Qty Rate Amount
1 Copier Paper A4 70gsm 4802 10 250.00 2500.00
2 Ball Pen Blue 9608 50 5.00 250.00
Sub Total 2750.00
CGST 9% 247.50
SGST 9% 247.50
Total Qty 60
Grand Total 3245.00`;
const items = parseLineItems(bill);
t('two items only (no header / label / total rows)', () => assert.equal(items.length, 2, JSON.stringify(items)));
t('item 1 parsed', () => assert.deepEqual(
  { name: items[0]?.name, hsn: items[0]?.hsn, quantity: items[0]?.quantity, rate: items[0]?.rate, amount: items[0]?.amount },
  { name: 'Copier Paper A4 70gsm', hsn: '4802', quantity: 10, rate: 250, amount: 2500 }));
t('header-only rows skipped', () => assert.equal(parseLineItems('S.No  Particulars  HSN/SAC  Qty  Rate  Amount').length, 0));
t('phone / date rows skipped', () => assert.equal(parseLineItems('Phone: 04144 222333 9876543210\nDate 14/07/2026 10:30').length, 0));
t('grand total', () => assert.equal(parseGrandTotal(bill), 3245));
t('bare total takes the last one, not Sub Total / Total Qty', () => assert.equal(
  parseGrandTotal('Sub Total 100.00\nTotal Qty 3\nTotal 118.00'), 118));

const parsed = heuristicParseBill(bill, [{ id: 'p1', name: 'A4 Copier Paper 70gsm', hsn: '4802', taxPercent: 12 }]);
t('full parse header fields', () => {
  assert.equal(parsed.supplierName, 'SRI MURUGAN TRADERS');
  assert.equal(parsed.supplierGstin, '33ABCDE1234F1Z5');
  assert.equal(parsed.invoiceNumber, '4521');
  assert.equal(parsed.date, '2026-07-14');
  assert.equal(parsed.grandTotal, 3245);
});
t('catalogue match', () => assert.equal(parsed.items[0]._matchedProductId, 'p1'));

console.log(`ocr-parse-test: ${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
