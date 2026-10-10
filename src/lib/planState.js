// Module-level copy of the signed-in user's effective plan, for code that
// renders outside the React tree (InvoicePreview is also rendered into
// detached roots for PDF export) or runs outside components (store).
// SubscriptionGuard keeps it up to date. Default = demo / not signed in:
// full features, no branding.
import { effectivePlan, TIERS } from '../../shared/plans.js';

const DEMO = Object.freeze({ tier: 'pro', source: 'demo', name: TIERS.pro.name, limits: TIERS.pro.limits, features: TIERS.pro.features, isTrial: false, isFree: false, isLifetime: false, isDemo: true, trialDaysLeft: 0, daysLeft: null, until: null });
let state = DEMO;
const listeners = new Set();

export function getPlanState() { return state; }
export function setPlanFromSubscription(sub) {
  state = sub ? effectivePlan(sub) : DEMO;
  listeners.forEach(fn => fn(state));
  return state;
}
export function resetPlanState() { state = DEMO; listeners.forEach(fn => fn(state)); }
export function subscribePlan(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const showBranding = () => !state.features?.removeBranding;

// Plan-limit errors raised by the database triggers (002 migration).
export const PLAN_LIMIT_EVENT = 'gbp:plan-limit';
export function planLimitKind(err) {
  const msg = String(err?.message || err?.details || err || '');
  if (msg.includes('PLAN_LIMIT_INVOICES')) return 'invoices';
  if (msg.includes('PLAN_LIMIT_BUSINESSES')) return 'businesses';
  return null;
}
/** If `err` is a plan-limit error, tell the UI (opens the upgrade modal). */
export function reportPlanLimit(err) {
  const kind = planLimitKind(err);
  if (kind && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PLAN_LIMIT_EVENT, { detail: { kind } }));
  }
  return kind;
}
