// ============================================================
// Admin panel helpers (server-only).
// Access = the caller's VERIFIED e-mail is in public.admins, checked with
// the service role on every request. The service key never leaves the
// server; the browser only ever sends its own Supabase access token.
// ============================================================
import { HttpError, getServiceClient, authenticate, assertOrigin, requireEnv } from './server.js';
import { effectivePlan, monthlyValue, getPlan, TIERS, LIFETIME_PERIOD_END, DAY } from './plans.js';

export async function requireAdmin(request, env) {
  assertOrigin(request, env);
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const supabase = getServiceClient(env);
  const user = await authenticate(request, supabase);
  const email = String(user.email || '').trim().toLowerCase();
  // An unconfirmed address proves nothing about who owns it.
  if (!email || !(user.email_confirmed_at || user.confirmed_at)) throw new HttpError(403, 'Not allowed');
  const { data, error } = await supabase.from('admins').select('email').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, 'Not allowed');
  return { supabase, user, adminEmail: email };
}

export async function logAdminAction(supabase, adminEmail, action, targetUserId, details) {
  const { error } = await supabase.from('admin_actions').insert({
    admin_email: adminEmail, action, target_user_id: targetUserId || null, details: details || {},
  });
  if (error) throw error; // an unlogged admin change is not allowed to "succeed"
}

/** Start of the current calendar month in IST, as an ISO instant. */
export function istMonthStart(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3600000).toISOString();
}

export const REVENUE_EVENTS = ['payment_verified', 'webhook_payment_captured'];

/**
 * Pure stats from subscription rows + this month's successful payment logs.
 * MRR counts running paid periods only (monthly price, or yearly / 12);
 * lifetime, trials, referral rewards and admin grants count as ₹0.
 */
export function computeStats(subs, payments, now = new Date()) {
  const nowMs = now.getTime();
  const in7 = nowMs + 7 * DAY;
  const out = {
    totalUsers: subs.length, trial: 0, free: 0, paid: 0, lifetime: 0,
    paidByTier: Object.fromEntries(Object.keys(TIERS).filter(t => t !== 'free').map(t => [t, 0])),
    paidByPlan: {}, mrr: 0, arr: 0, revenueThisMonth: 0, paymentsThisMonth: 0,
    expiringIn7Days: 0, trialsEndingIn7Days: 0,
  };
  for (const s of subs) {
    const eff = effectivePlan(s, now);
    if (s.lifetime) out.lifetime++;
    if (eff.source === 'trial') out.trial++;
    else if (eff.tier === 'free') out.free++;
    else {
      out.paid++;
      out.paidByTier[eff.tier] = (out.paidByTier[eff.tier] || 0) + 1;
      const key = getPlan(s.plan) ? s.plan : (s.lifetime && eff.source === 'lifetime' ? 'founder_lifetime' : (s.plan || 'other'));
      out.paidByPlan[key] = (out.paidByPlan[key] || 0) + 1;
    }
    const end = new Date(s.current_period_end || 0).getTime();
    const running = s.status === 'active' && end > nowMs && end < new Date(LIFETIME_PERIOD_END).getTime() - DAY;
    if (running) {
      out.mrr += monthlyValue(s.plan);
      if (end <= in7) out.expiringIn7Days++;
    }
    const tEnd = new Date(s.trial_end || 0).getTime();
    if (s.status === 'trial' && tEnd > nowMs && tEnd <= in7) out.trialsEndingIn7Days++;
  }
  for (const p of payments) {
    out.revenueThisMonth += Number(p.amount) || 0;
    out.paymentsThisMonth++;
  }
  out.arr = out.mrr * 12;
  return out;
}

const SAFE_Q = /[^a-z0-9@._+-]/g;
export function sanitizeSearch(q) { return String(q || '').toLowerCase().replace(SAFE_Q, '').slice(0, 80); }
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
