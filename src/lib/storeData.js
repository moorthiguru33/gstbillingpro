// Online Store data (migration 005): the org's shop row and its online orders.
import { supabase } from './supabase.js';
import { isDemoModeActive } from '../store-supabase.js';
import { ownerId } from './modData.js';

const DEMO_SHOP = 'gst_demo_shop';
const DEMO_ORDERS = 'gst_demo_shop_orders';
const demoGet = (k, f) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const demoSet = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };

const demoOrders = () => {
  const now = Date.now();
  return [
    { id: 'demo-order-1', order_no: 'W-DEMO-01', status: 'new', customer_name: 'Lakshmi R', customer_phone: '919840011223', total: 610, created_at: new Date(now - 25 * 60000).toISOString(), data: { items: [{ id: 'prod_demo_1', name: 'India Gate Basmati Rice 5kg', unit: 'BAG', price: 450, qty: 1, amount: 450 }, { id: 'prod_demo_3', name: 'Tata Salt Vacuum Evaporated 1kg', unit: 'PKT', price: 25, qty: 2, amount: 50 }, { id: 'prod_demo_8', name: 'Philips LED Bulb 9W Cool Day White', unit: 'PCS', price: 110, qty: 1, amount: 110 }], address: '12, North Street, T Nagar', note: 'Deliver after 5 pm' } },
    { id: 'demo-order-2', order_no: 'W-DEMO-02', status: 'confirmed', customer_name: 'Arun Kumar', customer_phone: '919790022334', total: 270, created_at: new Date(now - 26 * 3600000).toISOString(), data: { items: [{ id: 'prod_demo_2', name: 'Fortune Sunlite Refined Oil 1L', unit: 'PKT', price: 135, qty: 2, amount: 270 }], address: '', note: '' } },
  ];
};

export async function getShop() {
  if (isDemoModeActive()) return demoGet(DEMO_SHOP, null);
  const uid = await ownerId();
  const { data, error } = await supabase.from('store_shops').select('*').eq('owner_id', uid).maybeSingle();
  if (error) throw error;
  return data;
}

/** Saves { slug, enabled, data }. Throws Error('slug_taken') when another shop has the slug. */
export async function saveShop(shop) {
  if (isDemoModeActive()) { const row = { ...shop, owner_id: 'demo-guest', updated_at: new Date().toISOString() }; demoSet(DEMO_SHOP, row); return row; }
  const uid = await ownerId();
  const row = { owner_id: uid, slug: shop.slug, enabled: !!shop.enabled, data: shop.data || {}, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('store_shops').upsert(row, { onConflict: 'owner_id' }).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('slug_taken');
    throw error;
  }
  return data;
}

export async function slugAvailable(slug) {
  if (isDemoModeActive()) return true;
  const uid = await ownerId();
  const { data, error } = await supabase.rpc('gbp_store_slug_free', { p_slug: slug, p_owner: uid });
  if (error) return null; // unknown: the save will tell
  return !!data;
}

export async function listOrders() {
  if (isDemoModeActive()) { let o = demoGet(DEMO_ORDERS, null); if (!o) { o = demoOrders(); demoSet(DEMO_ORDERS, o); } return o; }
  const uid = await ownerId();
  const { data, error } = await supabase.from('store_orders').select('*').eq('owner_id', uid).order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return data || [];
}

export async function setOrderStatus(id, status, billId) {
  const patch = { status, ...(billId ? { bill_id: billId } : {}) };
  if (isDemoModeActive()) { demoSet(DEMO_ORDERS, (demoGet(DEMO_ORDERS, []) || []).map(o => (o.id === id ? { ...o, ...patch } : o))); return; }
  const { error } = await supabase.from('store_orders').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteOrder(id) {
  if (isDemoModeActive()) { demoSet(DEMO_ORDERS, (demoGet(DEMO_ORDERS, []) || []).filter(o => o.id !== id)); return; }
  const { error } = await supabase.from('store_orders').delete().eq('id', id);
  if (error) throw error;
}

/** Shrinks a photo to <= 640 px JPEG in the browser. */
export function shrinkImage(file, max = 640, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('image'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

/** Uploads a product / logo photo; returns its public https URL. */
export async function uploadStoreImage(file, name) {
  const blob = await shrinkImage(file);
  if (isDemoModeActive()) {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
  }
  const uid = await ownerId();
  const safe = String(name).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'img';
  const path = `${uid}/${safe}.jpg`;
  const { error } = await supabase.storage.from('store-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('store-images').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now().toString(36)}`;
}
