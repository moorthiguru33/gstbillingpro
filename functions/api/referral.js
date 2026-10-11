// ============================================================
// GET  /api/referral          → { code, link, invited, rewarded }
// POST /api/referral  {code}  → claim: "I was referred by <code>"
//
// Rules (server-enforced):
//   - no self-referral; one referrer per account (referrals PK)
//   - only accounts that have never paid, within 30 days of sign-up
//   - reward: both sides get 1 free month when the referred user makes
//     their FIRST paid purchase (shared/activation.js)
// ============================================================
import {
  HttpError, json, errorResponse, preflight, corsHeaders, assertOrigin, requireEnv, getServiceClient, authenticate,
} from '../../shared/server.js';
import { makeReferralCode, isReferralCode, REFERRAL_CLAIM_WINDOW_DAYS, DAY } from '../../shared/plans.js';
import { appUrlOf } from '../../shared/notify.js';

const ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

export async function getOrCreateCode(supabase, userId) {
  const { data: existing, error } = await supabase.from('referral_codes').select('code').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (existing?.code) return existing.code;
  for (let i = 0; i < 5; i++) {
    const code = makeReferralCode(crypto.getRandomValues(new Uint8Array(6)));
    const { error: insErr } = await supabase.from('referral_codes').insert({ user_id: userId, code });
    if (!insErr) return code;
    if (insErr.code !== '23505') throw insErr;
    const { data: again } = await supabase.from('referral_codes').select('code').eq('user_id', userId).maybeSingle();
    if (again?.code) return again.code; // lost a race with ourselves
  }
  throw new HttpError(500, 'Could not create a referral code. Please try again.');
}

export async function onRequestGet({ request, env }) {
  const cors = corsHeaders(request, env, 'GET, POST, OPTIONS');
  try {
    assertOrigin(request, env);
    requireEnv(env, ENV);
    const supabase = getServiceClient(env);
    const user = await authenticate(request, supabase);
    const code = await getOrCreateCode(supabase, user.id);
    const { data: refs, error } = await supabase.from('referrals').select('status').eq('referrer_user_id', user.id);
    if (error) throw error;
    return json({
      code,
      link: `${appUrlOf(env)}/?ref=${code}`,
      invited: (refs || []).length,
      rewarded: (refs || []).filter(r => r.status === 'rewarded').length,
    }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export async function onRequestPost({ request, env, now = new Date() }) {
  const cors = corsHeaders(request, env, 'GET, POST, OPTIONS');
  try {
    assertOrigin(request, env);
    requireEnv(env, ENV);
    const supabase = getServiceClient(env);
    const user = await authenticate(request, supabase);
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!isReferralCode(code)) throw new HttpError(400, 'This referral code is not valid.', 'ref_invalid');

    const { data: owner, error: oErr } = await supabase.from('referral_codes').select('user_id').eq('code', code).maybeSingle();
    if (oErr) throw oErr;
    if (!owner) throw new HttpError(404, 'This referral code is not valid.', 'ref_invalid');
    if (owner.user_id === user.id) throw new HttpError(400, 'You cannot use your own referral code.', 'ref_self');

    const created = new Date(user.created_at || 0).getTime();
    if (!Number.isFinite(created) || now.getTime() - created > REFERRAL_CLAIM_WINDOW_DAYS * DAY) {
      throw new HttpError(400, 'Referral codes can only be used in the first 30 days after sign-up.', 'ref_too_late');
    }
    const { data: paid, error: pErr } = await supabase.from('payment_orders').select('order_id').eq('user_id', user.id).eq('status', 'paid').limit(1);
    if (pErr) throw pErr;
    if ((paid || []).length) throw new HttpError(400, 'Referral codes are only for new customers.', 'ref_already_paid');

    const { error: insErr } = await supabase.from('referrals').insert({
      referred_user_id: user.id, referrer_user_id: owner.user_id, code, status: 'pending',
    });
    if (insErr) {
      if (insErr.code === '23505') throw new HttpError(409, 'A referral code is already linked to your account.', 'ref_exists');
      throw insErr;
    }
    return json({ ok: true }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export function onRequestOptions({ request, env }) {
  return preflight(request, env, 'GET, POST, OPTIONS');
}
