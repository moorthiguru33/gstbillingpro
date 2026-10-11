import { useEffect, useState } from 'react';
import { Lock, Wrench, RefreshCw } from 'lucide-react';
import { usePlan } from '../../lib/planContext';
import { moduleAllowed, moduleMinTier } from '../../../shared/modules.js';
import { TIERS } from '../../../shared/plans.js';
import { tablesReady } from '../../lib/modData';
import { activeRole } from '../../lib/org';
import { t as tr } from '../../i18n';
import './modules.css';

// Wraps a Phase 4 module screen:
//  1. plan below the module's tier  -> upgrade prompt (data stays readable
//     once tables exist, but new work needs the plan)
//  2. module tables not created yet -> "being set up" state (the SQL
//     migration has not been run on this database yet)
//  3. otherwise renders children
export default function ModuleGate({ module, tables, title, icon, children }) {
  const { plan, openUpgrade } = usePlan();
  const tier = plan?.tier || 'free';
  const allowed = moduleAllowed(tier, module);
  const [state, setState] = useState('checking');
  const [nonce, setNonce] = useState(0);
  const key = tables.join(',');
  useEffect(() => {
    let alive = true;
    tablesReady(key.split(',')).then(s => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [key, nonce]);

  if (!allowed) {
    const min = moduleMinTier(module);
    return (
      <div className="mod-page">
        <div className="mod-card mod-center">
          <div className="mod-badge">{icon || <Lock size={22} />}</div>
          <h2>{title}</h2>
          <p className="mod-muted">{tr('mod.upgradeBody', { plan: TIERS[min]?.name || min })}</p>
          {activeRole() === 'owner'
            ? <button type="button" className="btn btn-primary" onClick={() => openUpgrade(null)}><Lock size={16} /> {tr('mod.upgradeCta', { plan: TIERS[min]?.name || min })}</button>
            : <p className="mod-muted">{tr('staff.askOwner')}</p>}
        </div>
      </div>
    );
  }
  if (state === 'checking') return <div className="mod-page"><div className="mod-card mod-center mod-muted">{tr('mod.loading')}</div></div>;
  if (state !== 'ready') {
    return (
      <div className="mod-page">
        <div className="mod-card mod-center" data-testid="module-setup">
          <div className="mod-badge"><Wrench size={22} /></div>
          <h2>{title}</h2>
          <p className="mod-muted">{state === 'missing' ? tr('mod.settingUp') : tr('mod.loadError')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => { setState('checking'); setNonce(n => n + 1); }}><RefreshCw size={16} /> {tr('mod.retry')}</button>
        </div>
      </div>
    );
  }
  return children;
}

/** Horizontal, scrollable sub-page tabs (each maps to /app/<view>/<sub>). */
export function ModuleTabs({ tabs, active, onChange }) {
  return (
    <div className="mod-tabs" role="tablist">
      {tabs.map(tb => (
        <button type="button" role="tab" key={tb.id} aria-selected={active === tb.id}
          className={`mod-tab${active === tb.id ? ' active' : ''}`} onClick={() => onChange(tb.id)}>
          {tb.icon ? <tb.icon size={16} /> : null}<span>{tb.label}</span>{tb.badge ? <b className="mod-tab-badge">{tb.badge}</b> : null}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, text, children }) {
  return (
    <div className="mod-empty">
      {Icon ? <Icon size={36} /> : null}
      <p>{text}</p>
      {children}
    </div>
  );
}
