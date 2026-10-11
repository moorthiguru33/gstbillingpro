// WhatsApp bill links: upload the invoice PDF to the private `invoices`
// bucket and create a /b/<token> page (migration 003 `bill_links`). The
// public page serves short-lived signed URLs, never the bucket itself.
import { supabase } from './supabase';
import { dataOwnerId } from './org';
import { currentLanguage, tIn } from '../i18n';

export function newBillToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Language for messages to customers (Settings > Bills & Printing). */
export const CUSTOMER_LANG_KEY = 'gbp_customer_lang';
export function customerLang() {
  try { return localStorage.getItem(CUSTOMER_LANG_KEY) || currentLanguage(); } catch { return currentLanguage(); }
}
export function setCustomerLang(code) {
  try { if (code) localStorage.setItem(CUSTOMER_LANG_KEY, code); else localStorage.removeItem(CUSTOMER_LANG_KEY); } catch { /* private mode */ }
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const billAmount = (bill) => num(bill?.totalAmount ?? bill?.total ?? bill?.data?.totals?.total);
export function billDue(bill) {
  const paid = num(bill?.paidAmount) || (bill?.payments || []).reduce((s, p) => s + num(p.amount), 0);
  return Math.max(0, Math.round((billAmount(bill) - (bill?.status === 'paid' ? billAmount(bill) : paid)) * 100) / 100);
}

export const fmtInr = (n) => `₹${num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Upload `pdfBlob` and create a share link. Returns the absolute URL.
 * Throws when offline/demo or the database refuses (caller falls back).
 */
export async function createBillLink(bill, pdfBlob, profile = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) throw new Error('Not signed in');
  const owner = dataOwnerId() || uid;
  const token = newBillToken();
  const path = `${owner}/share/${token}.pdf`;
  const up = await supabase.storage.from('invoices').upload(path, pdfBlob, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw up.error;
  const prof = { ...(bill?.data?.profile || {}), ...(profile || {}) };
  const row = {
    token, owner_id: owner, bill_id: String(bill?.id || ''), pdf_path: path,
    invoice_number: String(bill?.invoiceNumber || ''),
    business_name: String(prof.businessName || '').slice(0, 200),
    client_name: String(bill?.clientName || bill?.client?.name || '').slice(0, 200),
    amount: billAmount(bill), amount_due: billDue(bill),
    upi_id: prof.upiId || null, upi_name: prof.businessName || null,
    lang: customerLang(),
  };
  const { error } = await supabase.from('bill_links').insert(row);
  if (error) {
    supabase.storage.from('invoices').remove([path]).catch(() => {});
    throw error;
  }
  return `${window.location.origin}/b/${token}`;
}

/** WhatsApp text for a bill (in the customer-message language). */
export async function billShareMessage(bill, profile, link) {
  const lng = customerLang();
  const vars = {
    name: bill?.clientName || bill?.client?.name || '',
    business: profile?.businessName || bill?.data?.profile?.businessName || '',
    number: bill?.invoiceNumber || '',
    amount: fmtInr(billAmount(bill)),
    link,
  };
  const lines = [await tIn(lng, vars.name ? 'share.billGreeting' : 'share.billGreetingNoName', vars),
    await tIn(lng, 'share.billBody', vars)];
  if (link) lines.push(await tIn(lng, 'share.billLink', vars));
  lines.push(await tIn(lng, 'share.billThanks', vars));
  return lines.join('\n\n');
}

/** Polite payment-due reminder for a client's outstanding amount. */
export async function reminderMessage({ clientName, business, amount, invoices = [], link }) {
  const lng = customerLang();
  const vars = { name: clientName || '', business: business || '', amount: fmtInr(amount), list: invoices.filter(Boolean).join(', '), link };
  const lines = [await tIn(lng, vars.name ? 'share.billGreeting' : 'share.billGreetingNoName', vars),
    await tIn(lng, vars.list ? 'reminder.bodyList' : 'reminder.body', vars)];
  if (link) lines.push(await tIn(lng, 'share.billLink', vars));
  lines.push(await tIn(lng, 'reminder.thanks', vars));
  return lines.join('\n\n');
}
