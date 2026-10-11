import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Shield } from 'lucide-react';
import PricingTable from './PricingTable';
import { checkout, previewPrice } from '../../lib/payments';
import { getFounderSlotsLeft } from '../../lib/supabase';
import { formatPlanPrice, PLAN_LABELS } from '../../../shared/plans.js';

export default function UpgradeModal({ open, reason, plan, usage, user, onClose, onPaid }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(null);
  const [coupon, setCoupon] = useState('');
  const [couponInfo, setCouponInfo] = useState(null);
  const [error, setError] = useState('');
  const [founderLeft, setFounderLeft] = useState(null);

  useEffect(() => { if (open) getFounderSlotsLeft().then(setFounderLeft); }, [open]);
  if (!open) return null;

  const applyCoupon = async () => {
    setError(''); setCouponInfo(null);
    if (!coupon.trim()) return;
    try {
      const r = await previewPrice('starter_yearly', coupon.trim());
      setCouponInfo({ code: r.coupon, discount: r.breakdown.discount });
    } catch (e) { setError(e.message); }
  };

  const choose = async (planId) => {
    setError(''); setBusy(planId);
    try {
      const res = await checkout({ planId, coupon: couponInfo?.code, user });
      if (res) {
        const date = res.periodEnd ? new Date(res.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        alert(res.lifetime && planId === 'founder_lifetime' ? t('plans.paySuccessLifetime') : t('plans.paySuccess', { plan: PLAN_LABELS[planId] || planId, date }));
        await onPaid?.();
        onClose();
      }
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const title = reason === 'invoices' ? t('plans.limitTitle') : reason === 'businesses' ? t('plans.businessLimitTitle') : t('plans.upgradeTitle');
  const body = reason === 'invoices' ? t('plans.limitBody', { limit: usage?.invoice_limit ?? plan?.limits?.invoicesPerMonth ?? 50 })
    : reason === 'businesses' ? t('plans.businessLimitBody', { limit: plan?.limits?.businesses ?? 1 }) : t('plans.upgradeSubtitle');

  return (
    <div role="dialog" aria-modal="true" data-testid="upgrade-modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 99998, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-primary, #fff)', color: 'var(--text-primary, #0f172a)', borderRadius: 18, padding: '1.25rem', maxWidth: 1000, width: '100%', margin: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{title}</h2>
            <p style={{ margin: '0.3rem 0 1rem', color: '#64748b', fontSize: '0.9rem' }}>{body}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}><X size={20} /></button>
        </div>
        <PricingTable currentTier={plan?.source === 'trial' ? null : plan?.tier} onChoose={choose} busyPlan={busy} founderLeft={founderLeft} isLifetime={plan?.isLifetime} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: '1rem' }}>
          <input value={coupon} onChange={e => setCoupon(e.target.value.toUpperCase())} placeholder={t('plans.coupon')} aria-label={t('plans.coupon')}
            style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 160 }} />
          {couponInfo
            ? <button type="button" className="btn btn-secondary" onClick={() => { setCouponInfo(null); setCoupon(''); }}>{t('plans.removeCoupon')}</button>
            : <button type="button" className="btn btn-secondary" onClick={applyCoupon}>{t('plans.applyCoupon')}</button>}
          {couponInfo && <span style={{ color: '#059669', fontSize: '0.85rem' }}>{t('plans.couponApplied', { code: couponInfo.code, amount: formatPlanPrice(couponInfo.discount) })}</span>}
        </div>
        {error && <p role="alert" style={{ color: '#dc2626', textAlign: 'center', fontSize: '0.88rem' }}>{error}</p>}
        <div style={{ textAlign: 'center', marginTop: '0.75rem', color: '#64748b', fontSize: '0.78rem' }}>
          <Shield size={12} style={{ verticalAlign: 'middle' }} /> {t('plans.secured')}
          <div><button type="button" onClick={onClose} style={{ background: 'none', border: 0, color: '#64748b', textDecoration: 'underline', cursor: 'pointer', marginTop: 6 }}>{t('plans.maybeLater')}</button></div>
        </div>
      </div>
    </div>
  );
}
