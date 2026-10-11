// Server side of the Online Store (Pages Functions only; service role).
import { isValidSlug, publicShop, buildCatalogue } from './store.js';

/** { row, shop, catalogue } for an enabled shop, or null (unknown / off / tables not created yet). */
export async function loadShop(supabase, slug) {
  const s = String(slug || '').toLowerCase();
  if (!isValidSlug(s)) return null;
  const { data: row, error } = await supabase.from('store_shops').select('owner_id, slug, enabled, data').eq('slug', s).maybeSingle();
  if (error || !row || !row.enabled) return null;
  const { data: products, error: pErr } = await supabase.from('products')
    .select('id, name, price, stock, unit, data').eq('user_id', row.owner_id).limit(3000);
  if (pErr) return null;
  const shop = publicShop(row);
  const catalogue = buildCatalogue(products || [], row.data || {});
  return { row, shop, catalogue };
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function makeNonce() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/[^A-Za-z0-9]/g, '');
}
