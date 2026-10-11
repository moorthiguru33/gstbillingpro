// AI billing helpers (Workers AI). Pure functions only: prompts, JSON
// schemas and *strict* normalisers. Model output is never trusted: every
// field is type-checked, clamped and length-limited before it reaches the app.

export const AI_QUOTA = Object.freeze({ free: 10, starter: 50, pro: 200, business: 1000 });
export const aiQuota = (tier) => AI_QUOTA[tier] ?? AI_QUOTA.free;

export const MODELS = Object.freeze({
  stt: '@cf/openai/whisper-large-v3-turbo',
  llm: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  vision: '@cf/meta/llama-3.2-11b-vision-instruct',
});

export const AI_LANGS = Object.freeze(['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu']);
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ITEMS = 100;
export const GST_RATES = Object.freeze([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28]);
const UNITS = ['pcs', 'nos', 'kg', 'g', 'gm', 'l', 'ltr', 'ml', 'm', 'mtr', 'cm', 'ft', 'box', 'pkt', 'dozen', 'set', 'pair', 'bag', 'bottle', 'roll', 'sheet', 'ream', 'hr', 'day', 'job', 'unit'];
const UNIT_ALIAS = { piece: 'pcs', pieces: 'pcs', pc: 'pcs', no: 'nos', number: 'nos', kilo: 'kg', kgs: 'kg', kilogram: 'kg', gram: 'g', grams: 'g', litre: 'l', liter: 'l', litres: 'l', liters: 'l', meter: 'm', metre: 'm', meters: 'm', metres: 'm', packet: 'pkt', packets: 'pkt', boxes: 'box', bags: 'bag', bottles: 'bottle', rolls: 'roll', sheets: 'sheet', dozens: 'dozen', hours: 'hr', hour: 'hr', days: 'day' };

/** Period key for monthly quotas, in India time (YYYY-MM). */
export function aiPeriod(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 7);
}

// ---------------------------------------------------------------- parsing

/** Pull the first JSON object out of a model reply (code fences, prose…). */
export function parseModelJson(out) {
  if (out && typeof out === 'object' && !Array.isArray(out)) {
    if (typeof out.response === 'object' && out.response) return out.response;
    if (typeof out.response === 'string') return parseModelJson(out.response);
    return out;
  }
  if (typeof out !== 'string') return null;
  const s = out.replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0; let inStr = false; let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

const DIGITS = { '०': 0, '१': 1, '२': 2, '३': 3, '४': 4, '५': 5, '६': 6, '७': 7, '८': 8, '९': 9, '০': 0, '১': 1, '২': 2, '৩': 3, '৪': 4, '৫': 5, '৬': 6, '৭': 7, '৮': 8, '৯': 9, '૦': 0, '૧': 1, '૨': 2, '૩': 3, '૪': 4, '૫': 5, '૬': 6, '૭': 7, '૮': 8, '૯': 9, '௦': 0, '௧': 1, '௨': 2, '௩': 3, '௪': 4, '௫': 5, '௬': 6, '௭': 7, '௮': 8, '௯': 9 };

/** "₹1,200.50" / "1.200" / 12 / "१२" → number, else null. Clamped to [0, max]. */
export function toNum(v, { max = 1e9, dp = 3 } = {}) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= max ? round(v, dp) : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[०-९০-৯૦-૯௦-௯]/g, d => DIGITS[d]).replace(/(rs\.?|inr|₹|\/-)/gi, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n <= max ? round(n, dp) : null;
}
const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

export function cleanText(v, max = 120) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  // eslint-disable-next-line no-control-regex -- strip control chars from model output
  return String(v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normUnit(v) {
  const u = cleanText(v, 20).toLowerCase().replace(/\.$/, '');
  if (!u) return '';
  if (UNITS.includes(u)) return u;
  return UNIT_ALIAS[u] || '';
}

export function normGstRate(v) {
  const n = toNum(typeof v === 'string' ? v.replace('%', '') : v, { max: 100 });
  if (n == null) return null;
  return GST_RATES.includes(n) ? n : null;
}

const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export function normGstin(v) {
  const g = cleanText(v, 20).toUpperCase().replace(/[\s-]/g, '');
  return GSTIN_RE.test(g) ? g : '';
}

export function normHsn(v) {
  const h = cleanText(v, 12).replace(/\s/g, '');
  return /^\d{4,8}$/.test(h) ? h : '';
}

/** Indian mobile → 10 digits, else ''. */
export function normPhone(v) {
  let d = cleanText(v, 20).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}

/** Accepts DD/MM/YYYY, DD-MM-YY, YYYY-MM-DD, "5 Oct 2026" → "YYYY-MM-DD" (Indian day-first). */
export function normDate(v, now = new Date()) {
  const s = cleanText(v, 30);
  if (!s) return '';
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let y; let m; let d; let r;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [, y, m, d] = r;
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) [, d, m, y] = r;
  else if ((r = s.match(/^(\d{1,2})[\s-]*([A-Za-z]{3})[A-Za-z]*[\s,-]*(\d{2,4})$/))) { d = r[1]; m = MONTHS.indexOf(r[2].toLowerCase()) + 1; y = r[3]; }
  else return '';
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!m || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  if (y < 2000 || dt.getTime() > now.getTime() + 2 * 86400000 * 366) return '';
  return dt.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- voice

export const VOICE_SCHEMA = {
  type: 'object',
  properties: {
    customer: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } } },
    items: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' }, rate: { type: 'number' } }, required: ['name'] },
    },
  },
  required: ['items'],
};

