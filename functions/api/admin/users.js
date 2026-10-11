// GET /api/admin/users?q=<email part | user id>&filter=trial|free|paid|expiring
import { json } from '../../../shared/server.js';
import { sanitizeSearch, UUID_RE } from '../../../shared/admin.js';
import { effectivePlan, DAY } from '../../../shared/plans.js';
import { adminHandler, adminOptions } from '../../../shared/admin-handler.js';

const SUB_COLS = 'user_id,email,status,tier,plan,lifetime,trial_end,current_period_end,created_at,last_payment_at,amount';

export const onRequestGet = adminHandler(async ({ request, supabase, cors }) => {
  const url = new URL(request.url);
  const raw = (url.searchParams.get('q') || '').trim();
  const filter = url.searchParams.get('filter') || '';
  const now = new Date();
  let query = supabase.from('subscriptions').select(SUB_COLS);
  if (UUID_RE.test(raw)) query = query.eq('user_id', raw.toLowerCase());
  else if (raw) {
    const q = sanitizeSearch(raw);
    if (q) query = query.ilike('email', `%${q}%`);
  }
  if (filter === 'trial') query = query.eq('status', 'trial');
  if (filter === 'free') query = query.in('status', ['free', 'expired']);
  if (filter === 'paid') query = query.eq('status', 'active');
  if (filter === 'expiring') {
    query = query.eq('status', 'active').gt('current_period_end', now.toISOString())
      .lte('current_period_end', new Date(now.getTime() + 7 * DAY).toISOString());
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  const users = (data || []).map(s => {
    const eff = effectivePlan(s, now);
    return { ...s, effective: { tier: eff.tier, source: eff.source, until: eff.until, daysLeft: eff.daysLeft } };
  });
  let history = [];
  if (users.length === 1) {
    const { data: orders } = await supabase.from('payment_orders')
      .select('order_id,plan,amount,discount,coupon_code,status,receipt_number,created_at,paid_at,period_end')
      .eq('user_id', users[0].user_id).order('created_at', { ascending: false }).limit(20);
    const { data: actions } = await supabase.from('admin_actions')
      .select('admin_email,action,details,created_at').eq('target_user_id', users[0].user_id).order('created_at', { ascending: false }).limit(20);
    history = { orders: orders || [], actions: actions || [] };
  }
  return json({ users, history }, 200, cors);
});
export const onRequestOptions = adminOptions;
