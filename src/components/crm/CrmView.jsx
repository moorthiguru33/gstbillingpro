import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, UserPlus, Phone, MessageCircle, Bell, Search, Plus, Trash2, UserCheck, CalendarClock, FileText, IndianRupee, StickyNote, Check, RefreshCw,
} from 'lucide-react';
import PageHeader from '../PageHeader';
import BottomSheet from '../mobile/BottomSheet';
import ModuleGate, { ModuleTabs, EmptyState } from '../modules/ModuleGate';
import { toast } from '../Toast';
import { confirmAction } from '../ConfirmModal';
import { t as tr } from '../../i18n';
import { formatCurrency } from '../../utils';
import { openInNewTab, whatsAppUrl } from '../../utils/share';
import { getAllClients, getAllBills, getAllReceipts, saveClient } from '../../store-supabase';
import { roleCan } from '../../lib/org';
import { CRM_TABLES, listLeads, saveLead, deleteLead, listActivities, saveActivity, deleteActivity, nextFollowUpFor, todayISO } from '../../lib/crmData';
import { LEAD_STATUSES, LEAD_SOURCES, OPEN_STATUSES, cleanLead, pipelineSummary, bucketFollowUps, leadToClient, customerTimeline, customerTotals } from '../../../shared/crm.js';

const CHIP = { new: 'amber', contacted: '', quoted: '', won: 'green', lost: 'red' };
const fmtDay = (d) => { try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } };
const tel = (p) => String(p || '').replace(/[^\d+]/g, '');

export default function CrmView(props) {
  return (
    <ModuleGate module="crm" tables={CRM_TABLES} title={tr('crm.title')} icon={<Users size={22} />}>
      <CrmScreen {...props} />
    </ModuleGate>
  );
}

function ContactButtons({ phone, message }) {
  if (!phone) return null;
  return (
    <>
      <a className="mod-icon-btn call" href={`tel:${tel(phone)}`} aria-label={tr('mod.call')} onClick={e => e.stopPropagation()}><Phone size={18} /></a>
      <button type="button" className="mod-icon-btn wa" aria-label="WhatsApp" onClick={(e) => { e.stopPropagation(); openInNewTab(whatsAppUrl(phone, message || '')); }}><MessageCircle size={18} /></button>
    </>
  );
}

function CrmScreen({ sub, onSub }) {
  const [leads, setLeads] = useState([]);
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // lead object or {} for new
  const tab = ['followups', 'customers'].includes(sub) ? sub : '';
  const today = todayISO();

  const reload = useCallback(() => Promise.all([listLeads(), listActivities()]).then(([l, a]) => {
    setLeads(l); setActs(a); setLoading(false);
  }, (e) => { console.warn(e); toast(tr('mod.loadError'), 'error'); setLoading(false); }), []);
  useEffect(() => { reload(); }, [reload]);

  const buckets = useMemo(() => bucketFollowUps(acts, today), [acts, today]);
  const due = buckets.overdue.length + buckets.today.length;

  const upsertLead = async (lead) => {
    const saved = await saveLead(lead);
    setLeads(prev => [saved, ...prev.filter(x => x.id !== saved.id)]);
    return saved;
  };
  const addActivity = async (a) => {
    const saved = await saveActivity(a);
    const next = [saved, ...acts.filter(x => x.id !== saved.id)];
    setActs(next);
    if (a.refType === 'lead') {
      const lead = leads.find(l => l.id === a.refId);
      if (lead) await upsertLead({ ...lead, nextFollowUp: nextFollowUpFor(lead.id, next) });
    }
    return saved;
  };
  const removeActivity = async (a) => {
    await deleteActivity(a.id);
    const next = acts.filter(x => x.id !== a.id);
    setActs(next);
    if (a.refType === 'lead') {
      const lead = leads.find(l => l.id === a.refId);
      if (lead) await upsertLead({ ...lead, nextFollowUp: nextFollowUpFor(lead.id, next) });
    }
  };

  const tabs = [
    { id: '', label: tr('crm.tabLeads'), icon: Users },
    { id: 'followups', label: tr('crm.tabFollowUps'), icon: Bell, badge: due || null },
    { id: 'customers', label: tr('crm.tabCustomers'), icon: UserCheck },
  ];
  const ctx = { leads, acts, today, upsertLead, addActivity, removeActivity, openLead: setEditing };
  return (
    <div className="mod-page">
      <PageHeader icon={<Users size={20} />} title={tr('crm.title')} subtitle={tr('crm.subtitle')}>
        <button type="button" className="mod-icon-btn" onClick={() => { setLoading(true); reload(); }} aria-label={tr('mod.refresh')}><RefreshCw size={18} /></button>
      </PageHeader>
      <ModuleTabs tabs={tabs} active={tab} onChange={onSub} />
      {loading ? <div className="mod-card mod-muted">{tr('mod.loading')}</div> : (
        <>
          {tab === '' && <LeadsTab {...ctx} />}
          {tab === 'followups' && <FollowUpsTab {...ctx} buckets={buckets} />}
          {tab === 'customers' && <CustomersTab {...ctx} />}
        </>
      )}
      {tab === '' && roleCan('write') && (
        <button type="button" className="btn btn-primary mod-fab" onClick={() => setEditing({})}><UserPlus size={18} /> {tr('crm.addLead')}</button>
      )}
      {editing && <LeadSheet lead={editing} onClose={() => setEditing(null)} {...ctx} onDeleted={(id) => { setLeads(prev => prev.filter(l => l.id !== id)); setEditing(null); }} />}
    </div>
  );
}

