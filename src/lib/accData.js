// Accounting data (migration 007): stored vouchers + accounts, and the
// sync that derives auto vouchers from bills / purchases / expenses /
// receipts. Books are kept per business profile (same rule as the rest of
// the app: belongsToProfile), tagged with `biz` on every voucher.
import { listRecords, upsertRecords, deleteRecords, newId, tableReady } from './modData.js';
import { activeRole } from './org.js';
import { getAllBills, getAllPurchases, getAllExpenses, getAllReceipts } from '../store-supabase.js';
import { belongsToProfile, countsAsSales, isCreditNote } from '../utils.js';
import { deriveVouchers, planSync, fyStartYear, fyRange } from '../../shared/accounting.js';
import { deriveDocVouchers, purchasesPaidByDocs } from '../../shared/txn.js';

export const ACC_TABLES = ['acc_accounts', 'acc_vouchers'];
export const canWriteBooks = () => ['owner', 'manager', 'accountant'].includes(activeRole());
export const bizKeyOf = (profile) => (String(profile?.gstin || profile?.businessName || 'default').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 32) || 'DEFAULT');

const vCols = (v) => ({ vdate: v.date, vtype: v.type || 'journal', source: v.source || 'manual' });
const aCols = (a) => ({ kind: a.kind === 'settings' ? 'settings' : 'account' });
const mine = (biz) => (v) => !v.biz || v.biz === biz;

export async function loadBooks(biz) {
  const [accRows, vouchers] = await Promise.all([listRecords('acc_accounts', { limit: 2000 }), listRecords('acc_vouchers', { order: ['vdate', true], limit: 100000 })]);
  const settings = accRows.find(a => a.id === `_settings:${biz}`) || { id: `_settings:${biz}`, kind: 'settings' };
  return { accounts: accRows.filter(a => a.kind !== 'settings'), vouchers: vouchers.filter(mine(biz)), settings };
}

export const saveSettings = (settings) => upsertRecords('acc_accounts', { ...settings, kind: 'settings' }, aCols).then(r => r[0]);
export const saveAccount = (acc) => upsertRecords('acc_accounts', { ...acc, kind: 'account', id: acc.id || newId('acc') }, aCols).then(r => r[0]);
export const deleteAccount = (id) => deleteRecords('acc_accounts', id);

/** Next number like JV-3 for a manual voucher type within its FY. */
export function nextVoucherNo(vouchers, type, date) {
  const pre = { journal: 'JV', payment: 'PV', receipt: 'RV', contra: 'CV' }[type] || 'V';
  const { from, to } = fyRange(fyStartYear(date));
  let max = 0;
  for (const v of vouchers) {
    if (v.source === 'auto' || v.type !== type || v.date < from || v.date > to) continue;
    const m = /-(\d+)$/.exec(v.no || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${pre}-${max + 1}`;
}
export async function saveVoucher(v, biz) {
  const rec = { ...v, id: v.id || newId('jv'), biz, source: v.source || 'manual', createdAt: v.createdAt || new Date().toISOString() };
  await upsertRecords('acc_vouchers', rec, vCols);
  return rec;
}
export const deleteVoucher = (id) => deleteRecords('acc_vouchers', id);

/** Derive auto vouchers for this business and write only the differences. */
export async function syncAutoVouchers({ biz, profile, stored, bankId }) {
  const [bills, purchases, expenses, receipts] = await Promise.all([
    getAllBills().catch(() => []), getAllPurchases().catch(() => []), getAllExpenses().catch(() => []), getAllReceipts().catch(() => []),
  ]);
  const own = (r) => belongsToProfile(r, profile);
  const billKind = (b) => (countsAsSales(b) ? 'sale' : (isCreditNote(b) ? 'credit' : null));
  // Payment-out, returns, cheques, cash and loans (migration 009) when present.
  const docs = (await tableReady('biz_docs')) === 'ready' ? (await listRecords('biz_docs', { limit: 50000 }).catch(() => [])).filter(d => !d.biz || d.biz === biz) : [];
  const derived = [...deriveVouchers({ bills: bills.filter(own), purchases: purchases.filter(own), expenses: expenses.filter(own), receipts: receipts.filter(own), billKind, bankId, paidByDocs: purchasesPaidByDocs(docs) }),
    ...deriveDocVouchers(docs, { bankId })]
    .map(v => ({ ...v, id: v.id.replace(/^auto:/, `auto:${biz}:`), biz }));
  const { upserts, deletes } = planSync(derived, stored.filter(v => v.source === 'auto' && (v.biz === biz)));
  if (upserts.length) await upsertRecords('acc_vouchers', upserts, vCols);
  if (deletes.length) await deleteRecords('acc_vouchers', deletes);
  return { added: upserts.length, removed: deletes.length, total: derived.length };
}
