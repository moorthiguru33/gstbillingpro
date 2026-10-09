// ============================================================
// Cloudflare Pages Functions — /functions/api/
// These run as serverless functions on Cloudflare's edge
// Handles: Razorpay order creation & payment verification
// ============================================================

// functions/api/create-order.js
// POST /api/create-order
export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    const body = await request.json();
    const { amount, currency, userId, email } = body;

    if (!amount || !userId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Create Razorpay order
    // Support monthly (₹99) and annual (₹999 - Save 2 months)
    const isAnnual = body.plan === 'annual' || (amount && amount >= 90000);
    const orderAmount = isAnnual ? 99900 : (amount || 9900);
    const planName = isAnnual ? 'annual' : 'monthly';

    const credentials = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: orderAmount,
        currency: currency || 'INR',
        receipt: `order_${userId}_${planName}_${Date.now()}`,
        notes: { userId, email, plan: planName },
      }),
    });

    const order = await orderRes.json();

    if (!orderRes.ok) {
      return new Response(JSON.stringify({ error: order.error?.description || 'Order creation failed' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify(order), {
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
