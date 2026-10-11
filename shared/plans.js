// ============================================================
// Subscription plans — SINGLE SOURCE OF TRUTH
// Imported by the Cloudflare Pages Functions (server) and by the React
// app (display only). The server NEVER trusts an amount sent by the
// browser: it looks the plan up here.
// Amounts are in paise (Razorpay's unit): 9900 = ₹99.
// ============================================================

export const PLANS = Object.freeze({
  monthly: Object.freeze({
    id: 'monthly',
    label: 'Monthly',
    description: 'Monthly Subscription (30 Days)',
    amount: 9900,
    currency: 'INR',
    days: 30,
  }),
  annual: Object.freeze({
    id: 'annual',
    label: 'Annual',
    description: 'Annual Subscription (1 Year)',
    amount: 99900,
    currency: 'INR',
    days: 365,
  }),
});

export const DEFAULT_PLAN_ID = 'annual';
export const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns the plan for a plan id, or null for anything unknown. */
export function getPlan(planId) {
  if (typeof planId !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(PLANS, planId) ? PLANS[planId] : null;
}

/** ₹ string for a paise amount: 99900 -> "₹999". */
export function formatPlanPrice(amountPaise) {
  const rupees = amountPaise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

/** Percentage saved by the annual plan vs 12 monthly payments (rounded). */
export function annualSavingsPercent() {
  const yearly = PLANS.monthly.amount * 12;
  return Math.round(((yearly - PLANS.annual.amount) / yearly) * 100);
}

function toTime(v) {
  if (!v) return NaN;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * New subscription end date after paying for `plan`.
 * Paid time is ADDED to whatever the user already has: we extend from
 * max(now, current paid period end, remaining trial end) so renewing early
 * — or paying during the free trial — never loses days.
 */
export function computeNewPeriodEnd(subscription, plan, now = new Date()) {
  if (!plan || !Number.isFinite(plan.days) || plan.days <= 0) {
    throw new Error('Invalid plan');
  }
  const nowMs = toTime(now);
  const candidates = [nowMs];
  if (subscription) {
    const paidEnd = toTime(subscription.current_period_end);
    if (Number.isFinite(paidEnd)) candidates.push(paidEnd);
    if (subscription.status === 'trial') {
      const trialEnd = toTime(subscription.trial_end);
      if (Number.isFinite(trialEnd)) candidates.push(trialEnd);
    }
  }
  return new Date(Math.max(...candidates) + plan.days * DAY_MS);
}

/** Does a captured Razorpay payment exactly match the plan we sold? */
export function paymentMatchesPlan(payment, plan) {
  return Boolean(
    payment && plan &&
    Number(payment.amount) === plan.amount &&
    String(payment.currency || 'INR').toUpperCase() === plan.currency
  );
}
