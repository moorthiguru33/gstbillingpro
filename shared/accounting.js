// ============================================================
// Accounting (double entry) — pure helpers shared by the app and tests.
//
// Vouchers: { id, date 'YYYY-MM-DD', type, no, narration, source, ref,
//             lines: [{ a: accountId, dr, cr, p?: partyName }] }
// Auto vouchers are DERIVED from existing data (bills, purchases,
// expenses, receipts) with deterministic ids ('auto:bill:<id>' …), so a
// back-fill / re-sync is idempotent: planSync() only upserts what changed
// and removes auto vouchers whose source record is gone.
// ============================================================

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const day = (d) => String(d || '').slice(0, 10);
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
export const partyKey = (s) => norm(s).toLowerCase();

// type: asset | liability | equity | income | expense ; group drives report grouping
const A = (id, name, type, group, extra = {}) => Object.freeze({ id, name, type, group, system: true, ...extra });
export const DEFAULT_ACCOUNTS = Object.freeze([
  A('cash', 'Cash in Hand', 'asset', 'cash'),
  A('bank', 'Bank Account', 'asset', 'bank'),
  A('debtors', 'Sundry Debtors', 'asset', 'debtors', { party: true }),
  A('stock', 'Stock-in-Hand', 'asset', 'stock'),
  A('in_cgst', 'Input CGST', 'asset', 'gst_input'),
  A('in_sgst', 'Input SGST/UTGST', 'asset', 'gst_input'),
  A('in_igst', 'Input IGST', 'asset', 'gst_input'),
  A('in_cess', 'Input Cess', 'asset', 'gst_input'),
  A('staff_adv', 'Staff Advances & Loans', 'asset', 'loans_adv'),
  A('loans_adv', 'Loans & Advances (Asset)', 'asset', 'loans_adv'),
  A('deposits', 'Deposits', 'asset', 'loans_adv'),
  A('fixed_assets', 'Fixed Assets', 'asset', 'fixed'),
  A('creditors', 'Sundry Creditors', 'liability', 'creditors', { party: true }),
  A('out_cgst', 'Output CGST', 'liability', 'duties'),
  A('out_sgst', 'Output SGST/UTGST', 'liability', 'duties'),
  A('out_igst', 'Output IGST', 'liability', 'duties'),
  A('out_cess', 'Output Cess', 'liability', 'duties'),
  A('duties', 'Duties & Taxes (GST/TDS payable)', 'liability', 'duties'),
  A('salary_payable', 'Salary Payable', 'liability', 'provisions'),
  A('borrowings', 'Loans (Borrowings)', 'liability', 'loans'),
  A('capital', 'Capital Account', 'equity', 'capital'),
  A('drawings', 'Drawings', 'equity', 'capital'),
  A('ob_diff', 'Opening Balance Difference', 'equity', 'capital'),
  A('sales', 'Sales', 'income', 'sales'),
  A('sales_ret', 'Sales Returns (Credit Notes)', 'income', 'sales'),
  A('other_income', 'Other Income', 'income', 'indirect_income'),
  A('discount_recd', 'Discount Received', 'income', 'indirect_income'),
  A('purchases', 'Purchases', 'expense', 'purchases'),
  A('freight', 'Freight & Courier', 'expense', 'direct_exp'),
  A('salaries', 'Salaries & Wages', 'expense', 'indirect_exp'),
  A('rent', 'Rent', 'expense', 'indirect_exp'),
  A('utilities', 'Electricity & Utilities', 'expense', 'indirect_exp'),
  A('phone', 'Telephone & Internet', 'expense', 'indirect_exp'),
  A('office', 'Printing, Stationery & Office', 'expense', 'indirect_exp'),
  A('repairs', 'Repairs & Maintenance', 'expense', 'indirect_exp'),
  A('bank_charges', 'Bank Charges', 'expense', 'indirect_exp'),
  A('marketing', 'Advertising & Marketing', 'expense', 'indirect_exp'),
  A('travel', 'Travel & Conveyance', 'expense', 'indirect_exp'),
  A('professional', 'Professional Fees', 'expense', 'indirect_exp'),
  A('insurance', 'Insurance', 'expense', 'indirect_exp'),
  A('software', 'Software & Subscriptions', 'expense', 'indirect_exp'),
  A('discount_allowed', 'Discount Allowed', 'expense', 'indirect_exp'),
  A('misc_exp', 'Miscellaneous Expenses', 'expense', 'indirect_exp'),
]);
export const ACCOUNT_TYPES = Object.freeze(['asset', 'liability', 'equity', 'income', 'expense']);
export const GROUPS = Object.freeze({
  asset: ['cash', 'bank', 'debtors', 'stock', 'gst_input', 'loans_adv', 'fixed', 'other_asset'],
  liability: ['creditors', 'duties', 'provisions', 'loans', 'other_liability'],
  equity: ['capital'],
  income: ['sales', 'indirect_income'],
  expense: ['purchases', 'direct_exp', 'indirect_exp'],
});
export const VOUCHER_TYPES = Object.freeze(['journal', 'payment', 'receipt', 'contra', 'sales', 'credit_note', 'purchase', 'expense', 'opening', 'salary']);
export const MANUAL_TYPES = Object.freeze(['journal', 'payment', 'receipt', 'contra']);
const DR_NORMAL = new Set(['asset', 'expense']);

