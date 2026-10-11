// ============================================================
// Payroll — pure helpers (attendance, salary calculation, advances,
// accounting postings). Used by src/components/payroll/* and tested in
// scripts/payroll-test.mjs.
// ============================================================
import { r2 } from './accounting.js';

export const SALARY_TYPES = Object.freeze(['monthly', 'daily', 'hourly']);
export const ATT_CODES = Object.freeze(['P', 'A', 'H', 'L']); // present, absent, half-day, leave
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const daysInMonth = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const monthOf = (date) => String(date || '').slice(0, 7);
export const monthDates = (month) => Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
export const attId = (empId, month) => `${empId}:${month}`;
export const salaryId = (empId, month) => `${empId}:${month}`;

export function cleanEmployee(e = {}) {
  const name = String(e.name || '').trim().slice(0, 100);
  if (!name) throw new Error('need_name');
  const type = SALARY_TYPES.includes(e.salaryType) ? e.salaryType : 'monthly';
  const amount = r2(Math.max(0, num(e.salary)));
  if (!amount) throw new Error('need_salary');
  return {
    ...e,
    name,
    phone: String(e.phone || '').replace(/[^\d+]/g, '').slice(0, 16),
    role: String(e.role || '').trim().slice(0, 60),
    salaryType: type,
    salary: amount,
    hoursPerDay: Math.min(24, Math.max(1, num(e.hoursPerDay) || 8)),
    paidLeaves: Math.min(31, Math.max(0, num(e.paidLeaves))),
    joinDate: String(e.joinDate || '').slice(0, 10),
    active: e.active !== false,
  };
}

/** Counts for a month of attendance { 'YYYY-MM-DD': 'P'|'A'|'H'|'L' }. Days after `upto` are ignored. */
export function attendanceSummary(days = {}, month, upto) {
  const s = { P: 0, A: 0, H: 0, L: 0, unmarked: 0, total: daysInMonth(month) };
  for (const d of monthDates(month)) {
    if (upto && d > upto) continue;
    const c = days[d];
    if (ATT_CODES.includes(c)) s[c] += 1; else s.unmarked += 1;
  }
  return s;
}

/**
 * Salary for one employee-month.
 *  monthly: salary − per-day × (absent + ½ half-days + unpaid leave); unmarked days count as paid
 *           (weekly offs / holidays are usually not marked)
 *  daily:   rate × (present + ½ half-days + paid leave)
 *  hourly:  rate × hours/day × (present + ½ half-days + paid leave) + extra hours
 * adj: { bonus, overtime, extraHours, otherDeduction, recovery }
 */
export function calcSalary(emp, att, month, adj = {}) {
  const s = attendanceSummary(att?.days || {}, month);
  const paidLeave = Math.min(s.L, num(emp.paidLeaves));
  const unpaidLeave = s.L - paidLeave;
  const worked = s.P + s.H * 0.5 + paidLeave;
  let base = 0; let perDay = 0; let lop = 0; let hours = 0;
  if (emp.salaryType === 'daily') {
    perDay = num(emp.salary); base = perDay * worked;
  } else if (emp.salaryType === 'hourly') {
    hours = (num(emp.hoursPerDay) || 8) * worked + num(adj.extraHours);
    base = num(emp.salary) * hours;
  } else {
    perDay = num(emp.salary) / s.total;
    lop = s.A + s.H * 0.5 + unpaidLeave;
    base = num(emp.salary) - perDay * lop;
  }
  base = r2(Math.max(0, base));
  const additions = r2(num(adj.bonus) + num(adj.overtime));
  const gross = r2(base + additions);
  const recovery = r2(Math.min(Math.max(0, num(adj.recovery)), gross));
  const other = r2(Math.min(Math.max(0, num(adj.otherDeduction)), gross - recovery));
  return { month, summary: s, paidLeave, unpaidLeave, worked, lopDays: lop, perDay: r2(perDay), hours, base, bonus: r2(adj.bonus), overtime: r2(adj.overtime), additions, gross, recovery, otherDeduction: other, net: r2(gross - recovery - other) };
}

