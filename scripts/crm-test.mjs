// Unit tests for shared/crm.js (CRM module). Run: node scripts/crm-test.mjs
import assert from 'node:assert/strict';
import { cleanLead, pipelineSummary, bucketFollowUps, dueCount, leadToClient, customerTimeline, customerTotals, LEAD_STATUSES } from '../shared/crm.js';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

test('cleanLead validates and normalises', () => {
  assert.throws(() => cleanLead({ name: '  ' }), /need_name/);
  assert.throws(() => cleanLead({ name: 'A', status: 'bogus' }), /bad_status/);
  const l = cleanLead({ name: ' Ravi ', phone: '+91 98765-43210', value: '1500.555', source: 'xx' });
  assert.equal(l.name, 'Ravi'); assert.equal(l.phone, '+919876543210');
  assert.equal(l.value, 1500.56); assert.equal(l.source, 'other'); assert.equal(l.status, 'new');
  assert.equal(cleanLead({ name: 'x', value: -5 }).value, 0);
});

test('pipelineSummary counts, values and win rate', () => {
  const s = pipelineSummary([
    { status: 'new', value: 100 }, { status: 'quoted', value: 400 }, { status: 'won', value: 1000 },
    { status: 'won', value: 50 }, { status: 'lost', value: 999 }, { status: 'weird', value: 1 },
  ]);
  assert.deepEqual(LEAD_STATUSES.map(k => s[k].count), [2, 0, 1, 2, 1]);
  assert.equal(s.openValue, 501); assert.equal(s.wonValue, 1050); assert.equal(s.conversion, 67);
  assert.equal(pipelineSummary([]).conversion, 0);
});

test('bucketFollowUps splits overdue/today/upcoming and ignores done/notes', () => {
  const acts = [
    { kind: 'followup', due: '2026-10-01', text: 'a' }, { kind: 'followup', due: '2026-10-11', text: 'b' },
    { kind: 'followup', due: '2026-10-20', text: 'c' }, { kind: 'followup', due: '2026-10-05', done: true },
    { kind: 'note', due: '2026-10-01' }, { kind: 'followup', due: '' },
  ];
  const b = bucketFollowUps(acts, '2026-10-11');
  assert.deepEqual([b.overdue.length, b.today.length, b.upcoming.length], [1, 1, 1]);
  assert.equal(dueCount(acts, '2026-10-11'), 2);
});

test('leadToClient maps company leads', () => {
  const c = leadToClient({ name: 'Ravi', company: 'RK Stores', phone: '99', notes: [{ text: 'hi' }] });
  assert.equal(c.name, 'RK Stores'); assert.equal(c.contactPerson, 'Ravi'); assert.equal(c.notes, 'hi');
  assert.equal(leadToClient({ name: 'Ravi' }).name, 'Ravi');
});

test('customerTimeline merges bills, payments, receipts, notes without double count', () => {
  const client = { id: 'c1', name: 'Lakshmi R' };
  const bills = [
    { id: 'b1', invoiceNumber: 'INV-1', clientName: 'lakshmi r', invoiceDate: '2026-09-01', totalAmount: 1000, status: 'partial',
      payments: [{ date: '2026-09-02', amount: 300, mode: 'cash' }, { date: '2026-09-03', amount: 200, receiptNo: 'R-1' }] },
    { id: 'b2', invoiceNumber: 'CN-1', invoiceType: 'credit-note', clientName: 'Lakshmi R', invoiceDate: '2026-09-05', totalAmount: 100 },
    { id: 'b3', invoiceNumber: 'INV-9', clientName: 'Other', invoiceDate: '2026-09-05', totalAmount: 5000 },
    { id: 'b4', invoiceNumber: 'QT-1', invoiceType: 'quotation', data: { client: { id: 'c1' } }, invoiceDate: '2026-09-06', totalAmount: 7000 },
  ];
  const receipts = [{ id: 'r1', receiptNo: 'R-1', clientName: 'Lakshmi R', date: '2026-09-03', amount: 200 }, { id: 'r2', clientName: 'X', amount: 9 }];
  const activities = [{ id: 'a1', refType: 'client', refId: 'c1', kind: 'note', text: 'called', at: '2026-09-10T05:00:00Z' },
    { id: 'a2', refType: 'lead', refId: 'c1', kind: 'note', text: 'no' }];
  const ev = customerTimeline({ client, bills, receipts, activities });
  assert.equal(ev.filter(e => e.type === 'bill').length, 3);
  assert.equal(ev.filter(e => e.type === 'payment').length, 2);
  assert.equal(ev.filter(e => e.type === 'note').length, 1);
  assert.equal(ev[0].type, 'note');
  assert.deepEqual(customerTotals(ev), { billed: 900, paid: 500, balance: 400 });
});

console.log(`crm-test: ${n} groups passed`);
