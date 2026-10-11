import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus, Crown } from 'lucide-react';
import {
  PLANS, TIERS, FEATURES, formatPlanPrice, planCharge, yearlySavingsPercent, FOUNDER_LIFETIME_CAP, GST_PERCENT,
} from '../../../shared/plans.js';

// Which SKU a tier card sells for each billing toggle.
const SKU = {
  monthly: { starter: 'starter_monthly', pro: 'pro_monthly', business: 'business_yearly' },
  yearly: { starter: 'starter_yearly', pro: 'pro_yearly', business: 'business_yearly' },
};
const FEATURE_ROWS = [
  ['whatsappAutomation', 'plans.featWhatsapp'],
  ['staffUsers', 'plans.featStaff'],
  ['eInvoice', 'plans.featEinvoice'],
  ['prioritySupport', 'plans.featSupport'],
];

function TierFeatures({ tierId, t }) {
  const tier = TIERS[tierId];
  const items = [
    [true, t('plans.featCore')],
    [true, tier.limits.invoicesPerMonth == null ? t('plans.featUnlimited') : t('plans.featInvoices', { count: tier.limits.invoicesPerMonth })],
    [true, t('plans.featBusinesses', { count: tier.limits.businesses })],
    [tier.features.removeBranding, tier.features.removeBranding ? t('plans.featBranding') : t('plans.featBrandingShown')],
    ...FEATURE_ROWS.map(([flag, key]) => [tier.features[flag], `${t(key)}${FEATURES[flag].soon && tier.features[flag] ? ` (${t('common.comingSoon')})` : ''}`]),
  ];
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', fontSize: '0.84rem', lineHeight: 1.45 }}>
      {items.map(([on, label], i) => (
        <li key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '0.18rem 0', color: on ? 'inherit' : '#94a3b8' }}>
          {on ? <Check size={15} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} /> : <Minus size={15} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param currentTier   effective tier of the signed-in user (or null on the landing page)
 * @param onChoose      (planId) => void; omitted = display only
 * @param founderLeft   seats left (null = unknown)
 */
export default function PricingTable({ currentTier = null, onChoose, founderLeft = null, busyPlan = null, isLifetime = false, freeCta }) {
  const { t } = useTranslation();
  const [billing, setBilling] = useState('yearly');
  const cardBase = { border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 14, padding: '1rem', background: 'var(--bg-secondary, #fff)', display: 'flex', flexDirection: 'column' };
  const btn = (primary) => ({ marginTop: 'auto', padding: '0.6rem 0.8rem', borderRadius: 10, border: primary ? 'none' : '1px solid #cbd5e1', background: primary ? '#1e40af' : 'transparent', color: primary ? '#fff' : 'inherit', fontWeight: 700, cursor: 'pointer', width: '100%' });
  const soldOut = founderLeft === 0;

  return (
    <div data-testid="pricing-table">
      <div role="tablist" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: '1rem' }}>
        {['monthly', 'yearly'].map(b => (
          <button key={b} type="button" role="tab" aria-selected={billing === b} onClick={() => setBilling(b)}
            style={{ padding: '0.4rem 1rem', borderRadius: 999, border: '1px solid #1e40af', background: billing === b ? '#1e40af' : 'transparent', color: billing === b ? '#fff' : '#1e40af', fontWeight: 700, cursor: 'pointer' }}>
            {t(`plans.${b}`)}{b === 'yearly' ? ` · ${t('plans.save', { percent: yearlySavingsPercent('starter') })}` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <div style={cardBase}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{t('plans.free')}</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', minHeight: 32 }}>{t('plans.freeTag')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0.4rem 0' }}>₹0</div>
          <TierFeatures tierId="free" t={t} />
          {currentTier === 'free'
            ? <div style={{ ...btn(false), textAlign: 'center', cursor: 'default', marginTop: '1rem' }}>{t('plans.currentPlan')}</div>
            : freeCta ? <div style={{ marginTop: '1rem' }}>{freeCta}</div> : null}
        </div>
        {['starter', 'pro', 'business'].map(tierId => {
          const plan = PLANS[SKU[billing][tierId]];
          const highlight = tierId === 'pro';
          const isCurrent = currentTier === tierId;
          return (
            <div key={tierId} style={{ ...cardBase, ...(highlight ? { border: '2px solid #1e40af', boxShadow: '0 8px 24px rgba(30,64,175,0.12)' } : {}) }} data-testid={`tier-${tierId}`}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{t(`plans.${tierId}`)}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', minHeight: 32 }}>{t(`plans.${tierId}Tag`)}</div>
              <div style={{ margin: '0.4rem 0' }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 800 }}>{formatPlanPrice(plan.price)}</span>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{plan.billing === 'monthly' ? t('common.perMonth') : t('common.perYear')}</span>
                {plan.billing === 'yearly' && yearlySavingsPercent(tierId) > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 700 }}>{t('plans.save', { percent: yearlySavingsPercent(tierId) })}</div>
                )}
              </div>
              <TierFeatures tierId={tierId} t={t} />
              {onChoose && (
                <button type="button" style={{ ...btn(highlight), marginTop: '1rem' }} disabled={busyPlan != null}
                  data-testid={`choose-${plan.id}`} onClick={() => onChoose(plan.id)}>
                  {busyPlan === plan.id ? t('plans.processing') : isCurrent ? t('plans.currentPlan') + ' · ' + t('common.continue') : t('plans.choose', { plan: t(`plans.${tierId}`) })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ ...cardBase, marginTop: '0.75rem', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', background: 'linear-gradient(135deg, #fff7ed, #fffbeb)', border: '1px solid #fdba74' }} data-testid="tier-lifetime">
        <Crown size={28} color="#c2410c" />
        <div style={{ flex: '1 1 220px' }}>
          <div style={{ fontWeight: 800 }}>{t('plans.lifetime')} · {formatPlanPrice(PLANS.founder_lifetime.price)} <span style={{ fontWeight: 500, color: '#64748b', fontSize: '0.85rem' }}>{t('common.oneTime')}</span></div>
          <div style={{ fontSize: '0.8rem', color: '#7c2d12' }}>
            {t('plans.lifetimeNote', { cap: FOUNDER_LIFETIME_CAP })}
            {founderLeft != null && !soldOut ? ` ${t('plans.seatsLeft', { count: founderLeft, cap: FOUNDER_LIFETIME_CAP })}` : ''}
          </div>
        </div>
        {onChoose && !isLifetime && (
          <button type="button" style={{ ...btn(true), width: 'auto', marginTop: 0, background: soldOut ? '#94a3b8' : '#c2410c' }} disabled={soldOut || busyPlan != null}
            data-testid="choose-founder_lifetime" onClick={() => onChoose('founder_lifetime')}>
            {soldOut ? t('plans.soldOut') : busyPlan === 'founder_lifetime' ? t('plans.processing') : t('plans.buy', { price: formatPlanPrice(planCharge(PLANS.founder_lifetime)) })}
          </button>
        )}
      </div>

      <p style={{ fontSize: '0.8rem', color: '#475569', textAlign: 'center', margin: '0.9rem 0 0.2rem' }} data-testid="compare-line">{t('plans.compare')}</p>
      <p style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center', margin: 0 }}>
        {t('plans.compareNote')} {GST_PERCENT === 0 ? t('plans.gstNote') : ''}
      </p>
    </div>
  );
}
