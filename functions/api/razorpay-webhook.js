// Razorpay Webhook handler - POST /api/razorpay-webhook
// Handles subscription renewals from Razorpay automatically

import { createClient } from '@supabase/supabase-js';

async function hmacSha256(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    // Verify webhook signature
    const expectedSig = await hmacSha256(env.RAZORPAY_WEBHOOK_SECRET, body);
    if (expectedSig !== signature) {
      return new Response('Invalid signature', { status: 400 });
    }

    const payload = JSON.parse(body);
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    // Handle payment events
    if (event === 'payment.captured') {
      const userId = paymentEntity?.notes?.userId;
      if (userId) {
        const newPeriodEnd = new Date();
        newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          status: 'active',
          razorpay_payment_id: paymentEntity.id,
          current_period_end: newPeriodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        await supabase.from('payment_logs').insert({
          user_id: userId,
          event_type: event,
          razorpay_payment_id: paymentEntity.id,
          amount: paymentEntity.amount,
          status: 'success',
          payload: paymentEntity,
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
