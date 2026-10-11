// ============================================================
// POST /api/create-order
// Headers: Authorization: Bearer <Supabase access token>
// Body:    { plan: 'monthly' | 'annual' }
//
// The price comes ONLY from shared/plans.js — any `amount` the browser
// sends is ignored. The order is recorded in payment_orders so that
// verify-payment / the webhook can check user, plan and amount later.
// ============================================================
import { getPlan } from '../../shared/plans.js';
import {
  HttpError, json, errorResponse, preflight, corsHeaders, assertOrigin,
  requireEnv, getServiceClient, authenticate, razorpay,
} from '../../shared/server.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request, env);
  try {
    assertOrigin(request, env);
    requireEnv(env, REQUIRED_ENV);
    const supabase = getServiceClient(env);
    const user = await authenticate(request, supabase);

    let body = {};
    try { body = await request.json(); } catch { /* empty body */ }
    const plan = getPlan(body.plan);
    if (!plan) throw new HttpError(400, 'Please choose a valid plan.');

    // Razorpay: receipt max 40 chars; notes values max 256 chars.
    const receipt = `gbp_${plan.id[0]}_${Date.now().toString(36)}_${user.id.slice(0, 8)}`;
    const order = await razorpay(env, '/orders', {
      method: 'POST',
      body: {
        amount: plan.amount,
        currency: plan.currency,
        receipt,
        notes: { userId: user.id, email: (user.email || '').slice(0, 200), plan: plan.id },
      },
    });
    if (!order?.id || Number(order.amount) !== plan.amount) {
      throw new HttpError(502, 'Payment gateway returned an unexpected order.');
    }

    const { error } = await supabase.from('payment_orders').insert({
      order_id: order.id,
      user_id: user.id,
      plan: plan.id,
      amount: plan.amount,
      currency: plan.currency,
      status: 'created',
    });
    if (error) throw error;

    return json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: plan.id,
      description: plan.description,
      keyId: env.RAZORPAY_KEY_ID, // public key id, safe to expose
    }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export function onRequestOptions({ request, env }) {
  return preflight(request, env, 'POST, OPTIONS');
}
