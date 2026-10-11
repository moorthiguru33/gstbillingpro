// ============================================================
// Active business ("org") for staff & CA access (migration 003).
// Business data stays keyed by the OWNER's user id. A staff member works in
// the owner's data by sending that owner id; RLS checks their role.
//   - loadOrgs(user)   → fetch memberships (rpc my_orgs), pick the active one
//   - dataOwnerId()    → user id the store reads / writes as
//   - activeRole()     → 'owner' | 'manager' | 'biller' | 'accountant'
// Switching business reloads the page so no cached data leaks across.
// ============================================================
import { supabase, authFetch } from './supabase.js';
import { canOpenView, can } from '../../shared/staff.js';
import { t } from '../i18n';

const KEY = (uid) => `gbp_active_org_${uid}`;
export const INVITE_KEY = 'gbp_invite';

let state = { userId: null, ownerId: null, role: 'owner', orgs: [] };
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(state));

export const getOrgState = () => state;
export const subscribeOrg = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const dataOwnerId = () => state.ownerId;
export const activeRole = () => state.role || 'owner';
export const isStaffMode = () => Boolean(state.ownerId && state.userId && state.ownerId !== state.userId);
export const roleCan = (what) => can(activeRole(), what);
export const roleCanView = (view) => canOpenView(activeRole(), view);

export async function loadOrgs(user) {
  state = { userId: user?.id || null, ownerId: user?.id || null, role: 'owner', orgs: [] };
  if (!user?.id || user.isDemo) { emit(); return state; }
  let orgs = [];
  try {
    const { data, error } = await supabase.rpc('my_orgs');
    if (!error && Array.isArray(data)) orgs = data;
  } catch { /* before migration 003: single-user mode */ }
  let wanted = null;
  try { wanted = localStorage.getItem(KEY(user.id)); } catch { /* ignore */ }
  const pick = orgs.find(o => o.owner_id === wanted) || orgs.find(o => o.owner_id === user.id) || null;
  state = {
    userId: user.id,
    ownerId: pick ? pick.owner_id : user.id,
    role: pick ? pick.role : 'owner',
    orgs,
  };
  emit();
  return state;
}

export function switchOrg(ownerId) {
  try { localStorage.setItem(KEY(state.userId), ownerId); } catch { /* ignore */ }
  window.location.reload();
}

// ---- Plan of the active org (staff see the owner's plan) ----
export async function getOrgPlan(ownerId) {
  const { data, error } = await supabase.rpc('org_plan', { p_owner: ownerId });
  if (error) throw error;
  return data;
}

// ---- Team API (/api/staff) ----
async function call(method, body, query = '') {
  const r = await authFetch(`/api/staff${query}`, method === 'GET'
    ? { method }
    : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const key = data?.code ? `staff.err_${data.code}` : '';
    const msg = key && t(key) !== key ? t(key) : (data?.error || t('plans.err_generic'));
    throw Object.assign(new Error(msg), { code: data?.code, status: r.status });
  }
  return data;
}
export const listTeam = () => call('GET', null, `?owner=${encodeURIComponent(state.ownerId || '')}`);
export const inviteMember = (inv) => call('POST', { action: 'invite', owner: state.ownerId, ...inv });
export const removeMember = (id) => call('POST', { action: 'remove', owner: state.ownerId, id });
export const changeRole = (id, role) => call('POST', { action: 'role', owner: state.ownerId, id, role });
export const acceptInvite = (token) => call('POST', { action: 'accept', token });
export async function peekInvite(token) {
  const r = await fetch('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'peek', token }) });
  const data = await r.json().catch(() => ({}));
  return r.ok ? data : null;
}

/** Remember ?invite=<token> from the URL (before sign-in). */
export function captureInviteFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    const tok = p.get('invite');
    if (tok && /^[A-Za-z0-9_-]{24,64}$/.test(tok)) {
      localStorage.setItem(INVITE_KEY, tok);
      p.delete('invite');
      const q = p.toString();
      window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''));
    }
  } catch { /* ignore */ }
}
export const pendingInvite = () => { try { return localStorage.getItem(INVITE_KEY); } catch { return null; } };
export const clearPendingInvite = () => { try { localStorage.removeItem(INVITE_KEY); } catch { /* ignore */ } };

/** After sign-in: accept a remembered invite and switch into that business. */
export async function acceptPendingInvite(user) {
  const tok = pendingInvite();
  if (!tok || !user?.id) return null;
  try {
    const res = await acceptInvite(tok);
    clearPendingInvite();
    try { localStorage.setItem(KEY(user.id), res.owner_id); } catch { /* ignore */ }
    return { ok: true, ...res };
  } catch (e) {
    if (e.status && e.status !== 401) clearPendingInvite();
    return { ok: false, message: e.message, code: e.code };
  }
}

// ---- Activity log (owner / manager; RLS) ----
export async function fetchActivity(limit = 50) {
  const { data, error } = await supabase.from('activity_log')
    .select('id,actor_email,action,entity,entity_id,summary,created_at')
    .eq('owner_id', state.ownerId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

/** True for "permission denied by RLS" style errors. */
export function isPermissionError(err) {
  const s = `${err?.code || ''} ${err?.message || ''}`;
  return /42501|row-level security|not allowed|permission denied/i.test(s);
}
