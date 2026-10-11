// Minimal ESC/POS encoder for 58mm (32 cols) and 80mm (48 cols) thermal
// printers. Pure functions: easy to unit-test, no browser APIs.

const ESC = 0x1b;
const GS = 0x1d;

export const COLUMNS = Object.freeze({ 58: 32, 80: 48 });
export const columnsFor = (paper) => COLUMNS[Number(paper) === 58 ? 58 : 80];

// Thermal printers speak a single-byte code page. Indian-language text
// cannot be printed in text mode, so anything outside ASCII is transliterated
// where we can (₹ → Rs.) and replaced by '?' otherwise.
export function toAscii(text) {
  return String(text ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '?');
}

export function padRow(left, right, width) {
  const l = toAscii(left); const r = toAscii(right);
  if (l.length + r.length + 1 > width) {
    const cut = Math.max(0, width - r.length - 1);
    return `${l.slice(0, cut).padEnd(cut)} ${r}`.slice(0, width);
  }
  return l + ' '.repeat(width - l.length - r.length) + r;
}

export function wrap(text, width) {
  const out = [];
  for (const para of toAscii(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (word.length > width) { if (line) out.push(line); for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width)); line = ''; continue; }
      if ((line ? line.length + 1 : 0) + word.length > width) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

/** Builder producing a Uint8Array of ESC/POS commands. */
export class EscPos {
  constructor(paper = 80) { this.width = columnsFor(paper); this.bytes = [ESC, 0x40]; }
  raw(...b) { this.bytes.push(...b); return this; }
  text(s) { for (const ch of toAscii(s)) this.bytes.push(ch.charCodeAt(0)); return this; }
  line(s = '') { return this.text(s).raw(0x0a); }
  align(a) { return this.raw(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0); }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  size(double) { return this.raw(GS, 0x21, double ? 0x11 : 0x00); }
  rule(ch = '-') { return this.line(ch.repeat(this.width)); }
  row(l, r) { return this.line(padRow(l, r, this.width)); }
  wrapped(s) { wrap(s, this.width).forEach(l => this.line(l)); return this; }
  feed(n = 3) { return this.raw(ESC, 0x64, Math.max(0, Math.min(255, n))); }
  cut() { return this.raw(GS, 0x56, 0x42, 0x00); }
  build() { return Uint8Array.from(this.bytes); }
}

/** Receipt for a bill object (same shape the app stores). */
export function receiptBytes(bill = {}, profile = {}, { paper = 80, labels = {} } = {}) {
  const L = { invoice: 'Invoice', date: 'Date', total: 'TOTAL', subtotal: 'Subtotal', tax: 'GST', thanks: 'Thank you! Visit again', qty: 'Qty', ...labels };
  const d = bill.data || {};
  profile = { ...(d.profile || {}), ...(profile || {}) };
  const items = bill.items || d.items || [];
  const p = new EscPos(paper);
  p.align('center').bold(true).size(true).wrapped(profile.businessName || 'Bill').size(false).bold(false);
  if (profile.address) p.wrapped(profile.address);
  if (profile.phone) p.line(`Ph: ${profile.phone}`);
  if (profile.gstin) p.line(`GSTIN: ${profile.gstin}`);
  p.align('left').rule();
  p.row(`${L.invoice}: ${bill.invoiceNumber || d.details?.invoiceNumber || ''}`, `${L.date}: ${bill.date || bill.invoiceDate || ''}`);
  if (bill.clientName || bill.client?.name) p.wrapped(bill.clientName || bill.client?.name);
  p.rule();
  let sub = 0; let tax = 0;
  for (const it of items) {
    const qty = Number(it.quantity ?? it.qty ?? 1) || 0;
    const rate = Number(it.rate ?? it.price ?? 0) || 0;
    const amt = qty * rate;
    const gst = amt * (Number(it.gstRate ?? it.taxRate ?? it.taxPercent ?? 0) || 0) / 100;
    sub += amt; tax += gst;
    p.wrapped(it.name || it.description || '-');
    p.row(`  ${qty} x ${money(rate)}`, money(amt));
  }
  p.rule();
  const total = Number(bill.total ?? bill.totalAmount ?? d.totals?.total ?? (sub + tax)) || 0;
  const taxAmt = bill.taxAmount ?? bill.totalTaxAmount ?? d.totals?.totalTaxAmount;
  p.row(L.subtotal, money(bill.subtotal ?? d.totals?.subtotal ?? sub));
  if (tax > 0 || Number(taxAmt) > 0) p.row(L.tax, money(taxAmt ?? tax));
  p.bold(true).size(true).row(L.total, `Rs.${money(total)}`.slice(0, Math.floor(p.width / 2))).size(false).bold(false);
  p.rule().align('center').line(L.thanks);
  return p.feed(4).cut().build();
}

/** Short self-test page for Settings > Printer > Test print. */
export function testPageBytes(paper = 80, businessName = '') {
  const p = new EscPos(paper);
  p.align('center').bold(true).size(true).line('TEST PRINT').size(false).bold(false);
  if (businessName) p.wrapped(businessName);
  p.line(`${paper}mm / ${p.width} columns`).align('left').rule();
  p.row('Item', 'Amount').row('Sample item', '100.00').rule('=');
  p.line('0123456789'.repeat(Math.ceil(p.width / 10)).slice(0, p.width));
  return p.align('center').line('GST Billing Pro').feed(4).cut().build();
}
