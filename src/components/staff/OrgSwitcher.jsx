import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { getOrgState, subscribeOrg, switchOrg } from '../../lib/org';

// Sidebar: which business you are working in + your role. Shows a picker
// only when the account belongs to more than one business.
export default function OrgSwitcher() {
  const { t } = useTranslation();
  const [st, setSt] = useState(getOrgState);
  useEffect(() => subscribeOrg(setSt), []);
  if (!st.userId || st.orgs.length < 2) {
    if (st.role && st.role !== 'owner') return <RoleBadge role={st.role} />;
    return null;
  }
  return (
    <div style={{ padding: '0.5rem 0.6rem', margin: '0.25rem 0', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <label htmlFor="org-switch" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>
        <Building2 size={13} /> {t('staff.workingIn')}
      </label>
      <select id="org-switch" value={st.ownerId || ''} onChange={e => switchOrg(e.target.value)}
        style={{ width: '100%', marginTop: 4, padding: '0.35rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card, #fff)', color: 'inherit', fontSize: '0.82rem' }}>
        {st.orgs.map(o => (
          <option key={o.owner_id} value={o.owner_id}>
            {(o.business_name || o.owner_email || t('staff.myBusiness'))}{o.owner_id === st.userId ? ` (${t('staff.myBusiness')})` : ` · ${t(`staff.role_${o.role}`)}`}
          </option>
        ))}
      </select>
      {st.role !== 'owner' && <RoleBadge role={st.role} inline />}
    </div>
  );
}

export function RoleBadge({ role, inline }) {
  const { t } = useTranslation();
  return (
    <div style={{ marginTop: inline ? 6 : 0, fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '0.2rem 0.6rem', alignSelf: 'flex-start' }}>
      {t('staff.youAre', { role: t(`staff.role_${role}`) })}
    </div>
  );
}