/** Merge defaults with stored accounts (custom ones + overrides) and any ids only seen in vouchers. */
export function chartOfAccounts(stored = [], vouchers = []) {
  const map = new Map(DEFAULT_ACCOUNTS.map(a => [a.id, { ...a }]));
  for (const s of stored) {
    if (!s || !s.id || s.kind === 'settings') continue;
    const base = map.get(s.id);
    map.set(s.id, base ? { ...base, name: s.name || base.name, hidden: !!s.hidden } : { group: 'other_asset', type: 'asset', ...s, system: false });
  }
  for (const v of vouchers) for (const l of v.lines || []) {
    if (!map.has(l.a)) map.set(l.a, { id: l.a, name: l.n || l.a, type: l.t || 'expense', group: l.t === 'asset' ? 'other_asset' : 'indirect_exp', system: false });
  }
  return [...map.values()];
}
export const isBankAccount = (a) => a && (a.group === 'bank');

// ---------- financial year ----------
export const fyStartYear = (d) => { const s = day(d); const y = Number(s.slice(0, 4)); const m = Number(s.slice(5, 7)); return m >= 4 ? y : y - 1; };
export const fyRange = (y) => ({ from: `${y}-04-01`, to: `${y + 1}-03-31` });
export const fyLabel = (y) => `FY ${y}-${String(y + 1).slice(-2)}`;
export function fyList(vouchers = [], today) {
  const ys = new Set([fyStartYear(today)]);
  for (const v of vouchers) if (v.date) ys.add(fyStartYear(v.date));
  return [...ys].sort((a, b) => b - a);
}

// ---------- validation ----------
export function voucherTotals(v) {
  let dr = 0; let cr = 0;
  for (const l of v.lines || []) { dr += num(l.dr); cr += num(l.cr); }
  return { dr: r2(dr), cr: r2(cr) };
}
/** Returns an error code or '' when the voucher is valid. */
export function validateVoucher(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day(v?.date))) return 'bad_date';
  const lines = (v.lines || []).filter(l => num(l.dr) || num(l.cr));
  if (lines.length < 2) return 'need_two_lines';
  for (const l of lines) {
    if (!l.a) return 'need_account';
    if (num(l.dr) < 0 || num(l.cr) < 0 || (num(l.dr) && num(l.cr))) return 'bad_amount';
  }
  const t = voucherTotals({ lines });
  if (!t.dr || Math.abs(t.dr - t.cr) > 0.005) return 'not_balanced';
  return '';
}
export function cleanVoucher(v) {
  return {
    ...v,
    date: day(v.date),
    narration: String(v.narration || '').trim().slice(0, 500),
    lines: (v.lines || []).filter(l => num(l.dr) || num(l.cr)).map(l => {
      const o = { a: l.a, dr: r2(l.dr), cr: r2(l.cr) };
      if (l.p) o.p = norm(l.p).slice(0, 120);
      return o;
    }),
  };
}

