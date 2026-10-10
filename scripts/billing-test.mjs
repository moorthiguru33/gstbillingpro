// Phase 2 tests: plan tiers & limits, upgrades, lifetime, coupons,
// referrals, admin authorisation, e-mail no-op / dedupe and the daily cron.
// Run: node scripts/billing-test.mjs   (no network, no real keys)
import fs from 'node:fs';
import {
  PLANS, TIERS, effectivePlan, planChange, priceBreakdown, evaluateCoupon, normalizeCode, makeReferralCode,
  isReferralCode, referrerReward, hasFeature, withinLimit, monthlyValue, LIFETIME_PERIOD_END, PURCHASABLE_PLAN_IDS,
  yearlySavingsPercent, FOUNDER_LIFETIME_CAP, DAY,
} from '../shared/plans.js';
import { generateBlock, currentBlock, MIGRATION } from './gen-plan-sql.mjs';
import {
  USERS, addUser, db, rz, env, req, call, sign, pay, subOf, resend, makeAsserts,
} from './lib/fake-backend.mjs';
import * as createOrder from '../functions/api/create-order.js';
import * as validateCoupon from '../functions/api/validate-coupon.js';
import * as verifyPayment from '../functions/api/verify-payment.js';
import * as referral from '../functions/api/referral.js';
import * as welcome from '../functions/api/account/welcome.js';
import * as cron from '../functions/api/cron/daily.js';
import * as adminMe from '../functions/api/admin/me.js';
import * as adminStats from '../functions/api/admin/stats.js';
import * as adminUsers from '../functions/api/admin/users.js';
import * as adminGrant from '../functions/api/admin/grant.js';
import * as adminCoupons from '../functions/api/admin/coupons.js';
import { computeStats, istMonthStart } from '../shared/admin.js';
import { sendEmail, sendLoggedEmail, emailConfigured } from '../shared/email.js';
import { receiptEmail, welcomeEmail, esc } from '../shared/email-templates.js';
import { reminderBucket } from '../shared/lifecycle.js';

const { ok, eq, done } = makeAsserts();
const now = new Date('2026-10-11T06:30:00Z');
const iso = (ms) => new Date(ms).toISOString();
const T = now.getTime();

// ---------------------------------------------------------------- tiers
console.log('tiers & limits');
eq(Object.keys(TIERS), ['free', 'starter', 'pro', 'business'], 'four tiers');
eq(TIERS.free.limits.invoicesPerMonth, 50, 'free: 50 invoices / month');
eq(TIERS.free.limits.businesses, 1, 'free: 1 business');
ok(!hasFeature('free', 'removeBranding'), 'free shows branding');
ok(hasFeature('starter', 'removeBranding'), 'starter removes branding');
ok(hasFeature('pro', 'whatsappAutomation') && !hasFeature('starter', 'whatsappAutomation'), 'whatsapp flag: pro yes, starter no');
ok(hasFeature('business', 'eInvoice') && !hasFeature('pro', 'eInvoice'), 'e-invoice flag: business only');
ok(withinLimit('free', 'invoicesPerMonth', 49) && !withinLimit('free', 'invoicesPerMonth', 50), 'free limit boundary at 50');
ok(withinLimit('starter', 'invoicesPerMonth', 1e6), 'starter unlimited invoices');
ok(!withinLimit('pro', 'businesses', 3) && withinLimit('business', 'businesses', 9), 'business limits');
eq(PURCHASABLE_PLAN_IDS, ['starter_monthly', 'starter_yearly', 'pro_monthly', 'pro_yearly', 'business_yearly', 'founder_lifetime'], 'purchasable SKUs');
eq(yearlySavingsPercent('pro'), 16, 'pro yearly saves 16%');
eq(monthlyValue('starter_yearly'), 8325, 'MRR of ₹999/yr = ₹83.25');
eq(monthlyValue('founder_lifetime'), 0, 'lifetime adds no MRR');
eq(FOUNDER_LIFETIME_CAP, 300, 'founder cap 300');

