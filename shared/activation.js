// ============================================================
// Idempotent subscription activation (server-only).
// Used by /api/verify-payment (browser callback) AND
// /api/razorpay-webhook (Razorpay server callback). Whichever arrives
// first activates; the other one sees status='paid' and does nothing,
// so a payment can never extend a subscription twice.
// ============================================================
import { getPlan, computeNewPeriodEnd, paymentMatchesPlan } from './plans.js';
import { HttpError } from './server.js';

const STALE_PROCESSING_MS = 2 * 60 * 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('payment_orders').select('*').eq('order_id', orderId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * @param supabase  service-role client
 * @param orderRow  row from payment_orders
 * @param payment   Razorpay payment entity (fetched from Razorpay or from a
 *                  signature-verified webhook) — must be status 'captured'
 * @param source    'verify' | 'webhook'
 * @returns {{ periodEnd: string, alreadyProcessed: boolean }}
 */
export async function activatePaidOrder(supabase, { orderRow, payment, source, now = new Date() }) {
  const plan = getPlan(orderRow.plan);
  if (!plan) throw new HttpError(400, 'Unknown plan on order');
  if (orderRow.status === 'paid') {
    return { periodEnd: orderRow.period_end, alreadyProcessed: true };
  }
  if (!payment || payment.status !== 'captured') throw new HttpError(402, 'Payment has not been captured yet');
  if (payment.order_id !== orderRow.order_id) throw new HttpError(400, 'Payment does not belong to this order');
  if (Number(payment.amount) !== Number(orderRow.amount) || !paymentMatchesPlan(payment, plan)) {
    console.error(`[activation] amount mismatch order=${orderRow.order_id} paid=${payment.amount} expected=${orderRow.amount}`);
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
    const { data: sub, error: subReadErr } = await supabase
      .from('subscriptions').select('*').eq('user_id', orderRow.user_id).maybeSingle();
    if (subReadErr) throw subReadErr;

    const periodEnd = computeNewPeriodEnd(sub, plan, now).toISOString();
    const nowIso = now.toISOString();

    const { error: upErr } = await supabase.from('subscriptions').upsert({
      user_id: orderRow.user_id,
      status: 'active',
      plan: plan.id,
      amount: Number(payment.amount),
      razorpay_payment_id: payment.id,
      razorpay_order_id: orderRow.order_id,
      current_period_end: periodEnd,
      last_payment_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: 'user_id' });
    if (upErr) throw upErr;

    const { error: doneErr } = await supabase.from('payment_orders')
      .update({ status: 'paid', paid_at: nowIso, period_end: periodEnd, updated_at: nowIso })
      .eq('order_id', orderRow.order_id);
    if (doneErr) throw doneErr;

    const { error: logErr } = await supabase.from('payment_logs').insert({
      user_id: orderRow.user_id,
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
      },
    });
    if (logErr) console.error('[activation] payment log insert failed:', logErr.message);

    return { periodEnd, alreadyProcessed: false };
  } catch (err) {
    // Release the claim so the webhook / a retry can finish the job.
    await supabase.from('payment_orders')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('order_id', orderRow.order_id).eq('status', 'processing');
    throw err;
  }
}
