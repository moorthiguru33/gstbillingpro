// POST /api/store/order — public: place an order from a shop page.
// Body: { slug, name, phone, address?, note?, items: [{ id, qty }], website (honeypot) }
// Prices come from the shop's own products (never from the browser).
// Rate limited per visitor (hashed IP) and per shop.
import { json, errorResponse, HttpError, getServiceClient, requireEnv, assertOrigin } from '../../../shared/server.js';
import { validateOrder, rateLimitOk, makeOrderNo, ORDER_LIMITS } from '../../../shared/store.js';
import { loadShop, sha256Hex } from '../../../shared/store-server.js';

export async function onRequestPost({ request, env }) {
  try {
    assertOrigin(request, env);
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const len = Number(request.headers.get('content-length') || 0);
    if (len > ORDER_LIMITS.maxBody) throw new HttpError(413, 'Order too large', 'too_large');
    let body;
    try { body = JSON.parse(await request.text()); } catch { throw new HttpError(400, 'Invalid request', 'bad_request'); }
    const supabase = getServiceClient(env);
    const found = await loadShop(supabase, body?.slug);
    if (!found) throw new HttpError(404, 'Shop not found', 'no_shop');

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
    const ipHash = (await sha256Hex(`${ip}|${env.STORE_ORDER_SALT || env.SUPABASE_URL}`)).slice(0, 32);
    const since10 = new Date(Date.now() - 10 * 60000).toISOString();
    const since60 = new Date(Date.now() - 60 * 60000).toISOString();
    const [ipQ, shopQ] = await Promise.all([
      supabase.from('store_orders').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since10),
      supabase.from('store_orders').select('id', { count: 'exact', head: true }).eq('owner_id', found.row.owner_id).gte('created_at', since60),
    ]);
    if (ipQ.error || shopQ.error) throw new HttpError(503, 'Store not ready', 'not_ready');
    const rl = rateLimitOk({ ipRecent: ipQ.count || 0, shopRecent: shopQ.count || 0 });
    if (!rl.ok) throw new HttpError(429, 'Too many orders', rl.code);

    const v = validateOrder(body, found.catalogue);
    if (!v.ok) throw new HttpError(v.code === 'spam' ? 400 : 422, 'Invalid order', v.code);
    const o = v.order;
    let orderNo = makeOrderNo();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('store_orders').insert({
        owner_id: found.row.owner_id, order_no: orderNo, status: 'new',
        customer_name: o.name, customer_phone: o.phone, total: o.total, ip_hash: ipHash,
        data: { items: o.items, address: o.address, note: o.note, source: 'online' },
      });
      if (!error) return json({ ok: true, orderNo, order: o });
      if (error.code !== '23505') { console.error('[store-order] insert', error.message); throw new HttpError(503, 'Could not save order', 'save_failed'); }
      orderNo = makeOrderNo();
    }
    throw new HttpError(503, 'Could not save order', 'save_failed');
  } catch (e) {
    return errorResponse(e);
  }
}