eq(effectivePlan(null, now).tier, 'free', 'no row → free');
eq(effectivePlan({ status: 'trial', trial_end: iso(T + 5 * DAY) }, now).tier, 'pro', 'trial → Pro features');
eq(effectivePlan({ status: 'trial', trial_end: iso(T + 5 * DAY) }, now).trialDaysLeft, 5, 'trial days left');
eq(effectivePlan({ status: 'trial', trial_end: iso(T - DAY) }, now).tier, 'free', 'trial over → Free, not locked');
eq(effectivePlan({ status: 'expired', trial_end: iso(T - 90 * DAY), current_period_end: iso(T - DAY), tier: 'pro' }, now).tier, 'free', 'lapsed paid → Free');
eq(effectivePlan({ status: 'active', plan: 'annual', current_period_end: iso(T + DAY) }, now).tier, 'starter', 'legacy annual row → Starter');
eq(effectivePlan({ status: 'active', tier: 'business', current_period_end: iso(T + DAY) }, now).tier, 'business', 'paid business');
eq(effectivePlan({ status: 'active', tier: 'starter', lifetime: true, current_period_end: LIFETIME_PERIOD_END }, now).source, 'lifetime', 'lifetime source');
eq(effectivePlan({ status: 'active', tier: 'starter', lifetime: true, current_period_end: iso(T - DAY) }, now).tier, 'starter', 'lifetime survives a lapsed period');
eq(effectivePlan({ status: 'active', tier: 'pro', lifetime: true, current_period_end: iso(T + DAY) }, now).tier, 'pro', 'lifetime + running Pro → Pro');
eq(effectivePlan({ status: 'active', tier: 'starter', current_period_end: iso(T + 40 * DAY), trial_end: iso(T + 3 * DAY) }, now).tier, 'pro', 'trial benefits last to trial end');
eq(effectivePlan({ status: 'cancelled', trial_end: iso(T + 3 * DAY) }, now).tier, 'free', 'cancelled ignores trial');

// ---------------------------------------------------------------- money
console.log('price & GST');
eq(priceBreakdown(PLANS.pro_yearly), { base: 199900, discount: 0, taxable: 199900, gstPercent: 0, gst: 0, total: 199900, currency: 'INR' }, 'no GST by default');
eq(priceBreakdown(PLANS.starter_yearly, 0, 18).total, 117882, '₹999 + 18% GST = ₹1,178.82');
eq(priceBreakdown(PLANS.starter_monthly, 10 ** 9).total, 100, 'discount never below ₹1');
eq(priceBreakdown(PLANS.starter_monthly, -50).discount, 0, 'negative discount ignored');

// ---------------------------------------------------------------- planChange
console.log('upgrades / renewals / lifetime');
const starterSub = { status: 'active', tier: 'starter', plan: 'starter_yearly', current_period_end: iso(T + 100 * DAY) };
let ch = planChange(starterSub, PLANS.pro_yearly, now);
// 100 days × ₹999/365 = ₹273.70 → / (₹1999/365 per day) = 49.97 → 49 days
eq(ch.kind, 'upgrade', 'starter → pro is an upgrade'); eq(ch.creditDays, 49, 'unused Starter days credited pro-rata');
eq(ch.periodEnd, iso(T + (365 + 49) * DAY), 'upgrade starts now + credit');
eq(ch.tier, 'pro', 'upgrade tier');
ch = planChange(starterSub, PLANS.starter_monthly, now);
eq([ch.kind, ch.periodEnd], ['renew', iso(T + 130 * DAY)], 'same tier extends from end');
ch = planChange({ status: 'active', tier: 'pro', plan: 'pro_yearly', current_period_end: iso(T + 10 * DAY) }, PLANS.starter_yearly, now);
eq([ch.ok, ch.code], [false, 'DOWNGRADE'], 'downgrade refused while higher tier runs');
ch = planChange({ status: 'active', tier: 'pro', plan: 'pro_yearly', current_period_end: iso(T + 10 * DAY) }, PLANS.starter_yearly, now, { allowDowngrade: true });
eq([ch.kind, ch.tier, ch.creditDays], ['credited', 'pro', 182], 'paid downgrade becomes Pro days of equal value');
ch = planChange({ status: 'trial', trial_end: iso(T + 5 * DAY) }, PLANS.pro_monthly, now);
eq(ch.periodEnd, iso(T + 35 * DAY), 'buying during trial keeps trial days');
ch = planChange(null, PLANS.founder_lifetime, now);
eq([ch.lifetime, ch.tier, ch.periodEnd], [true, 'starter', LIFETIME_PERIOD_END], 'lifetime → Starter forever');
ch = planChange({ status: 'active', tier: 'business', plan: 'business_yearly', current_period_end: iso(T + 50 * DAY) }, PLANS.founder_lifetime, now);
eq([ch.lifetime, ch.tier, ch.periodEnd], [true, 'business', iso(T + 50 * DAY)], 'lifetime keeps a running higher tier');
ch = planChange({ status: 'active', tier: 'starter', lifetime: true, plan: 'founder_lifetime', current_period_end: LIFETIME_PERIOD_END }, PLANS.pro_yearly, now);
eq([ch.tier, ch.lifetime, ch.creditDays, ch.periodEnd], ['pro', true, 0, iso(T + 365 * DAY)], 'lifetime owner can buy Pro on top');

