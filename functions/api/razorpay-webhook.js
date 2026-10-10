// ============================================================
// POST /api/razorpay-webhook   (called by Razorpay, not the browser)
// Razorpay Dashboard → Settings → Webhooks:
//   URL:    https://<your-domain>/api/razorpay-webhook
//   Events: payment.captured, order.paid
//   Secret: same value as the RAZORPAY_WEBHOOK_SECRET env var
//
// Safety net for when the browser closes before /api/verify-payment
// runs. Uses the same idempotent activation, so a payment is only ever
// applied once whichever path arrives first.
// ============================================================
import { getPlan, PLANS, planCharge, priceBreakdown, normalizeCode } from '../../shared/plans.js';
import {
  json, requireEnv, getServiceClient, hmacSha256Hex, timingSafeEqual, HttpError,
} from '../../shared/server.js';
import { loadOrder, activatePaidOrder } from '../../shared/activation.js';
import { background, sendReceiptForOrder } from '../../shared/notify.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RAZORPAY_WEBHOOK_SECRET'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLED = new Set(['payment.captured', 'order.paid']);

export async function onRequestPost({ request, env, waitUntil }) {
  try {
    requireEnv(env, REQUIRED_ENV);
  } catch {
    return json({ error: 'not configured' }, 500);
  }

  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const expected = await hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!timingSafeEqual(expected, signature)) return json({ error: 'Invalid signature' }, 400);

  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: 'Bad JSON' }, 400); }

  if (!HANDLED.has(payload.event)) return json({ received: true, ignored: payload.event });

  const payment = payload.payload?.payment?.entity;
  if (!payment?.order_id) return json({ received: true, ignored: 'no order' });

  try {
    const supabase = getServiceClient(env);
    let orderRow = await loadOrder(supabase, payment.order_id);

    if (!orderRow) {
      // Order created before payment_orders existed (or row lost):
      // rebuild it from the order notes that WE set server-side.
      const notes = payment.notes || payload.payload?.order?.entity?.notes || {};
      const plan = getPlan(notes.plan) ||
        Object.values(PLANS).find(p => planCharge(p) === Number(payment.amount)) || null;
      const discount = getPlan(notes.plan) ? Math.max(0, Number(notes.discount) || 0) : 0;
      if (!UUID_RE.test(notes.userId || '') || !plan) {
        console.error(`[webhook] cannot map order ${payment.order_id} to a user/plan`);
        return json({ received: true, ignored: 'unknown order' });
      }
      const bd = priceBreakdown(plan, discount);
      const { error } = await supabase.from('payment_orders').upsert({
        order_id: payment.order_id, user_id: notes.userId, plan: plan.id,
        amount: bd.total, base_amount: bd.base, discount: bd.discount, gst_amount: bd.gst,
        coupon_code: normalizeCode(notes.coupon) || null, currency: bd.currency, status: 'created',
      }, { onConflict: 'order_id', ignoreDuplicates: true });
      if (error) throw error;
      orderRow = await loadOrder(supabase, payment.order_id);
    }

    const result = await activatePaidOrder(supabase, { orderRow, payment, source: 'webhook' });
    if (!result.alreadyProcessed) await background(waitUntil, sendReceiptForOrder(env, supabase, orderRow.order_id));
    return json({ received: true, ...result });
  } catch (err) {
    if (err instanceof HttpError && err.status < 500 && err.status !== 409) {
      // Permanent problem (e.g. amount mismatch) — log, don't make Razorpay retry forever.
      console.error(`[webhook] rejected ${payment.order_id}: ${err.message}`);
      return json({ received: true, rejected: err.message });
    }
    console.error('[webhook] error:', err && (err.message || err));
    return json({ error: 'temporary failure' }, 500); // Razorpay will retry
  }
}
