// Plan / pricing / payment-flow tests.
// Run: node scripts/plans-test.mjs
//
// Exercises shared/plans.js and the real Cloudflare Pages Function
// handlers (create-order, verify-payment, razorpay-webhook, upload-logo)
// against an in-memory fake of Supabase Auth + PostgREST and Razorpay,
// by stubbing globalThis.fetch. No network, no real keys.
import crypto from 'node:crypto';
import {
  PLANS, getPlan, getPurchasablePlan, computeNewPeriodEnd, paymentMatchesPlan, formatPlanPrice, annualSavingsPercent,
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
eq(PLANS.starter_monthly.price, 12900, 'starter monthly = ₹129');
eq(PLANS.starter_yearly.price, 99900, 'starter yearly = ₹999');
eq(PLANS.pro_monthly.price, 19900, 'pro monthly = ₹199');
eq(PLANS.pro_yearly.price, 199900, 'pro yearly = ₹1,999');
eq(PLANS.business_yearly.price, 399900, 'business yearly = ₹3,999');
eq(PLANS.founder_lifetime.price, 699900, 'founder lifetime = ₹6,999');
eq(PLANS.monthly.price, 9900, 'legacy monthly still resolvable');
eq(getPlan('annual')?.tier, 'starter', 'legacy annual = Starter');
eq(getPurchasablePlan('annual'), null, 'legacy SKUs cannot be bought');
eq(getPlan('ANNUAL'), null, 'unknown plan id case-sensitive');
eq(getPlan('__proto__'), null, 'prototype keys are not plans');
eq(getPlan('toString'), null, 'inherited keys are not plans');
eq(getPlan(undefined), null, 'missing plan');
eq(formatPlanPrice(9900), '₹99', 'format ₹99');
eq(formatPlanPrice(399900), '₹3,999', 'format Indian grouping');
eq(formatPlanPrice(99950), '₹999.50', 'format paise');
eq(annualSavingsPercent(), 35, 'starter yearly saves 35% vs 12 × ₹129');
ok(Object.isFrozen(PLANS) && Object.isFrozen(PLANS.starter_yearly), 'plans immutable');

const now = new Date('2026-10-11T00:00:00Z');
const M = PLANS.starter_monthly, Y = PLANS.starter_yearly;
eq(computeNewPeriodEnd(null, M, now).toISOString(), new Date(now.getTime() + 30 * DAY).toISOString(), 'new sub: now + 30d');
eq(computeNewPeriodEnd({ status: 'active', tier: 'starter', plan: 'starter_monthly', current_period_end: '2026-10-21T00:00:00Z' }, M, now).toISOString(),
  '2026-11-20T00:00:00.000Z', 'early renewal extends from current end');
eq(computeNewPeriodEnd({ status: 'expired', current_period_end: '2026-01-01T00:00:00Z' }, Y, now).toISOString(),
  new Date(now.getTime() + 365 * DAY).toISOString(), 'lapsed sub extends from now');
eq(computeNewPeriodEnd({ status: 'trial', trial_end: '2026-10-16T00:00:00Z' }, M, now).toISOString(),
  '2026-11-15T00:00:00.000Z', 'paying during trial keeps remaining trial days');
eq(computeNewPeriodEnd({ status: 'active', current_period_end: 'garbage' }, M, now).toISOString(),
  new Date(now.getTime() + 30 * DAY).toISOString(), 'invalid date ignored');
let threw = false; try { computeNewPeriodEnd(null, null, now); } catch { threw = true; }
ok(threw, 'invalid plan throws');
ok(paymentMatchesPlan({ amount: 99900, currency: 'INR' }, Y), 'exact amount matches');
ok(!paymentMatchesPlan({ amount: 12900, currency: 'INR' }, Y), 'monthly amount ≠ yearly plan');
ok(!paymentMatchesPlan({ amount: 99900, currency: 'USD' }, Y), 'currency must be INR');

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
const { USERS, addUser, db, rz, env, req, sign, pay, subOf, ORIGIN } = await import('./lib/fake-backend.mjs');
addUser('tok.en.A', { id: '11111111-1111-4111-8111-111111111111', email: 'a@shop.in' });
addUser('tok.en.B', { id: '22222222-2222-4222-8222-222222222222', email: 'b@shop.in' });
const call = async (mod, request) => { const r = await mod.onRequestPost({ request, env }); return { status: r.status, body: await r.json(), headers: r.headers }; };
const A = USERS['tok.en.A'].id, B = USERS['tok.en.B'].id;

// ---------------------------------------------------------------- create-order
console.log('create-order');
eq((await call(createOrder, req('/api/create-order', { body: { plan: 'starter_yearly' } }))).status, 401, 'no token → 401');
eq((await call(createOrder, req('/api/create-order', { token: A, body: { plan: 'starter_yearly' } }))).status, 401, 'raw user id as token → 401');
eq((await call(createOrder, req('/api/create-order', { token: 'bad.to.ken', body: { plan: 'starter_yearly' } }))).status, 401, 'invalid JWT → 401');
eq((await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'starter_yearly' }, origin: 'https://evil.com' }))).status, 403, 'foreign origin → 403');
eq((await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'lifetime' } }))).status, 400, 'unknown plan → 400');
eq((await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'annual' } }))).status, 400, 'legacy plan cannot be bought → 400');
let r = await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'starter_yearly', amount: 100 } }));
eq(r.status, 200, 'annual order created');
eq(r.body.amount, 99900, 'client amount ignored — server price used');
eq(r.headers.get('access-control-allow-origin'), ORIGIN, 'CORS echoes allowed origin only');
const orderA = r.body.id;
eq(db.payment_orders.find(o => o.order_id === orderA)?.user_id, A, 'order stored for user A');
eq(rz.orders[orderA].notes.plan, 'starter_yearly', 'plan in Razorpay notes');
r = await call(createOrder, req('/api/create-order', { token: 'tok.en.B', body: { plan: 'starter_monthly' } }));
const orderB = r.body.id;
eq(r.body.amount, 12900, 'monthly order = 12900');
const savedEnv = env.RAZORPAY_KEY_SECRET; delete env.RAZORPAY_KEY_SECRET;
r = await call(createOrder, req('/api/create-order', { token: 'tok.en.A', body: { plan: 'starter_monthly' } }));
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
eq(subOf(A).status, 'active', 'A active'); eq(subOf(A).plan, 'starter_yearly', 'A plan starter_yearly'); eq(subOf(A).tier, 'starter', 'A tier starter'); eq(subOf(A).amount, 99900, 'amount in paise');
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
const payOther = pay('order_other', 12900);
r = await call(verifyPayment, req('/api/verify-payment', { token: 'tok.en.B', body: { razorpay_order_id: orderB, razorpay_payment_id: payOther, razorpay_signature: sign(orderB, payOther) } }));
eq(r.status, 400, 'payment from another order rejected');
// Authorized (not auto-captured) → server captures exact amount
const payB = pay(orderB, 12900, 'authorized');
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
r = await call(createOrder, req('/api/create-order', { token: 'tok.en.B', body: { plan: 'starter_yearly' } }));
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
