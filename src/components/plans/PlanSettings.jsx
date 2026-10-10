import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, Copy } from 'lucide-react';
import { usePlan } from '../../lib/planContext';
import { fetchReferral } from '../../lib/payments';
import LanguagePicker from '../LanguagePicker';

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** One line: "Pro · until 3 Mar 2027" / "Pro trial · 5 days left". */
// eslint-disable-next-line react-refresh/only-export-components
export function planLabel(plan, t) {
  if (!plan) return '';
  const name = t(`plans.${plan.tier}`);
  if (plan.isTrial) return t('plans.trialUntil', { days: plan.trialDaysLeft });
  if (plan.source === 'lifetime') return t('plans.planLifetime', { plan: name });
  if (plan.until) return t('plans.planUntil', { plan: name, date: fmt(plan.until) });
  return name;
}

/** Small sidebar meter: plan + monthly usage; click → upgrade modal. */
export function UsageMeter() {
  const { t } = useTranslation();
  const { plan, usage, openUpgrade, sub } = usePlan();
  if (!sub || !plan) return null;
  const limit = usage?.invoice_limit;
  const used = usage?.invoices_used ?? 0;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <button type="button" data-testid="usage-meter" onClick={() => openUpgrade()}
      style={{ width: '100%', textAlign: 'left', background: 'rgba(30,64,175,0.06)', border: '1px solid rgba(30,64,175,0.15)', borderRadius: 10, padding: '0.5rem 0.6rem', cursor: 'pointer', color: 'inherit', fontSize: '0.75rem', marginTop: 8 }}>
      <div style={{ fontWeight: 700 }}>{planLabel(plan, t)}</div>
      <div style={{ color: 'var(--text-muted, #64748b)' }}>{limit ? t('plans.usage', { used, limit }) : t('plans.usageUnlimited')}</div>
      {limit ? <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0', marginTop: 4 }}><div style={{ width: `${pct}%`, height: 4, borderRadius: 2, background: pct >= 100 ? '#dc2626' : '#1e40af' }} /></div> : null}
      {plan.tier !== 'business' && <div style={{ color: '#1e40af', fontWeight: 700, marginTop: 3 }}>{t('common.upgrade')} →</div>}
    </button>
  );
}

/** Settings → Language, Plan & billing, Refer a shop. */
export default function PlanSettings() {
  const { t } = useTranslation();
  const { plan, usage, openUpgrade, sub } = usePlan();
  const [ref, setRef] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (sub) fetchReferral().then(setRef).catch(() => setRef(null)); }, [sub]);
  const box = { padding: '1rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 12, marginBottom: '1rem' };
  return (
    <div id="settings-plan" data-testid="plan-settings">
      <div style={box}>
        <h3 className="section-title" style={{ marginTop: 0 }}>{t('settings.languageSection')}</h3>
        <LanguagePicker id="settings-lang-picker" />
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', margin: '0.5rem 0 0' }}>{t('lang.hint')}</p>
      </div>
      {sub && plan && (
        <div style={box}>
          <h3 className="section-title" style={{ marginTop: 0 }}>{t('settings.planSection')}</h3>
          <p style={{ margin: '0 0 0.4rem', fontWeight: 700 }}>{planLabel(plan, t)}</p>
          {usage && <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>{usage.invoice_limit ? t('plans.usage', { used: usage.invoices_used, limit: usage.invoice_limit }) : t('plans.usageUnlimited')}</p>}
          <button type="button" className="btn btn-primary" onClick={() => openUpgrade()}>{t('plans.seePlans')}</button>
        </div>
      )}
      {ref && (
        <div style={box}>
          <h3 className="section-title" style={{ marginTop: 0 }}><Gift size={16} /> {t('plans.referTitle')}</h3>
          <p style={{ fontSize: '0.85rem', margin: '0 0 0.5rem' }}>{t('plans.referDesc')}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <code style={{ padding: '0.35rem 0.5rem', background: 'var(--bg-secondary, #f1f5f9)', borderRadius: 6, wordBreak: 'break-all' }}>{ref.link}</code>
            <button type="button" className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(ref.link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              <Copy size={14} /> {copied ? t('plans.referCopied') : t('plans.referCopy')}
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted, #64748b)', margin: '0.5rem 0 0' }}>{t('plans.referStats', { invited: ref.invited, rewarded: ref.rewarded })}</p>
        </div>
      )}
    </div>
  );
}
