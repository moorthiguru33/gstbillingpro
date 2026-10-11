// Unit tests for shared/payroll.js. Run: node scripts/payroll-test.mjs
import assert from 'node:assert/strict';
import { cleanEmployee, attendanceSummary, calcSalary, advanceBalance, suggestedRecovery, salaryVoucher, advanceVoucher, daysInMonth, monthDates, slipText } from '../shared/payroll.js';
import { validateVoucher } from '../shared/accounting.js';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const days = (map) => ({ days: Object.fromEntries(Object.entries(map).map(([d, c]) => [`2026-02-${d}`, c])) });

test('cleanEmployee validates', () => {
  assert.throws(() => cleanEmployee({ name: '' }), /need_name/);
  assert.throws(() => cleanEmployee({ name: 'Ravi', salary: 0 }), /need_salary/);
  const e = cleanEmployee({ name: ' Ravi ', salary: '15000', salaryType: 'weird', phone: '98765 43210', paidLeaves: 50 });
  assert.equal(e.name, 'Ravi'); assert.equal(e.salaryType, 'monthly'); assert.equal(e.phone, '9876543210'); assert.equal(e.paidLeaves, 31); assert.equal(e.hoursPerDay, 8);
});

test('month helpers and attendance summary', () => {
  assert.equal(daysInMonth('2026-02'), 28); assert.equal(daysInMonth('2028-02'), 29); assert.equal(monthDates('2026-04').length, 30);
  const s = attendanceSummary(days({ '01': 'P', '02': 'A', '03': 'H', '04': 'L', '05': 'X' }).days, '2026-02', '2026-02-10');
  assert.deepEqual([s.P, s.A, s.H, s.L, s.unmarked, s.total], [1, 1, 1, 1, 6, 28]);
});

test('monthly salary: loss of pay for absent, half-days and unpaid leave', () => {
  const emp = { salaryType: 'monthly', salary: 28000, paidLeaves: 1 };
  const att = days({ '02': 'A', '03': 'H', '04': 'L', '05': 'L' });
  const c = calcSalary(emp, att, '2026-02', { bonus: 500, recovery: 2000, otherDeduction: 100 });
  assert.equal(c.lopDays, 2.5); // 1 A + 0.5 H + 1 unpaid L
  assert.equal(c.base, 25500); assert.equal(c.gross, 26000); assert.equal(c.net, 23900);
  assert.equal(calcSalary(emp, null, '2026-02').net, 28000);
});

test('daily and hourly wages', () => {
  const att = days({ '01': 'P', '02': 'P', '03': 'H', '04': 'A', '05': 'L' });
  assert.equal(calcSalary({ salaryType: 'daily', salary: 600, paidLeaves: 0 }, att, '2026-02').base, 1500);
  assert.equal(calcSalary({ salaryType: 'daily', salary: 600, paidLeaves: 1 }, att, '2026-02').base, 2100);
  const h = calcSalary({ salaryType: 'hourly', salary: 100, hoursPerDay: 8 }, att, '2026-02', { extraHours: 3, overtime: 50 });
  assert.equal(h.hours, 23); assert.equal(h.base, 2300); assert.equal(h.gross, 2350);
});

test('deductions never exceed pay', () => {
  const c = calcSalary({ salaryType: 'daily', salary: 500 }, days({ '01': 'P' }), '2026-02', { recovery: 9999, otherDeduction: 50 });
  assert.equal(c.recovery, 500); assert.equal(c.otherDeduction, 0); assert.equal(c.net, 0);
});

test('advances: balance and suggested recovery', () => {
  const adv = [{ empId: 'e1', amount: 3000, kind: 'advance' }, { empId: 'e1', amount: 12000, kind: 'loan', installment: 2000 }, { empId: 'e2', amount: 100 }];
  assert.equal(advanceBalance('e1', adv, []), 15000);
  assert.equal(suggestedRecovery('e1', adv, []), 5000);
  const paid = [{ empId: 'e1', status: 'paid', calc: { recovery: 5000 } }];
  assert.equal(advanceBalance('e1', adv, paid), 10000);
  assert.equal(suggestedRecovery('e1', adv, paid), 2000);
  assert.equal(suggestedRecovery('e3', adv, []), 0);
});

test('accounting vouchers balance', () => {
  const emp = { id: 'e1', name: 'Ravi' };
  const calc = calcSalary({ salaryType: 'monthly', salary: 20000 }, null, '2026-02', { recovery: 2000, otherDeduction: 100, bonus: 1000 });
  const v = salaryVoucher({ biz: 'B', emp, calc, paidOn: '2026-03-01', mode: 'UPI', bankId: 'bank_sbi' });
  assert.equal(v.id, 'payroll:B:sal:e1:2026-02'); assert.equal(v.source, 'payroll'); assert.equal(validateVoucher(v), '');
  assert.deepEqual(v.lines.map(l => [l.a, l.dr, l.cr]), [['salaries', 21000, 0], ['staff_adv', 0, 2000], ['other_income', 0, 100], ['bank_sbi', 0, 18900]]);
  const a = advanceVoucher({ biz: 'B', emp, adv: { id: 'a1', date: '2026-02-10', amount: 3000, mode: 'Cash' } });
  assert.equal(validateVoucher(a), ''); assert.equal(a.lines[1].a, 'cash');
  assert.match(slipText({ emp, calc, business: 'Apex', monthLabel: 'February 2026' }), /Net pay: ₹18900\.00/);
});

console.log(`payroll-test: ${n} groups passed`);
