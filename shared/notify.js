// ============================================================
// Glue between payments / cron and e-mail (server-only).
// ============================================================
import { sendLoggedEmail, emailConfigured } from './email.js';
import { receiptEmail, welcomeEmail } from './email-templates.js';

/** Run work after the response when the platform allows it (Pages: waitUntil). */
export async function background(waitUntil, promise) {
  const p = Promise.resolve(promise).catch(err => console.error('[background]', err && (err.message || err)));
  if (typeof waitUntil === 'function') { waitUntil(p); return; }
  await p;
}

export async function getUserContact(supabase, userId) {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    const u = data.user;
    return { email: u.email || null, name: u.user_metadata?.full_name || u.user_metadata?.name || '', createdAt: u.created_at };
  } catch { return null; }
}

export function appUrlOf(env) { return (env.APP_URL || 'https://gst-billing-pro.pages.dev').replace(/\/+$/, ''); }

export async function sendReceiptForOrder(env, supabase, orderId) {
  if (!emailConfigured(env)) { console.log(`[email] not configured — receipt for ${orderId} not sent`); return { status: 'skipped' }; }
  const { data: order, error } = await supabase.from('payment_orders').select('*').eq('order_id', orderId).maybeSingle();
  if (error || !order || order.status !== 'paid') return { status: 'skipped' };
  const contact = await getUserContact(supabase, order.user_id);
  if (!contact?.email) return { status: 'skipped' };
  const { subject, html, text } = receiptEmail({ order, customer: contact, env, appUrl: appUrlOf(env) });
  return sendLoggedEmail(env, supabase, { userId: order.user_id, kind: 'receipt', dedupeKey: `receipt:${orderId}`, to: contact.email, subject, html, text });
}

export async function sendWelcome(env, supabase, user, trialEnd) {
  const { subject, html, text } = welcomeEmail({ name: user.user_metadata?.full_name || '', appUrl: appUrlOf(env), trialEnd });
  return sendLoggedEmail(env, supabase, { userId: user.id, kind: 'welcome', dedupeKey: `welcome:${user.id}`, to: user.email, subject, html, text });
}
