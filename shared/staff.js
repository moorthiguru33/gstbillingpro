// ============================================================
// Staff & CA access — shared rules (server API + client UI + tests).
// The database (003_staff_roles.sql) is the final authority: RLS decides
// what each role can read / write and a trigger enforces seat limits. This
// module mirrors those rules so the API can refuse early with a friendly
// message and the UI can hide what a role cannot use.
// ============================================================
import { hasFeature, getTier } from './plans.js';

export const ROLES = Object.freeze(['owner', 'manager', 'biller', 'accountant']);
export const INVITABLE_ROLES = Object.freeze(['manager', 'biller', 'accountant']);
export const INVITE_TTL_DAYS = 14;
export const MAX_CA_LOGINS = 2;

/** App views each role may open (UI only; RLS is the real guard). */
export const ROLE_VIEWS = Object.freeze({
  owner: null, // everything
  manager: null,
  // ids match App.jsx views; 'settings' is reduced to device/language pages
  biller: Object.freeze(['dashboard', 'pos', 'new', 'clients', 'inventory', 'guide', 'support', 'settings', 'store', 'crm']),
  accountant: Object.freeze(['dashboard', 'clients', 'inventory', 'expenses', 'purchases', 'receipts', 'reports', 'filing', 'incometax', 'guide', 'support', 'settings', 'accounts']),
});

export const ROLE_CAN = Object.freeze({
  owner: Object.freeze({ write: true, delete: true, settings: true, reports: true, manageStaff: true, billing: true }),
  manager: Object.freeze({ write: true, delete: true, settings: true, reports: true, manageStaff: true, billing: false }),
  biller: Object.freeze({ write: true, delete: false, settings: false, reports: false, manageStaff: false, billing: false }),
  accountant: Object.freeze({ write: false, delete: false, settings: false, reports: true, manageStaff: false, billing: false }),
});

export const isRole = (r) => ROLES.includes(r);
export function can(role, what) { return Boolean(ROLE_CAN[role]?.[what]); }
export function canOpenView(role, view) {
  if (!isRole(role)) return false;
  const list = ROLE_VIEWS[role];
  return list === null || list.includes(view);
}

/** Can `actor` add / change / remove a member with `targetRole`? */
export function canAssignRole(actorRole, targetRole) {
  if (!INVITABLE_ROLES.includes(targetRole)) return false;
  if (actorRole === 'owner') return true;
  if (actorRole === 'manager') return targetRole !== 'manager';
  return false;
}

/**
 * Whether the org's tier allows inviting `role`, given current counts.
 * staffUsed counts manager + biller seats (invited or active), caUsed counts
 * accountant seats. Returns { ok } or { ok:false, code }.
 */
export function staffAllowed(tier, role, { staffUsed = 0, caUsed = 0 } = {}) {
  if (!getTier(tier)) return { ok: false, code: 'staff_plan' };
  if (role === 'accountant') {
    if (tier === 'free') return { ok: false, code: 'staff_ca_paid_only' };
    if (caUsed >= MAX_CA_LOGINS) return { ok: false, code: 'staff_ca_limit' };
    return { ok: true };
  }
  if (!hasFeature(tier, 'staffUsers')) return { ok: false, code: 'staff_plan' };
  const limit = getTier(tier).limits.staffUsers || 0;
  if (staffUsed >= limit) return { ok: false, code: 'staff_limit', limit };
  return { ok: true, limit };
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
/** Indian mobile or international digits; returns digits with country code or ''. */
export function normalizePhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) d = `91${d}`;
  return d.length >= 8 && d.length <= 15 ? d : '';
}

/** Validates invite input. Returns { email, phone, name, role } or throws Error(code). */
export function normalizeInvite(b = {}) {
  const role = String(b.role || '');
  if (!INVITABLE_ROLES.includes(role)) throw new Error('staff_bad_role');
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) throw new Error('staff_bad_email');
  const phone = b.phone ? normalizePhone(b.phone) : '';
  if (b.phone && !phone) throw new Error('staff_bad_phone');
  if (!email && !phone) throw new Error('staff_need_contact');
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
  return { email: email || null, phone: phone || null, name: name || null, role };
}

/** 32-char URL-safe token from 24 random bytes. */
export function makeInviteToken(bytes) {
  const b = bytes || crypto.getRandomValues(new Uint8Array(24));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const isInviteToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(t);

export function inviteExpired(invitedAt, now = new Date()) {
  const t = new Date(invitedAt).getTime();
  return !Number.isFinite(t) || now.getTime() - t > INVITE_TTL_DAYS * 86400000;
}
