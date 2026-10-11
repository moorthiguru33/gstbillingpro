// Client for /api/ai/* (Workers AI voice + photo billing).
import { authFetch } from './supabase';
import { dataOwnerId } from './org';
import { t } from '../i18n';
import { matchProduct } from '../../shared/ai.js';

export { matchProduct };

async function call(path, body, type, params = {}) {
  const q = new URLSearchParams({ ...params, ...(dataOwnerId() ? { owner: dataOwnerId() } : {}) });
  let r;
  try {
    r = await authFetch(`/api/ai/${path}?${q}`, body ? { method: 'POST', body, headers: { 'Content-Type': type } } : {});
  } catch {
    throw Object.assign(new Error(t('ai.err_offline')), { code: 'offline' });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const key = data?.code ? `ai.err_${data.code}` : '';
    const msg = key && t(key) !== key ? t(key) : (data?.error || t('ai.err_ai_failed'));
    throw Object.assign(new Error(msg), { code: data?.code || 'http', status: r.status });
  }
  return data;
}

export const aiUsage = () => call('usage');
export const aiVoiceBill = (blob, lang) => call('voice-bill', blob, (blob.type || 'audio/webm').split(';')[0], lang ? { lang } : {});
export async function aiPhotoBill(file, mode = 'purchase') {
  const jpeg = await shrinkImage(file);
  return call('photo-bill', jpeg, jpeg.type || 'image/jpeg', { mode });
}

/** Downscale a photo to ≤1600px JPEG (fast upload, within model limits). */
export async function shrinkImage(file, max = 1600, quality = 0.85) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file;
  }
}

/** Attach catalogue matches to AI items. */
export function withMatches(items, products) {
  return (items || []).map((it, i) => {
    const m = matchProduct(it.name, products);
    const p = m?.product;
    return {
      key: `${i}-${it.name}`,
      name: p ? p.name : it.name,
      spoken: it.name,
      qty: it.qty || 1,
      unit: it.unit || p?.unit || '',
      rate: it.rate || Number(p?.sellingPrice ?? p?.rate ?? p?.price ?? 0) || 0,
      hsn: it.hsn || p?.hsn || '',
      gst: it.gst ?? (p ? Number(p.taxRate ?? p.taxPercent ?? 0) : null),
      product: p || null,
      score: m?.score || 0,
    };
  });
}
