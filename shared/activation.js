// ============================================================
// Idempotent subscription activation (server-only).
// Used by /api/verify-payment (browser callback) AND
// /api/razorpay-webhook (Razorpay server callback). Whichever arrives
// first activates; the other one sees status='paid' and does nothing,
// so a payment can never extend a subscription twice.
//
// Handles every SKU in shared/plans.js: monthly / yearly renewals,
// upgrades (unused days credited), Founder Lifetime, coupons (discount
// already fixed on the order by create-order) and referral rewards.
// ============================================================
import {
  getPlan, planChange, priceBreakdown, paymentMatchesPlan, LIFETIME_PERIOD_END,
  REFERRAL_BONUS_DAYS, referrerReward, addDays,
} from './plans.js';
import { HttpError } from './server.js';

const STALE_PROCESSING_MS = 2 * 60 * 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('payment_orders').select('*').eq('order_id', orderId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Amount the order should have charged, recomputed from the plan map. */
export function expectedOrderAmount(orderRow, plan) {
  return priceBreakdown(plan, Number(orderRow.discount) || 0).total;
}

/**
 * @param supabase  service-role client
 * @param orderRow  row from payment_orders
 * @param payment   Razorpay payment entity (fetched from Razorpay or from a
 *                  signature-verified webhook) — must be status 'captured'
 * @param source    'verify' | 'webhook'
 * @returns {{ periodEnd, tier, lifetime, alreadyProcessed, referralBonus }}
 */
export async function activatePaidOrder(supabase, { orderRow, payment, source, now = new Date() }) {
  const plan = getPlan(orderRow.plan);
  if (!plan) throw new HttpError(400, 'Unknown plan on order');
  if (orderRow.status === 'paid') {
    return { periodEnd: orderRow.period_end, alreadyProcessed: true };
  }
  if (!payment || payment.status !== 'captured') throw new HttpError(402, 'Payment has not been captured yet');
  if (payment.order_id !== orderRow.order_id) throw new HttpError(400, 'Payment does not belong to this order');
  const expected = expectedOrderAmount(orderRow, plan);
  if (Number(payment.amount) !== Number(orderRow.amount) || Number(orderRow.amount) !== expected
      || !paymentMatchesPlan(payment, plan, expected)) {
    console.error(`[activation] amount mismatch order=${orderRow.order_id} paid=${payment.amount} order=${orderRow.amount} expected=${expected}`);
    throw new HttpError(400, 'Paid amount does not match the plan. Please contact support.');
  }

  // ---- Claim the order atomically (only one caller can win) ----
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS).toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from('payment_orders')
    .update({ status: 'processing', razorpay_payment_id: payment.id, updated_at: now.toISOString() })
    .eq('order_id', orderRow.order_id)
    .or(`status.eq.created,status.eq.failed,and(status.eq.processing,updated_at.lt."${staleBefore}")`)
    .select()
    .maybeSingle();
  if (claimErr) throw claimErr;

  if (!claimed) {
    // Someone else (webhook vs browser) is activating / has activated it.
    for (let i = 0; i < 8; i++) {
      const row = await loadOrder(supabase, orderRow.order_id);
      if (row?.status === 'paid') return { periodEnd: row.period_end, alreadyProcessed: true };
      await sleep(500);
    }
    throw new HttpError(409, 'Your payment is being processed. Please refresh in a minute.');
  }

  try {
    const userId = orderRow.user_id;
    const { data: sub, error: subReadErr } = await supabase
      .from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
    if (subReadErr) throw subReadErr;

    // Is this the user's first paid order? (referral reward trigger)
    const { data: prevPaid, error: prevErr } = await supabase
      .from('payment_orders').select('order_id').eq('user_id', userId).eq('status', 'paid').limit(1);
    if (prevErr) throw prevErr;
    const firstPurchase = !prevPaid || prevPaid.length === 0;

    // Founder Lifetime cap: refuse at create-order; if two buyers race for
    // the last seat we still honour the payment (and flag it in the log).
    let overCap = false;
    if (plan.cap) {
      const { data: sold, error: soldErr } = await supabase
        .from('payment_orders').select('order_id').eq('plan', plan.id).eq('status', 'paid');
      if (soldErr) throw soldErr;
      overCap = (sold || []).length >= plan.cap;
      if (overCap) console.warn(`[activation] ${plan.id} sold beyond cap (${plan.cap}) order=${orderRow.order_id}`);
    }

    const change = planChange(sub, plan, now, { allowDowngrade: true });
    let periodEnd = change.periodEnd;

    // Referral: the referred user gets +30 days on their first purchase.
    let referral = null;
    if (firstPurchase) {
      const { data: ref } = await supabase
        .from('referrals').select('*').eq('referred_user_id', userId).eq('status', 'pending').maybeSingle();
      if (ref) {
        const { data: won } = await supabase.from('referrals')
          .update({ status: 'rewarded', rewarded_at: now.toISOString(), order_id: orderRow.order_id })
          .eq('referred_user_id', userId).eq('status', 'pending')
          .select().maybeSingle();
        if (won) {
          referral = won;
          if (periodEnd !== LIFETIME_PERIOD_END) periodEnd = addDays(periodEnd, REFERRAL_BONUS_DAYS);
        }
      }
    }

    const nowIso = now.toISOString();
    const { error: upErr } = await supabase.from('subscriptions').upsert({
      user_id: userId,
      status: 'active',
      plan: plan.id,
      tier: change.tier,
      lifetime: change.lifetime,
      amount: Number(payment.amount),
      razorpay_payment_id: payment.id,
      razorpay_order_id: orderRow.order_id,
      current_period_end: periodEnd,
      last_payment_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: 'user_id' });
    if (upErr) throw upErr;

    let receiptNumber = orderRow.receipt_number || null;
    if (!receiptNumber) {
      const { data: rn, error: rnErr } = await supabase.rpc('next_receipt_number', { p_at: nowIso });
      if (rnErr) console.error('[activation] receipt number failed:', rnErr.message);
      else receiptNumber = rn;
    }

    const { error: doneErr } = await supabase.from('payment_orders')
      .update({ status: 'paid', paid_at: nowIso, period_end: periodEnd, receipt_number: receiptNumber, updated_at: nowIso })
      .eq('order_id', orderRow.order_id);
    if (doneErr) throw doneErr;

    // ---- Everything below is bookkeeping: never fail a paid order on it ----
    const { error: logErr } = await supabase.from('payment_logs').insert({
      user_id: userId,
      event_type: source === 'webhook' ? 'webhook_payment_captured' : 'payment_verified',
      razorpay_payment_id: payment.id,
      razorpay_order_id: orderRow.order_id,
      amount: Number(payment.amount),          // REAL captured amount (paise)
      currency: payment.currency || 'INR',
      plan: plan.id,
      status: 'success',
      payload: {
        method: payment.method || null,
        email: payment.email || null,
        contact: payment.contact || null,
        created_at: payment.created_at || null,
        source,
        tier: change.tier,
        change: change.kind,
        credit_days: change.creditDays,
        coupon: orderRow.coupon_code || null,
        discount: Number(orderRow.discount) || 0,
        referral_bonus_days: referral ? REFERRAL_BONUS_DAYS : 0,
        receipt_number: receiptNumber,
        ...(overCap ? { over_cap: true } : {}),
      },
    });
    if (logErr) console.error('[activation] payment log insert failed:', logErr.message);

    if (orderRow.coupon_code) {
      const { error: redErr } = await supabase.from('coupon_redemptions').upsert({
        code: orderRow.coupon_code, user_id: userId, order_id: orderRow.order_id, discount: Number(orderRow.discount) || 0,
      }, { onConflict: 'code,user_id', ignoreDuplicates: true });
      if (redErr) console.error('[activation] coupon redemption insert failed:', redErr.message);
      const { error: incErr } = await supabase.rpc('redeem_coupon', { p_code: orderRow.coupon_code });
      if (incErr) console.error('[activation] coupon counter failed:', incErr.message);
    }

    if (referral) {
      try { await rewardReferrer(supabase, referral, now); } catch (e) { console.error('[activation] referrer reward failed:', e.message); }
    }

    return { periodEnd, tier: change.tier, lifetime: change.lifetime, alreadyProcessed: false, referralBonus: Boolean(referral), receiptNumber };
  } catch (err) {
    // Release the claim so the webhook / a retry can finish the job.
    await supabase.from('payment_orders')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('order_id', orderRow.order_id).eq('status', 'processing');
    throw err;
  }
}

/** Give the referrer their free month (see referrerReward in plans.js). */
export async function rewardReferrer(supabase, referral, now = new Date()) {
  const { data: sub, error } = await supabase
    .from('subscriptions').select('*').eq('user_id', referral.referrer_user_id).maybeSingle();
  if (error) throw error;
  const reward = referrerReward(sub, now);
  const nowIso = now.toISOString();
  const { error: upErr } = await supabase.from('subscriptions').upsert({
    user_id: referral.referrer_user_id,
    status: 'active',
    tier: reward.tier,
    ...(sub?.plan && reward.kind === 'extend' ? {} : { plan: 'referral_reward' }),
    current_period_end: reward.periodEnd,
    updated_at: nowIso,
  }, { onConflict: 'user_id' });
  if (upErr) throw upErr;
  await supabase.from('payment_logs').insert({
    user_id: referral.referrer_user_id, event_type: 'referral_reward', amount: 0, currency: 'INR',
    plan: reward.tier, status: 'success',
    payload: { referred_user_id: referral.referred_user_id, kind: reward.kind, period_end: reward.periodEnd, order_id: referral.order_id },
  });
  return reward;
}
