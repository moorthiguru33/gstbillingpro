// Payroll data (migration 008) on the generic module store. Marking a
// salary paid also posts an expense voucher to accounting (007) when the
// accounting tables exist.
import { listRecords, upsertRecords, deleteRecords, newId, tablesReady } from './modData.js';
import { ACC_TABLES, loadBooks } from './accData.js';
import { attId, salaryId, salaryVoucher, advanceVoucher } from '../../shared/payroll.js';

export const PAY_TABLES = ['pay_employees', 'pay_attendance', 'pay_advances', 'pay_salaries'];
const empCols = (e) => ({ name: e.name || '', active: e.active !== false });
const attCols = (a) => ({ emp_id: a.empId, month: a.month });
const advCols = (a) => ({ emp_id: a.empId });
const salCols = (s) => ({ emp_id: s.empId, month: s.month, status: s.status || 'paid', net: Number(s.calc?.net) || 0 });
const vCols = (v) => ({ vdate: v.date, vtype: v.type || 'journal', source: v.source || 'manual' });

export const listEmployees = () => listRecords('pay_employees', { order: ['name', true] });
export const saveEmployee = (e) => upsertRecords('pay_employees', { ...e, id: e.id || newId('emp') }, empCols).then(r => r[0]);
export const deleteEmployee = (id) => deleteRecords('pay_employees', id);

export const listAttendance = (month) => listRecords('pay_attendance', { eq: { month } });
/** Set one or more days: changes = [{ empId, date, code|null }]. Returns updated month records. */
export async function markAttendance(month, current, changes) {
  const byEmp = new Map(current.map(a => [a.empId, { ...a, days: { ...(a.days || {}) } }]));
  for (const c of changes) {
    const rec = byEmp.get(c.empId) || { id: attId(c.empId, month), empId: c.empId, month, days: {} };
    if (c.code) rec.days[c.date] = c.code; else delete rec.days[c.date];
    byEmp.set(c.empId, rec);
  }
  const touched = [...new Set(changes.map(c => c.empId))].map(id => byEmp.get(id));
  await upsertRecords('pay_attendance', touched, attCols);
  return [...byEmp.values()];
}

export const listAdvances = () => listRecords('pay_advances', { order: ['updated_at', false] });
export const listSalaries = () => listRecords('pay_salaries', { order: ['month', false] });

async function accountingTarget(biz) {
  if ((await tablesReady(ACC_TABLES)) !== 'ready') return null;
  try { const b = await loadBooks(biz); return { bankId: b.settings.bankId || 'bank' }; } catch { return null; }
}
const postVoucher = (v) => upsertRecords('acc_vouchers', v, vCols);

/** Records an advance/loan and posts it to accounting. Returns { adv, posted }. */
export async function saveAdvance(adv, { biz, emp }) {
  const rec = { ...adv, id: adv.id || newId('adv') };
  await upsertRecords('pay_advances', rec, advCols);
  const acc = await accountingTarget(biz);
  if (acc) await postVoucher(advanceVoucher({ biz, emp, adv: rec, bankId: acc.bankId })).catch(() => {});
  return { adv: rec, posted: !!acc };
}
export async function deleteAdvance(adv, { biz }) {
  await deleteRecords('pay_advances', adv.id);
  if ((await tablesReady(ACC_TABLES)) === 'ready') await deleteRecords('acc_vouchers', `payroll:${biz}:adv:${adv.id}`).catch(() => {});
}

/** Mark salary paid: saves the snapshot and posts the salary voucher. */
export async function markSalaryPaid({ biz, emp, calc, adj, paidOn, mode }) {
  const rec = { id: salaryId(emp.id, calc.month), empId: emp.id, empName: emp.name, month: calc.month, status: 'paid', calc, adj, paidOn, mode };
  await upsertRecords('pay_salaries', rec, salCols);
  const acc = await accountingTarget(biz);
  if (acc) await postVoucher(salaryVoucher({ biz, emp, calc, paidOn, mode, bankId: acc.bankId }));
  return { rec, posted: !!acc };
}
export async function undoSalaryPaid({ biz, empId, month }) {
  await deleteRecords('pay_salaries', salaryId(empId, month));
  if ((await tablesReady(ACC_TABLES)) === 'ready') await deleteRecords('acc_vouchers', `payroll:${biz}:sal:${empId}:${month}`).catch(() => {});
}
