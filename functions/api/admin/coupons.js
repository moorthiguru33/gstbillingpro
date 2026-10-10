// GET  /api/admin/coupons            → list
// POST /api/admin/coupons  { action: 'create', code, kind, value, max_redemptions?, valid_until?, applies_to?, note? }
//                          { action: 'set_active', code, active }
import { json, HttpError } from '../../../shared/server.js';
import { logAdminAction } from '../../../shared/admin.js';
import { normalizeCode, getPlan, getTier } from '../../../shared/plans.js';
import { adminHandler, adminOptions } from '../../../shared/admin-handler.js';

export function validateCouponInput(b) {
  const code = normalizeCode(b.code);
  if (!code) throw new HttpError(400, 'Code: 3–32 letters, digits, - or _');
  if (!['percent', 'flat'].includes(b.kind)) throw new HttpError(400, 'Kind must be percent or flat');
  const value = Number(b.value);
  if (!Number.isInteger(value) || value <= 0) throw new HttpError(400, 'Value must be a positive whole number');
  if (b.kind === 'percent' && value > 90) throw new HttpError(400, 'Percent coupons are limited to 90%');
  const max = b.max_redemptions == null || b.max_redemptions === '' ? null : Number(b.max_redemptions);
  if (max != null && !(Number.isInteger(max) && max > 0)) throw new HttpError(400, 'Max redemptions must be a positive number');
  let validUntil = null;
  if (b.valid_until) {
    const t = new Date(b.valid_until);
    if (!Number.isFinite(t.getTime())) throw new HttpError(400, 'Invalid expiry date');
    validUntil = t.toISOString();
  }
  const applies = Array.isArray(b.applies_to) ? b.applies_to.filter(Boolean) : [];
  for (const a of applies) if (!getPlan(a) && !getTier(a)) throw new HttpError(400, `Unknown plan/tier: ${String(a).slice(0, 30)}`);
  return { code, kind: b.kind, value, max_redemptions: max, valid_until: validUntil, applies_to: applies.length ? applies : null, note: typeof b.note === 'string' ? b.note.slice(0, 300) : null };
}

export const onRequestGet = adminHandler(async ({ supabase, cors }) => {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return json({ coupons: data || [] }, 200, cors);
});

export const onRequestPost = adminHandler(async ({ request, supabase, adminEmail, cors }) => {
  let b = {};
  try { b = await request.json(); } catch { /* empty */ }
  if (b.action === 'create') {
    const row = validateCouponInput(b);
    await logAdminAction(supabase, adminEmail, 'coupon_create', null, row);
    const { data, error } = await supabase.from('coupons').insert({ ...row, created_by: adminEmail }).select().maybeSingle();
    if (error) {
      if (error.code === '23505') throw new HttpError(409, 'A coupon with this code already exists');
      throw error;
    }
    return json({ ok: true, coupon: data }, 200, cors);
  }
  if (b.action === 'set_active') {
    const code = normalizeCode(b.code);
    if (!code) throw new HttpError(400, 'Invalid code');
    await logAdminAction(supabase, adminEmail, 'coupon_set_active', null, { code, active: b.active === true });
    const { data, error } = await supabase.from('coupons').update({ active: b.active === true, updated_at: new Date().toISOString() }).eq('code', code).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Coupon not found');
    return json({ ok: true, coupon: data }, 200, cors);
  }
  throw new HttpError(400, 'Unknown action');
});
export const onRequestOptions = adminOptions;
