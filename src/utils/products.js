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

const nameKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Default GST % for a NEW line item / product. Uses the business's own
 * setting (profile.defaultTaxRate, Settings > Tax) when set, otherwise 18%
 * where the country uses it, otherwise the second-highest rate.
 */
export function defaultTaxRateFor(profile, countryRates = [0, 5, 12, 18, 28, 40]) {
  const own = num(profile?.defaultTaxRate);
  if (own !== undefined && own >= 0 && own <= 100) return own;
  if (countryRates.includes(18)) return 18;
  return countryRates[countryRates.length - 2] ?? 0;
}

/**
 * Line items typed by hand on an invoice that are not in the product
 * catalogue yet (no productId and no product with the same name), as
 * product records ready for saveProductsBatch(). Duplicates within the
 * invoice are collapsed; blank / zero-rate rows are skipped.
 */
export function findNewCatalogItems(items = [], products = [], skipNames = new Set()) {
  const known = new Set(products.map((p) => nameKey(p?.name)).filter(Boolean));
  const ids = new Set(products.map((p) => p?.id).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = nameKey(it?.name);
    if (!key || key.length < 2) continue;
    if (it.productId && ids.has(it.productId)) continue;
    if (known.has(key) || seen.has(key) || skipNames.has(key)) continue;
    const rate = num(it.rate);
    if (!(rate > 0)) continue;
    seen.add(key);
    out.push(normalizeProduct({
      name: String(it.name).trim().replace(/\s+/g, ' '),
      hsn: it.hsn || '',
      unit: it.unit || 'Nos',
      sellingPrice: rate,
      ...(num(it.taxPercent) !== undefined ? { taxPercent: num(it.taxPercent) } : {}),
      ...(num(it.mrp) > 0 ? { mrp: num(it.mrp) } : {}),
      source: 'invoice',
    }));
  }
  return out;
}

export { nameKey as productNameKey };
