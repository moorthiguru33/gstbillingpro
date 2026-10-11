// ============================================================
// /api/staff — team (staff & CA) management. Service role, so every rule is
// checked here AND in the database (RLS + gbp_staff_limit trigger).
//
// GET  /api/staff?owner=<uuid>          → { members, tier, staffUsed, staffLimit, caUsed, role }
// POST /api/staff {action:'invite', owner?, email?, phone?, name?, role}  → { member, link, emailed }
// POST /api/staff {action:'accept', token}                              → { owner_id, role }
// POST /api/staff {action:'remove', owner?, id}                         → { ok }
// POST /api/staff {action:'role',   owner?, id, role}                   → { ok }
// POST /api/staff {action:'peek',   token}  (no auth)                   → { business, role, email }
// ============================================================
import {
  HttpError, json, errorResponse, preflight, corsHeaders, assertOrigin, requireEnv, getServiceClient, authenticate,
} from '../../shared/server.js';
import { effectivePlan } from '../../shared/plans.js';
import {
  canAssignRole, staffAllowed, normalizeInvite, makeInviteToken, isInviteToken, inviteExpired, INVITE_TTL_DAYS,
} from '../../shared/staff.js';
import { appUrlOf } from '../../shared/notify.js';
import { sendEmail } from '../../shared/email.js';
import { staffInviteEmail } from '../../shared/email-templates.js';

const ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER_COLS = 'id,owner_id,user_id,email,phone,name,role,status,invited_at,accepted_at,invite_token';

