import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { usePlan } from '../../lib/planContext';
import { moduleAllowed } from '../../../shared/modules.js';
import { tablesReady } from '../../lib/modData';
import { CRM_TABLES, listActivities, todayISO } from '../../lib/crmData';
import { bucketFollowUps } from '../../../shared/crm.js';
import { roleCanView } from '../../lib/org';
import { t as tr } from '../../i18n';

// Dashboard card: CRM follow-ups due today or overdue. Renders nothing when
// the plan has no CRM, the tables are not set up yet or nothing is due.
export default function FollowUpsWidget({ onOpen }) {
  const { plan } = usePlan();
  const ok = moduleAllowed(plan?.tier || 'free', 'crm') && roleCanView('crm');
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!ok) return undefined;
    let alive = true;
    tablesReady(CRM_TABLES).then(s => (s === 'ready' ? listActivities() : [])).then(acts => {
      if (!alive) return;
      const b = bucketFollowUps(acts, todayISO());
      setItems([...b.overdue, ...b.today]);
    }, () => {});
    return () => { alive = false; };
  }, [ok]);
  if (!ok || !items.length) return null;
  return (
    <button type="button" className="glass-panel" data-testid="followups-widget" onClick={onOpen}
      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '0.9rem 1rem', marginBottom: '1rem', cursor: 'pointer', border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 14 }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: '#f59e0b', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Bell size={20} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', color: '#92400e' }}>{tr('crm.widgetTitle', { count: items.length })}</strong>
        <span style={{ fontSize: '.85rem', color: '#92400e' }}>{items.slice(0, 3).map(a => a.refName).filter(Boolean).join(', ')}</span>
      </span>
      <span style={{ color: '#92400e', fontWeight: 700 }}>{tr('crm.view')} →</span>
    </button>
  );
}
