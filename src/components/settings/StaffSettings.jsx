import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Copy, MessageCircle, History } from 'lucide-react';
import { toast } from '../Toast';
import { INVITABLE_ROLES, canAssignRole } from '../../../shared/staff.js';
import { listTeam, inviteMember, removeMember, changeRole, fetchActivity, activeRole, isStaffMode } from '../../lib/org';
import { openWhatsAppShare } from '../../utils/share';

// Settings > Staff & Access: invite people, set roles, see who did what.
export default function StaffSettings() {
  const { t } = useTranslation();
  const [team, setTeam] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ contact: '', name: '', role: 'biller' });
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState(null);
  const [log, setLog] = useState(null);
  const me = activeRole();

  const load = useCallback(() => listTeam().then(d => { setTeam(d); setErr(''); }, e => setErr(e.message)), []);
  useEffect(() => {
    let off = false;
    listTeam().then(d => { if (!off) setTeam(d); }, e => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, []);

  const shareLink = (link, m) => {
    const text = t('staff.inviteWhatsApp', { role: t(`staff.role_${m?.role || form.role}`), link });
    openWhatsAppShare(m?.phone || '', text);
  };
  const copy = async (link) => {
    try { await navigator.clipboard.writeText(link); toast(t('staff.copied'), 'success'); } catch { window.prompt(t('staff.copyPrompt'), link); }
  };

  const invite = async (e) => {
    e.preventDefault();
    const c = form.contact.trim();
    if (!c) { toast(t('staff.err_staff_need_contact'), 'error'); return; }
    const isEmail = c.includes('@');
    setBusy(true);
    try {
      const res = await inviteMember({ role: form.role, name: form.name.trim(), email: isEmail ? c : '', phone: isEmail ? '' : c });
      setLastLink({ link: res.link, member: res.member });
      toast(res.emailed ? t('staff.invitedEmailed') : t('staff.invitedShare'), 'success', 6000);
      setForm({ contact: '', name: '', role: form.role });
      load();
    } catch (e2) { toast(e2.message, 'error', 7000); } finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (!window.confirm(t('staff.removeConfirm', { who: m.name || m.email || m.phone }))) return;
    try { await removeMember(m.id); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const setRole = async (m, role) => {
    try { await changeRole(m.id, role); load(); } catch (e) { toast(e.message, 'error'); }
  };

  if (err) return <div className="glass-panel p-6 mb-6"><p className="settings-note">{err}</p></div>;
  if (!team) return <div className="glass-panel p-6 mb-6"><p>{t('common.loading')}</p></div>;

  const seatsLeft = Math.max(0, (team.staffLimit || 0) - (team.staffUsed || 0));
  const roles = INVITABLE_ROLES.filter(r => canAssignRole(me, r));
  return (
    <>
      <div className="glass-panel p-6 mb-6">
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={18} /> {t('staff.inviteTitle')}</h3>
        <p className="settings-help">{t('staff.seats', { used: team.staffUsed || 0, limit: team.staffLimit || 0, ca: team.caUsed || 0, caMax: 2 })}</p>
        {team.tier === 'free' && <p className="settings-note">{t('staff.freePlanNote')}</p>}
        <form onSubmit={invite} className="staff-invite">
          <label><span>{t('staff.contact')}</span>
            <input className="form-input" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder={t('staff.contactPh')} autoComplete="off" />
          </label>
          <label><span>{t('staff.name')}</span>
            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('staff.namePh')} />
          </label>
          <label><span>{t('staff.role')}</span>
            <select className="form-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {roles.map(r => <option key={r} value={r}>{t(`staff.role_${r}`)}</option>)}
            </select>
          </label>
          <p className="settings-help" style={{ gridColumn: '1 / -1', margin: 0 }}>{t(`staff.roleHelp_${form.role}`)}</p>
          <button className="btn btn-primary" type="submit" disabled={busy || (form.role !== 'accountant' && seatsLeft <= 0)}>{t('staff.sendInvite')}</button>
        </form>
        {lastLink?.link && (
          <div className="staff-link">
            <span>{t('staff.linkReady')}</span>
            <code>{lastLink.link}</code>
            <button type="button" className="btn btn-secondary" onClick={() => copy(lastLink.link)}><Copy size={14} /> {t('staff.copy')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => shareLink(lastLink.link, lastLink.member)}><MessageCircle size={14} /> WhatsApp</button>
          </div>
        )}
      </div>

      <div className="glass-panel p-6 mb-6">
        <h3 className="section-title">{t('staff.teamTitle')}</h3>
        <div className="staff-list">
          {(team.members || []).map(m => (
            <div key={m.id} className="staff-row">
              <div className="staff-who">
                <strong>{m.name || m.email || m.phone || '—'}</strong>
                <small>{[m.email, m.phone].filter(Boolean).join(' · ')}</small>
                <small className={`staff-status ${m.status}`}>{m.status === 'invited' ? (m.expired ? t('staff.expired') : t('staff.pending')) : t('staff.active')}</small>
              </div>
              {m.role === 'owner' || !canAssignRole(me, m.role) ? (
                <span className="staff-role">{t(`staff.role_${m.role}`)}</span>
              ) : (
                <select className="form-input staff-role-select" value={m.role} onChange={e => setRole(m, e.target.value)}>
                  {roles.map(r => <option key={r} value={r}>{t(`staff.role_${r}`)}</option>)}
                </select>
              )}
              <div className="staff-actions">
                {m.link && <button type="button" className="btn btn-secondary" title={t('staff.copy')} onClick={() => copy(m.link)}><Copy size={14} /></button>}
                {m.link && <button type="button" className="btn btn-secondary" title="WhatsApp" onClick={() => shareLink(m.link, m)}><MessageCircle size={14} /></button>}
                {m.role !== 'owner' && canAssignRole(me, m.role) && <button type="button" className="btn btn-secondary" title={t('staff.remove')} onClick={() => remove(m)} style={{ color: '#dc2626' }}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel p-6 mb-6">
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><History size={18} /> {t('staff.activityTitle')}</h3>
        <p className="settings-help">{t('staff.activityHelp')}</p>
        {log === null ? (
          <button type="button" className="btn btn-secondary" onClick={() => fetchActivity(100).then(setLog).catch(e => toast(e.message, 'error'))}>{t('staff.showActivity')}</button>
        ) : log.length === 0 ? <p>{t('staff.noActivity')}</p> : (
          <div className="activity-list">
            {log.map(a => (
              <div key={a.id} className="activity-row">
                <span className={`act-badge ${a.action}`}>{t(`staff.act_${a.action}`)}</span>
                <span className="act-text">{t(`staff.ent_${a.entity}`, { defaultValue: a.entity })}{a.summary ? `: ${a.summary}` : ''}</span>
                <small>{a.actor_email || ''} · {new Date(a.created_at).toLocaleString()}</small>
              </div>
            ))}
          </div>
        )}
      </div>
      {isStaffMode() && <p className="settings-help">{t('staff.managerNote')}</p>}
    </>
  );
}