// ---------------------------------------------------------------- coupons
console.log('coupons');
eq(normalizeCode(' launch50 '), 'LAUNCH50', 'codes are upper-cased');
eq(normalizeCode('a'), null, 'too short'); eq(normalizeCode('BAD CODE'), null, 'no spaces'); eq(normalizeCode(42), null, 'non-string');
const cp = (o) => ({ code: 'X10', kind: 'percent', value: 10, active: true, redeemed_count: 0, ...o });
eq(evaluateCoupon(cp(), PLANS.pro_yearly).discount, 19990, '10% of ₹1,999');
eq(evaluateCoupon(cp({ kind: 'flat', value: 20000 }), PLANS.starter_yearly).breakdown.total, 79900, 'flat ₹200 off');
eq(evaluateCoupon(cp({ active: false }), PLANS.pro_yearly).reason, 'invalid', 'inactive');
eq(evaluateCoupon(null, PLANS.pro_yearly).reason, 'invalid', 'missing coupon');
eq(evaluateCoupon(cp({ valid_until: iso(T - 1) }), PLANS.pro_yearly, { now }).reason, 'expired', 'expired');
eq(evaluateCoupon(cp({ max_redemptions: 5, redeemed_count: 5 }), PLANS.pro_yearly).reason, 'used_up', 'used up');
eq(evaluateCoupon(cp(), PLANS.pro_yearly, { alreadyUsedByUser: true }).reason, 'already_used', 'one use per user');
eq(evaluateCoupon(cp({ applies_to: ['business'] }), PLANS.pro_yearly).reason, 'not_for_plan', 'tier restriction');
ok(evaluateCoupon(cp({ applies_to: ['pro_yearly'] }), PLANS.pro_yearly).ok, 'SKU restriction');
eq(evaluateCoupon(cp({ value: 95 }), PLANS.pro_yearly).reason, 'invalid', 'percent capped at 90');

// ---------------------------------------------------------------- referral maths
console.log('referral rules');
const code = makeReferralCode(new Uint8Array([0, 1, 2, 3, 4, 255]));
ok(isReferralCode(code) && code.length === 9 && code.startsWith('GBP'), `referral code shape ${code}`);
ok(!isReferralCode('GBP0O1IAB'), 'lookalike characters rejected');
eq(referrerReward({ status: 'active', tier: 'pro', plan: 'pro_monthly', current_period_end: iso(T + 3 * DAY) }, now),
  { tier: 'pro', periodEnd: iso(T + 33 * DAY), kind: 'extend' }, 'paid referrer: +30 days');
eq(referrerReward({ status: 'free', trial_end: iso(T - DAY) }, now), { tier: 'starter', periodEnd: iso(T + 30 * DAY), kind: 'grant' }, 'free referrer: 30 days Starter');
eq(referrerReward({ status: 'trial', trial_end: iso(T + 4 * DAY) }, now).periodEnd, iso(T + 34 * DAY), 'trial referrer: Starter after trial');
eq(referrerReward({ status: 'active', tier: 'starter', lifetime: true, current_period_end: LIFETIME_PERIOD_END }, now).tier, 'pro', 'lifetime referrer: 30 days Pro');

