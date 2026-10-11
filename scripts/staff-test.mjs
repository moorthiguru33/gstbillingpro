// Unit tests for Phase 3: staff roles, bill links, ESC/POS encoding.
import assert from 'node:assert/strict';
import {
  can, canOpenView, canAssignRole, staffAllowed, normalizeInvite, normalizePhone,
  makeInviteToken, isInviteToken, inviteExpired, MAX_CA_LOGINS,
} from '../shared/staff.js';
import { upiPayUrl, renderBillPage, BILL_TOKEN_RE, BILL_PAGE_HEADERS } from '../shared/bill-link.js';
import { EscPos, receiptBytes, testPageBytes, padRow, wrap, toAscii, columnsFor } from '../src/utils/escpos.js';

let n = 0;
const test = (name, fn) => { fn(); n++; };

test('role permissions', () => {
  assert.equal(can('owner', 'delete'), true);
  assert.equal(can('manager', 'delete'), true);
  assert.equal(can('biller', 'delete'), false);
  assert.equal(can('biller', 'reports'), false);
  assert.equal(can('biller', 'settings'), false);
  assert.equal(can('accountant', 'write'), false);
  assert.equal(can('accountant', 'reports'), true);
  assert.equal(canOpenView('biller', 'pos'), true);
  assert.equal(canOpenView('biller', 'reports'), false);
  assert.equal(canOpenView('biller', 'filing'), false);
  assert.equal(canOpenView('accountant', 'filing'), true);
  assert.equal(canOpenView('accountant', 'pos'), false);
  assert.equal(canOpenView('accountant', 'new'), false);
  assert.equal(canOpenView('owner', 'anything'), true);
});

test('who may assign which role', () => {
  assert.equal(canAssignRole('owner', 'manager'), true);
  assert.equal(canAssignRole('manager', 'manager'), false);
  assert.equal(canAssignRole('manager', 'biller'), true);
  assert.equal(canAssignRole('biller', 'biller'), false);
  assert.equal(canAssignRole('accountant', 'accountant'), false);
  assert.equal(canAssignRole('owner', 'owner'), false);
});

test('seat limits follow plan flags', () => {
  assert.equal(staffAllowed('free', 'biller').ok, false);
  assert.equal(staffAllowed('starter', 'biller').ok, false);
  assert.deepEqual(staffAllowed('pro', 'biller', { staffUsed: 1 }), { ok: true, limit: 2 });
  assert.equal(staffAllowed('pro', 'manager', { staffUsed: 2 }).code, 'staff_limit');
  assert.equal(staffAllowed('business', 'biller', { staffUsed: 9 }).ok, true);
  assert.equal(staffAllowed('business', 'biller', { staffUsed: 10 }).ok, false);
  // CA login: free on every paid plan, max 2, never on free
  assert.equal(staffAllowed('free', 'accountant').code, 'staff_ca_paid_only');
  assert.equal(staffAllowed('starter', 'accountant').ok, true);
  assert.equal(staffAllowed('pro', 'accountant', { staffUsed: 2 }).ok, true);
  assert.equal(staffAllowed('pro', 'accountant', { caUsed: MAX_CA_LOGINS }).code, 'staff_ca_limit');
  assert.equal(staffAllowed('nope', 'biller').code, 'staff_plan');
});

test('invite validation', () => {
  assert.deepEqual(normalizeInvite({ role: 'biller', email: ' Ravi@Gmail.com ', name: ' Ravi ' }), { email: 'ravi@gmail.com', phone: null, name: 'Ravi', role: 'biller' });
  assert.equal(normalizeInvite({ role: 'accountant', phone: '098765 43210' }).phone, '919876543210');
  assert.equal(normalizePhone('+91 98765-43210'), '919876543210');
  assert.throws(() => normalizeInvite({ role: 'owner', email: 'a@b.co' }), /staff_bad_role/);
  assert.throws(() => normalizeInvite({ role: 'biller', email: 'nope' }), /staff_bad_email/);
  assert.throws(() => normalizeInvite({ role: 'biller', phone: '12' }), /staff_bad_phone/);
  assert.throws(() => normalizeInvite({ role: 'biller' }), /staff_need_contact/);
});