function LeadsTab({ leads, openLead }) {
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const sum = useMemo(() => pipelineSummary(leads), [leads]);
  const list = leads
    .filter(l => (filter === 'open' ? OPEN_STATUSES.includes(l.status) : filter === 'all' || l.status === filter))
    .filter(l => !q || `${l.name} ${l.phone} ${l.company || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999') || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return (
    <>
      <div className="mod-grid" style={{ marginBottom: 10 }}>
        <div className="mod-stat"><span className="mod-muted">{tr('crm.openValue')}</span><b>{formatCurrency(sum.openValue)}</b></div>
        <div className="mod-stat"><span className="mod-muted">{tr('crm.wonValue')}</span><b>{formatCurrency(sum.wonValue)}</b></div>
        <div className="mod-stat"><span className="mod-muted">{tr('crm.conversion')}</span><b>{sum.conversion}%</b></div>
      </div>
      <div className="mod-tabs" aria-label={tr('crm.pipeline')}>
        {['open', ...LEAD_STATUSES, 'all'].map(s => (
          <button type="button" key={s} className={`mod-tab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'open' ? tr('crm.fOpen') : s === 'all' ? tr('crm.fAll') : tr(`crm.st_${s}`)}
            {LEAD_STATUSES.includes(s) ? <b className="mod-tab-badge" style={{ background: '#64748b' }}>{sum[s].count}</b> : null}
          </button>
        ))}
      </div>
      <div className="mod-toolbar">
        <input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder={tr('crm.searchLeads')} />
      </div>
      {!list.length ? <EmptyState icon={Users} text={tr('crm.noLeads')} /> : (
        <div className="mod-list">
          {list.map(l => (
            <div key={l.id} className="mod-row" role="button" tabIndex={0} data-testid="crm-lead" onClick={() => openLead(l)} onKeyDown={e => { if (e.key === 'Enter') openLead(l); }} style={{ cursor: 'pointer' }}>
              <div className="mod-row-main">
                <div className="mod-row-title">{l.name}{l.company ? ` · ${l.company}` : ''}</div>
                <div className="mod-row-sub">
                  <span className={`mod-chip ${CHIP[l.status] || ''}`}>{tr(`crm.st_${l.status}`)}</span>{' '}
                  {tr(`crm.src_${l.source || 'other'}`)}{l.nextFollowUp ? ` · 🔔 ${fmtDay(l.nextFollowUp)}` : ''}
                </div>
              </div>
              {l.value ? <div className="mod-amt">{formatCurrency(l.value)}</div> : null}
              <ContactButtons phone={l.phone} message={tr('crm.waHello', { name: l.name })} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function LeadSheet({ lead, onClose, acts, today, upsertLead, addActivity, removeActivity, onDeleted }) {
  const [form, setForm] = useState(() => ({ status: 'new', source: 'walkin', ...lead }));
  const isNew = !form.id;
  const [note, setNote] = useState('');
  const [fu, setFu] = useState({ due: today, text: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const mine = acts.filter(a => a.refType === 'lead' && a.refId === form.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const canWrite = roleCan('write');

  const save = async (patch = {}, close = true) => {
    let clean;
    try { clean = cleanLead({ ...form, ...(form.id ? { nextFollowUp: nextFollowUpFor(form.id, acts) } : {}), ...patch }); } catch (e) { toast(tr(e.message === 'need_name' ? 'crm.errName' : 'mod.saveError'), 'warning'); return null; }
    setBusy(true);
    try {
      const saved = await upsertLead(clean);
      setForm(saved);
      if (close) { toast(tr('crm.saved'), 'success'); onClose(); }
      return saved;
    } catch (e) { console.warn(e); toast(tr('mod.saveError'), 'error'); return null; } finally { setBusy(false); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    const saved = form.id ? form : await save({}, false);
    if (!saved) return;
    await addActivity({ refType: 'lead', refId: saved.id, refName: saved.name, kind: 'note', text: note.trim() }).catch(() => toast(tr('mod.saveError'), 'error'));
    setNote('');
  };
  const addFollowUp = async () => {
    if (!fu.due) return;
    const saved = form.id ? form : await save({}, false);
    if (!saved) return;
    await addActivity({ refType: 'lead', refId: saved.id, refName: saved.name, phone: saved.phone, kind: 'followup', due: fu.due, text: fu.text.trim() || tr('crm.followUpDefault') })
      .then(() => toast(tr('crm.followUpAdded'), 'success'), () => toast(tr('mod.saveError'), 'error'));
    setFu({ due: today, text: '' });
  };
  const convert = async () => {
    const saved = await save({ status: 'won' }, false);
    if (!saved) return;
    try {
      const draft = leadToClient(saved);
      if (saved.clientId) draft.id = saved.clientId;
      const client = await saveClient(draft);
      const withClient = await upsertLead({ ...saved, status: 'won', clientId: client.id });
      setForm(withClient);
      toast(tr('crm.converted', { name: client.name }), 'success');
    } catch (e) { console.warn(e); toast(tr('mod.saveError'), 'error'); }
  };
  const remove = async () => {
    if (!(await confirmAction({ title: tr('crm.deleteLead'), message: form.name, tone: 'danger', confirmLabel: tr('mod.delete'), cancelLabel: tr('mod.cancel') }))) return;
    try {
      await deleteLead(form.id);
      for (const a of mine) await removeActivity(a).catch(() => {});
      onDeleted(form.id);
    } catch { toast(tr('mod.saveError'), 'error'); }
  };

  return (
    <BottomSheet title={isNew ? tr('crm.newLead') : form.name} onClose={onClose}>
      <div className="mod-form two" style={{ paddingBottom: 8 }}>
        <label>{tr('crm.name')}<input className="form-input" value={form.name || ''} onChange={e => set('name', e.target.value)} maxLength={100} autoFocus={isNew} /></label>
        <label>{tr('crm.phone')}<input className="form-input" type="tel" inputMode="tel" value={form.phone || ''} onChange={e => set('phone', e.target.value)} maxLength={16} /></label>
        <label>{tr('crm.company')}<input className="form-input" value={form.company || ''} onChange={e => set('company', e.target.value)} maxLength={100} /></label>
        <label>{tr('crm.email')}<input className="form-input" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} maxLength={120} /></label>
        <label>{tr('crm.source')}
          <select className="form-input" value={form.source || 'other'} onChange={e => set('source', e.target.value)}>
            {LEAD_SOURCES.map(s => <option key={s} value={s}>{tr(`crm.src_${s}`)}</option>)}
          </select>
        </label>
        <label>{tr('crm.value')}<input className="form-input" type="number" inputMode="decimal" min="0" value={form.value ?? ''} onChange={e => set('value', e.target.value)} /></label>
      </div>
      <div className="mod-muted" style={{ fontWeight: 700, margin: '4px 0' }}>{tr('crm.status')}</div>
      <div className="mod-tabs">
        {LEAD_STATUSES.map(s => (
          <button type="button" key={s} className={`mod-tab${form.status === s ? ' active' : ''}`} onClick={() => set('status', s)}>{tr(`crm.st_${s}`)}</button>
        ))}
      </div>
      {form.phone ? <div className="mod-actions" style={{ marginTop: 0 }}><ContactButtons phone={form.phone} message={tr('crm.waHello', { name: form.name })} /></div> : null}
      {canWrite && (
        <div className="mod-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save()}>{busy ? tr('mod.saving') : tr('crm.save')}</button>
          {!isNew && !form.clientId && <button type="button" className="btn btn-secondary" onClick={convert}><UserCheck size={16} /> {tr('crm.toCustomer')}</button>}
          {form.clientId && <span className="mod-chip green">{tr('crm.isCustomer')}</span>}
          {!isNew && roleCan('delete') && <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={remove}><Trash2 size={18} /></button>}
        </div>
      )}
      {canWrite && (
        <div className="mod-card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}><CalendarClock size={16} /> {tr('crm.scheduleFollowUp')}</div>
          <div className="mod-toolbar" style={{ marginBottom: 0 }}>
            <input className="form-input" type="date" value={fu.due} onChange={e => setFu(f => ({ ...f, due: e.target.value }))} style={{ flex: '0 0 150px', minWidth: 0 }} />
            <input className="form-input" value={fu.text} onChange={e => setFu(f => ({ ...f, text: e.target.value }))} placeholder={tr('crm.followUpWhat')} maxLength={200} />
            <button type="button" className="btn btn-secondary" onClick={addFollowUp}><Plus size={16} /> {tr('crm.add')}</button>
          </div>
        </div>
      )}
      <div className="mod-card">
        <div style={{ fontWeight: 700, marginBottom: 6 }}><StickyNote size={16} /> {tr('crm.notes')}</div>
        {canWrite && (
          <div className="mod-toolbar">
            <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder={tr('crm.notePlaceholder')} maxLength={1000} onKeyDown={e => { if (e.key === 'Enter') addNote(); }} />
            <button type="button" className="btn btn-secondary" onClick={addNote}><Plus size={16} /> {tr('crm.add')}</button>
          </div>
        )}
        {!mine.length ? <div className="mod-muted">{tr('crm.noNotes')}</div> : mine.map(a => (
          <div key={a.id} className="mod-row" style={{ marginBottom: 6 }}>
            <div className="mod-row-main">
              <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{a.kind === 'followup' ? '🔔 ' : ''}{a.text}</div>
              <div className="mod-row-sub">{a.kind === 'followup' ? `${tr('crm.due')}: ${fmtDay(a.due)}` : new Date(a.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{a.done ? ` · ${tr('crm.done')}` : ''}</div>
            </div>
            {a.kind === 'followup' && !a.done && canWrite && <button type="button" className="mod-icon-btn" aria-label={tr('crm.markDone')} onClick={() => addActivity({ ...a, done: true })}><Check size={18} /></button>}
            {roleCan('delete') && <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={() => removeActivity(a)}><Trash2 size={16} /></button>}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

function FollowUpsTab({ buckets, leads, addActivity, openLead }) {
  const byLead = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads]);
  const section = (key, items) => (
    <div key={key} style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: '.95rem', margin: '0 0 6px', color: key === 'overdue' ? '#dc2626' : 'inherit' }}>{tr(`crm.${key}`)} ({items.length})</h3>
      {!items.length ? <div className="mod-muted">—</div> : (
        <div className="mod-list">
          {items.map(a => {
            const lead = a.refType === 'lead' ? byLead.get(a.refId) : null;
            const name = lead?.name || a.refName || '';
            const phone = lead?.phone || a.phone || '';
            return (
              <div key={a.id} className="mod-row" data-testid="crm-followup">
                <button type="button" className="mod-icon-btn" aria-label={tr('crm.markDone')} onClick={() => addActivity({ ...a, done: true }).then(() => toast(tr('crm.doneToast'), 'success'), () => toast(tr('mod.saveError'), 'error'))}><Check size={18} /></button>
                <div className="mod-row-main" role="button" tabIndex={0} style={{ cursor: lead ? 'pointer' : 'default' }} onClick={() => lead && openLead(lead)} onKeyDown={e => { if (e.key === 'Enter' && lead) openLead(lead); }}>
                  <div className="mod-row-title">{name}</div>
                  <div className="mod-row-sub">{fmtDay(a.due)} · {a.text}</div>
                </div>
                <ContactButtons phone={phone} message={tr('crm.waHello', { name })} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
  return (
    <>
      {section('overdue', buckets.overdue)}
      {section('today', buckets.today)}
      {section('upcoming', buckets.upcoming)}
    </>
  );
}

function CustomersTab({ acts, addActivity, today }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState('');
  const [fuDate, setFuDate] = useState('');
  useEffect(() => {
    Promise.all([getAllClients(), getAllBills(), getAllReceipts()]).then(([clients, bills, receipts]) => setData({ clients: clients || [], bills: bills || [], receipts: receipts || [] }),
      () => setData({ clients: [], bills: [], receipts: [] }));
  }, []);
  if (!data) return <div className="mod-card mod-muted">{tr('mod.loading')}</div>;
  if (sel) {
    const events = customerTimeline({ client: sel, bills: data.bills, receipts: data.receipts, activities: acts });
    const tot = customerTotals(events);
    const add = async (kind) => {
      if (kind === 'note' && !note.trim()) return;
      if (kind === 'followup' && !fuDate) return;
      try {
        await addActivity({ refType: 'client', refId: sel.id, refName: sel.name, phone: sel.phone, kind, text: note.trim() || tr('crm.followUpDefault'), ...(kind === 'followup' ? { due: fuDate } : {}) });
        setNote(''); setFuDate('');
      } catch { toast(tr('mod.saveError'), 'error'); }
    };
    const icon = { bill: FileText, payment: IndianRupee, note: StickyNote, followup: Bell };
    return (
      <>
        <div className="mod-actions" style={{ marginTop: 0 }}><button type="button" className="btn btn-secondary" onClick={() => setSel(null)}>← {tr('crm.allCustomers')}</button></div>
        <div className="mod-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="mod-row-main"><div className="mod-row-title" style={{ fontSize: '1.1rem' }}>{sel.name}</div><div className="mod-row-sub">{sel.phone || ''} {sel.gstin ? `· ${sel.gstin}` : ''}</div></div>
            <ContactButtons phone={sel.phone} message={tr('crm.waHello', { name: sel.name })} />
          </div>
          <div className="mod-grid" style={{ marginTop: 10 }}>
            <div className="mod-stat"><span className="mod-muted">{tr('crm.billed')}</span><b>{formatCurrency(tot.billed)}</b></div>
            <div className="mod-stat"><span className="mod-muted">{tr('crm.paid')}</span><b>{formatCurrency(tot.paid)}</b></div>
            <div className="mod-stat"><span className="mod-muted">{tr('crm.balance')}</span><b style={{ color: tot.balance > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(tot.balance)}</b></div>
          </div>
          {roleCan('write') && (
            <div className="mod-toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
              <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder={tr('crm.notePlaceholder')} maxLength={1000} />
              <button type="button" className="btn btn-secondary" onClick={() => add('note')}><StickyNote size={16} /> {tr('crm.addNote')}</button>
              <input className="form-input" type="date" min={today} value={fuDate} onChange={e => setFuDate(e.target.value)} style={{ flex: '0 0 150px', minWidth: 0 }} aria-label={tr('crm.due')} />
              <button type="button" className="btn btn-secondary" onClick={() => add('followup')}><Bell size={16} /> {tr('crm.addFollowUp')}</button>
            </div>
          )}
        </div>
        <h3 style={{ fontSize: '.95rem', margin: '8px 0' }}>{tr('crm.timeline')}</h3>
        {!events.length ? <EmptyState icon={FileText} text={tr('crm.noHistory')} /> : (
          <div className="mod-list" data-testid="crm-timeline">
            {events.map((e, i) => {
              const Icon = icon[e.type] || FileText;
              return (
                <div key={`${e.type}-${e.ref}-${i}`} className="mod-row">
                  <div className="mod-thumb" style={{ width: 40, height: 40 }}><Icon size={18} /></div>
                  <div className="mod-row-main">
                    <div className="mod-row-title">{tr(`crm.ev_${e.type}`)} · {e.title}</div>
                    <div className="mod-row-sub">{e.date ? fmtDay(e.date) : ''}{e.status ? ` · ${e.status}` : ''}{e.mode ? ` · ${e.mode}` : ''}{e.done ? ` · ${tr('crm.done')}` : ''}</div>
                  </div>
                  {e.amount ? <div className="mod-amt" style={{ color: e.type === 'payment' ? '#16a34a' : 'inherit' }}>{formatCurrency(e.amount)}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }
  const list = data.clients.filter(c => !q || `${c.name} ${c.phone || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return (
    <>
      <div className="mod-toolbar">
        <Search size={16} style={{ opacity: 0.5 }} />
        <input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder={tr('crm.searchCustomers')} />
      </div>
      {!list.length ? <EmptyState icon={UserCheck} text={tr('crm.noCustomers')} /> : (
        <div className="mod-list">
          {list.map(c => (
            <div key={c.id} className="mod-row" role="button" tabIndex={0} style={{ cursor: 'pointer' }} data-testid="crm-customer" onClick={() => setSel(c)} onKeyDown={e => { if (e.key === 'Enter') setSel(c); }}>
              <div className="mod-row-main"><div className="mod-row-title">{c.name}</div><div className="mod-row-sub">{c.phone || ''}{c.city ? ` · ${c.city}` : ''}</div></div>
              <ContactButtons phone={c.phone} message={tr('crm.waHello', { name: c.name })} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
