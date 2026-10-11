// ============================================================
// Plans, tiers and limits — SINGLE SOURCE OF TRUTH
//
// Imported by the Cloudflare Pages Functions (server: prices, limits,
// activation maths) and by the React app (display only). The server NEVER
// trusts an amount sent by the browser: it looks the plan up here.
// The SQL side (plan_limits table used by the bills / business limit
// triggers) is generated from this file by scripts/gen-plan-sql.mjs and a
// test fails if the migration drifts from it.
//
// Amounts are in paise (Razorpay's unit): 99900 = ₹999. Prices are
// EXCLUSIVE of GST. GST_PERCENT is 0 until D Printers starts charging GST
// on subscriptions; set it to 18 and redeploy and every order, receipt and
// price label picks it up.
// ============================================================

export const CURRENCY = 'INR';
export const GST_PERCENT = 0;
export const TRIAL_DAYS = 30;
export const TRIAL_TIER = 'pro';            // trial users get Pro features
export const FOUNDER_LIFETIME_CAP = 300;
export const REFERRAL_BONUS_DAYS = 30;
export const REFERRAL_CLAIM_WINDOW_DAYS = 30;
export const MIN_CHARGE_PAISE = 100;       // Razorpay minimum order (₹1)
// Lifetime rows also get this period end so pre-Phase-2 clients (which
// only look at status + current_period_end) keep treating them as paid.
export const LIFETIME_PERIOD_END = '2099-12-31T23:59:59.000Z';
// Invoice types that do NOT count towards the Free monthly limit.
export const UNCOUNTED_INVOICE_TYPES = Object.freeze(['quotation', 'estimate', 'proforma', 'delivery-challan']);

const DAY_MS = 24 * 60 * 60 * 1000;
const deepFreeze = (o) => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

// ---------------------------------------------------------------- tiers
// limits: null = unlimited. features: true = included.
// Feature flags marked `soon` in FEATURES are placeholders: the flag exists
// so it can be switched on per plan, but the feature itself is not built.
export const TIERS = deepFreeze({
  free: {
    id: 'free', rank: 0, name: 'Free',
    limits: { invoicesPerMonth: 50, businesses: 1, staffUsers: 0 },
    features: { removeBranding: false, multiBusiness: false, staffUsers: false, whatsappAutomation: false, eInvoice: false, prioritySupport: false },
  },
  starter: {
    id: 'starter', rank: 1, name: 'Starter',
    limits: { invoicesPerMonth: null, businesses: 1, staffUsers: 0 },
    features: { removeBranding: true, multiBusiness: false, staffUsers: false, whatsappAutomation: false, eInvoice: false, prioritySupport: false },
  },
  pro: {
    id: 'pro', rank: 2, name: 'Pro',
    limits: { invoicesPerMonth: null, businesses: 3, staffUsers: 2 },
    features: { removeBranding: true, multiBusiness: true, staffUsers: true, whatsappAutomation: true, eInvoice: false, prioritySupport: false },
  },
  business: {
    id: 'business', rank: 3, name: 'Business',
    limits: { invoicesPerMonth: null, businesses: 10, staffUsers: 10 },
    features: { removeBranding: true, multiBusiness: true, staffUsers: true, whatsappAutomation: true, eInvoice: true, prioritySupport: true },
  },
});
export const TIER_IDS = Object.freeze(Object.keys(TIERS));

/** Display metadata for feature flags (soon = placeholder, not built yet). */
export const FEATURES = deepFreeze({
  removeBranding: { soon: false },
  multiBusiness: { soon: false },
  staffUsers: { soon: true },
  whatsappAutomation: { soon: true },
  eInvoice: { soon: true },
  prioritySupport: { soon: false },
});

