// Product field normalisation.
// Products reach the store from several places that historically used
// different field names: the Products form (sellingPrice / rate /
// taxPercent), the starter & master catalogues and older demo data
// (price / taxRate), CSV imports (rate / price), and QuickPOS. Readers
// were equally inconsistent, which is why the Products table showed "-" for
// Rate and GST% on catalogue items. Every product is now stored with ALL
// aliases filled from one canonical value.

const num = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function productSellingPrice(p) {
  if (!p) return 0;
  return num(p.sellingPrice) ?? num(p.rate) ?? num(p.price) ?? 0;
}

/** GST % of a product, or undefined when it was never set. */
export function productTaxPercent(p) {
  if (!p) return undefined;
  return num(p.taxPercent) ?? num(p.taxRate) ?? num(p.tax_rate) ?? num(p.gst);
}

export function normalizeProduct(p) {
  if (!p || typeof p !== 'object') return p;
  const price = productSellingPrice(p);
  const tax = productTaxPercent(p);
  const out = { ...p, sellingPrice: price, rate: price, price };
  if (tax !== undefined) {
    out.taxPercent = tax;
    out.taxRate = tax;
  }
  const purchase = num(p.purchasePrice);
  if (purchase !== undefined) out.purchasePrice = purchase;
  const mrp = num(p.mrp);
  if (mrp !== undefined) out.mrp = mrp;
  return out;
}