// ---------------------------------------------------------------- SQL in sync
console.log('SQL');
const sql = fs.readFileSync(MIGRATION, 'utf8');
eq(currentBlock(sql), generateBlock(), '002 plan_limits block matches shared/plans.js');
for (const t of Object.values(TIERS)) ok(sql.includes(`('${t.id}', ${t.rank}, ${t.limits.invoicesPerMonth ?? 'NULL'},`), `plan_limits row for ${t.id}`);
const setup = fs.readFileSync(new URL('../supabase-setup.sql', import.meta.url), 'utf8');
ok(setup.includes(sql.trim()), 'supabase-setup.sql contains 002 verbatim');
ok(/CREATE TRIGGER gbp_bills_limit BEFORE INSERT ON public\.bills/.test(sql), 'bills limit trigger');
ok(/IF EXISTS \(SELECT 1 FROM public\.bills b WHERE b\.id = NEW\.id/.test(sql), 'trigger lets upsert-edits through');
ok(!/GRANT[^;]*ON public\.(coupons|admins|admin_actions|email_log|referrals)[^;]*TO (anon|authenticated)/.test(sql), 'server-only tables not granted to users');

// ---------------------------------------------------------------- API flows
console.log('orders, coupons, lifetime');
const U = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;
addUser('tok.en.1', { id: U(1), email: 'one@shop.in' });
addUser('tok.en.2', { id: U(2), email: 'two@shop.in' });
addUser('tok.en.3', { id: U(3), email: 'three@shop.in', created_at: iso(Date.now() - 60 * DAY) });
addUser('tok.en.4', { id: U(4), email: 'four@shop.in' });
addUser('tok.en.5', { id: U(5), email: 'admin@dprinters.in' });
addUser('tok.en.6', { id: U(6), email: 'fake-admin@dprinters.in', email_confirmed_at: null });
for (const n of [1, 2, 3, 4, 5, 6]) db.subscriptions.push({ user_id: U(n), email: USERS[`tok.en.${n}`].email, status: 'trial', trial_end: iso(Date.now() + 10 * DAY), created_at: iso(Date.now() - n * DAY) });
db.coupons.push({ code: 'LAUNCH20', kind: 'percent', value: 20, active: true, redeemed_count: 0, max_redemptions: 100 });
const P = (mod, path, token, body, extra) => call(mod.onRequestPost, req(path, { token, body }), extra);
const G = (mod, path, token, extra = {}) => call(mod.onRequestGet, req(path, { token, method: 'GET', ...extra }));

let r = await P(validateCoupon, '/api/validate-coupon', 'tok.en.1', { plan: 'pro_yearly', coupon: 'launch20' });
eq([r.status, r.body.breakdown?.total, r.body.coupon], [200, 159920, 'LAUNCH20'], 'coupon preview: 20% off ₹1,999');
r = await P(validateCoupon, '/api/validate-coupon', 'tok.en.1', { plan: 'pro_yearly', coupon: 'NOPE99' });
eq([r.status, r.body.code], [400, 'coupon_invalid'], 'unknown coupon rejected with code');
r = await P(validateCoupon, '/api/validate-coupon', null, { plan: 'pro_yearly' });
eq(r.status, 401, 'coupon preview needs auth');

r = await P(createOrder, '/api/create-order', 'tok.en.1', { plan: 'pro_yearly', coupon: 'LAUNCH20', amount: 1 });
eq([r.status, r.body.amount], [200, 159920], 'order charged discounted server price');
const o1 = r.body.id;
eq(db.payment_orders.find(o => o.order_id === o1)?.coupon_code, 'LAUNCH20', 'coupon stored on order');
r = await P(verifyPayment, '/api/verify-payment', 'tok.en.1', { razorpay_order_id: o1, razorpay_payment_id: pay(o1, 199900), razorpay_signature: 'x' });
eq(r.status, 400, 'bad signature');
let p1 = pay(o1, 159920);
r = await P(verifyPayment, '/api/verify-payment', 'tok.en.1', { razorpay_order_id: o1, razorpay_payment_id: p1, razorpay_signature: sign(o1, p1) });
eq([r.status, r.body.tier], [200, 'pro'], 'pro activated');
eq(subOf(U(1)).tier, 'pro', 'tier stored'); eq(subOf(U(1)).plan, 'pro_yearly', 'plan stored');
eq(db.coupon_redemptions.filter(x => x.code === 'LAUNCH20').length, 1, 'redemption recorded');
eq(db.coupons[0].redeemed_count, 1, 'redemption counter bumped');
ok(/^GBP\/2026-27\/\d{5}$/.test(db.payment_orders.find(o => o.order_id === o1).receipt_number), 'receipt number assigned');
r = await P(createOrder, '/api/create-order', 'tok.en.1', { plan: 'business_yearly', coupon: 'LAUNCH20' });
eq([r.status, r.body.code], [400, 'coupon_already_used'], 'coupon once per user');
r = await P(createOrder, '/api/create-order', 'tok.en.1', { plan: 'starter_yearly' });
eq([r.status, r.body.code], [409, 'downgrade'], 'downgrade while Pro runs → 409');
r = await P(createOrder, '/api/create-order', 'tok.en.1', { plan: 'pro_monthly' });
eq(r.status, 200, 'same-tier renewal allowed');

// lifetime
r = await P(createOrder, '/api/create-order', 'tok.en.2', { plan: 'founder_lifetime' });
eq([r.status, r.body.amount], [200, 699900], 'lifetime order ₹6,999');
const o2 = r.body.id; const p2 = pay(o2, 699900);
r = await P(verifyPayment, '/api/verify-payment', 'tok.en.2', { razorpay_order_id: o2, razorpay_payment_id: p2, razorpay_signature: sign(o2, p2) });
eq([r.status, r.body.lifetime], [200, true], 'lifetime activated');
eq([subOf(U(2)).lifetime, subOf(U(2)).current_period_end, subOf(U(2)).tier], [true, LIFETIME_PERIOD_END, 'starter'], 'lifetime row');
r = await P(createOrder, '/api/create-order', 'tok.en.2', { plan: 'founder_lifetime' });
eq([r.status, r.body.code], [409, 'already_lifetime'], 'cannot buy lifetime twice');
r = await P(createOrder, '/api/create-order', 'tok.en.2', { plan: 'pro_yearly' });
eq(r.status, 200, 'lifetime owner may buy Pro');
for (let i = 0; i < FOUNDER_LIFETIME_CAP; i++) db.payment_orders.push({ order_id: `order_seed${i}`, user_id: U(9), plan: 'founder_lifetime', amount: 699900, status: 'paid' });
r = await P(createOrder, '/api/create-order', 'tok.en.4', { plan: 'founder_lifetime' });
eq([r.status, r.body.code], [410, 'sold_out'], 'founder cap enforced → 410');
db.payment_orders = db.payment_orders.filter(o => !o.order_id.startsWith('order_seed'));

// ---------------------------------------------------------------- referrals
console.log('referrals');
r = await G(referral, '/api/referral', 'tok.en.1');
eq(r.status, 200, 'referral code issued'); ok(isReferralCode(r.body.code), 'valid code');
const refCode = r.body.code;
eq((await G(referral, '/api/referral', 'tok.en.1')).body.code, refCode, 'same code on every call');
eq((await P(referral, '/api/referral', 'tok.en.1', { code: refCode })).body.code, 'ref_self', 'no self-referral');
eq((await P(referral, '/api/referral', 'tok.en.3', { code: refCode })).body.code, 'ref_too_late', 'only within 30 days of sign-up');
eq((await P(referral, '/api/referral', 'tok.en.2', { code: refCode })).body.code, 'ref_already_paid', 'paid users cannot claim');
eq((await P(referral, '/api/referral', 'tok.en.4', { code: 'GBPZZZZZZ' })).status, 404, 'unknown code');
eq((await P(referral, '/api/referral', 'tok.en.4', { code: refCode.toLowerCase() })).status, 200, 'claim ok');
eq((await P(referral, '/api/referral', 'tok.en.4', { code: refCode })).body.code, 'ref_exists', 'one referrer per account');
const refEndBefore = new Date(subOf(U(1)).current_period_end).getTime();
r = await P(createOrder, '/api/create-order', 'tok.en.4', { plan: 'starter_monthly' });
const o4 = r.body.id; const p4 = pay(o4, 12900);
r = await P(verifyPayment, '/api/verify-payment', 'tok.en.4', { razorpay_order_id: o4, razorpay_payment_id: p4, razorpay_signature: sign(o4, p4) });
eq([r.status, r.body.referralBonus], [200, true], 'referred user rewarded on first purchase');
const end4 = new Date(subOf(U(4)).current_period_end).getTime();
ok(Math.abs(end4 - (Date.now() + (10 + 30 + 30) * DAY)) < 120000, 'referred: trial 10d + 30d plan + 30d bonus');
eq(new Date(subOf(U(1)).current_period_end).getTime(), refEndBefore + 30 * DAY, 'referrer (paid Pro): +30 days');
eq(db.referrals[0].status, 'rewarded', 'referral marked rewarded');
r = await P(createOrder, '/api/create-order', 'tok.en.4', { plan: 'starter_monthly' });
const o4b = r.body.id; const p4b = pay(o4b, 12900);
r = await P(verifyPayment, '/api/verify-payment', 'tok.en.4', { razorpay_order_id: o4b, razorpay_payment_id: p4b, razorpay_signature: sign(o4b, p4b) });
eq(r.body.referralBonus, false, 'bonus only once');
eq((await G(referral, '/api/referral', 'tok.en.1')).body.rewarded, 1, 'referrer sees 1 rewarded invite');

// ---------------------------------------------------------------- admin
console.log('admin authorisation');
db.admins.push({ email: 'admin@dprinters.in' }, { email: 'fake-admin@dprinters.in' });
eq((await G(adminMe, '/api/admin/me', null)).status, 401, 'no token → 401');
eq((await G(adminMe, '/api/admin/me', 'bad.to.ken')).status, 401, 'invalid token → 401');
eq((await G(adminMe, '/api/admin/me', 'tok.en.1')).status, 403, 'normal user → 403');
eq((await G(adminMe, '/api/admin/me', 'tok.en.6')).status, 403, 'unconfirmed e-mail in admins → 403');
eq((await G(adminMe, '/api/admin/me', 'tok.en.5', { origin: 'https://evil.com' })).status, 403, 'foreign origin → 403');
r = await G(adminMe, '/api/admin/me', 'tok.en.5');
eq([r.status, r.body.admin], [200, true], 'admin → 200');
for (const [mod, path] of [[adminStats, '/api/admin/stats'], [adminUsers, '/api/admin/users?q=one'], [adminCoupons, '/api/admin/coupons']]) {
  eq((await G(mod, path, 'tok.en.1')).status, 403, `${path} refuses non-admin`);
}
eq((await P(adminGrant, '/api/admin/grant', 'tok.en.1', { userId: U(3), tier: 'pro', days: 30, note: 'x' })).status, 403, 'grant refuses non-admin');
eq((await P(adminCoupons, '/api/admin/coupons', 'tok.en.1', { action: 'create', code: 'HACK', kind: 'percent', value: 90 })).status, 403, 'coupon create refuses non-admin');
r = await G(adminStats, '/api/admin/stats', 'tok.en.5');
eq(r.status, 200, 'stats ok'); ok(r.body.stats.totalUsers >= 6, 'stats totals'); ok(r.body.stats.mrr > 0, 'MRR computed');
ok(!JSON.stringify(r.body).includes('service-key'), 'no service key in admin responses');
r = await G(adminUsers, '/api/admin/users?q=three', 'tok.en.5');
eq(r.body.users.map(u => u.email), ['three@shop.in'], 'user search');
r = await G(adminUsers, '/api/admin/users?q=%25%27)%2C(', 'tok.en.5');
eq(r.status, 200, 'hostile search string sanitised');
r = await P(adminGrant, '/api/admin/grant', 'tok.en.5', { userId: U(3), tier: 'pro', days: 30 });
eq(r.status, 400, 'grant needs a note');
r = await P(adminGrant, '/api/admin/grant', 'tok.en.5', { userId: U(3), tier: 'pro', days: 30, note: 'support goodwill' });
eq([r.status, subOf(U(3)).tier, subOf(U(3)).status], [200, 'pro', 'active'], 'grant applied');
const act = db.admin_actions.find(a => a.action === 'grant');
eq([act?.admin_email, act?.target_user_id, act?.details?.before?.status], ['admin@dprinters.in', U(3), 'trial'], 'grant logged with before/after');
r = await P(adminCoupons, '/api/admin/coupons', 'tok.en.5', { action: 'create', code: 'diwali', kind: 'percent', value: 95 });
eq(r.status, 400, 'coupon > 90% refused');
r = await P(adminCoupons, '/api/admin/coupons', 'tok.en.5', { action: 'create', code: 'diwali', kind: 'flat', value: 10000, applies_to: ['starter', 'pro_yearly'] });
eq([r.status, r.body.coupon?.code], [200, 'DIWALI'], 'coupon created');
eq((await P(adminCoupons, '/api/admin/coupons', 'tok.en.5', { action: 'create', code: 'DIWALI', kind: 'flat', value: 1 })).status, 409, 'duplicate coupon');
r = await P(adminCoupons, '/api/admin/coupons', 'tok.en.5', { action: 'set_active', code: 'DIWALI', active: false });
eq(r.body.coupon?.active, false, 'coupon deactivated');
eq(db.admin_actions.filter(a => a.action.startsWith('coupon_')).length, 3, 'coupon actions logged');

const st = computeStats([
  { status: 'trial', trial_end: iso(T + 3 * DAY) },
  { status: 'free', trial_end: iso(T - DAY) },
  { status: 'active', tier: 'starter', plan: 'starter_monthly', current_period_end: iso(T + 5 * DAY) },
  { status: 'active', tier: 'pro', plan: 'pro_yearly', current_period_end: iso(T + 200 * DAY) },
  { status: 'active', tier: 'starter', plan: 'founder_lifetime', lifetime: true, current_period_end: LIFETIME_PERIOD_END },
], [{ amount: 12900 }, { amount: 199900 }], now);
eq([st.trial, st.free, st.paid, st.lifetime], [1, 1, 3, 1], 'stats buckets');
eq(st.mrr, 12900 + Math.round(199900 / 12), 'MRR = monthly + yearly/12, lifetime 0');
eq(st.arr, st.mrr * 12, 'ARR'); eq(st.revenueThisMonth, 212800, 'revenue this month');
eq([st.expiringIn7Days, st.trialsEndingIn7Days], [1, 1], 'expiring soon');
eq(st.paidByTier, { starter: 2, pro: 1, business: 0 }, 'paid by tier');
eq(istMonthStart(new Date('2026-10-31T20:00:00Z')), '2026-10-31T18:30:00.000Z', 'IST month start (1 Nov IST)');

// ---------------------------------------------------------------- e-mail
console.log('e-mail');
ok(!emailConfigured(env), 'not configured by default');
const before = resend.sent.length;
eq((await sendEmail(env, { to: 'a@b.in', subject: 's', html: 'h' })).skipped, true, 'sendEmail no-op without keys');
eq((await sendLoggedEmail(env, null, { kind: 'x', dedupeKey: 'x:1', to: 'a@b.in', subject: 's', html: 'h' })).status, 'skipped', 'logged send no-op without keys');
eq(resend.sent.length, before, 'nothing sent to Resend');
eq((await P(welcome, '/api/account/welcome', 'tok.en.4', {})).body.status, 'skipped', 'welcome API no-op without keys');
const envMail = { ...env, RESEND_API_KEY: 're_test', FROM_EMAIL: 'GST Billing Pro <billing@example.in>' };
const { getServiceClient } = await import('../shared/server.js');
const sb = getServiceClient(envMail);
r = await sendLoggedEmail(envMail, sb, { userId: U(1), kind: 'test', dedupeKey: 'test:1', to: 'one@shop.in', subject: 'Hi', html: '<p>x</p>', text: 'x' });
eq(r.status, 'sent', 'sent with keys'); eq(resend.sent.at(-1).auth, 'Bearer re_test', 'Resend auth header');
eq((await sendLoggedEmail(envMail, sb, { kind: 'test', dedupeKey: 'test:1', to: 'one@shop.in', subject: 'Hi', html: 'x' })).status, 'duplicate', 'dedupe key prevents resend');
resend.fail = true;
eq((await sendLoggedEmail(envMail, sb, { kind: 'test', dedupeKey: 'test:2', to: 'one@shop.in', subject: 'Hi', html: 'x' })).status, 'failed', 'provider error reported');
ok(!db.email_log.find(e => e.dedupe_key === 'test:2'), 'failed send un-logged so it retries');
resend.fail = false;
eq((await sendEmail(envMail, { to: 'not-an-email', subject: 's', html: 'h' })).skipped, true, 'invalid recipient skipped');
eq(esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;', 'escape');
let rec = receiptEmail({ order: { order_id: 'o', plan: 'pro_yearly', amount: 159920, base_amount: 199900, discount: 39980, gst_amount: 0, coupon_code: 'LAUNCH20', receipt_number: 'GBP/2026-27/00001', paid_at: now.toISOString(), period_end: iso(T + 365 * DAY), razorpay_payment_id: 'pay_1' }, customer: { email: 'one@shop.in', name: '<script>' }, env: {} });
ok(rec.html.includes('Payment Receipt') && rec.html.includes('Not registered under GST'), 'receipt without GSTIN');
ok(rec.html.includes('₹1,599.20') && rec.html.includes('LAUNCH20') && rec.html.includes('D Printers'), 'receipt amounts + seller');
ok(!rec.html.includes('<script>'), 'receipt escapes user data');
rec = receiptEmail({ order: { order_id: 'o', plan: 'starter_yearly', amount: 117882, base_amount: 99900, discount: 0, gst_amount: 17982, paid_at: now.toISOString() }, customer: { email: 'x@y.in' }, env: { SELLER_GSTIN: '33ABCDE1234F1Z5', SELLER_SAC: '998314' } });
ok(rec.html.includes('Tax Invoice') && rec.html.includes('33ABCDE1234F1Z5') && rec.html.includes('CGST @ 9%') && rec.html.includes('SAC 998314'), 'tax invoice once GSTIN is set');
ok(welcomeEmail({ name: 'Ravi', trialEnd: iso(T + 30 * DAY) }).subject.includes('30-day'), 'welcome template');

// ---------------------------------------------------------------- cron
console.log('daily cron');
eq(reminderBucket(7, [7, 3, 1]), 7, 'day 23 → 7-day reminder'); eq(reminderBucket(3, [7, 3, 1]), 3, 'day 27');
eq(reminderBucket(1, [7, 3, 1]), 1, 'day 29'); eq(reminderBucket(5, [7, 3, 1]), 7, 'missed run still reminds');
eq(reminderBucket(9, [7, 3, 1]), null, 'too early'); eq(reminderBucket(0, [7, 3, 1]), null, 'already over');
const cronReq = (tok) => new Request('https://gst-billing-pro.pages.dev/api/cron/daily', { method: 'POST', headers: tok ? { authorization: `Bearer ${tok}` } : {} });
const runCron = async (e, tok) => { const res = await cron.onRequestPost({ request: cronReq(tok), env: e }); return { status: res.status, body: await res.json() }; };
eq((await runCron(env, 'x')).status, 503, 'cron refuses without CRON_SECRET');
const envCron = { ...envMail, CRON_SECRET: 'cron-secret-0123456789' };
eq((await runCron(envCron, null)).status, 401, 'cron needs bearer');
eq((await runCron(envCron, 'cron-secret-WRONG-6789')).status, 401, 'cron wrong secret');
db.subscriptions.push(
  { user_id: U(7), email: 'seven@shop.in', status: 'trial', trial_end: iso(Date.now() + 3 * DAY - 3600000) },
  { user_id: U(8), email: 'eight@shop.in', status: 'trial', trial_end: iso(Date.now() - 3600000) },
  { user_id: '99999999-0000-4000-8000-000000000001', email: 'lapsed@shop.in', status: 'active', tier: 'starter', plan: 'starter_monthly', current_period_end: iso(Date.now() - DAY) },
  { user_id: '99999999-0000-4000-8000-000000000002', email: 'life@shop.in', status: 'active', tier: 'pro', lifetime: true, plan: 'pro_monthly', current_period_end: iso(Date.now() - DAY) },
  { user_id: '99999999-0000-4000-8000-000000000003', email: 'renew@shop.in', status: 'active', tier: 'pro', plan: 'pro_monthly', current_period_end: iso(Date.now() + 7 * DAY - 3600000) },
);
const sentBefore = resend.sent.length;
r = await runCron(envCron, 'cron-secret-0123456789');
eq(r.status, 200, 'cron runs');
eq(subOf(U(8)).status, 'free', 'lapsed trial → free');
eq(subOf('99999999-0000-4000-8000-000000000001').status, 'free', 'lapsed paid → free');
eq([subOf('99999999-0000-4000-8000-000000000002').tier, subOf('99999999-0000-4000-8000-000000000002').current_period_end], ['starter', LIFETIME_PERIOD_END], 'lapsed upgrade on lifetime → lifetime Starter');
const subjects = resend.sent.slice(sentBefore).map(m => `${m.to[0]}|${m.subject}`);
ok(subjects.some(s => s.startsWith('seven@shop.in|Your free trial ends in 3 days')), 'trial 3-day reminder');
ok(subjects.some(s => s.startsWith('eight@shop.in|Your free trial has ended')), 'trial ended e-mail');
ok(subjects.some(s => s.startsWith('renew@shop.in|Your Pro · Monthly plan renews in 7 days')), 'renewal reminder');
ok(subjects.some(s => s.startsWith('lapsed@shop.in|Your plan has ended')), 'plan ended e-mail');
const afterFirst = resend.sent.length;
r = await runCron(envCron, 'cron-secret-0123456789');
eq(resend.sent.length, afterFirst, 'second run sends nothing new (dedupe)');

done();
