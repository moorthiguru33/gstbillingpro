// Business documents (migration 009, table biz_docs): payment-out,
// purchase returns, sale / purchase orders, cheques, cash adjustments and
// loans. Every record carries `biz` (the active business key) so one
// login with several businesses keeps them apart, like accounting does.
import { listRecords, upsertRecords, deleteRecords, newId } from './modData.js';
import { cleanDoc, nextDocNo, paidOutFor, purchaseOrderToBill } from '../../shared/txn.js';
import { getAllPurchases, savePurchase } from '../store';
import { belongsToProfile } from '../utils';

export const DOC_TABLE = 'biz_docs';
const cols = (d) => ({ kind: d.kind, doc_date: d.date, status: d.status || '', amount: Number(d.amount) || 0 });
export const bizKeyOf = (profile) => String(profile?.gstin || profile?.businessName || '').trim().toUpperCase();

export async function listDocs(profile) {
  const biz = bizKeyOf(profile);
  const rows = await listRecords(DOC_TABLE, { order: ['doc_date', false], limit: 20000 });
  return rows.filter(d => !d.biz || d.biz === biz);
}

export async function saveDoc(input, profile, all = []) {
  const d = cleanDoc(input);
  const rec = { ...d, id: d.id || newId(d.kind.replace('_', '')), biz: bizKeyOf(profile), no: d.no || nextDocNo(all, d.kind), createdAt: d.createdAt || new Date().toISOString() };
  await upsertRecords(DOC_TABLE, rec, cols);
  return rec;
}
export const deleteDoc = (id) => deleteRecords(DOC_TABLE, id);

/** Purchase bills of the active business (for Payment-Out / returns). */
export async function myPurchases(profile) {
  const rows = await getAllPurchases().catch(() => []);
  return (rows || []).filter(p => belongsToProfile(p, profile));
}

/** Payment-out against a purchase bill: saves the doc and updates the bill status. */
export async function payOut(input, profile, all, purchases) {
  const rec = await saveDoc(input, profile, all);
  const pu = rec.purchaseId && purchases.find(p => p.id === rec.purchaseId);
  if (pu) {
    const paid = paidOutFor(pu.id, [...all.filter(d => d.id !== rec.id), rec]);
    const total = Number(pu.totalAmount ?? pu.total) || 0;
    await savePurchase({ ...pu, paidAmount: paid, paymentStatus: paid >= total - 0.005 ? 'Paid' : 'Partial' });
  }
  return rec;
}

/** Purchase order -> purchase bill; marks the order converted. */
export async function convertPurchaseOrder(doc, profile, all) {
  const bill = purchaseOrderToBill(doc, profile);
  const saved = await savePurchase(bill);
  return saveDoc({ ...doc, status: 'converted', convertedTo: saved?.id || bill.id || '' }, profile, all);
}
