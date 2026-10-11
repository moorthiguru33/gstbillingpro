import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, X, RefreshCw } from 'lucide-react';
import { getSubscription, getMyPlanUsage } from '../lib/supabase.js';
import { setPlanFromSubscription, PLAN_LIMIT_EVENT } from '../lib/planState';
import { PlanContext } from '../lib/planContext';
import { claimReferral, requestWelcomeEmail } from '../lib/payments';
import UpgradeModal from './plans/UpgradeModal';

// ============================================================
// SubscriptionGuard — loads the subscription, works out the effective plan
// (shared/plans.js) and provides it to the app via PlanContext.
// Phase 2: nobody is locked out any more. After the trial (or a paid
// period) ends the account simply runs on the Free plan; limits are
// enforced by the database and surface here as an upgrade modal.
// ============================================================
const REF_KEY = 'gbp_ref';

export default function SubscriptionGuard({ user, children, onSignOut }) {
  const { t } = useTranslation();
  const [sub, setSub] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [upgrade, setUpgrade] = useState({ open: false, reason: null });

  // Subscription status ALWAYS comes from the database. If it cannot be
  // read we show a retry screen — we never invent a plan in the browser.
  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const s = await getSubscription(user.id);
      if (!s) throw new Error('No subscription record found for this account.');
      setSub(s);
      setPlanFromSubscription(s);
      setUsage(await getMyPlanUsage());
    } catch (err) {
      console.warn('Subscription fetch error:', err);
      setLoadError(err?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.isDemo) { setLoading(false); return; }
    refresh();
  }, [user, refresh]);

  // One-time post-signup jobs: referral code from ?ref= and the welcome mail.
  useEffect(() => {
    if (!user || user.isDemo || !sub) return;
    let ref = null;
    try { ref = localStorage.getItem(REF_KEY); } catch { /* private mode */ }
    if (ref) {
      claimReferral(ref).catch(() => {}).finally(() => { try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ } });
    }
    const welcomeKey = `gbp_welcome_${user.id}`;
    try {
      if (!localStorage.getItem(welcomeKey)) { localStorage.setItem(welcomeKey, '1'); requestWelcomeEmail(); }
    } catch { /* ignore */ }
  }, [user, sub]);

  // DB limit hit anywhere in the app → open the upgrade modal.
  useEffect(() => {
    const onLimit = (e) => { setUpgrade({ open: true, reason: e.detail?.kind || null }); getMyPlanUsage().then(setUsage); };
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    // Deep link from e-mails: /?view=pricing
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'pricing') {
        setUpgrade({ open: true, reason: null });
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch { /* ignore */ }
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
  }, []);

  const plan = useMemo(() => (sub ? setPlanFromSubscription(sub) : null), [sub]);
  const ctx = useMemo(() => ({
    plan, sub, usage, refresh,
    openUpgrade: (reason = null) => setUpgrade({ open: true, reason }),
  }), [plan, sub, usage, refresh]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#64748b' }}>{t('account.loading')}</p>
      </div>
    );
  }

  if (loadError || (!sub && user && !user.isDemo)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div role="alert" style={{ background: '#fff', borderRadius: 16, padding: '2rem', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem' }}>{t('account.loadErrorTitle')}</h2>
          <p style={{ color: '#64748b', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
            {t('account.loadErrorBody')}
            {loadError ? <><br /><small style={{ color: '#94a3b8' }}>{loadError}</small></> : null}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => { setLoading(true); refresh(); }}><RefreshCw size={16} /> {t('common.retry')}</button>
          {onSignOut && <div><button type="button" onClick={onSignOut} style={{ marginTop: '1rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline' }}>{t('common.signOut')}</button></div>}
        </div>
      </div>
    );
  }

  return (
    <PlanContext.Provider value={ctx}>
      {plan && <PlanBanner plan={plan} usage={usage} onUpgrade={() => ctx.openUpgrade()} />}
      <UpgradeModal open={upgrade.open} reason={upgrade.reason} plan={plan} usage={usage} user={user}
        onClose={() => setUpgrade({ open: false, reason: null })} onPaid={refresh} />
      {children}
    </PlanContext.Provider>
  );
}

// Trial ending (≤ 7 days) or Free-plan usage nearly used up.
function PlanBanner({ plan, usage, onUpgrade }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  let text = null; let urgent = false;
  if (plan.isTrial && plan.trialDaysLeft <= 7) {
    urgent = plan.trialDaysLeft <= 3;
    text = plan.trialDaysLeft <= 0 ? t('plans.trialToday') : t('plans.trialBanner', { count: plan.trialDaysLeft });
  } else if (plan.isFree && usage?.invoice_limit && usage.invoices_used >= usage.invoice_limit * 0.8) {
    urgent = usage.invoices_used >= usage.invoice_limit;
    text = t('plans.onFreeBanner', { used: usage.invoices_used, limit: usage.invoice_limit });
  }
  if (!text) return null;
  return (
    <div data-testid="plan-banner" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9990, background: urgent ? '#b91c1c' : '#b45309', color: '#fff', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '0.86rem', fontWeight: 600, flexWrap: 'wrap' }}>
      <Zap size={16} /><span>{text}</span>
      <button type="button" onClick={onUpgrade} style={{ background: '#fff', color: urgent ? '#b91c1c' : '#b45309', border: 'none', borderRadius: 20, padding: '0.2rem 0.85rem', fontWeight: 700, cursor: 'pointer' }}>{t('plans.seePlans')}</button>
      <button type="button" aria-label={t('common.close')} onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}><X size={16} /></button>
    </div>
  );
}