export function voiceMessages(transcript) {
  return [
    { role: 'system', content: 'You turn a shopkeeper\'s spoken bill (any Indian language or English) into JSON. Reply with ONLY a JSON object: {"customer":{"name":"","phone":""},"items":[{"name":"","qty":1,"unit":"","rate":0}]}. Item names in the original language or common English product name. qty and rate are numbers (rate = price per unit in rupees; 0 if not said). unit is one of pcs,kg,g,l,ml,m,box,pkt,dozen or "". Only include a customer if a name or phone was spoken. Never invent items that were not said.' },
    { role: 'user', content: String(transcript).slice(0, 4000) },
  ];
}

export function normalizeVoiceResult(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const items = (Array.isArray(obj.items) ? obj.items : []).slice(0, MAX_ITEMS).map((it) => {
    if (!it || typeof it !== 'object') return null;
    const name = cleanText(it.name, 120);
    if (!name) return null;
    const qty = toNum(it.qty ?? it.quantity, { max: 1e6 });
    const rate = toNum(it.rate ?? it.price, { max: 1e8, dp: 2 });
    return { name, qty: qty && qty > 0 ? qty : 1, unit: normUnit(it.unit), rate: rate ?? 0 };
  }).filter(Boolean);
  const c = obj.customer && typeof obj.customer === 'object' ? obj.customer : {};
  return { customer: { name: cleanText(c.name, 80), phone: normPhone(c.phone) }, items };
}

// ---------------------------------------------------------------- photo

export const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    supplier: { type: 'string' }, gstin: { type: 'string' }, invoiceNo: { type: 'string' }, date: { type: 'string' },
    customer: { type: 'string' },
    items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, hsn: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' }, rate: { type: 'number' }, gst: { type: 'number' }, amount: { type: 'number' } } } },
    totals: { type: 'object', properties: { taxable: { type: 'number' }, cgst: { type: 'number' }, sgst: { type: 'number' }, igst: { type: 'number' }, total: { type: 'number' } } },
  },
};

export function photoPrompt(mode = 'purchase') {
  const who = mode === 'sales' ? 'a handwritten or printed sales bill written by a shopkeeper' : 'a supplier\'s purchase invoice (GST bill) from India';
  return `Read this photo of ${who}. Reply with ONLY one JSON object, no prose:
{"supplier":"seller business name","gstin":"15-char GSTIN of the seller or empty","invoiceNo":"","date":"DD/MM/YYYY","customer":"buyer name if written","items":[{"name":"","hsn":"","qty":1,"unit":"","rate":0,"gst":18,"amount":0}],"totals":{"taxable":0,"cgst":0,"sgst":0,"igst":0,"total":0}}
Rules: numbers without commas or currency symbols; rate is price per unit before tax; gst is the GST percent; use empty string or 0 when not visible; do not guess values that are not on the bill.`;
}

export function normalizePhotoResult(raw, now = new Date()) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS).map((it) => {
    if (!it || typeof it !== 'object') return null;
    const name = cleanText(it.name ?? it.description, 120);
    if (!name) return null;
    let qty = toNum(it.qty ?? it.quantity, { max: 1e6 });
    let rate = toNum(it.rate ?? it.price, { max: 1e8, dp: 2 });
    const amount = toNum(it.amount ?? it.total, { max: 1e9, dp: 2 });
    if (!(qty > 0)) qty = rate > 0 && amount > 0 ? round(amount / rate, 3) : 1;
    if (!(rate > 0) && amount > 0) rate = round(amount / qty, 2);
    return { name, hsn: normHsn(it.hsn ?? it.hsnCode), qty, unit: normUnit(it.unit), rate: rate ?? 0, gst: normGstRate(it.gst ?? it.gstRate ?? it.tax), amount: amount ?? round(qty * (rate || 0), 2) };
  }).filter(Boolean);
  const t = o.totals && typeof o.totals === 'object' ? o.totals : {};
  const totals = {};
  for (const k of ['taxable', 'cgst', 'sgst', 'igst', 'total']) totals[k] = toNum(t[k], { max: 1e10, dp: 2 }) ?? 0;
  if (!totals.total && items.length) totals.total = round(items.reduce((s, i) => s + i.amount * (1 + (i.gst || 0) / 100), 0), 2);
  return {
    supplier: cleanText(o.supplier ?? o.seller, 120),
    gstin: normGstin(o.gstin),
    invoiceNo: cleanText(o.invoiceNo ?? o.invoice_number ?? o.billNo, 40).replace(/[^\w\-/. ]/g, ''),
    date: normDate(o.date, now),
    customer: cleanText(o.customer, 80),
    items,
    totals,
  };
}

// ---------------------------------------------------------------- client-side matching

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function bigrams(s) { const t = ` ${s} `; const out = new Map(); for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1); } return out; }
/** Dice similarity 0..1 on character bigrams (works for Indic scripts too). */
export function similarity(a, b) {
  const x = norm(a); const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x))) return 0.9;
  const A = bigrams(x); const B = bigrams(y);
  let inter = 0; let total = 0;
  for (const [k, n] of A) { total += n; inter += Math.min(n, B.get(k) || 0); }
  for (const n of B.values()) total += n;
  return (2 * inter) / total;
}

/** Best catalogue product for a spoken/read item name, or null below `min`. */
export function matchProduct(name, products = [], min = 0.55) {
  let best = null; let score = 0;
  for (const p of products) {
    const names = [p.name, p.localName, p.alias, p.sku, p.barcode].filter(Boolean);
    for (const n of names) {
      const s = similarity(name, n);
      if (s > score) { score = s; best = p; }
    }
  }
  return score >= min ? { product: best, score: round(score, 2) } : null;
}
