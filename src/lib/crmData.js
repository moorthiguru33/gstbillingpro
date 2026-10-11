// CRM data (migration 006) on top of the generic module store.
import { listRecords, upsertRecords, deleteRecords, newId } from './modData.js';

export const CRM_TABLES = ['crm_leads', 'crm_activities'];
const leadCols = (l) => ({ name: l.name || '', phone: l.phone || '', status: l.status || 'new', value: Number(l.value) || 0, next_follow_up: l.nextFollowUp || null });
const actCols = (a) => ({ ref_type: a.refType, ref_id: String(a.refId), kind: a.kind || 'note', due_date: a.due || null, done: !!a.done });

export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const listLeads = () => listRecords('crm_leads');
export async function saveLead(lead) {
  const rec = { ...lead, id: lead.id || newId('lead'), createdAt: lead.createdAt || new Date().toISOString() };
  await upsertRecords('crm_leads', rec, leadCols);
  return rec;
}
export const deleteLead = (id) => deleteRecords('crm_leads', id);

export const listActivities = () => listRecords('crm_activities');
export async function saveActivity(a) {
  const rec = { ...a, id: a.id || newId('act'), at: a.at || new Date().toISOString() };
  await upsertRecords('crm_activities', rec, actCols);
  return rec;
}
export const deleteActivity = (id) => deleteRecords('crm_activities', id);

/** Earliest open follow-up date of a lead (stored on the lead for sorting). */
export function nextFollowUpFor(refId, activities) {
  const due = activities.filter(a => a.refType === 'lead' && a.refId === refId && a.kind === 'followup' && !a.done && a.due).map(a => a.due).sort();
  return due[0] || null;
}
