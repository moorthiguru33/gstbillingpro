// In-memory fake of Supabase Auth + PostgREST + Razorpay + Resend for the
// Pages Function tests. Installs itself as globalThis.fetch. No network.
import crypto from 'node:crypto';

if (!globalThis.WebSocket) globalThis.WebSocket = class FakeWebSocket {};

export const SUPABASE_URL = 'https://fake.supabase.co';
export const env = {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: 'service-key', RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_secret', RAZORPAY_WEBHOOK_SECRET: 'whsec',
};
export const USERS = {};
export const addUser = (token, u) => { USERS[token] = { created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString(), ...u }; return USERS[token]; };
export const db = {
  subscriptions: [], payment_orders: [], payment_logs: [], coupons: [], coupon_redemptions: [],
  referral_codes: [], referrals: [], admins: [], admin_actions: [], email_log: [],
};
export const rz = { orders: {}, payments: {}, calls: [] };
export const resend = { sent: [], fail: false };
export const rpcs = {
  next_receipt_number: (() => { let n = 0; return () => `GBP/2026-27/${String(++n).padStart(5, '0')}`; })(),
  redeem_coupon: ({ p_code }) => { const c = db.coupons.find(x => x.code === p_code); if (c) c.redeemed_count = (c.redeemed_count || 0) + 1; return null; },
};
const PK = {
  subscriptions: 'user_id', payment_orders: 'order_id', coupons: 'code', referral_codes: 'user_id',
  referrals: 'referred_user_id', admins: 'email', email_log: 'dedupe_key',
};
const UNIQUE = { referral_codes: ['code'], coupon_redemptions: ['code,user_id'], email_log: ['dedupe_key'] };

