// POST /api/admin/grant
//   { userId, tier: 'starter'|'pro'|'business'|'free', days?: 1-3650, lifetime?: bool, note: string }
// Manual extend / grant / revoke. Every change is logged in admin_actions
// with the before and after values.
import { json, HttpError } from '../../../shared/server.js';
import { logAdminAction, UUID_RE } from '../../../shared/admin.js';
import { TIERS, LIFETIME_PERIOD_END, DAY, paidTierOf } from '../../../shared/plans.js';
import { adminHandler, adminOptions } from '../../../shared/admin-handler.js';

export function planGrant(sub, { tier, days, lifetime }, now = new Date()) {
  const nowMs = now.getTime();
  if (tier === 'free') {
    return { status: 'free', tier: 'free', lifetime: false, current_period_end: now.toISOString() };
  }
  if (lifetime) return { status: 'active', tier: tier === 'starter' ? 'starter' : tier, lifetime: true, current_period_end: LIFETIME_PERIOD_END, plan: 'admin_grant' };
  const end = new Date(sub?.current_period_end || 0).getTime();
  const sameTierRunning = sub?.status === 'active' && end > nowMs && paidTierOf(sub) === tier && end < new Date(LIFETIME_PERIOD_END).getTime() - DAY;
  const start = sameTierRunning ? end : nowMs;
  return { status: 'active', tier, lifetime: Boolean(sub?.lifetime), current_period_end: new Date(start + days * DAY).toISOString(), plan: sameTierRunning ? sub.plan : 'admin_grant' };
}

export const onRequestPost = adminHandler(async ({ request, supabase, adminEmail, cors }) => {
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const { userId, tier } = body;
  const days = Number(body.days);
  const lifetime = body.lifetime === true;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  if (!UUID_RE.test(userId || '')) throw new HttpError(400, 'Invalid user id');
  if (!Object.prototype.hasOwnProperty.call(TIERS, tier)) throw new HttpError(400, 'Invalid tier');
  if (tier !== 'free' && !lifetime && !(Number.isInteger(days) && days >= 1 && days <= 3650)) throw new HttpError(400, 'Days must be 1–3650');
  if (!note) throw new HttpError(400, 'A note (reason) is required');

  const { data: sub, error } = await supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!sub) throw new HttpError(404, 'User not found');
  const patch = planGrant(sub, { tier, days, lifetime });
  const before = { status: sub.status, tier: sub.tier, plan: sub.plan, lifetime: sub.lifetime, current_period_end: sub.current_period_end };
  await logAdminAction(supabase, adminEmail, 'grant', userId, { request: { tier, days: days || null, lifetime, note }, before, after: patch });
  const { data: updated, error: upErr } = await supabase.from('subscriptions')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', userId).select().maybeSingle();
  if (upErr) throw upErr;
  return json({ ok: true, subscription: updated }, 200, cors);
});
export const onRequestOptions = adminOptions;
