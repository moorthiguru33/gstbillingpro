// ============================================================
// Transactional e-mail via Resend (server-only).
//
// Env: RESEND_API_KEY, FROM_EMAIL (e.g. "GST Billing Pro <billing@yourdomain.in>")
// If either is missing every send is a NO-OP that only logs to the
// console — nothing breaks before Resend is set up.
//
// sendLoggedEmail() writes email_log first with a unique dedupe_key, so
// the daily cron (or a retried request) can never send the same e-mail
// twice. A failed send deletes its log row so the next run retries.
// ============================================================

export function emailConfigured(env = {}) {
  return Boolean(env.RESEND_API_KEY && env.FROM_EMAIL);
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s);

/** Low-level send. Returns { skipped } | { id } ; throws on provider error. */
export async function sendEmail(env, { to, subject, html, text, tags }) {
  if (!emailConfigured(env)) {
    console.log(`[email] RESEND_API_KEY/FROM_EMAIL not set — skipped "${subject}"`);
    return { skipped: true, reason: 'not_configured' };
  }
  if (!isEmail(to)) {
    console.warn('[email] invalid recipient — skipped');
    return { skipped: true, reason: 'invalid_recipient' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [to],
      subject,
      html,
      text,
      ...(env.REPLY_TO_EMAIL ? { reply_to: env.REPLY_TO_EMAIL } : {}),
      ...(tags ? { tags: Object.entries(tags).map(([name, value]) => ({ name, value: String(value).replace(/[^A-Za-z0-9_-]/g, '_') })) } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Resend ${res.status}: ${data?.message || data?.name || 'send failed'}`);
    err.status = res.status;
    throw err;
  }
  return { id: data.id || null };
}

/**
 * Idempotent, logged send.
 * @returns {{ status: 'sent'|'skipped'|'duplicate'|'failed', id?: string }}
 */
export async function sendLoggedEmail(env, supabase, { userId = null, kind, dedupeKey, to, subject, html, text }) {
  if (!emailConfigured(env)) {
    console.log(`[email] not configured — skipped ${kind} (${dedupeKey})`);
    return { status: 'skipped' };
  }
  const { data: inserted, error } = await supabase.from('email_log')
    .upsert({ user_id: userId, kind, dedupe_key: dedupeKey, to_email: to, status: 'pending' },
      { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select();
  if (error) { console.error('[email] log insert failed:', error.message); return { status: 'failed' }; }
  if (!inserted || inserted.length === 0) return { status: 'duplicate' };

  try {
    const r = await sendEmail(env, { to, subject, html, text, tags: { kind } });
    await supabase.from('email_log')
      .update({ status: r.skipped ? 'skipped' : 'sent', provider_id: r.id || null, error: r.reason || null })
      .eq('dedupe_key', dedupeKey);
    return { status: r.skipped ? 'skipped' : 'sent', id: r.id };
  } catch (err) {
    console.error(`[email] ${kind} failed:`, err.message);
    await supabase.from('email_log').delete().eq('dedupe_key', dedupeKey); // retry next run
    return { status: 'failed' };
  }
}
