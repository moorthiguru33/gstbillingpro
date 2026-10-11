// ============================================================
// POST /api/verify-payment
// Headers: Authorization: Bearer <Supabase access token>
// Body:    { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//
// 1. Authenticates the user from the access token (not from the body).
// 2. Verifies the Razorpay checkout signature (constant-time).
// 3. Loads the order from payment_orders and checks it belongs to the user.
// 4. Fetches the payment from the Razorpay API and checks it is captured,
//    belongs to the order and the amount equals the order price
//    (plan price from shared/plans.js − server-validated coupon + GST).
// 5. Activates idempotently (shared/activation.js: renewals, upgrades,
//    lifetime, referral bonus), logs the REAL captured amount and e-mails
//    the receipt (no-op until RESEND_API_KEY / FROM_EMAIL are set).
// ============================================================
import {
  HttpError, json, errorResponse, preflight, corsHeaders, assertOrigin, requireEnv,
  getServiceClient, authenticate, hmacSha256Hex, timingSafeEqual, razorpay,
} from '../../shared/server.js';
import { loadOrder, activatePaidOrder } from '../../shared/activation.js';
import { background, sendReceiptForOrder } from '../../shared/notify.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
const ID_RE = /^[A-Za-z0-9_]{6,64}$/;

export async function onRequestPost({ request, env, waitUntil }) {
  const cors = corsHeaders(request, env);
  try {
    assertOrigin(request, env);
    requireEnv(env, REQUIRED_ENV);
    const supabase = getServiceClient(env);
    const user = await authenticate(request, supabase);

    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
    if (!ID_RE.test(orderId || '') || !ID_RE.test(paymentId || '') || typeof signature !== 'string') {
      throw new HttpError(400, 'Missing payment verification fields');
    }

    const expected = await hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
    if (!timingSafeEqual(expected, signature)) throw new HttpError(400, 'Invalid payment signature');

    const orderRow = await loadOrder(supabase, orderId);
    if (!orderRow) throw new HttpError(404, 'Order not found. Please contact support with your payment ID.');
    if (orderRow.user_id !== user.id) throw new HttpError(403, 'This payment belongs to a different account.');

    if (orderRow.status === 'paid') {
      return json({ success: true, alreadyProcessed: true, periodEnd: orderRow.period_end, plan: orderRow.plan }, 200, cors);
    }

    // Confirm with Razorpay itself — never trust the browser's word.
    let payment = await razorpay(env, `/payments/${encodeURIComponent(paymentId)}`);
    if (payment?.status === 'authorized') {
      // Account not set to auto-capture: capture exactly the order amount.
      payment = await razorpay(env, `/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: 'POST', body: { amount: orderRow.amount, currency: orderRow.currency || 'INR' },
      });
    }

    const result = await activatePaidOrder(supabase, { orderRow, payment, source: 'verify' });
    if (!result.alreadyProcessed) await background(waitUntil, sendReceiptForOrder(env, supabase, orderId));
    return json({ success: true, ...result, plan: orderRow.plan }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export function onRequestOptions({ request, env }) {
  return preflight(request, env, 'POST, OPTIONS');
}
