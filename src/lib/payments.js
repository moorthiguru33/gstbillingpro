// Browser side of checkout: /api/create-order → Razorpay Checkout →
// /api/verify-payment. The server decides every price (shared/plans.js +
// coupon); the browser only names the plan and the coupon code.
import { authFetch } from './supabase.js';
import { t } from '../i18n';

async function postJson(path, body) {
  const r = await authFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

/** Human message for an API error ({ error, code }). */
export function apiErrorMessage(data) {
  if (data?.code) {
    const key = data.code.startsWith('ref_') ? `plans.${data.code}` : `plans.err_${data.code}`;
    const msg = t(key);
    if (msg && msg !== key) return msg;
  }
  return data?.error || t('plans.err_generic');
}

export async function previewPrice(planId, coupon) {
  const { ok, data } = await postJson('/api/validate-coupon', { plan: planId, coupon: coupon || undefined });
  if (!ok) throw Object.assign(new Error(apiErrorMessage(data)), { code: data?.code });
  return data;
}

/**
 * Opens Razorpay for `planId`. Resolves with the verify-payment result,
 * or null if the user closed the window. Throws with a readable message.
 */
export function checkout({ planId, coupon, user }) {
  return new Promise((resolve, reject) => {
    (async () => {
      if (typeof window.Razorpay !== 'function') throw new Error(t('plans.err_noRazorpay'));
      const { ok, data: order } = await postJson('/api/create-order', { plan: planId, coupon: coupon || undefined });
      if (!ok || !order.id) throw Object.assign(new Error(apiErrorMessage(order)), { code: order?.code });
      const key = order.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!key) throw new Error(t('plans.err_generic'));
      const rzp = new window.Razorpay({
        key,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'GST Billing Pro',
        description: order.description,
        order_id: order.id,
        prefill: { email: user?.email || '', name: user?.user_metadata?.full_name || '' },
        notes: { plan: planId },
        theme: { color: '#1e40af' },
        handler: async (response) => {
          try {
            const v = await postJson('/api/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            if (!v.ok || !v.data.success) throw new Error(v.data?.error || 'verify failed');
            resolve(v.data);
          } catch {
            reject(new Error(t('plans.payVerifyIssue', { id: response.razorpay_payment_id })));
          }
        },
        modal: { ondismiss: () => resolve(null) },
      });
      rzp.on?.('payment.failed', (resp) => reject(new Error(t('plans.payFailed', { reason: resp?.error?.description || t('plans.err_generic') }))));
      rzp.open();
    })().catch(reject);
  });
}

export async function fetchReferral() {
  const r = await authFetch('/api/referral', { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(apiErrorMessage(data));
  return data;
}

export async function claimReferral(code) {
  const { ok, data } = await postJson('/api/referral', { code });
  if (!ok) throw Object.assign(new Error(apiErrorMessage(data)), { code: data?.code });
  return data;
}

export async function requestWelcomeEmail() {
  try { await postJson('/api/account/welcome', {}); } catch { /* best effort */ }
}
