// ============================================================
// POST /api/validate-coupon   { plan, coupon }
// Price preview for the upgrade modal. Same rules as create-order
// (shared/billing.js); nothing is reserved or written.
// ============================================================
import {
  json, errorResponse, preflight, corsHeaders, assertOrigin, requireEnv, getServiceClient, authenticate,
} from '../../shared/server.js';
import { quoteOrder } from '../../shared/billing.js';

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request, env);
  try {
    assertOrigin(request, env);
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const supabase = getServiceClient(env);
    const user = await authenticate(request, supabase);
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { plan, breakdown, coupon, change } = await quoteOrder(supabase, user, { planId: body.plan, couponCode: body.coupon });
    return json({ ok: true, plan: plan.id, coupon, breakdown, periodEnd: change.periodEnd, creditDays: change.creditDays }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export function onRequestOptions({ request, env }) {
  return preflight(request, env, 'POST, OPTIONS');
}
