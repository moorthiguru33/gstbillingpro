// ============================================================
// Phase 4 business modules: which plan unlocks each one.
// Mirrors the SQL helper gbp_module_ok() (migrations 005+): the database
// refuses writes below the minimum tier, the UI shows an upgrade prompt.
// ============================================================
import { tierRank } from './plans.js';

export const MODULES = Object.freeze({
  onlineStore: Object.freeze({ id: 'onlineStore', view: 'store', minTier: 'starter' }),
  crm: Object.freeze({ id: 'crm', view: 'crm', minTier: 'starter' }),
  accounting: Object.freeze({ id: 'accounting', view: 'accounts', minTier: 'pro' }),
  payroll: Object.freeze({ id: 'payroll', view: 'payroll', minTier: 'pro' }),
  // Payment-out, returns, orders, cheques, cash, loans (009): core billing, every plan.
  docs: Object.freeze({ id: 'docs', view: 'txn', minTier: 'free' }),
});

/** True when `tier` (free | starter | pro | business) includes module `mod`. */
export function moduleAllowed(tier, mod) {
  const m = MODULES[mod];
  if (!m) return false;
  return tierRank(tier) >= tierRank(m.minTier);
}
export const moduleMinTier = (mod) => MODULES[mod]?.minTier || 'business';