/** Role of `userId` in org `ownerId` (owner if same id). */
export async function roleIn(supabase, ownerId, userId) {
  if (ownerId === userId) return 'owner';
  const { data, error } = await supabase.from('org_members').select('role')
    .eq('owner_id', ownerId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (error) throw error;
  return data?.role || null;
}

async function orgTier(supabase, ownerId, now) {
  const { data: sub, error } = await supabase.from('subscriptions').select('*').eq('user_id', ownerId).maybeSingle();
  if (error) throw error;
  return effectivePlan(sub, now).tier;
}

async function seatCounts(supabase, ownerId) {
  const { data, error } = await supabase.from('org_members').select('role,status').eq('owner_id', ownerId).neq('status', 'removed');
  if (error) throw error;
  const rows = data || [];
  return {
    staffUsed: rows.filter(r => r.role === 'manager' || r.role === 'biller').length,
    caUsed: rows.filter(r => r.role === 'accountant').length,
  };
}

async function businessName(supabase, ownerId) {
  const { data } = await supabase.from('profiles').select('business_name').eq('user_id', ownerId).maybeSingle();
  return data?.business_name || '';
}

function ownerParam(v, user) {
  if (v == null || v === '') return user.id;
  if (!UUID_RE.test(String(v))) throw new HttpError(400, 'Invalid business id');
  return String(v).toLowerCase();
}

const mapDbError = (error) => {
  if (String(error?.message || '').includes('PLAN_LIMIT_STAFF')) return new HttpError(402, 'Your plan has no free staff seat.', 'staff_limit');
  if (error?.code === '23505') return new HttpError(409, 'This person is already in your team.', 'staff_exists');
  return error;
};

export async function handleStaff({ request, env, now = new Date(), method }) {
  const supabase = getServiceClient(env);
  if (method === 'GET') {
    const user = await authenticate(request, supabase);
    const ownerId = ownerParam(new URL(request.url).searchParams.get('owner'), user);
    const role = await roleIn(supabase, ownerId, user.id);
    if (role !== 'owner' && role !== 'manager') throw new HttpError(403, 'Only the owner or a manager can see the team.', 'staff_forbidden');
    const { data, error } = await supabase.from('org_members').select(MEMBER_COLS).eq('owner_id', ownerId).neq('status', 'removed').order('invited_at');
    if (error) throw error;
    const tier = await orgTier(supabase, ownerId, now);
    const counts = await seatCounts(supabase, ownerId);
    const appUrl = appUrlOf(env);
    const members = (data || []).map(({ invite_token, ...m }) => ({
      ...m,
      link: m.status === 'invited' && invite_token ? `${appUrl}/?invite=${invite_token}` : null,
      expired: m.status === 'invited' && inviteExpired(m.invited_at, now),
    }));
    const lim = staffAllowed(tier, 'biller', { staffUsed: 0 });
    return json({ members, tier, role, ...counts, staffLimit: lim.ok ? lim.limit : 0 }, 200, {});
  }

  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const action = body.action;

  if (action === 'peek') {
    if (!isInviteToken(body.token)) throw new HttpError(400, 'Invalid invitation link.', 'invite_invalid');
    const { data } = await supabase.from('org_members').select('owner_id,email,role,status,invited_at').eq('invite_token', body.token).maybeSingle();
    if (!data || data.status !== 'invited' || inviteExpired(data.invited_at, now)) throw new HttpError(404, 'This invitation is no longer valid.', 'invite_invalid');
    return json({ business: await businessName(supabase, data.owner_id), role: data.role, email: data.email }, 200, {});
  }

  const user = await authenticate(request, supabase);

  if (action === 'accept') {
    if (!isInviteToken(body.token)) throw new HttpError(400, 'Invalid invitation link.', 'invite_invalid');
    const { data: inv, error } = await supabase.from('org_members').select(MEMBER_COLS).eq('invite_token', body.token).maybeSingle();
    if (error) throw error;
    if (!inv || inv.status !== 'invited' || inviteExpired(inv.invited_at, now)) throw new HttpError(404, 'This invitation is no longer valid. Ask the owner for a new link.', 'invite_invalid');
    if (inv.owner_id === user.id) throw new HttpError(400, 'You cannot join your own business as staff.', 'invite_self');
    if (inv.email && inv.email !== String(user.email || '').toLowerCase()) {
      throw new HttpError(403, `This invitation is for ${inv.email}. Log in with that e-mail address.`, 'invite_email_mismatch');
    }
    const { data: dup } = await supabase.from('org_members').select('id').eq('owner_id', inv.owner_id).eq('user_id', user.id).neq('status', 'removed').maybeSingle();
    if (dup) {
      await supabase.from('org_members').update({ status: 'removed', invite_token: null, updated_at: now.toISOString() }).eq('id', inv.id);
      return json({ owner_id: inv.owner_id, role: inv.role, already: true }, 200, {});
    }
    const { error: upErr } = await supabase.from('org_members').update({
      user_id: user.id, status: 'active', accepted_at: now.toISOString(), invite_token: null, updated_at: now.toISOString(),
      email: inv.email || String(user.email || '').toLowerCase() || null,
    }).eq('id', inv.id).eq('status', 'invited');
    if (upErr) throw mapDbError(upErr);
    return json({ owner_id: inv.owner_id, role: inv.role }, 200, {});
  }

  const ownerId = ownerParam(body.owner, user);
  const actorRole = await roleIn(supabase, ownerId, user.id);
  if (actorRole !== 'owner' && actorRole !== 'manager') throw new HttpError(403, 'Only the owner or a manager can manage the team.', 'staff_forbidden');

  if (action === 'invite') {
    let inv;
    try { inv = normalizeInvite(body); } catch (e) { throw new HttpError(400, 'Please check the details.', e.message); }
    if (!canAssignRole(actorRole, inv.role)) throw new HttpError(403, 'You cannot invite this role.', 'staff_forbidden');
    const tier = await orgTier(supabase, ownerId, now);
    const allowed = staffAllowed(tier, inv.role, await seatCounts(supabase, ownerId));
    if (!allowed.ok) throw new HttpError(402, 'Your plan has no free seat for this role.', allowed.code);
    // ensure the org row exists (accounts created before 003 ran in odd orders)
    await supabase.from('orgs').upsert({ owner_id: ownerId }, { onConflict: 'owner_id', ignoreDuplicates: true });
    const token = makeInviteToken();
    const { data: member, error } = await supabase.from('org_members').insert({
      owner_id: ownerId, email: inv.email, phone: inv.phone, name: inv.name, role: inv.role,
      status: 'invited', invite_token: token, invited_by: user.id, invited_at: now.toISOString(),
    }).select('id,email,phone,name,role,status,invited_at').single();
    if (error) throw mapDbError(error);
    const link = `${appUrlOf(env)}/?invite=${token}`;
    let emailed = false;
    if (inv.email) {
      try {
        const mail = staffInviteEmail({ businessName: await businessName(supabase, ownerId), role: inv.role, link, appUrl: appUrlOf(env), inviterEmail: user.email });
        const r = await sendEmail(env, { to: inv.email, ...mail, tags: { kind: 'staff_invite' } });
        emailed = Boolean(r?.id);
      } catch (e) { console.warn('[staff] invite e-mail failed', e?.message); }
    }
    return json({ member, link, emailed, validDays: INVITE_TTL_DAYS }, 200, {});
  }

  if (action === 'remove' || action === 'role') {
    if (!UUID_RE.test(String(body.id || ''))) throw new HttpError(400, 'Invalid member', 'staff_bad_member');
    const { data: m, error } = await supabase.from('org_members').select('id,role,status,user_id').eq('id', body.id).eq('owner_id', ownerId).maybeSingle();
    if (error) throw error;
    if (!m || m.status === 'removed') throw new HttpError(404, 'Member not found', 'staff_bad_member');
    if (m.role === 'owner') throw new HttpError(400, 'The owner cannot be changed here.', 'staff_forbidden');
    if (!canAssignRole(actorRole, m.role)) throw new HttpError(403, 'You cannot change this member.', 'staff_forbidden');
    if (action === 'remove') {
      const { error: e2 } = await supabase.from('org_members').update({ status: 'removed', invite_token: null, updated_at: now.toISOString() }).eq('id', m.id);
      if (e2) throw e2;
      return json({ ok: true }, 200, {});
    }
    const role = String(body.role || '');
    if (!canAssignRole(actorRole, role)) throw new HttpError(403, 'You cannot assign this role.', 'staff_forbidden');
    if (role !== m.role) {
      const tier = await orgTier(supabase, ownerId, now);
      const counts = await seatCounts(supabase, ownerId);
      const isStaff = (r) => r === 'manager' || r === 'biller';
      const adj = { staffUsed: counts.staffUsed - (isStaff(m.role) ? 1 : 0), caUsed: counts.caUsed - (m.role === 'accountant' ? 1 : 0) };
      const allowed = staffAllowed(tier, role, adj);
      if (!allowed.ok) throw new HttpError(402, 'Your plan has no free seat for this role.', allowed.code);
      const { error: e3 } = await supabase.from('org_members').update({ role, updated_at: now.toISOString() }).eq('id', m.id);
      if (e3) throw mapDbError(e3);
    }
    return json({ ok: true }, 200, {});
  }
  throw new HttpError(400, 'Unknown action');
}

const wrap = (method) => async ({ request, env }) => {
  const cors = corsHeaders(request, env, 'GET, POST, OPTIONS');
  try {
    assertOrigin(request, env);
    requireEnv(env, ENV);
    const res = await handleStaff({ request, env, method });
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (err) {
    return errorResponse(err, cors);
  }
};
export const onRequestGet = wrap('GET');
export const onRequestPost = wrap('POST');
export const onRequestOptions = ({ request, env }) => preflight(request, env, 'GET, POST, OPTIONS');