function splitTop(inner) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}
function parseOr(expr) {
  const inner = expr.replace(/^\(/, '').replace(/\)$/, '');
  const preds = splitTop(inner).map(p => {
    if (p.startsWith('and(')) { const sub = parseOr(p.slice(3)); return row => sub.all(row); }
    const [col, op, ...rest] = p.split('.');
    const val = rest.join('.').replace(/^"|"$/g, '');
    return row => cmp(row[col], op, val);
  });
  const any = row => preds.some(f => f(row));
  any.all = row => preds.every(f => f(row));
  return any;
}
const cmpVal = (v) => (typeof v === 'boolean' ? String(v) : v);
function cmp(v, op, val) {
  v = cmpVal(v);
  if (op === 'eq') return String(v) === val;
  if (op === 'neq') return String(v) !== val;
  if (op === 'lt') return v != null && String(v) < val;
  if (op === 'lte') return v != null && String(v) <= val;
  if (op === 'gt') return v != null && String(v) > val;
  if (op === 'gte') return v != null && String(v) >= val;
  if (op === 'is') return val === 'null' ? v == null : String(v) === val;
  if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(v));
  if (op === 'ilike') {
    const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$', 'i');
    return v != null && re.test(String(v));
  }
  throw new Error('op ' + op);
}
function filterRows(table, params) {
  let rows = db[table] || (db[table] = []);
  let order = null, limit = null;
  for (const [k, v] of params) {
    if (['select', 'on_conflict', 'columns', 'offset'].includes(k)) continue;
    if (k === 'order') { order = v; continue; }
    if (k === 'limit') { limit = Number(v); continue; }
    if (k === 'or') { const f = parseOr(v); rows = rows.filter(r => f(r)); continue; }
    const [op, ...rest] = v.split('.');
    rows = rows.filter(r => cmp(r[k], op, rest.join('.')));
  }
  if (order) {
    const [col, dir] = order.split('.');
    rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1));
  }
  if (limit != null) rows = rows.slice(0, limit);
  return rows;
}
const jres = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const findConflict = (table, r, key) => {
  const keys = key ? [key] : [PK[table], ...(UNIQUE[table] || [])].filter(Boolean);
  for (const k of keys) {
    const cols = k.split(',');
    if (cols.some(c => r[c] == null)) continue;
    const hit = db[table].find(x => cols.every(c => x[c] === r[c]));
    if (hit) return hit;
  }
  return null;
};

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  const bodyText = init.body != null ? (typeof init.body === 'string' ? init.body : await new Response(init.body).text()) : null;

  if (url.origin === SUPABASE_URL && url.pathname === '/auth/v1/user') {
    const tok = (headers.get('authorization') || '').replace(/^Bearer /, '');
    return USERS[tok] ? jres(USERS[tok]) : jres({ message: 'invalid JWT' }, 401);
  }
  let m;
  if (url.origin === SUPABASE_URL && (m = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/))) {
    if (headers.get('apikey') !== 'service-key') return jres({ message: 'no key' }, 401);
    const u = Object.values(USERS).find(x => x.id === m[1]);
    return u ? jres(u) : jres({ message: 'not found' }, 404);
  }
  if (url.origin === SUPABASE_URL && url.pathname.startsWith('/rest/v1/rpc/')) {
    if (headers.get('apikey') !== 'service-key') return jres({ message: 'no key' }, 401);
    const fn = url.pathname.split('/').pop();
    if (!rpcs[fn]) return jres({ message: 'no fn' }, 404);
    return jres(rpcs[fn](bodyText ? JSON.parse(bodyText) : {}));
  }
  if (url.origin === SUPABASE_URL && url.pathname.startsWith('/rest/v1/')) {
    if (headers.get('apikey') !== 'service-key') return jres({ message: 'no key' }, 401);
    const table = url.pathname.split('/').pop();
    db[table] = db[table] || [];
    const params = [...url.searchParams.entries()];
    const prefer = headers.get('prefer') || '';
    if (method === 'GET') {
      let rows = filterRows(table, params);
      const range = headers.get('range');
      if (range) { const [a, b] = range.split('-').map(Number); rows = rows.slice(a, b + 1); }
      return jres(rows);
    }
    if (method === 'POST') {
      const rows = [].concat(JSON.parse(bodyText));
      const out = [];
      for (const r of rows) {
        const existing = findConflict(table, r, url.searchParams.get('on_conflict'));
        if (existing) {
          if (prefer.includes('ignore-duplicates')) continue;
          if (prefer.includes('merge-duplicates')) { Object.assign(existing, r); out.push(existing); continue; }
          return jres({ code: '23505', message: 'duplicate key' }, 409);
        }
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r };
        db[table].push(row); out.push(row);
      }
      return prefer.includes('return=representation') ? jres(out, 201) : new Response(null, { status: 201 });
    }
    if (method === 'PATCH') {
      const rows = filterRows(table, params);
      const patch = JSON.parse(bodyText);
      rows.forEach(r => Object.assign(r, patch));
      return prefer.includes('return=representation') ? jres(rows) : new Response(null, { status: 204 });
    }
    if (method === 'DELETE') {
      const rows = new Set(filterRows(table, params));
      db[table] = db[table].filter(r => !rows.has(r));
      return new Response(null, { status: 204 });
    }
  }
  if (url.origin === 'https://api.razorpay.com') {
    rz.calls.push(`${method} ${url.pathname}`);
    const auth = headers.get('authorization');
    if (auth !== `Basic ${btoa('rzp_test_key:rzp_secret')}`) return jres({ error: { description: 'auth' } }, 401);
    if (method === 'POST' && url.pathname === '/v1/orders') {
      const b = JSON.parse(bodyText);
      if (b.receipt.length > 40) return jres({ error: { description: 'receipt too long' } }, 400);
      const id = `order_${crypto.randomBytes(7).toString('hex')}`;
      rz.orders[id] = { id, ...b, status: 'created' };
      return jres(rz.orders[id]);
    }
    if ((m = url.pathname.match(/^\/v1\/payments\/([^/]+)$/))) {
      return rz.payments[m[1]] ? jres(rz.payments[m[1]]) : jres({ error: { description: 'nf' } }, 404);
    }
    if ((m = url.pathname.match(/^\/v1\/payments\/([^/]+)\/capture$/))) {
      const p = rz.payments[m[1]]; p.status = 'captured'; return jres(p);
    }
  }
  if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') {
    if (resend.fail) return jres({ message: 'boom' }, 500);
    const b = JSON.parse(bodyText);
    resend.sent.push({ ...b, auth: headers.get('authorization') });
    return jres({ id: `re_${resend.sent.length}` });
  }
  throw new Error(`unexpected fetch ${method} ${url}`);
};

export const ORIGIN = 'https://gst-billing-pro.pages.dev';
export const req = (path, { token, body, origin = ORIGIN, headers = {}, method = 'POST' } = {}) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: {
    'content-type': 'application/json',
    ...(origin ? { origin } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers,
  },
  ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body ?? {}) }),
});
export const call = async (handler, request, extra = {}) => {
  const r = await handler({ request, env, ...extra });
  return { status: r.status, body: await r.json(), headers: r.headers };
};
export const sign = (o, p) => crypto.createHmac('sha256', 'rzp_secret').update(`${o}|${p}`).digest('hex');
export const pay = (orderId, amount, status = 'captured') => {
  const id = `pay_${crypto.randomBytes(7).toString('hex')}`;
  rz.payments[id] = { id, order_id: orderId, amount, currency: 'INR', status, method: 'upi' };
  return id;
};
export const subOf = (uid) => db.subscriptions.find(s => s.user_id === uid);

export function makeAsserts() {
  const t = { failed: 0, passed: 0 };
  t.ok = (cond, msg) => { if (cond) t.passed++; else { t.failed++; console.error('  ✗', msg); } };
  t.eq = (a, b, msg) => t.ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  t.done = () => { console.log(`\n${t.passed} passed, ${t.failed} failed`); process.exit(t.failed ? 1 : 0); };
  return t;
}
