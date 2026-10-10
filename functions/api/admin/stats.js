// GET /api/admin/stats — dashboard numbers, recent sign-ups and payments.
import { json } from '../../../shared/server.js';
import { computeStats, istMonthStart, REVENUE_EVENTS } from '../../../shared/admin.js';
import { fetchAll } from '../../../shared/lifecycle.js';
import { FOUNDER_LIFETIME_CAP } from '../../../shared/plans.js';
import { founderSeatsSold } from '../../../shared/billing.js';
import { adminHandler, adminOptions } from '../../../shared/admin-handler.js';

const SUB_COLS = 'user_id,email,status,tier,plan,lifetime,trial_end,current_period_end,created_at,last_payment_at,amount';

export const onRequestGet = adminHandler(async ({ supabase, cors }) => {
  const now = new Date();
  const monthStart = istMonthStart(now);
  const subs = await fetchAll(() => supabase.from('subscriptions').select(SUB_COLS).order('created_at', { ascending: true }));
  const payments = await fetchAll(() => supabase.from('payment_logs')
    .select('amount,created_at,event_type,status').eq('status', 'success').in('event_type', REVENUE_EVENTS)
    .gte('created_at', monthStart).order('created_at', { ascending: true }));
  const { data: recentPayments, error: rpErr } = await supabase.from('payment_logs')
    .select('user_id,amount,plan,created_at,event_type,razorpay_payment_id,payload')
    .eq('status', 'success').in('event_type', REVENUE_EVENTS).order('created_at', { ascending: false }).limit(15);
  if (rpErr) throw rpErr;
  const stats = computeStats(subs, payments, now);
  const recentSignups = [...subs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 15);
  const emailOf = Object.fromEntries(subs.map(s => [s.user_id, s.email]));
  const sold = await founderSeatsSold(supabase, 'founder_lifetime');
  return json({
    stats, monthStart,
    founder: { sold, cap: FOUNDER_LIFETIME_CAP, left: Math.max(0, FOUNDER_LIFETIME_CAP - sold) },
    recentSignups,
    recentPayments: (recentPayments || []).map(p => ({
      email: emailOf[p.user_id] || null, user_id: p.user_id, amount: p.amount, plan: p.plan, created_at: p.created_at,
      payment_id: p.razorpay_payment_id, coupon: p.payload?.coupon || null, receipt: p.payload?.receipt_number || null,
    })),
  }, 200, cors);
});
export const onRequestOptions = adminOptions;
