// Purchase-bill OCR text parsing (pure functions, unit-tested in
// scripts/ocr-parse-test.mjs). Moved out of BillOCR.jsx so it can be tested
// without tesseract / React.

// GSTIN: 2-digit state code + 5 letters + 4 digits + 1 letter + entity
// code (digit/letter) + 'Z' + check digit/letter. Real length: 15.
export const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/;

// Date variants seen on Indian tax invoices:
//   14/07/2026, 14-07-2026, 14.07.26, 14 Jul 2026, 14-Jul-2026, Jul 14, 2026.
// Numeric dates are DD/MM (India). MM/DD is only assumed when the first
// part cannot be a month and the second can't be a day-of-month swap
// (e.g. 07/14/2026). ISO 2026-07-14 is also accepted.
const NUMERIC_DATE_RE = /(?<![\d/.-])(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4}|\d{2})(?![\d/.-])/g;
const ISO_DATE_RE = /(?<![\d/.-])(20\d{2})-(\d{1,2})-(\d{1,2})(?![\d/.-])/g;
const NAMED_DATE_RE = /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?[\s\-/.,]*(\d{4}|\d{2})\b/gi;
const NAMED_DATE_US_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const toIso = (y, mo, d) => {
  if (y < 100) y = 2000 + y;
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31) || y < 2000 || y > 2100) return '';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return ''; // 31/02 etc.
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Every date in the text as { iso, index }, in reading order. */
export const findDates = (text) => {
  const out = [];
  for (const m of text.matchAll(NUMERIC_DATE_RE)) {
    const a = Number(m[1]); const b = Number(m[2]); const y = Number(m[3]);
    // DD/MM first; MM/DD only when DD/MM is impossible.
    const iso = toIso(y, b, a) || (a <= 12 && b > 12 ? toIso(y, a, b) : '');
    if (iso) out.push({ iso, index: m.index });
  }
  for (const m of text.matchAll(ISO_DATE_RE)) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) out.push({ iso, index: m.index });
  }
  for (const m of text.matchAll(NAMED_DATE_RE)) {
    const iso = toIso(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
    if (iso) out.push({ iso, index: m.index });
  }
  for (const m of text.matchAll(NAMED_DATE_US_RE)) {
    const iso = toIso(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]));
    if (iso) out.push({ iso, index: m.index });
  }
  return out.sort((x, y) => x.index - y.index);
};

// Invoice date: the first date after an "Invoice Date" / "Bill Date" /
// "Date" label; otherwise the first date on the bill (not, e.g., a due
// date or the e-way bill validity that happens to come first).
export const parseDateFrom = (text) => {
  const dates = findDates(text);
  if (!dates.length) return '';
  const labels = [
    /(?:invoice|inv|bill|voucher)\.?\s*date/gi,
    /(?<!due\s)(?<!due\s\s)\bdated?\b/gi,
  ];
  for (const re of labels) {
    for (const m of text.matchAll(re)) {
      const next = dates.find((d) => d.index >= m.index && d.index - m.index <= 40);
      if (next) return next.iso;
    }
  }
  return dates[0].iso;
};

