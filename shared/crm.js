// ============================================================
// CRM (basic) — pure helpers: lead pipeline, follow-ups, customer timeline.
// Used by src/components/crm/* and unit tested in scripts/crm-test.mjs.
// ============================================================
export const LEAD_STATUSES = Object.freeze(['new', 'contacted', 'quoted', 'won', 'lost']);
export const LEAD_SOURCES = Object.freeze(['walkin', 'phone', 'whatsapp', 'referral', 'online', 'other']);
export const OPEN_STATUSES = Object.freeze(['new', 'contacted', 'quoted']);

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const day = (d) => String(d || '').slice(0, 10);

/** Normalises a lead coming from the form. Throws Error('need_name' | 'bad_status'). */
export function cleanLead(input = {}) {
  const name = String(input.name || '').trim().slice(0, 100);
  if (!name) throw new Error('need_name');
  const status = input.status || 'new';
  if (!LEAD_STATUSES.includes(status)) throw new Error('bad_status');
  return {
    ...input,
    name,
    phone: String(input.phone || '').replace(/[^\d+]/g, '').slice(0, 16),
    email: String(input.email || '').trim().slice(0, 120),
    company: String(input.company || '').trim().slice(0, 100),
    source: LEAD_SOURCES.includes(input.source) ? input.source : 'other',
    status,
    value: Math.max(0, Math.round(num(input.value) * 100) / 100),
    notes: Array.isArray(input.notes) ? input.notes.slice(-200) : [],
  };
}

/** { new: {count, value}, … , openValue, wonValue, conversion (0-100) } */
export function pipelineSummary(leads = []) {
  const out = Object.fromEntries(LEAD_STATUSES.map(s => [s, { count: 0, value: 0 }]));
  for (const l of leads) {
    const s = LEAD_STATUSES.includes(l.status) ? l.status : 'new';
    out[s].count += 1; out[s].value += num(l.value);
  }
  const closed = out.won.count + out.lost.count;
  out.openValue = OPEN_STATUSES.reduce((a, s) => a + out[s].value, 0);
  out.wonValue = out.won.value;
  out.conversion = closed ? Math.round((out.won.count / closed) * 100) : 0;
  return out;
}

/** Follow-ups (activities with kind 'followup') bucketed against `today` (YYYY-MM-DD). */
export function bucketFollowUps(activities = [], today) {
  const t = day(today);
  const open = activities.filter(a => a.kind === 'followup' && !a.done && a.due);
  const sort = (a, b) => day(a.due).localeCompare(day(b.due)) || String(a.text || '').localeCompare(String(b.text || ''));
  return {
    overdue: open.filter(a => day(a.due) < t).sort(sort),
    today: open.filter(a => day(a.due) === t).sort(sort),
    upcoming: open.filter(a => day(a.due) > t).sort(sort),
  };
}
export const dueCount = (activities, today) => { const b = bucketFollowUps(activities, today); return b.overdue.length + b.today.length; };

/** Lead -> client record for saveClient(). */
export function leadToClient(lead) {
  return {
    name: lead.company ? `${lead.company}` : lead.name,
    contactPerson: lead.company ? lead.name : '',
    phone: lead.phone || '',
    email: lead.email || '',
    address: lead.address || '',
    city: lead.city || '',
    notes: lead.notes?.length ? lead.notes.map(n => n.text).join('\n').slice(0, 1000) : '',
    source: 'crm',
  };
}

const sameParty = (client, name, id) => {
  if (!client) return false;
  if (id && client.id && id === client.id) return true;
  const a = String(name || '').trim().toLowerCase();
  return !!a && a === String(client.name || '').trim().toLowerCase();
};

/**
 * Customer history: bills, payments (bill payments + receipts, without
 * double-counting receipts that were copied onto a bill), notes, follow-ups.
 * Newest first. Each event: { type, date, title, amount?, status?, ref? }
 */
export function customerTimeline({ client, bills = [], receipts = [], activities = [] }) {
  const ev = [];
  for (const b of bills) {
    const bc = b.data?.client || {};
    if (!sameParty(client, b.clientName || bc.name, bc.id)) continue;
    const type = b.invoiceType || b.data?.invoiceType || 'tax-invoice';
    ev.push({ type: 'bill', date: day(b.invoiceDate || b.data?.details?.invoiceDate), title: b.invoiceNumber || b.id, amount: num(b.totalAmount), status: b.status || 'unpaid', docType: type, ref: b.id });
    for (const p of b.payments || []) {
      if (p.receiptNo) continue; // shown from the receipt itself
      ev.push({ type: 'payment', date: day(p.date), title: b.invoiceNumber || b.id, amount: num(p.amount), mode: p.mode || '', ref: b.id });
    }
  }
  for (const r of receipts) {
    if (!sameParty(client, r.clientName, r.clientId)) continue;
    ev.push({ type: 'payment', date: day(r.date), title: r.receiptNo || r.id, amount: num(r.amount), mode: r.paymentMode || '', against: r.againstInvoice || '', ref: r.id });
  }
  for (const a of activities) {
    if (a.refType !== 'client' || a.refId !== client?.id) continue;
    ev.push({ type: a.kind === 'followup' ? 'followup' : 'note', date: day(a.kind === 'followup' ? a.due : a.at), title: a.text || '', done: !!a.done, ref: a.id });
  }
  return ev.sort((x, y) => y.date.localeCompare(x.date) || (x.type === 'bill' ? -1 : 1));
}

/** Totals for the timeline header: billed (sales only), paid, balance. */
export function customerTotals(events) {
  let billed = 0; let paid = 0;
  for (const e of events) {
    if (e.type === 'bill' && ['tax-invoice', 'bill-of-supply', 'composition'].includes(e.docType) && e.status !== 'cancelled') billed += e.amount;
    if (e.type === 'bill' && e.docType === 'credit-note' && e.status !== 'cancelled') billed -= e.amount;
    if (e.type === 'payment') paid += e.amount;
  }
  const r = (n) => Math.round(n * 100) / 100;
  return { billed: r(billed), paid: r(paid), balance: r(billed - paid) };
}
