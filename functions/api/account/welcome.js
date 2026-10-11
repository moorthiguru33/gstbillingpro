// ============================================================
// POST /api/account/welcome — the app calls this once after sign-up.
// Sends the welcome e-mail at most once per user (email_log dedupe) and
// only for accounts created in the last 3 days. No-op without Resend.
// ============================================================
import {
  json, errorResponse, preflight, corsHeaders, assertOrigin, requireEnv, getServiceClient, authenticate,
} from '../../../shared/server.js';
import { sendWelcome, background } from '../../../shared/notify.js';
import { emailConfigured } from '../../../shared/email.js';
import { DAY, TRIAL_DAYS } from '../../../shared/plans.js';

export async function onRequestPost({ request, env, waitUntil }) {
  const cors = corsHeaders(request, env);
  try {
    assertOrigin(request, env);
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const supabase = getServiceClient(env);
    const user = await authenticate(request, supabase);
    if (!emailConfigured(env)) {
      console.log('[welcome] e-mail not configured — skipped');
      return json({ ok: true, status: 'skipped' }, 200, cors);
    }
    const created = new Date(user.created_at || 0).getTime();
    if (!user.email || !(Date.now() - created < 3 * DAY)) return json({ ok: true, status: 'not_new' }, 200, cors);
    const { data: sub } = await supabase.from('subscriptions').select('trial_end').eq('user_id', user.id).maybeSingle();
    const trialEnd = sub?.trial_end || new Date(created + TRIAL_DAYS * DAY).toISOString();
    await background(waitUntil, sendWelcome(env, supabase, user, trialEnd));
    return json({ ok: true, status: 'queued' }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export function onRequestOptions({ request, env }) {
  return preflight(request, env, 'POST, OPTIONS');
}