// ---------- auto posting ----------
const MAP_RULES = [
  [/asset purchase|fixed asset/i, 'fixed_assets'], [/drawing|personal/i, 'drawings'], [/gst paid|tax paid|tds/i, 'duties'],
  [/raw material|purchase/i, 'purchases'], [/rent/i, 'rent'], [/electric|utilit|power|water/i, 'utilities'],
  [/internet|phone|mobile|telecom/i, 'phone'], [/shipping|courier|freight|transport/i, 'freight'], [/salary|wage/i, 'salaries'],
  [/repair|mainten/i, 'repairs'], [/bank/i, 'bank_charges'], [/market|advert|ads\b/i, 'marketing'], [/travel|fuel|convey/i, 'travel'],
  [/professional|legal|audit|consult/i, 'professional'], [/insurance/i, 'insurance'], [/software|subscription|tools/i, 'software'],
  [/office|stationery|printing|supplies/i, 'office'],
];
export function expenseAccountFor(category) {
  const c = norm(category);
  if (!c || /^other$/i.test(c)) return { a: 'misc_exp' };
  for (const [re, id] of MAP_RULES) if (re.test(c)) return { a: id };
  const slug = c.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'misc';
  return { a: `exp:${slug}`, n: c, t: 'expense' };
}
/** Payment mode -> cash or the bank account chosen in settings. */
export const modeAccount = (mode, bankId = 'bank') => (/cash/i.test(String(mode || '')) ? 'cash' : (bankId || 'bank'));

const line = (a, dr, cr, extra) => ({ a, dr: r2(dr), cr: r2(cr), ...(extra || {}) });
const nonZero = (lines) => lines.filter(l => l.dr || l.cr);
// Fold rounding residue into the first line of the larger side so every voucher balances.
function balance(lines, plugAcc) {
  const t = voucherTotals({ lines });
  const diff = r2(t.dr - t.cr);
  if (Math.abs(diff) >= 0.005) lines.push(diff > 0 ? line(plugAcc, 0, diff) : line(plugAcc, -diff, 0));
  return nonZero(lines);
}
function gstSplit(tax, interstate) {
  const t = r2(tax);
  if (interstate) return { cgst: 0, sgst: 0, igst: t };
  const half = r2(t / 2);
  return { cgst: half, sgst: r2(t - half), igst: 0 };
}

/**
 * Derive auto vouchers. billKind(bill) -> 'sale' | 'credit' | null.
 * Returns vouchers sorted by date.
 */
