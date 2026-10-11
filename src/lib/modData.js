// ============================================================
// Generic data access for the Phase 4 module tables (store, CRM,
// accounting, payroll). Every table has: id TEXT, user_id UUID (org
// owner), a few indexed columns and `data` JSONB holding the record.
// Records go in and come out as plain objects ({ id, ...data }).
//
// The tables arrive through SQL migrations the owner runs by hand, so a
// deploy can be live before they exist: tableReady() detects a missing
// table and screens show a "being set up" state instead of failing.
// Demo mode keeps everything in sessionStorage.
// ============================================================
import { supabase } from './supabase.js';
import { isDemoModeActive } from '../store-supabase.js';
import { dataOwnerId } from './org.js';

export const isMissingTable = (err) => {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err.details || err.hint || '');
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883'
    || /does not exist|schema cache|could not find the (table|function)/i.test(msg);
};

const demoKey = (t) => `gst_demo_mod_${t}`;
export const demoRows = (t) => { try { return JSON.parse(sessionStorage.getItem(demoKey(t)) || '[]'); } catch { return []; } };
const setDemoRows = (t, rows) => { try { sessionStorage.setItem(demoKey(t), JSON.stringify(rows)); } catch { /* full */ } };

export async function ownerId() {
  if (isDemoModeActive()) return 'demo-guest';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return dataOwnerId() || session.user.id;
}

const ready = new Map();
/** Resolves 'ready' | 'missing' | 'error' for a table (cached per session). */
export function tableReady(table) {
  if (isDemoModeActive()) return Promise.resolve('ready');
  if (!ready.has(table)) {
    const p = (async () => {
      try {
        const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
        if (!error) return 'ready';
        return isMissingTable(error) ? 'missing' : 'error';
      } catch { return 'error'; }
    })();
    ready.set(table, p);
    p.then(v => { if (v !== 'ready') setTimeout(() => ready.delete(table), 60000); });
  }
  return ready.get(table);
}
export async function tablesReady(tables) {
  const res = await Promise.all(tables.map(tableReady));
  if (res.includes('missing')) return 'missing';
  if (res.includes('error')) return 'error';
  return 'ready';
}

export const newId = (prefix = 'r') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * listRecords(table, { eq: {col: val}, gte: [col, v], lte: [col, v], order: [col, asc], limit })
 * Filters apply to indexed columns (also used for demo rows via `cols`).
 */
export async function listRecords(table, { eq = {}, gte, lte, order = ['updated_at', false], limit = 5000, owner = 'user_id' } = {}) {
  if (isDemoModeActive()) {
    let rows = demoRows(table).filter(r => Object.entries(eq).every(([k, v]) => r._cols?.[k] === v));
    if (gte) rows = rows.filter(r => String(r._cols?.[gte[0]] ?? '') >= String(gte[1]));
    if (lte) rows = rows.filter(r => String(r._cols?.[lte[0]] ?? '') <= String(lte[1]));
    return rows.map(r => r.rec);
  }
  const uid = await ownerId();
  let q = supabase.from(table).select('*').eq(owner, uid);
  for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
  if (gte) q = q.gte(gte[0], gte[1]);
  if (lte) q = q.lte(lte[0], lte[1]);
  if (order) q = q.order(order[0], { ascending: !!order[1] });
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  return (data || []).map(r => ({ ...(r.data || {}), id: r.id }));
}

/** upsertRecords(table, records, cols(rec) => indexed column values) */
export async function upsertRecords(table, records, cols = () => ({}), { owner = 'user_id' } = {}) {
  const list = (Array.isArray(records) ? records : [records]).map(r => ({ ...r, id: r.id || newId(table.slice(0, 3)) }));
  if (isDemoModeActive()) {
    const rows = demoRows(table);
    for (const rec of list) {
      const i = rows.findIndex(x => x.rec.id === rec.id);
      const row = { rec, _cols: cols(rec) };
      if (i >= 0) rows[i] = row; else rows.unshift(row);
    }
    setDemoRows(table, rows);
    return list;
  }
  const uid = await ownerId();
  const now = new Date().toISOString();
  const payload = list.map(rec => {
    const { id, ...data } = rec;
    return { id, [owner]: uid, ...cols(rec), data, updated_at: now };
  });
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from(table).upsert(payload.slice(i, i + 500), { onConflict: `${owner},id` });
    if (error) throw error;
  }
  return list;
}

export async function deleteRecords(table, ids, { owner = 'user_id' } = {}) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  if (isDemoModeActive()) { setDemoRows(table, demoRows(table).filter(r => !list.includes(r.rec.id))); return; }
  const uid = await ownerId();
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await supabase.from(table).delete().eq(owner, uid).in('id', list.slice(i, i + 200));
    if (error) throw error;
  }
}

// Small key/value settings per module (stored in the existing `meta` table).
export async function getModuleSetting(key, fallback) {
  if (isDemoModeActive()) { try { const v = sessionStorage.getItem(`gst_demo_set_${key}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
  const uid = await ownerId();
  const { data } = await supabase.from('meta').select('value').eq('user_id', uid).eq('key', key).maybeSingle();
  return data?.value ?? fallback;
}
export async function setModuleSetting(key, value) {
  if (isDemoModeActive()) { try { sessionStorage.setItem(`gst_demo_set_${key}`, JSON.stringify(value)); } catch { /* full */ } return; }
  const uid = await ownerId();
  const { error } = await supabase.from('meta').upsert({ user_id: uid, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  if (error) throw error;
}
