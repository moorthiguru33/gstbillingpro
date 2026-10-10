// Normalises bills saved by older builds so every screen reads one shape.
// Old demo data / early POS bills used invoiceType 'regular' and `total`
// instead of 'tax-invoice' and `totalAmount`, which made the Dashboard
// totals show 0, sample invoices ₹0.00 and the type badge blank.
const LEGACY_TYPES = { regular: 'tax-invoice', invoice: 'tax-invoice', tax_invoice: 'tax-invoice', pos: 'tax-invoice' };

const n = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? undefined : Number(v));

export function normalizeBill(bill) {
  if (!bill || typeof bill !== 'object') return bill;
  const out = { ...bill };
  if (LEGACY_TYPES[out.invoiceType]) out.invoiceType = LEGACY_TYPES[out.invoiceType];
  if (n(out.totalAmount) === undefined) {
    out.totalAmount = n(bill.total) ?? n(bill.data?.totals?.total) ?? 0;
  }
  if (n(out.totalTaxAmount) === undefined) {
    out.totalTaxAmount = n(bill.taxAmount) ?? n(bill.data?.totals?.totalTaxAmount) ?? 0;
  }
  if (!out.invoiceNumber && out.data?.details?.invoiceNumber) out.invoiceNumber = out.data.details.invoiceNumber;
  if (!out.invoiceDate && out.data?.details?.invoiceDate) out.invoiceDate = out.data.details.invoiceDate;
  if (!out.clientName && out.data?.client?.name) out.clientName = out.data.client.name;
  if (out.data && LEGACY_TYPES[out.data.invoiceType]) out.data = { ...out.data, invoiceType: out.invoiceType };
  return out;
}