// ---------------------------------------------------------------- SKUs
// What can be bought. `days: null` = lifetime (one-time).
// `purchasable: false` = legacy SKUs from before Phase 2: existing orders,
// webhooks and subscriptions still resolve, but nobody can buy them now.
export const PLANS = deepFreeze({
  starter_monthly: { id: 'starter_monthly', tier: 'starter', billing: 'monthly', price: 12900, days: 30, purchasable: true },
  starter_yearly: { id: 'starter_yearly', tier: 'starter', billing: 'yearly', price: 99900, days: 365, purchasable: true },
  pro_monthly: { id: 'pro_monthly', tier: 'pro', billing: 'monthly', price: 19900, days: 30, purchasable: true },
  pro_yearly: { id: 'pro_yearly', tier: 'pro', billing: 'yearly', price: 199900, days: 365, purchasable: true },
  business_yearly: { id: 'business_yearly', tier: 'business', billing: 'yearly', price: 399900, days: 365, purchasable: true },
  founder_lifetime: { id: 'founder_lifetime', tier: 'starter', billing: 'lifetime', price: 699900, days: null, lifetime: true, cap: FOUNDER_LIFETIME_CAP, purchasable: true },
  // Legacy (Phase 1: ₹99/mo, ₹999/yr) — same features as Starter.
  monthly: { id: 'monthly', tier: 'starter', billing: 'monthly', price: 9900, days: 30, purchasable: false, legacy: true },
  annual: { id: 'annual', tier: 'starter', billing: 'yearly', price: 99900, days: 365, purchasable: false, legacy: true },
});
export const PURCHASABLE_PLAN_IDS = Object.freeze(Object.values(PLANS).filter(p => p.purchasable).map(p => p.id));
export const DEFAULT_PLAN_ID = 'starter_yearly';

/** Display labels (English; the app translates via i18n keys plans.sku.<id>). */
export const PLAN_LABELS = Object.freeze({
  starter_monthly: 'Starter · Monthly', starter_yearly: 'Starter · Yearly',
  pro_monthly: 'Pro · Monthly', pro_yearly: 'Pro · Yearly',
  business_yearly: 'Business · Yearly', founder_lifetime: 'Founder Lifetime',
  monthly: 'Monthly (legacy)', annual: 'Annual (legacy)',
});

const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

/** Any known SKU (including legacy ones), or null. */
export function getPlan(planId) { return own(PLANS, planId) ? PLANS[planId] : null; }
/** Only SKUs that can be bought today, or null. */
export function getPurchasablePlan(planId) { const p = getPlan(planId); return p && p.purchasable ? p : null; }
export function getTier(tierId) { return own(TIERS, tierId) ? TIERS[tierId] : null; }
export function tierRank(tierId) { return getTier(tierId)?.rank ?? -1; }

// ---------------------------------------------------------------- money
/** GST on an amount (paise), rounded to the nearest paisa. */
export function gstOn(paise, percent = GST_PERCENT) { return Math.round((paise * percent) / 100); }

/**
 * Full price breakdown for a SKU and an optional discount (paise).
 * The discount is applied BEFORE GST, and can never take the charge below
 * Razorpay's ₹1 minimum.
 */
export function priceBreakdown(plan, discount = 0, percent = GST_PERCENT) {
  if (!plan) throw new Error('Invalid plan');
  const base = plan.price;
  const d = Math.max(0, Math.min(Math.floor(Number(discount) || 0), base - MIN_CHARGE_PAISE));
  const taxable = base - d;
  const gst = gstOn(taxable, percent);
  return { base, discount: d, taxable, gstPercent: percent, gst, total: taxable + gst, currency: CURRENCY };
}

/** Amount charged for a SKU with no discount (incl. GST if any). */
export function planCharge(plan) { return priceBreakdown(plan).total; }

