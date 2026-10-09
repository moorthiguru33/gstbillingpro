// functions/api/verify-payment.js
// POST /api/verify-payment
// Verifies Razorpay signature and activates subscription in Supabase

import { createClient } from '@supabase/supabase-js';

// Helper: HMAC-SHA256 using Web Crypto API (available in Cloudflare Workers)
async function hmacSha256(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
    } = body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !userId) {
      return new Response(JSON.stringify({ error: 'Missing payment verification fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Verify Razorpay signature
    const message = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = await hmacSha256(env.RAZORPAY_KEY_SECRET, message);

    if (expectedSignature !== razorpay_signature) {
      return new Response(JSON.stringify({ error: 'Invalid payment signature' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Update Supabase subscription
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Support annual (365 days) vs monthly (30 days)
    const isAnnual = body.plan === 'annual' || (body.amount && body.amount >= 90000);
    const daysToAdd = isAnnual ? 365 : 30;

    const newPeriodEnd = new Date();
    newPeriodEnd.setDate(newPeriodEnd.getDate() + daysToAdd);

    const { error: subError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: userId,
        status: 'active',
        razorpay_payment_id,
        current_period_end: newPeriodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (subError) throw subError;

    // Log the payment
    await supabase.from('payment_logs').insert({
      user_id: userId,
      event_type: 'payment_verified',
      razorpay_payment_id,
      razorpay_order_id,
      amount: 9900,
      status: 'success',
      payload: body,
    });

    return new Response(JSON.stringify({ success: true, periodEnd: newPeriodEnd.toISOString() }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
