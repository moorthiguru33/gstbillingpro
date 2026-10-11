// GET /s/<shop-slug> — public online shop page (SEO meta + catalogue + cart
// that sends the order to the shop on WhatsApp). Server-rendered so search
// engines and link previews see the shop's own title and description.
import { getServiceClient } from '../../shared/server.js';
import { renderShopPage, shopPageHeaders } from '../../shared/store.js';
import { loadShop, makeNonce } from '../../shared/store-server.js';

export async function onRequestGet({ params, env, request }) {
  const nonce = makeNonce();
  const origin = new URL(request.url).origin;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(renderShopPage(null), { status: 503, headers: shopPageHeaders(nonce, { found: false }) });
  }
  try {
    const found = await loadShop(getServiceClient(env), params?.slug);
    if (!found) return new Response(renderShopPage(null), { status: 404, headers: shopPageHeaders(nonce, { found: false }) });
    return new Response(renderShopPage(found.shop, found.catalogue, { origin, nonce }), { status: 200, headers: shopPageHeaders(nonce) });
  } catch (e) {
    console.error('[shop-page]', e?.message);
    return new Response(renderShopPage(null), { status: 500, headers: shopPageHeaders(nonce, { found: false }) });
  }
}