/** ₹ string for a paise amount: 99900 -> "₹999", 99950 -> "₹999.50". */
export function formatPlanPrice(amountPaise) {
  const rupees = amountPaise / 100;
  const s = Number.isInteger(rupees) ? rupees.toLocaleString('en-IN') : rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${s}`;
}

/** % saved by the yearly SKU of a tier vs 12 monthly payments (rounded). */
export function yearlySavingsPercent(tier) {
  const m = PLANS[`${tier}_monthly`], y = PLANS[`${tier}_yearly`];
  if (!m || !y) return 0;
  return Math.round(((m.price * 12 - y.price) / (m.price * 12)) * 100);
}
/** Back-compat helper (Phase 1 name): Starter yearly saving. */
export function annualSavingsPercent() { return yearlySavingsPercent('starter'); }

/** Monthly recurring value of a SKU in paise (lifetime / unknown = 0). */
export function monthlyValue(planId) {
  const p = getPlan(planId);
  if (!p || p.lifetime || !p.days) return 0;
  return p.billing === 'monthly' ? p.price : Math.round(p.price / 12);
}

/** Does a captured Razorpay payment exactly match what the order charged? */
export function paymentMatchesPlan(payment, plan, expectedAmount = plan ? planCharge(plan) : NaN) {
  return Boolean(
    payment && plan &&
    Number(payment.amount) === Number(expectedAmount) &&
    String(payment.currency || 'INR').toUpperCase() === CURRENCY
  );
}

// ---------------------------------------------------------------- dates
function toTime(v) {
  if (!v) return NaN;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}
const isLifetimeEnd = (ms) => Number.isFinite(ms) && ms >= toTime(LIFETIME_PERIOD_END) - DAY_MS;

/** Tier of the paid period on a subscription row (null if none / unknown). */
export function paidTierOf(sub) {
  if (!sub) return null;
  if (getTier(sub.tier)) return sub.tier;
  const p = getPlan(sub.plan);
  return p ? p.tier : (sub.status === 'active' ? 'starter' : null);
}

/**
 * Which tier a subscription row gives RIGHT NOW. Mirrors the SQL function
 * public.gbp_effective_tier() — keep them in step (tests check both read
 * the same TIERS data).
 *   - best of: active paid period, lifetime (Starter), running trial (Pro)
 *   - otherwise Free (never locked out)
 */
export function effectivePlan(sub, now = new Date()) {
  const nowMs = toTime(now);
  const candidates = [];
  if (sub) {
    const end = toTime(sub.current_period_end);
    const paidTier = paidTierOf(sub);
    if (sub.status === 'active' && Number.isFinite(end) && end > nowMs && paidTier) {
      candidates.push({ tier: paidTier, source: sub.lifetime && isLifetimeEnd(end) ? 'lifetime' : 'paid', until: new Date(end).toISOString() });
    }
    if (sub.lifetime) candidates.push({ tier: 'starter', source: 'lifetime', until: null });
    const trialEnd = toTime(sub.trial_end);
    if (sub.status !== 'cancelled' && Number.isFinite(trialEnd) && trialEnd > nowMs) {
      candidates.push({ tier: TRIAL_TIER, source: 'trial', until: new Date(trialEnd).toISOString() });
    }
  }
  candidates.sort((a, b) => tierRank(b.tier) - tierRank(a.tier));
  const best = candidates[0] || { tier: 'free', source: 'free', until: null };
  const tier = TIERS[best.tier];
  const trialEndMs = toTime(sub?.trial_end);
  return {
    ...best,
    name: tier.name,
    limits: tier.limits,
    features: tier.features,
    isTrial: best.source === 'trial',
    isFree: best.tier === 'free',
    isLifetime: Boolean(sub?.lifetime),
    trialDaysLeft: Number.isFinite(trialEndMs) && trialEndMs > nowMs ? Math.ceil((trialEndMs - nowMs) / DAY_MS) : 0,
    daysLeft: best.until ? Math.max(0, Math.ceil((toTime(best.until) - nowMs) / DAY_MS)) : null,
  };
}

/** Can this tier do X? */
export function hasFeature(tierId, feature) { return Boolean(getTier(tierId)?.features?.[feature]); }
/** Is `used` within the tier's limit `name`? (null limit = unlimited) */
export function withinLimit(tierId, name, used) {
  const lim = getTier(tierId)?.limits?.[name];
  return lim == null || Number(used) < lim;
}

/**
 * What buying `plan` would do to a subscription. Returns
 *   { ok: true, tier, periodEnd (ISO), lifetime, creditDays, kind }
 * or { ok: false, code: 'DOWNGRADE' } when a cheaper tier is bought while a
 * higher paid tier is still running (create-order refuses that up front;
 * activation converts the money into days of the current tier instead, so
 * a payment that slipped through is never lost).
 *
 *   same tier      → extend from max(now, paid end, trial end)
 *   upgrade        → starts now; unused days of the lower paid tier are
 *                    converted to days of the new tier at the daily rate
 *   lifetime       → lifetime flag; a higher paid tier keeps running
 */
export function planChange(sub, plan, now = new Date(), { allowDowngrade = false } = {}) {
  if (!plan || !getTier(plan.tier) || (!plan.lifetime && !(Number.isFinite(plan.days) && plan.days > 0))) {
    throw new Error('Invalid plan');
  }
  const nowMs = toTime(now);
  const paidEnd = toTime(sub?.current_period_end);
  const paidTier = paidTierOf(sub);
  const paidRunning = sub?.status === 'active' && Number.isFinite(paidEnd) && paidEnd > nowMs && !!paidTier && !isLifetimeEnd(paidEnd);
  const trialEnd = toTime(sub?.trial_end);
  const trialRunning = sub?.status !== 'cancelled' && Number.isFinite(trialEnd) && trialEnd > nowMs;
  const currentRank = paidRunning ? tierRank(paidTier) : -1;
  const newRank = tierRank(plan.tier);

  if (plan.lifetime) {
    if (paidRunning && currentRank > newRank) {
      return { ok: true, kind: 'lifetime', tier: paidTier, periodEnd: new Date(paidEnd).toISOString(), lifetime: true, creditDays: 0 };
    }
    return { ok: true, kind: 'lifetime', tier: plan.tier, periodEnd: LIFETIME_PERIOD_END, lifetime: true, creditDays: 0 };
  }

  const lifetime = Boolean(sub?.lifetime);
  if (paidRunning && newRank < currentRank) {
    if (!allowDowngrade) return { ok: false, code: 'DOWNGRADE', currentTier: paidTier };
    // Payment already taken: credit its value as days of the current tier.
    const cur = getPlan(sub.plan);
    const curDaily = cur && cur.days ? cur.price / cur.days : plan.price / plan.days;
    const creditDays = Math.floor(plan.price / curDaily);
    return { ok: true, kind: 'credited', tier: paidTier, periodEnd: new Date(paidEnd + creditDays * DAY_MS).toISOString(), lifetime, creditDays };
  }

  if (paidRunning && newRank > currentRank) {
    const cur = getPlan(sub.plan);
    const remainingDays = (paidEnd - nowMs) / DAY_MS;
    let creditDays = 0;
    if (cur && cur.days) {
      const creditPaise = remainingDays * (cur.price / cur.days);
      creditDays = Math.floor(creditPaise / (plan.price / plan.days));
    }
    const start = Math.max(nowMs, trialRunning ? trialEnd : nowMs);
    return { ok: true, kind: 'upgrade', tier: plan.tier, periodEnd: new Date(start + (plan.days + creditDays) * DAY_MS).toISOString(), lifetime, creditDays };
  }

  const candidates = [nowMs];
  if (paidRunning) candidates.push(paidEnd);
  if (trialRunning) candidates.push(trialEnd);
  return { ok: true, kind: paidRunning ? 'renew' : 'new', tier: plan.tier, periodEnd: new Date(Math.max(...candidates) + plan.days * DAY_MS).toISOString(), lifetime, creditDays: 0 };
}

/** Phase 1 API kept for callers/tests: new period end after paying `plan`. */
export function computeNewPeriodEnd(subscription, plan, now = new Date()) {
  const r = planChange(subscription, plan, now, { allowDowngrade: true });
  return new Date(r.periodEnd);
}

// ---------------------------------------------------------------- coupons
const COUPON_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
export function normalizeCode(code) {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  return COUPON_RE.test(c) ? c : null;
}

/**
 * Validate a coupon row (from the coupons table) for a SKU.
 * Returns { ok: true, discount, breakdown } or { ok: false, reason }.
 * `alreadyUsedByUser` comes from coupon_redemptions.
 */
export function evaluateCoupon(coupon, plan, { now = new Date(), alreadyUsedByUser = false } = {}) {
  if (!plan) return { ok: false, reason: 'invalid_plan' };
  if (!coupon || !coupon.active) return { ok: false, reason: 'invalid' };
  if (coupon.valid_until && toTime(coupon.valid_until) <= toTime(now)) return { ok: false, reason: 'expired' };
  if (coupon.max_redemptions != null && Number(coupon.redeemed_count || 0) >= Number(coupon.max_redemptions)) return { ok: false, reason: 'used_up' };
  if (alreadyUsedByUser) return { ok: false, reason: 'already_used' };
  const applies = Array.isArray(coupon.applies_to) ? coupon.applies_to.filter(Boolean) : [];
  if (applies.length && !applies.includes(plan.id) && !applies.includes(plan.tier)) return { ok: false, reason: 'not_for_plan' };
  const value = Number(coupon.value);
  let discount = 0;
  if (coupon.kind === 'percent') {
    if (!(value > 0 && value <= 90)) return { ok: false, reason: 'invalid' };
    discount = Math.floor((plan.price * value) / 100);
  } else if (coupon.kind === 'flat') {
    if (!(value > 0)) return { ok: false, reason: 'invalid' };
    discount = Math.floor(value);
  } else return { ok: false, reason: 'invalid' };
  const breakdown = priceBreakdown(plan, discount);
  return { ok: true, discount: breakdown.discount, breakdown };
}

// ---------------------------------------------------------------- referral
/** Referral codes: 'GBP' + 6 chars, no lookalikes (0/O, 1/I). */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeReferralCode(randomBytes) {
  let s = 'GBP';
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[randomBytes[i] % REF_ALPHABET.length];
  return s;
}
export const isReferralCode = (c) => typeof c === 'string' && /^GBP[A-HJ-NP-Z2-9]{6}$/.test(c.trim().toUpperCase());

/**
 * Reward for the REFERRER when someone they referred pays for the first
 * time: +30 days on their running paid plan, otherwise 30 days of Starter
 * (from the end of their trial if it is still running). Lifetime-only
 * referrers get 30 days of Pro.
 */
export function referrerReward(sub, now = new Date()) {
  const nowMs = toTime(now);
  const paidEnd = toTime(sub?.current_period_end);
  const paidTier = paidTierOf(sub);
  if (sub?.status === 'active' && Number.isFinite(paidEnd) && paidEnd > nowMs && paidTier && !isLifetimeEnd(paidEnd)) {
    return { tier: paidTier, periodEnd: new Date(paidEnd + REFERRAL_BONUS_DAYS * DAY_MS).toISOString(), kind: 'extend' };
  }
  if (sub?.lifetime) {
    return { tier: 'pro', periodEnd: new Date(nowMs + REFERRAL_BONUS_DAYS * DAY_MS).toISOString(), kind: 'lifetime_pro' };
  }
  const trialEnd = toTime(sub?.trial_end);
  const start = Number.isFinite(trialEnd) && trialEnd > nowMs ? trialEnd : nowMs;
  return { tier: 'starter', periodEnd: new Date(start + REFERRAL_BONUS_DAYS * DAY_MS).toISOString(), kind: 'grant' };
}

export const addDays = (iso, days) => new Date(toTime(iso) + days * DAY_MS).toISOString();
export const DAY = DAY_MS;