// Invoice number: the token after "Invoice No", "Bill No", "Inv #" … It
// must contain a digit — "TAX INVOICE" followed by "ORIGINAL FOR
// RECIPIENT" used to yield "ORIGINAL". Stays on the same line.
export const parseInvoiceNumber = (text) => {
  const re = /(?:invoice|bill|inv|voucher)[ \t]*(?:no\.?|#|number|num)[ \t]*[:.-]?[ \t]*([A-Za-z0-9][A-Za-z0-9/-]{0,24})/gi;
  for (const m of text.matchAll(re)) {
    if (/\d/.test(m[1])) return m[1].trim();
  }
  const loose = /(?:invoice|bill|inv)[ \t]*[:#][ \t]*([A-Za-z0-9][A-Za-z0-9/-]{0,24})/gi;
  for (const m of text.matchAll(loose)) {
    if (/\d/.test(m[1])) return m[1].trim();
  }
  return '';
};

// Lines that are labels / boilerplate, never a supplier name.
const NOT_A_NAME_RE = /\b(?:gstin|gst\s*(?:no|number|in)|uin|pan|tax\s+invoice|invoice|bill\s+of\s+supply|cash\s+memo|estimate|original|duplicate|triplicate|recipient|transporter|phone|ph|mobile|mob|tel|cell|e-?mail|website|www|state(?:\s+code)?|pin(?:\s*code)?|address|date|place\s+of\s+supply|cin|fssai|bank|ifsc|a\/c)\b/i;

// Supplier name — heuristic: the first uppercase-heavy line above the
// GSTIN, skipping label lines ("GSTIN:", "TAX INVOICE", "Ph: …").
export const parseSupplierName = (text) => {
  const gstinIdx = text.search(GSTIN_RE);
  const above = gstinIdx > 0 ? text.slice(0, gstinIdx) : text;
  const lines = above.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const isCandidate = (line, minUpper) => {
    if (line.length < 4 || line.length > 80) return false;
    if (NOT_A_NAME_RE.test(line)) return false;
    if (/^[^A-Za-z]*$/.test(line)) return false;
    // Mostly digits (phone / PIN / address numbers) → not a name.
    const digits = line.replace(/\D/g, '').length;
    const letters = line.replace(/[^A-Za-z]/g, '');
    if (letters.length < 4 || digits > letters.length) return false;
    const upper = letters.replace(/[^A-Z]/g, '').length / letters.length;
    return upper >= minUpper;
  };
  // The registered name is usually the FIRST prominent line of the bill.
  const strong = lines.find((l) => isCandidate(l, 0.5) && /\b(?:m\/s|pvt|private|ltd|limited|llp|traders?|enterprises?|agencies|stores?|industries|& co|and co|company|corporation|mart|centre|center|distributors?|suppliers?|sons)\b/i.test(l));
  if (strong) return strong.replace(/^m\/s\.?\s*/i, '').trim();
  const first = lines.find((l) => isCandidate(l, 0.5));
  if (first) return first;
  return '';
};

// Grand total — walks label patterns from most-specific to most-general,
// returns the first match as a JS number. Indian rupee formatting has
// commas we strip; a bare "Total" without a currency prefix is fine.
export const parseGrandTotal = (text) => {
  const amount = (raw) => {
    const n = Number(String(raw).replace(/,/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
  };
  // Specific labels: first hit wins.
  const specific = [
    /grand\s*total[^0-9\n-]{0,15}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
    /(?:amount|amt)\s+payable[^0-9\n-]{0,15}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
    /net\s+(?:amount|payable|total)[^0-9\n-]{0,15}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
    /invoice\s+(?:total|value|amount)[^0-9\n-]{0,15}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
  ];
  for (const re of specific) {
    const m = text.match(re);
    const n = m ? amount(m[1]) : 0;
    if (n) return n;
  }
  // Bare "Total": the LAST one on the bill (the item-table and tax
  // sub-totals come first), skipping Sub Total / Total Qty / Total Tax.
  let last = 0;
  for (const m of text.matchAll(/(sub\s?)?total(\s+(?:qty|quantity|items?|tax|gst|cgst|sgst|igst|discount|taxable))?[^0-9\n-]{0,15}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/gi)) {
    if (m[1] || m[2]) continue;
    const n = amount(m[3]);
    if (n) last = n;
  }
  return last;
};

// v1.10.35 — Tax-breakdown extraction. Grabs CGST / SGST / IGST / cess
// amounts + taxable value + round-off. Indian tax invoices lay these
// under the item table with labels like "CGST 9% 45.00" or "IGST @18%
// = 90.00". Regex tolerates the wide space + punctuation variance
// tesseract introduces when characters split awkwardly across an OCR
// scan.
export const parseTaxBreakdown = (text) => {
  const out = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, roundOff: 0 };
  const num = (m) => {
    if (!m) return 0;
    const n = Number(m[m.length - 1].replace(/,/g, ''));
    return isFinite(n) && n >= 0 ? n : 0;
  };
  const patterns = {
    taxableValue: [
      /(?:taxable\s+(?:value|amount))[^0-9-]{0,15}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
      /(?:sub\s?total|subtotal)[^0-9-]{0,10}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
    ],
    cgst: [
      /\bcgst[^0-9-]{0,15}(?:@?\s*\d+(?:\.\d+)?%?)?[^0-9-]{0,10}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
    ],
    sgst: [
      /\b(?:sgst|utgst)[^0-9-]{0,15}(?:@?\s*\d+(?:\.\d+)?%?)?[^0-9-]{0,10}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
    ],
    igst: [
      /\bigst[^0-9-]{0,15}(?:@?\s*\d+(?:\.\d+)?%?)?[^0-9-]{0,10}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
    ],
    cess: [
      /\bcess[^0-9-]{0,15}(?:@?\s*\d+(?:\.\d+)?%?)?[^0-9-]{0,10}(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
    ],
    roundOff: [
      /(?:round\s*(?:off|ing))[^0-9-]{0,10}(?:rs\.?|inr|₹)?\s*(-?[\d,]+\.?\d*)/i,
    ],
  };
  for (const [key, list] of Object.entries(patterns)) {
    for (const re of list) {
      const m = text.match(re);
      if (m) { out[key] = num(m); break; }
    }
  }
  return out;
};

// v1.10.35 — Line-item heuristic. Bill layouts vary but a taxable line
// almost always ends with a numeric column pair (rate, amount). We walk
// the raw OCR text row-by-row, keep only rows that look like table
// entries (short-ish, end with 2+ numeric tokens), and pull out:
//   - name        : leading text up to the first HSN/qty/rate token
//   - hsn         : nearby 4/6/8-digit code
//   - quantity    : first bare integer (with optional decimal)
//   - rate        : the LAST number that's not the row total
//   - amount      : the LAST number on the row
//   - taxPercent  : "18%"/"5%" etc if present on the row
// This won't be perfect on every bill — user reviews + edits before
// applying. But even 60% accuracy on 5 items beats manual typing.
// Words that anchor "this line is a total / header / label, NOT a line item":
const NON_ITEM_ANCHORS = /^(?:sub\s?total|subtotal|grand\s+total|total|net\s+(?:amount|payable|total)|amount\s+(?:payable|in\s+words|chargeable)|rupees|cgst|sgst|utgst|igst|cess|round|balance|discount|freight|shipping|packing|handling|tds|tcs|advance|received|paid|dues?|hsn|sac|desc|description|particulars|item\s*(?:name|description)?|product|goods|qty|quantity|rate|amount|s\.?\s*no|sno|sl\.?\s*no|sr\.?\s*no|si\.?\s*no|#|no\.|invoice|inv|bill|dated?|due|gstin|gst|pan|state|place\s+of\s+supply|phone|ph|mob(?:ile)?|tel|e-?mail|pin(?:\s*code)?|address|vehicle|e-?way|transport|lr\s*no|bank|a\/c|ifsc|upi|terms|declaration|for\s+|authori[sz]ed|signature|thank)\b/i;
// A column-header row names several columns, wherever it starts.
const HEADER_WORDS_RE = /\b(?:hsn|sac|qty|quantity|rate|price|amount|amt|description|particulars|uom|unit|gst%?|tax|disc|mrp|per)\b/gi;
const isHeaderRow = (line) => {
  const hits = new Set((line.match(HEADER_WORDS_RE) || []).map((w) => w.toLowerCase()));
  // A real item row has prices; a header has 3+ column names and no decimals.
  return hits.size >= 3 && !/\d+\.\d{2}\b/.test(line);
};

const UNIT_TOKEN_RE = /^(?:nos?|pcs?|pieces?|kgs?|g|gm|gms|grams?|ltrs?|l|ml|mtrs?|m|cm|mm|box(?:es)?|pkts?|packs?|doz(?:en)?|sets?|pairs?|rolls?|bags?|btls?|bottles?|units?|hrs?|sqft|reams?)\.?$/i;
const NUM_TOKEN_RE = /^(?:₹|rs\.?)?-?[\d,]+(?:\.\d+)?%?$/i;

export const parseLineItems = (rawText) => {
  const lines = rawText.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    // Skip obvious non-item rows (headers, totals, labels).
    if (line.length < 8 || line.length > 200) continue;
    if (NON_ITEM_ANCHORS.test(line)) continue;
    if (isHeaderRow(line)) continue;
    // Lines carrying a GSTIN or a date are party / invoice details.
    if (GSTIN_RE.test(line) || findDates(line).length) continue;

    // Drop a leading serial number ("1", "01.", "2)") so it is not read
    // as part of the name or as the quantity.
    const body = line.replace(/^(?:item\s*)?\d{1,3}\s*[.):-]?\s+(?=\S*[A-Za-z])/i, '');
    const tokens = body.split(/\s+/);
    // The numeric columns are the trailing run of number / % / unit tokens.
    let start = tokens.length;
    while (start > 0 && (NUM_TOKEN_RE.test(tokens[start - 1]) || UNIT_TOKEN_RE.test(tokens[start - 1]))) start--;
    const nameTokens = tokens.slice(0, start);
    const cols = tokens.slice(start);
    let name = nameTokens.join(' ').replace(/[|:;,-]+$/, '').trim();
    if (!name || !/[A-Za-z]{3,}/.test(name)) continue;
    // "Label: 123 456" rows (e.g. "Vehicle No: TN 31 ...") are not items.
    if (/:/.test(nameTokens[nameTokens.length - 1] || '')) continue;

    const pctTok = cols.find((c) => c.endsWith('%'));
    const taxPercent = pctTok ? Number(pctTok.replace(/[^\d.]/g, '')) || 0 : 0;
    const nums = cols
      .filter((c) => NUM_TOKEN_RE.test(c) && !c.endsWith('%'))
      .map((c) => ({ raw: c.replace(/^(?:₹|rs\.?)/i, ''), value: Number(c.replace(/^(?:₹|rs\.?)/i, '').replace(/,/g, '')) }))
      .filter((n) => isFinite(n.value));
    if (nums.length < 2) continue;
    // Last number = amount; second-to-last = rate.
    const amount = nums[nums.length - 1].value;
    const rate = nums[nums.length - 2].value;
    if (!(amount > 0) || !(rate > 0)) continue;
    const rest = nums.slice(0, -2);
    // HSN: a 4/6/8-digit integer column (>= 1000) before qty.
    let hsn = '';
    const hsnTok = rest.find((n) => /^\d{4}(?:\d{2}){0,2}$/.test(n.raw) && n.value >= 1000);
    if (hsnTok) hsn = hsnTok.raw;
    // Quantity: the remaining number closest to the rate (falls back to
    // amount / rate when that is a whole number, else 1).
    const qtyTok = [...rest].reverse().find((n) => n !== hsnTok && n.value > 0 && n.value < 100000);
    let quantity = qtyTok ? qtyTok.value : 1;
    if (!qtyTok) {
      const implied = amount / rate;
      if (Math.abs(implied - Math.round(implied)) < 0.01 && Math.round(implied) >= 1) quantity = Math.round(implied);
    }
    if (name.length > 100) name = name.slice(0, 100);
    items.push({ name, hsn, quantity, rate, amount, taxPercent });
  }
  return items;
};

// v1.10.35 — Fuzzy product-catalog matching. When OCR gives us "Copier
// Paper A4 70gsm" and the user's catalog has "A4 Copier Paper 70 GSM",
// we want to auto-fill HSN + tax rate from the saved product without
// exact-string matching. Token-set overlap (Jaccard) is fast, works
// with word reordering, tolerates spacing/case differences, and is
// portable to any language. Threshold 0.5 = at least half the tokens
// overlap → strong match.
const tokenize = (s) => {
  if (!s) return new Set();
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3)
  );
};
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
};
export const matchProduct = (extractedName, catalog) => {
  if (!catalog?.length) return null;
  const tokens = tokenize(extractedName);
  if (!tokens.size) return null;
  let best = null, bestScore = 0.5; // threshold
  for (const p of catalog) {
    const score = jaccard(tokens, tokenize(p.name));
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best ? { product: best, score: bestScore } : null;
};

// Everything above assembled — returns partial patch of PurchaseBills.emptyForm.
// v1.10.35 — Enriched: line items, tax breakdown, catalog matches.
export const heuristicParseBill = (rawText, catalog = []) => {
  const text = rawText.replace(/[ \t]+/g, ' ');
  const gstinMatch = text.match(GSTIN_RE);
  const items = parseLineItems(rawText);
  // Enrich each item with catalog match (HSN + tax rate fallback).
  const enrichedItems = items.map(it => {
    const match = matchProduct(it.name, catalog);
    if (match) {
      return {
        ...it,
        // Prefer OCR-extracted HSN, fall back to catalog HSN.
        hsn: it.hsn || match.product.hsn || '',
        // Prefer catalog's stored GST rate over the OCR-extracted one —
        // catalog is user-verified, OCR is noisy.
        taxPercent: match.product.taxPercent ?? it.taxPercent,
        // Attach the matched product's id so the caller can link back.
        _matchedProductId: match.product.id,
        _matchScore: match.score,
        _matchedName: match.product.name,
      };
    }
    return it;
  });
  return {
    supplierGstin: gstinMatch ? gstinMatch[0] : '',
    supplierName: parseSupplierName(text),
    invoiceNumber: parseInvoiceNumber(text),
    date: parseDateFrom(text),
    grandTotal: parseGrandTotal(text),
    taxBreakdown: parseTaxBreakdown(text),
    items: enrichedItems,
    _rawText: rawText,
  };
};