/** Outstanding advance/loan of an employee: given − recovered in paid salaries. */
export function advanceBalance(empId, advances = [], salaries = []) {
  const given = advances.filter(a => a.empId === empId).reduce((s, a) => s + num(a.amount), 0);
  const back = salaries.filter(x => x.empId === empId && x.status === 'paid').reduce((s, x) => s + num(x.calc?.recovery), 0);
  return r2(given - back);
}
/** Suggested recovery this month: loans by their monthly instalment, advances in full. */
export function suggestedRecovery(empId, advances = [], salaries = []) {
  const bal = advanceBalance(empId, advances, salaries);
  if (bal <= 0) return 0;
  const mine = advances.filter(a => a.empId === empId);
  const loanInst = mine.filter(a => a.kind === 'loan').reduce((s, a) => s + num(a.installment), 0);
  const plainAdv = mine.filter(a => a.kind !== 'loan').reduce((s, a) => s + num(a.amount), 0);
  const recovered = salaries.filter(x => x.empId === empId && x.status === 'paid').reduce((s, x) => s + num(x.calc?.recovery), 0);
  const advLeft = Math.max(0, plainAdv - recovered);
  return r2(Math.min(bal, advLeft + loanInst));
}

const payAcc = (mode, bankId) => (/cash/i.test(String(mode || 'cash')) ? 'cash' : (bankId || 'bank'));
/** Accounting voucher for a paid salary (posted as an expense). */
export function salaryVoucher({ biz, emp, calc, paidOn, mode, bankId }) {
  const lines = [{ a: 'salaries', dr: calc.gross, cr: 0 }];
  if (calc.recovery) lines.push({ a: 'staff_adv', dr: 0, cr: calc.recovery, p: emp.name });
  if (calc.otherDeduction) lines.push({ a: 'other_income', dr: 0, cr: calc.otherDeduction });
  if (calc.net) lines.push({ a: payAcc(mode, bankId), dr: 0, cr: calc.net });
  return { id: `payroll:${biz}:sal:${emp.id}:${calc.month}`, date: paidOn, type: 'salary', no: `SAL-${calc.month}`, narration: `Salary ${calc.month} — ${emp.name}`, source: 'payroll', biz, lines: lines.filter(l => l.dr || l.cr) };
}
/** Accounting voucher for an advance / loan given to an employee. */
export function advanceVoucher({ biz, emp, adv, bankId }) {
  return { id: `payroll:${biz}:adv:${adv.id}`, date: adv.date, type: 'payment', no: `ADV-${adv.date}`, narration: `${adv.kind === 'loan' ? 'Loan' : 'Advance'} to ${emp.name}`, source: 'payroll', biz, lines: [{ a: 'staff_adv', dr: r2(adv.amount), cr: 0, p: emp.name }, { a: payAcc(adv.mode, bankId), dr: 0, cr: r2(adv.amount) }] };
}

/** Text for WhatsApp with the slip. */
export function slipText({ emp, calc, business, monthLabel }) {
  return [
    `*${business || ''}* — Salary slip ${monthLabel}`,
    `${emp.name}${emp.role ? ` (${emp.role})` : ''}`,
    `Days: P ${calc.summary.P}, H ${calc.summary.H}, L ${calc.summary.L}, A ${calc.summary.A}`,
    `Gross: ₹${calc.gross.toFixed(2)}`,
    calc.recovery ? `Advance recovery: −₹${calc.recovery.toFixed(2)}` : '',
    calc.otherDeduction ? `Other deductions: −₹${calc.otherDeduction.toFixed(2)}` : '',
    `*Net pay: ₹${calc.net.toFixed(2)}*`,
  ].filter(Boolean).join('\n');
}