export function deriveVouchers({ bills = [], purchases = [], expenses = [], receipts = [], billKind, bankId = 'bank' }) {
  const out = [];
  const kindOf = billKind || ((b) => (b.status === 'cancelled' ? null : (b.invoiceType === 'credit-note' ? 'credit' : (['tax-invoice', 'bill-of-supply', 'composition', undefined, ''].includes(b.invoiceType) ? 'sale' : null))));
  for (const b of bills) {
    const kind = kindOf(b);
    if (!kind || !b.id) continue;
    const total = r2(b.totalAmount ?? b.data?.totals?.total);
    if (!total) continue;
    const tt = b.data?.totals || {};
    let cgst = r2(tt.cgst); let sgst = r2(num(tt.sgst) + num(tt.utgst)); let igst = r2(tt.igst); const cess = r2(tt.cess);
    if (!(cgst || sgst || igst || cess) && num(b.totalTaxAmount) > 0) ({ cgst, sgst, igst } = gstSplit(b.totalTaxAmount, false));
    const tax = r2(cgst + sgst + igst + cess);
    const party = norm(b.clientName || b.data?.client?.name) || 'Cash Customer';
    const date = day(b.invoiceDate || b.data?.details?.invoiceDate);
    if (!date) continue;
    const p = { p: party };
    const sale = kind === 'sale';
    const lines = sale
      ? [line('debtors', total, 0, p), line('sales', 0, r2(total - tax)), line('out_cgst', 0, cgst), line('out_sgst', 0, sgst), line('out_igst', 0, igst), line('out_cess', 0, cess)]
      : [line('sales_ret', r2(total - tax), 0), line('out_cgst', cgst, 0), line('out_sgst', sgst, 0), line('out_igst', igst, 0), line('out_cess', cess, 0), line('debtors', 0, total, p)];
    out.push({ id: `auto:bill:${b.id}`, date, type: sale ? 'sales' : 'credit_note', no: b.invoiceNumber || b.id, narration: `${sale ? 'Sales' : 'Credit note'} ${b.invoiceNumber || ''} — ${party}`.trim(), source: 'auto', ref: b.id, lines: nonZero(lines) });
    if (sale) {
      (b.payments || []).forEach((pay, i) => {
        if (pay.receiptNo) return; // posted from the receipt itself
        const amt = r2(pay.amount);
        if (amt <= 0) return;
        const acc = modeAccount(pay.mode, bankId);
        out.push({ id: `auto:billpay:${b.id}:${pay.id || i}`, date: day(pay.date) || date, type: 'receipt', no: b.invoiceNumber || b.id, narration: `Payment received — ${party} (${b.invoiceNumber || ''})`, source: 'auto', ref: b.id, lines: [line(acc, amt, 0), line('debtors', 0, amt, p)] });
      });
    }
  }
  for (const r of receipts) {
    const amt = r2(r.amount);
    if (!r.id || amt <= 0 || !day(r.date)) continue;
    const party = norm(r.clientName) || 'Cash Customer';
    out.push({ id: `auto:rcpt:${r.id}`, date: day(r.date), type: 'receipt', no: r.receiptNo || r.id, narration: `Receipt ${r.receiptNo || ''} — ${party}${r.againstInvoice ? ` (against ${r.againstInvoice})` : ''}`, source: 'auto', ref: r.id, lines: [line(modeAccount(r.paymentMode, bankId), amt, 0), line('debtors', 0, amt, { p: party })] });
  }
  for (const pu of purchases) {
    const total = r2(pu.totalAmount ?? pu.total);
    if (!pu.id || total <= 0 || !day(pu.date)) continue;
    const party = norm(pu.supplierName) || 'Cash Supplier';
    const tax = r2(pu.totalTax);
    const g = gstSplit(tax, !!pu.interstate);
    const lines = [line('purchases', r2(total - tax), 0), line('in_cgst', g.cgst, 0), line('in_sgst', g.sgst, 0), line('in_igst', g.igst, 0), line('creditors', 0, total, { p: party })];
    out.push({ id: `auto:pur:${pu.id}`, date: day(pu.date), type: 'purchase', no: pu.invoiceNumber || pu.id, narration: `Purchase ${pu.invoiceNumber || ''} — ${party}`, source: 'auto', ref: pu.id, lines: nonZero(lines) });
    if (String(pu.paymentStatus || '').toLowerCase() === 'paid') {
      out.push({ id: `auto:purpay:${pu.id}`, date: day(pu.date), type: 'payment', no: pu.invoiceNumber || pu.id, narration: `Paid to ${party} (${pu.invoiceNumber || ''})`, source: 'auto', ref: pu.id, lines: [line('creditors', total, 0, { p: party }), line(modeAccount(pu.paymentMode || 'bank', bankId), 0, total)] });
    }
  }
  for (const e of expenses) {
    const total = r2(e.amount);
    if (!e.id || total <= 0 || !day(e.date)) continue;
    const gst = Math.min(r2(e.gstAmount), total);
    const acc = expenseAccountFor(e.category);
    const head = { a: acc.a, ...(acc.n ? { n: acc.n, t: acc.t } : {}) };
    const g = gstSplit(gst, !!e.interstate);
    const pay = modeAccount(e.paymentMode, bankId);
    const lines = [{ ...head, dr: r2(total - gst), cr: 0 }, line('in_cgst', g.cgst, 0), line('in_sgst', g.sgst, 0), line('in_igst', g.igst, 0), line(pay, 0, total)];
    out.push({ id: `auto:exp:${e.id}`, date: day(e.date), type: 'expense', no: e.invoiceNo || '', narration: `${e.category || 'Expense'} — ${norm(e.description || e.vendorName)}`.trim(), source: 'auto', ref: e.id, lines: nonZero(lines) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export const voucherHash = (v) => JSON.stringify([v.date, v.type, v.no || '', v.narration || '', (v.lines || []).map(l => [l.a, r2(l.dr), r2(l.cr), l.p || '', l.n || ''])]);
/** Which auto vouchers to write / remove so stored == derived. Manual & payroll vouchers are never touched. */
export function planSync(derived, stored) {
  const have = new Map(stored.filter(v => v.source === 'auto').map(v => [v.id, v]));
  const upserts = [];
  for (const v of derived) {
    const s = have.get(v.id);
    if (!s || voucherHash(s) !== voucherHash(v)) upserts.push(v);
    have.delete(v.id);
  }
  return { upserts, deletes: [...have.keys()] };
}

/** Opening balances voucher: entries [{a, dr, cr, p}], balanced into 'Opening Balance Difference'. */
export function openingVoucher(entries, date) {
  const lines = cleanVoucher({ lines: entries }).lines;
  return { id: 'opening', date: day(date), type: 'opening', no: 'OB', narration: 'Opening balances', source: 'manual', lines: balance(lines, 'ob_diff') };
}

// ---------- reports ----------
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
const signOf = (type) => (DR_NORMAL.has(type) ? 1 : -1);

/** Map accountId -> { open, dr, cr, close } as net debit amounts. */
export function accountBalances(vouchers, { from, to } = {}) {
  const m = new Map();
  const get = (a) => { if (!m.has(a)) m.set(a, { open: 0, dr: 0, cr: 0, close: 0 }); return m.get(a); };
  for (const v of vouchers) {
    if (to && v.date > to) continue;
    const before = from && v.date < from;
    for (const l of v.lines || []) {
      const b = get(l.a);
      if (before) b.open += num(l.dr) - num(l.cr);
      else { b.dr += num(l.dr); b.cr += num(l.cr); }
    }
  }
  for (const b of m.values()) { b.open = r2(b.open); b.dr = r2(b.dr); b.cr = r2(b.cr); b.close = r2(b.open + b.dr - b.cr); }
  return m;
}

/** Ledger of one account (optionally one party) with running balance (net debit). */
export function ledger(vouchers, accId, { from, to, party, names = {} } = {}) {
  const pk = party ? partyKey(party) : '';
  const match = (l) => (Array.isArray(accId) ? accId.includes(l.a) : l.a === accId) && (!pk || partyKey(l.p) === pk);
  let opening = 0;
  const rows = [];
  const sorted = [...vouchers].sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  for (const v of sorted) {
    if (to && v.date > to) continue;
    const mine = (v.lines || []).filter(match);
    if (!mine.length) continue;
    const dr = r2(mine.reduce((s, l) => s + num(l.dr), 0));
    const cr = r2(mine.reduce((s, l) => s + num(l.cr), 0));
    if (from && v.date < from) { opening = r2(opening + dr - cr); continue; }
    const other = (v.lines || []).filter(l => !match(l)).map(l => names[l.a] || l.n || l.a);
    rows.push({ id: v.id, date: v.date, type: v.type, no: v.no || '', narration: v.narration || '', other: [...new Set(other)].join(', '), dr, cr });
  }
  let bal = opening;
  for (const r of rows) { bal = r2(bal + r.dr - r.cr); r.bal = bal; }
  return { opening, rows, closing: bal, dr: r2(rows.reduce((s, r) => s + r.dr, 0)), cr: r2(rows.reduce((s, r) => s + r.cr, 0)) };
}

/** Parties with balances on debtors / creditors: [{ name, debtors, creditors, net }] (net debit). */
export function partyBalances(vouchers, { to } = {}) {
  const m = new Map();
  for (const v of vouchers) {
    if (to && v.date > to) continue;
    for (const l of v.lines || []) {
      if (!l.p || (l.a !== 'debtors' && l.a !== 'creditors')) continue;
      const k = partyKey(l.p);
      const row = m.get(k) || { name: norm(l.p), debtors: 0, creditors: 0, net: 0 };
      row[l.a] = r2(row[l.a] + num(l.dr) - num(l.cr));
      row.net = r2(row.debtors + row.creditors);
      m.set(k, row);
    }
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function dayBook(vouchers, { from, to }) {
  return vouchers.filter(v => inRange(v.date, from, to)).sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
}

const accMap = (accounts) => new Map(accounts.map(a => [a.id, a]));

/** Closing stock handling: opening = closingStock of previous FY when set, else stock account balance. */
function stockFigures(bal, { closingStock, openingStock }) {
  const stockBal = bal.get('stock')?.close || 0;
  const opening = openingStock != null && openingStock !== '' ? r2(openingStock) : stockBal;
  const closing = closingStock != null && closingStock !== '' ? r2(closingStock) : stockBal;
  return { stockBal, opening, closing };
}

/**
 * Profit & Loss for [from, to]. Income/expense balances of the period plus
 * stock change (closing − opening).
 */
export function profitAndLoss(vouchers, accounts, { from, to, closingStock, openingStock } = {}) {
  const bal = accountBalances(vouchers, { from, to });
  const st = stockFigures(bal, { closingStock, openingStock });
  const rows = (type, groups) => accounts.filter(a => a.type === type && groups.includes(a.group))
    .map(a => ({ id: a.id, name: a.name, amount: r2(((bal.get(a.id)?.dr || 0) - (bal.get(a.id)?.cr || 0)) * signOf(type)) }))
    .filter(r => r.amount);
  const sum = (list) => r2(list.reduce((s, r) => s + r.amount, 0));
  const tradingIncome = rows('income', ['sales']);
  const tradingExp = rows('expense', ['purchases', 'direct_exp']);
  const grossProfit = r2(sum(tradingIncome) - sum(tradingExp) + st.closing - st.opening);
  const otherIncome = rows('income', accounts.filter(a => a.type === 'income' && a.group !== 'sales').map(a => a.group));
  const otherExp = rows('expense', accounts.filter(a => a.type === 'expense' && !['purchases', 'direct_exp'].includes(a.group)).map(a => a.group));
  const netProfit = r2(grossProfit + sum(otherIncome) - sum(otherExp));
  return { tradingIncome, tradingExp, openingStock: st.opening, closingStock: st.closing, grossProfit, otherIncome, otherExp, netProfit, totalIncome: r2(sum(tradingIncome) + sum(otherIncome)), totalExpense: r2(sum(tradingExp) + sum(otherExp)) };
}

/** Trial balance as at `to`: balance-sheet accounts cumulative, P&L accounts for the period, prior P&L as one line. */
export function trialBalance(vouchers, accounts, { from, to } = {}) {
  const am = accMap(accounts);
  const bal = accountBalances(vouchers, { from, to });
  const rows = [];
  let prior = 0;
  for (const [id, b] of bal) {
    const a = am.get(id) || { id, name: id, type: 'expense' };
    const pl = a.type === 'income' || a.type === 'expense';
    if (pl) prior += b.open;
    const net = pl ? r2(b.dr - b.cr) : b.close;
    if (Math.abs(net) < 0.005) continue;
    rows.push({ id, name: a.name, type: a.type, dr: net > 0 ? net : 0, cr: net < 0 ? -net : 0 });
  }
  prior = r2(prior);
  if (Math.abs(prior) >= 0.005) rows.push({ id: '_retained', name: 'Profit & Loss A/c (previous years)', type: 'equity', dr: prior > 0 ? prior : 0, cr: prior < 0 ? -prior : 0 });
  const order = ACCOUNT_TYPES;
  rows.sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type) || x.name.localeCompare(y.name));
  const dr = r2(rows.reduce((s, r) => s + r.dr, 0));
  const cr = r2(rows.reduce((s, r) => s + r.cr, 0));
  return { rows, dr, cr, diff: r2(dr - cr) };
}

/** Balance sheet as at `to` for the FY starting `from`. */
export function balanceSheet(vouchers, accounts, { from, to, closingStock, openingStock } = {}) {
  const bal = accountBalances(vouchers, { from, to });
  const pl = profitAndLoss(vouchers, accounts, { from, to, closingStock, openingStock });
  const st = stockFigures(bal, { closingStock, openingStock });
  let priorPL = 0;
  for (const a of accounts) if (a.type === 'income' || a.type === 'expense') priorPL -= bal.get(a.id)?.open || 0;
  priorPL = r2(priorPL + st.opening - st.stockBal);
  const side = (type) => {
    const groups = {};
    for (const a of accounts.filter(x => x.type === type)) {
      let amt = r2((bal.get(a.id)?.close || 0) * signOf(type));
      if (a.id === 'stock') amt = st.closing;
      if (!amt) continue;
      (groups[a.group] = groups[a.group] || []).push({ id: a.id, name: a.name, amount: amt });
    }
    return Object.entries(groups).map(([group, items]) => ({ group, items, total: r2(items.reduce((s, i) => s + i.amount, 0)) }));
  };
  const assets = side('asset');
  if (!assets.some(g => g.items.some(i => i.id === 'stock')) && st.closing) assets.push({ group: 'stock', items: [{ id: 'stock', name: 'Stock-in-Hand', amount: st.closing }], total: st.closing });
  const liabilities = side('liability');
  const equity = side('equity');
  const eqItems = [];
  if (Math.abs(priorPL) >= 0.005) eqItems.push({ id: '_retained', name: 'Profit & Loss A/c (previous years)', amount: priorPL });
  eqItems.push({ id: '_current', name: 'Profit for the period', amount: pl.netProfit });
  equity.push({ group: 'profit', items: eqItems, total: r2(eqItems.reduce((s, i) => s + i.amount, 0)) });
  const tot = (g) => r2(g.reduce((s, x) => s + x.total, 0));
  const totalAssets = tot(assets);
  const totalLiab = r2(tot(liabilities) + tot(equity));
  return { assets, liabilities, equity, totalAssets, totalLiabilities: totalLiab, diff: r2(totalAssets - totalLiab), netProfit: pl.netProfit };
}
