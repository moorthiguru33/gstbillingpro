// Plan / pricing / payment-flow tests.
// Run: node scripts/plans-test.mjs
//
// Exercises shared/plans.js and the real Cloudflare Pages Function
// handlers (create-order, verify-payment, razorpay-webhook, upload-logo)
// against an in-memory fake of Supabase Auth + PostgREST and Razorpay,
// by stubbing globalThis.fetch. No network, no real keys.
import crypto from 'node:crypto';
import {
  PLANS, getPlan, computeNewPeriodEnd, paymentMatchesPlan, formatPlanPrice, annualSavingsPercent,
} from '../shared/plans.js';
import { timingSafeEqual, hmacSha256Hex, isOriginAllowed } from '../shared/server.js';
import { sniffImageType } from '../shared/images.js';
import * as createOrder from '../functions/api/create-order.js';
import * as verifyPayment from '../functions/api/verify-payment.js';
import * as webhook from '../functions/api/razorpay-webhook.js';
import * as uploadLogo from '../functions/api/upload-logo.js';

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; } else { failed++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const DAY = 86400000;

// ---------------------------------------------------------------- plans
console.log('plans');
eq(PLANS.monthly.amount, 9900, 'monthly = ₹99 in paise');
eq(PLANS.annual.amount, 99900, 'annual = ₹999 in paise');
eq(PLANS.monthly.days, 30, 'monthly = 30 days');
eq(PLANS.annual.days, 365, 'annual = 365 days');
eq(getPlan('annual')?.id, 'annual', 'getPlan annual');
eq(getPlan('ANNUAL'), null, 'unknown plan id case-sensitive');
eq(getPlan('__proto__'), null, 'prototype keys are not plans');
eq(getPlan('toString'), null, 'inherited keys are not plans');
eq(getPlan(undefined), null, 'missing plan');
eq(formatPlanPrice(9900), '₹99', 'format ₹99');
eq(formatPlanPrice(99950), '₹999.50', 'format paise');
eq(annualSavingsPercent(), 16, 'annual saves 16%');
ok(Object.isFrozen(PLANS) && Object.isFrozen(PLANS.annual), 'plans immutable');

const now = new Date('2026-10-11T00:00:00Z');
eq(computeNewPeriodEnd(null, PLANS.monthly, now).toISOString(), new Date(now.getTime() + 30 * DAY).toISOString(), 'new sub: now + 30d');
eq(computeNewPeriodEnd({ status: 'active', current_period_end: '2026-10-21T00:00:00Z' }, PLANS.monthly, now).toISOString(),
  '2026-11-20T00:00:00.000Z', 'early renewal extends from current end');
eq(computeNewPeriodEnd({ status: 'expired', current_period_end: '2026-01-01T00:00:00Z' }, PLANS.annual, now).toISOString(),
  new Date(now.getTime() + 365 * DAY).toISOString(), 'lapsed sub extends from now');
eq(computeNewPeriodEnd({ status: 'trial', trial_end: '2026-10-16T00:00:00Z' }, PLANS.monthly, now).toISOString(),
  '2026-11-15T00:00:00.000Z', 'paying during trial keeps remaining trial days');
eq(computeNewPeriodEnd({ status: 'active', trial_end: '2027-01-01T00:00:00Z', current_period_end: null }, PLANS.monthly, now).toISOString(),
  new Date(now.getTime() + 30 * DAY).toISOString(), 'stale trial_end ignored once active');
eq(computeNewPeriodEnd({ status: 'active', current_period_end: 'garbage' }, PLANS.monthly, now).toISOString(),
  new Date(now.getTime() + 30 * DAY).toISOString(), 'invalid date ignored');
let threw = false; try { computeNewPeriodEnd(null, null, now); } catch { threw = true; }
ok(threw, 'invalid plan throws');
ok(paymentMatchesPlan({ amount: 99900, currency: 'INR' }, PLANS.annual), 'exact amount matches');
ok(!paymentMatchesPlan({ amount: 9900, currency: 'INR' }, PLANS.annual), 'monthly amount ≠ annual plan');
ok(!paymentMatchesPlan({ amount: 99900, currency: 'USD' }, PLANS.annual), 'currency must be INR');

// ---------------------------------------------------------------- helpers
console.log('server helpers');
ok(timingSafeEqual('abc', 'abc'), 'tse equal');
ok(!timingSafeEqual('abc', 'abd'), 'tse differ');
ok(!timingSafeEqual('abc', 'abcd'), 'tse length');
ok(!timingSafeEqual('abc', undefined), 'tse undefined');
eq(await hmacSha256Hex('secret', 'order_1|pay_1'),
  crypto.createHmac('sha256', 'secret').update('order_1|pay_1').digest('hex'), 'hmac matches node crypto');
ok(isOriginAllowed('https://gst-billing-pro.pages.dev', {}), 'prod origin allowed');
ok(isOriginAllowed('https://abc123.gst-billing-pro.pages.dev', {}), 'preview origin allowed');
ok(!isOriginAllowed('https://evil.pages.dev', {}), 'other pages.dev blocked');
ok(!isOriginAllowed('https://gst-billing-pro.pages.dev.evil.com', {}), 'suffix trick blocked');
ok(!isOriginAllowed('http://localhost:5173', {}), 'localhost blocked by default');
ok(isOriginAllowed('http://localhost:5173', { ALLOW_LOCALHOST: '1' }), 'localhost opt-in');
ok(isOriginAllowed('https://app.example.in', { ALLOWED_ORIGINS: 'https://app.example.in, https://x.in' }), 'ALLOWED_ORIGINS list');
eq(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])), 'image/png', 'sniff png');
eq(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg', 'sniff jpeg');
eq(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>')), null, 'svg rejected');

// ---------------------------------------------------------------- fakes
// Workers have a native WebSocket; Node 20 doesn't (supabase-js realtime checks).
if (!globalThis.WebSocket) globalThis.WebSocket = class FakeWebSocket {};
const SUPABASE_URL = 'https://fake.supabase.co';
const env = {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: 'service-key', RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_secret', RAZORPAY_WEBHOOK_SECRET: 'whsec',
};
const USERS = {
  'tok.en.A': { id: '11111111-1111-4111-8111-111111111111', email: 'a@shop.in' },
  'tok.en.B': { id: '22222222-2222-4222-8222-222222222222', email: 'b@shop.in' },
};
const db = { subscriptions: [], payment_orders: [], payment_logs: [] };
const rz = { orders: {}, payments: {}, calls: [] };

function parseOr(expr) {
  // (a.eq.x,b.eq.y,and(c.eq.z,d.lt."v"))  ->  predicate
  const inner = expr.replace(/^\(/, '').replace(/\)$/, '');
  const parts = []; let depth = 0, cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const preds = parts.map(p => {
    if (p.startsWith('and(')) {
      const sub = parseOr(p.slice(3));
      return row => sub.all(row);
    }
    const [col, op, ...rest] = p.split('.');
    const val = rest.join('.').replace(/^"|"$/g, '');
    return row => cmp(row[col], op, val);
  });
  const any = row => preds.some(f => f(row));
  any.all = row => preds.every(f => f(row));
  return any;
}
function cmp(v, op, val) {
  if (op === 'eq') return String(v) === val;
  if (op === 'lt') return v != null && String(v) < val;
  if (op === 'in') return val.replace(/[()]/g, '').split(',').includes(String(v));
  throw new Error('op ' + op);
}
function filterRows(table, params) {
  let rows = db[table];
  for (const [k, v] of params) {
    if (['select', 'on_conflict', 'columns'].includes(k)) continue;
    if (k === 'or') { const f = parseOr(v); rows = rows.filter(r => f(r)); continue; }
    const [op, ...rest] = v.split('.');
    rows = rows.filter(r => cmp(r[k], op, rest.join('.')));
  }
  return rows;
}
const PK = { subscriptions: 'user_id', payment_orders: 'order_id', payment_logs: 'id' };
const jres = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  const bodyText = init.body != null ? (typeof init.body === 'string' ? init.body : await new Response(init.body).text()) : null;

  if (url.origin === SUPABASE_URL && url.pathname === '/auth/v1/user') {
    const tok = (headers.get('authorization') || '').replace(/^Bearer /, '');
    return USERS[tok] ? jres(USERS[tok]) : jres({ message: 'invalid JWT' }, 401);
  }
  if (url.origin === SUPABASE_URL && url.pathname.startsWith('/rest/v1/')) {
    if (headers.get('apikey') !== 'service-key') return jres({ message: 'no key' }, 401);
    const table = url.pathname.split('/').pop();
    const params = [...url.searchParams.entries()];
    const prefer = headers.get('prefer') || '';
    if (method === 'GET') return jres(filterRows(table, params));
    if (method === 'POST') {
      const rows = [].concat(JSON.parse(bodyText));
      const out = [];
      for (const r of rows) {
        const pk = PK[table];
        const key = url.searchParams.get('on_conflict') || pk;
        const existing = r[key] != null && db[table].find(x => x[key] === r[key]);
        if (existing) {
          if (prefer.includes('ignore-duplicates')) continue;
          if (prefer.includes('merge-duplicates')) { Object.assign(existing, r); out.push(existing); continue; }
          return jres({ code: '23505', message: 'duplicate key' }, 409);
        }
        const row = { id: crypto.randomUUID(), ...r };
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
    let m;
    if ((m = url.pathname.match(/^\/v1\/payments\/([^/]+)$/))) {
      return rz.payments[m[1]] ? jres(rz.payments[m[1]]) : jres({ error: { description: 'nf' } }, 404);
    }
    if ((m = url.pathname.match(/^\/v1\/payments\/([^/]+)\/capture$/))) {
      const p = rz.payments[m[1]]; p.status = 'captured'; return jres(p);
    }
  }
  throw new Error(`unexpected fetch ${method} ${url}`);
};

const ORIGIN = 'https://gst-billing-pro.pages.dev';
const req = (path, { token, body, origin = ORIGIN, headers = {} } = {}) => new Request(`${ORIGIN}${path}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(origin ? { origin } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers,
  },
  body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
});
const call = async (mod, request) => { const r = await mod.onRequestPost({ request, env }); return { status: r.status, body: await r.json(), headers: r.headers }; };
const sign = (o, p) => crypto.createHmac('sha256', 'rzp_secret').update(`${o}|${p}`).digest('hex');
const pay = (orderId, amount, status = 'captured') => {
  const id = `pay_${crypto.randomBytes(7).toString('hex')}`;
  rz.payments[id] = { id, order_id: orderId, amount, currency: 'INR', status, method: 'upi' };
  return id;
};
const subOf = (uid) => db.subscriptions.find(s => s.user_id === uid);
const A = USERS['tok.en.A'].id, B = USERS['tok.en.B'].id;

// ---------------------------------------------------------------- create-order
console.log('create-order');
eq((await call(createOrder, req('/api/create-order', { body: { plan: 'annual' } }))).status, 401, 'no token → 401');
eq((await call(createOrder, req('/api/create-order', { token: A, body: { plan: 'annual' } }))).status, 401, 'raw user id as token → 401');
eq((await call(createOrder, req('/api/create-order', { token: 'bad.to.ken', body: { plan: 'annual' } }))).status, 401, 'invalid JWT → 401');
eq((await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'annual' }, origin: 'https://evil.com' }))).status, 403, 'foreign origin → 403');
eq((await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'lifetime' } }))).status, 400, 'unknown plan → 400');
let r = await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'annual', amount: 100 } }));
eq(r.status, 200, 'annual order created');
eq(r.body.amount, 99900, 'client amount ignored — server price used');
eq(r.headers.get('access-control-allow-origin'), ORIGIN, 'CORS echoes allowed origin only');
const orderA = r.body.id;
eq(db.payment_orders.find(o => o.order_id === orderA)?.user_id, A, 'order stored for user A');
eq(rz.orders[orderA].notes.plan, 'annual', 'plan in Razorpay notes');
r = await call(createOrder, req('/api/create-order', { token: 'tok.en.B', body: { plan: 'monthly' } }));
const orderB = r.body.id;
eq(r.body.amount, 9900, 'monthly order = 9900');
const savedEnv = env.RAZORPAY_KEY_SECRET; delete env.RAZORPAY_KEY_SECRET;
r = await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'monthly' } }));
eq(r.status, 500, 'missing secret → 500'); ok(!JSON.stringify(r.body).includes('RAZORPAY'), 'env names not leaked to client');
env.RAZORPAY_KEY_SECRET = savedEnv;

// ---------------------------------------------------------------- verify-payment
console.log('verify-payment');
const payA = pay(orderA, 99900);
eq((await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.A', body: { razorpay_order_id: orderA, razorpay_payment_id: payA, razorpay_signature: '00' } }))).status, 400, 'bad signature → 400');
eq((await call(verifyPayment, req('/api/verify-payment', { body: { razorpay_order_id: orderA, razorpay_payment_id: payA, razorpay_signature: sign(orderA, payA) } }))).status, 401, 'no token → 401');
eq((await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.B', body: { razorpay_order_id: orderA, razorpay_payment_id: payA, razorpay_signature: sign(orderA, payA) } }))).status, 403, "B can't claim A's payment");
ok(!subOf(B), 'B not activated');

db.subscriptions.push({ user_id: A, status: 'trial', trial_end: new Date(Date.now() + 5 * DAY).toISOString() });
const before = Date.now();
r = await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.A', body: { razorpay_order_id: orderA, razorpay_payment_id: payA, razorpay_signature: sign(orderA, payA) } }));
eq(r.status, 200, 'valid payment verified'); eq(r.body.alreadyProcessed, false, 'first activation');
const endA = new Date(subOf(A).current_period_end).getTime();
ok(Math.abs(endA - (before + 370 * DAY)) < 60000, 'annual during trial: trial(5d)+365d');
eq(subOf(A).status, 'active', 'A active'); eq(subOf(A).plan, 'annual', 'A plan annual'); eq(subOf(A).amount, 99900, 'amount in paise');
eq(db.payment_orders.find(o => o.order_id === orderA).status, 'paid', 'order marked paid');
eq(db.payment_logs.filter(l => l.razorpay_payment_id === payA).length, 1, 'one log');
eq(db.payment_logs.find(l => l.razorpay_payment_id === payA).amount, 99900, 'log has real amount');

r = await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.A', body: { razorpay_order_id: orderA, razorpay_payment_id: payA, razorpay_signature: sign(orderA, payA) } }));
eq(r.status, 200, 'replay OK'); eq(r.body.alreadyProcessed, true, 'replay idempotent');
eq(new Date(subOf(A).current_period_end).getTime(), endA, 'replay did not extend again');
eq(db.payment_logs.filter(l => l.razorpay_payment_id === payA).length, 1, 'replay did not log again');

// Underpayment: monthly order but somebody pays a tampered amount
const payBad = pay(orderB, 100);
r = await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.B', body: { razorpay_order_id: orderB, razorpay_payment_id: payBad, razorpay_signature: sign(orderB, payBad) } }));
eq(r.status, 400, 'amount mismatch rejected'); ok(!subOf(B), 'B still not active');
// Payment of a different order presented with this order id
const payOther = pay('order_other', 9900);
r = await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.B', body: { razorpay_order_id: orderB, razorpay_payment_id: payOther, razorpay_signature: sign(orderB, payOther) } }));
eq(r.status, 400, 'payment from another order rejected');
// Authorized (not auto-captured) → server captures exact amount
const payB = pay(orderB, 9900, 'authorized');
r = await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.B', body: { razorpay_order_id: orderB, razorpay_payment_id: payB, razorpay_signature: sign(orderB, payB) } }));
eq(r.status, 200, 'authorized payment captured + activated');
ok(rz.calls.includes(`POST /v1/payments/${payB}/capture`), 'capture called');
ok(Math.abs(new Date(subOf(B).current_period_end).getTime() - (Date.now() + 30 * DAY)) < 60000, 'monthly = now + 30d');

// ---------------------------------------------------------------- webhook
console.log('razorpay-webhook');
const whReq = (payload, sig) => {
  const raw = JSON.stringify(payload);
  return new Request(`${ORIGIN}/api/razorpay-webhook`, {
    method: 'POST', body: raw,
    headers: { 'x-razorpay-signature': sig ?? crypto.createHmac('sha256', 'whsec').update(raw).digest('hex') },
  });
};
const whCall = async (payload, sig) => { const res = await webhook.onRequestPost({ request: whReq(payload, sig), env }); return { status: res.status, body: await res.json() }; };
eq((await whCall({ event: 'payment.captured' }, 'nope')).status, 400, 'bad webhook signature → 400');

// Browser closed before verify: webhook activates
r = await call(createOrder, req('/api/create-order', { token: 'tok.en.B', body: { plan: 'annual' } }));
const orderB2 = r.body.id; const payB2 = pay(orderB2, 99900);
const endBefore = new Date(subOf(B).current_period_end).getTime();
const capturedEvt = (paymentId) => ({ event: 'payment.captured', payload: { payment: { entity: rz.payments[paymentId] } } });
r = await whCall(capturedEvt(payB2));
eq(r.status, 200, 'webhook activates'); eq(r.body.alreadyProcessed, false, 'webhook first');
eq(new Date(subOf(B).current_period_end).getTime(), endBefore + 365 * DAY, 'annual added on top of remaining month');
r = await whCall({ event: 'order.paid', payload: { payment: { entity: rz.payments[payB2] } } });
eq(r.body.alreadyProcessed, true, 'order.paid after payment.captured is a no-op');
r = await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.B', body: { razorpay_order_id: orderB2, razorpay_payment_id: payB2, razorpay_signature: sign(orderB2, payB2) } }));
eq(r.body.alreadyProcessed, true, 'late browser verify is a no-op');
eq(new Date(subOf(B).current_period_end).getTime(), endBefore + 365 * DAY, 'not double-extended');

// Legacy order (created before payment_orders existed) → rebuilt from notes
const legacyPay = `pay_legacy1`;
rz.payments[legacyPay] = { id: legacyPay, order_id: 'order_legacy1', amount: 9900, currency: 'INR', status: 'captured', notes: { userId: A, plan: 'monthly' } };
const endA2 = new Date(subOf(A).current_period_end).getTime();
r = await whCall(capturedEvt(legacyPay));
eq(r.status, 200, 'legacy order accepted');
eq(new Date(subOf(A).current_period_end).getTime(), endA2 + 30 * DAY, 'legacy monthly adds 30 days to existing end');
// Unknown notes → ignored, 200 so Razorpay stops retrying
rz.payments.pay_x = { id: 'pay_x', order_id: 'order_x', amount: 9900, currency: 'INR', status: 'captured', notes: {} };
r = await whCall(capturedEvt('pay_x'));
eq(r.status, 200, 'unmappable order acknowledged'); eq(r.body.ignored, 'unknown order', 'unmappable ignored');
eq((await whCall({ event: 'refund.created', payload: {} })).body.ignored, 'refund.created', 'other events ignored');

// ---------------------------------------------------------------- upload-logo
console.log('upload-logo');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const dataUrl = (buf, type = 'image/png') => `data:${type};base64,${Buffer.from(buf).toString('base64')}`;
const upl = async (opts) => { const res = await uploadLogo.onRequestPost({ request: req('/api/upload-logo', opts), env }); return { status: res.status, body: await res.json() }; };
eq((await upl({ body: { data: dataUrl(png) } })).status, 401, 'logo upload needs auth');
eq((await upl({ token: 'tok.en.A', body: { data: dataUrl(png) }, origin: 'https://evil.com' })).status, 403, 'logo upload foreign origin');
r = await upl({ token: 'tok.en.A', body: { data: dataUrl(png) } });
eq(r.status, 200, 'png accepted'); eq(r.body.storage, 'inline', 'inline without R2');
eq((await upl({ token: 'tok.en.A', body: { data: dataUrl('<svg onload=alert(1)/>', 'image/svg+xml') } })).status, 415, 'svg rejected');
eq((await upl({ token: 'tok.en.A', body: { data: dataUrl(Buffer.concat([png, Buffer.alloc(600 * 1024)])) } })).status, 413, '>512KB rejected');
const puts = [];
env.R2_BUCKET = { put: async (k, b, o) => { puts.push({ k, o }); } };
r = await upl({ token: 'tok.en.A', body: { data: dataUrl(png) } });
ok(r.body.url.startsWith('/api/files/logos%2F' + A), 'R2 key namespaced by verified user id');
eq(puts[0].o.httpMetadata.contentType, 'image/png', 'stored type from sniffed bytes');
delete env.R2_BUCKET;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
