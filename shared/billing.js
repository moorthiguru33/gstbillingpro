// ============================================================
// Order quoting (server-only): which SKU, which coupon, what price.
// Shared by /api/create-order (real order) and /api/validate-coupon
// (preview in the upgrade modal) so both always agree.
// ============================================================
import {
  getPurchasablePlan, planChange, priceBreakdown, evaluateCoupon, normalizeCode, TIERS,
} from './plans.js';
import { HttpError } from './server.js';

const COUPON_MESSAGES = {
  invalid: 'This coupon code is not valid.',
  expired: 'This coupon has expired.',
  used_up: 'This coupon has been fully used.',
  already_used: 'You have already used this coupon.',
  not_for_plan: 'This coupon is not valid for the selected plan.',
  invalid_plan: 'Please choose a valid plan.',
};

export async function founderSeatsSold(supabase, planId) {
  const { data, error } = await supabase
    .from('payment_orders').select('order_id').eq('plan', planId).in('status', ['paid', 'processing']);
  if (error) throw error;
  return (data || []).length;
}

/**
 * @returns {{ plan, breakdown, coupon: string|null }}
 * Throws HttpError with a machine-readable `code` on any refusal.
 */
export async function quoteOrder(supabase, user, { planId, couponCode, now = new Date() }) {
  const plan = getPurchasablePlan(planId);
  if (!plan) throw new HttpError(400, 'Please choose a valid plan.', 'invalid_plan');

  const { data: sub, error: subErr } = await supabase
    .from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();
  if (subErr) throw subErr;

  if (plan.lifetime && sub?.lifetime) {
    throw new HttpError(409, 'You already own Founder Lifetime.', 'already_lifetime');
  }
  const change = planChange(sub, plan, now);
  if (!change.ok) {
    const name = TIERS[change.currentTier]?.name || change.currentTier;
    throw new HttpError(409, `You are on the ${name} plan. Choose ${name} or a higher plan to renew.`, 'downgrade');
  }
  if (plan.cap) {
    const sold = await founderSeatsSold(supabase, plan.id);
    if (sold >= plan.cap) throw new HttpError(410, 'Founder Lifetime is sold out.', 'sold_out');
  }

  let discount = 0;
  let coupon = null;
  if (couponCode != null && String(couponCode).trim() !== '') {
    const code = normalizeCode(couponCode);
    if (!code) throw new HttpError(400, COUPON_MESSAGES.invalid, 'coupon_invalid');
    const { data: row, error: cErr } = await supabase.from('coupons').select('*').eq('code', code).maybeSingle();
    if (cErr) throw cErr;
    let alreadyUsedByUser = false;
    if (row) {
      const { data: used, error: uErr } = await supabase
        .from('coupon_redemptions').select('id').eq('code', code).eq('user_id', user.id).limit(1);
      if (uErr) throw uErr;
      alreadyUsedByUser = (used || []).length > 0;
    }
    const res = evaluateCoupon(row, plan, { now, alreadyUsedByUser });
    if (!res.ok) throw new HttpError(400, COUPON_MESSAGES[res.reason] || COUPON_MESSAGES.invalid, `coupon_${res.reason}`);
    discount = res.discount;
    coupon = code;
  }

  return { plan, breakdown: priceBreakdown(plan, discount), coupon, change };
}