test('invite tokens', () => {
  const tok = makeInviteToken();
  assert.equal(tok.length, 32);
  assert.ok(isInviteToken(tok));
  assert.ok(BILL_TOKEN_RE.test(tok));
  assert.notEqual(tok, makeInviteToken());
  assert.equal(isInviteToken('short'), false);
  assert.equal(isInviteToken("abc'; drop table x;--aaaaaaaaaaaa"), false);
  const now = new Date('2026-10-11T00:00:00Z');
  assert.equal(inviteExpired('2026-10-01T00:00:00Z', now), false);
  assert.equal(inviteExpired('2026-09-01T00:00:00Z', now), true);
  assert.equal(inviteExpired('garbage', now), true);
});

test('UPI pay link', () => {
  const u = upiPayUrl({ upiId: 'shop@okicici', payee: 'D Printers', amount: 1180.5, note: 'Invoice INV-1' });
  assert.ok(u.startsWith('upi://pay?'));
  const p = new URLSearchParams(u.slice('upi://pay?'.length));
  assert.equal(p.get('pa'), 'shop@okicici');
  assert.equal(p.get('am'), '1180.50');
  assert.equal(p.get('cu'), 'INR');
  assert.equal(upiPayUrl({ upiId: 'not a vpa', amount: 10 }), null);
  assert.equal(upiPayUrl({ upiId: 'shop@okicici', amount: 0 }), null);
});

test('bill page escapes and localises', () => {
  const link = { token: 'x'.repeat(32), business_name: '<script>alert(1)</script>', invoice_number: 'INV-7', client_name: 'Ravi & Sons', amount: 500, amount_due: 500, currency: 'INR', upi_id: 'shop@okicici', lang: 'ta' };
  const html = renderBillPage(link, { viewUrl: 'https://s.example/v', downloadUrl: 'https://s.example/d' });
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Ravi &amp; Sons'));
  assert.ok(html.includes('upi://pay?'));
  assert.ok(html.includes('lang="ta"'));
  const paid = renderBillPage({ ...link, amount_due: 0, lang: 'xx' }, {});
  assert.ok(!paid.includes('upi://pay?'));
  assert.ok(paid.includes('lang="en"'));
  const h = BILL_PAGE_HEADERS;
  const get = (k) => (h instanceof Headers ? h.get(k) : h[k] ?? h[k.toLowerCase()]);
  assert.match(String(get('Content-Security-Policy')), /default-src 'none'/);
  assert.match(String(get('X-Robots-Tag')), /noindex/);
});

test('ESC/POS encoding', () => {
  assert.equal(columnsFor(58), 32);
  assert.equal(columnsFor(80), 48);
  assert.equal(columnsFor('x'), 48);
  assert.equal(toAscii('₹10 – “ok”'), 'Rs.10 - "ok"');
  assert.equal(toAscii('தமிழ்'), '?????'.slice(0, 'தமிழ்'.length));
  assert.equal(padRow('Item', '10.00', 20), 'Item           10.00');
  assert.equal(padRow('A very long item name here', '10.00', 20).length, 20);
  assert.deepEqual(wrap('one two three', 7), ['one two', 'three']);
  const b = new EscPos(58).bold(true).line('Hi').cut().build();
  assert.deepEqual([...b.slice(0, 2)], [0x1b, 0x40]); // init
  assert.deepEqual([...b.slice(2, 5)], [0x1b, 0x45, 1]); // bold on
  assert.deepEqual([...b.slice(-4)], [0x1d, 0x56, 0x42, 0x00]); // cut
  const bill = { invoiceNumber: 'INV-9', date: '2026-10-11', items: [{ name: 'Pen', quantity: 2, rate: 10, taxRate: 18 }], subtotal: 20, taxAmount: 3.6, total: 23.6 };
  const r = new TextDecoder().decode(receiptBytes(bill, { businessName: 'D Printers', gstin: '33AAAAA0000A1Z5' }, { paper: 58 }));
  for (const s of ['D Printers', 'INV-9', 'Pen', '2 x 10.00', '20.00', '3.60', 'Rs.23.60']) assert.ok(r.includes(s), s);
  for (const line of r.split('\n')) assert.ok(line.replace(/[\x00-\x1f]|\x1b.|\x1d.../g, '').length <= 40);
  const posShape = { invoiceNumber: 'P-1', totalAmount: 50, data: { profile: { businessName: 'Shop' }, items: [{ name: 'Tea', quantity: 5, rate: 10 }] } };
  const r2 = new TextDecoder().decode(receiptBytes(posShape, null, { paper: 80 }));
  assert.ok(r2.includes('Shop') && r2.includes('Tea') && r2.includes('Rs.50.00'));
  assert.ok(testPageBytes(80, 'X').length > 50);
});

console.log(`staff-test: ${n} groups passed`);
