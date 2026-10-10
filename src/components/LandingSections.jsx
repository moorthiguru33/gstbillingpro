import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Zap, Share2, Package, BarChart3, Languages } from 'lucide-react';
import PricingTable from './plans/PricingTable';
import LanguagePicker from './LanguagePicker';
import { getFounderSlotsLeft } from '../lib/supabase';

// Public landing content shown under the sign-in hero: features, pricing,
// FAQ and a (clearly marked) testimonials placeholder. Choosing any plan here
// just opens sign-up; purchase happens inside the app after login.

export function LandingTopBar() {
  const { t } = useTranslation();
  const link = { color: '#e2e8f0', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 };
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      padding: '0.6rem 1.2rem', background: 'rgba(15,23,42,0.92)', color: '#fff', backdropFilter: 'blur(8px)' }}>
      <strong style={{ flex: 1, minWidth: 140 }}>GST Billing Pro</strong>
      <nav style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <a href="#features" style={link}>{t('landing.navFeatures')}</a>
        <a href="#pricing" style={link}>{t('landing.navPricing')}</a>
        <a href="#faq" style={link}>{t('landing.navFaq')}</a>
        <LanguagePicker compact id="landing-lang" />
      </nav>
    </header>
  );
}

export default function LandingSections({ onSignup }) {
  const { t } = useTranslation();
  const [founderLeft, setFounderLeft] = useState(null);
  useEffect(() => { getFounderSlotsLeft().then(setFounderLeft).catch(() => {}); }, []);
  const features = [
    { icon: FileText, k: 'f1' }, { icon: Zap, k: 'f2' }, { icon: Share2, k: 'f3' },
    { icon: Package, k: 'f4' }, { icon: BarChart3, k: 'f5' }, { icon: Languages, k: 'f6' },
  ];
  const section = { maxWidth: 1100, margin: '0 auto', padding: '3rem 1.2rem' };
  const h2 = { fontSize: '1.7rem', fontWeight: 800, textAlign: 'center', margin: '0 0 1.5rem', color: '#0f172a' };
  return (
    <div style={{ background: '#f8fafc', color: '#0f172a', fontFamily: 'inherit' }}>
      <section id="features" style={section}>
        <h2 style={h2}>{t('landing.featuresTitle')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {features.map((f) => (
            <div key={f.k} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.1rem' }}>
              <f.icon size={22} color="#2563eb" />
              <h3 style={{ margin: '0.5rem 0 0.3rem', fontSize: '1.02rem' }}>{t(`landing.${f.k}Title`)}</h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#475569', lineHeight: 1.5 }}>{t(`landing.${f.k}Desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" style={section}>
        <h2 style={{ ...h2, marginBottom: '0.4rem' }}>{t('landing.pricingTitle')}</h2>
        <p style={{ textAlign: 'center', color: '#475569', marginTop: 0, marginBottom: '1.5rem' }}>{t('landing.pricingSubtitle')}</p>
        <PricingTable founderLeft={founderLeft} onChoose={() => onSignup()}
          freeCta={<button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => onSignup()}>{t('landing.ctaStart')}</button>} />
      </section>

      <section id="faq" style={{ ...section, maxWidth: 800 }}>
        <h2 style={h2}>{t('landing.faqTitle')}</h2>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <details key={n} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.8rem 1rem', marginBottom: '0.6rem' }}>
            <summary style={{ fontWeight: 700, cursor: 'pointer' }}>{t(`landing.q${n}`)}</summary>
            <p style={{ margin: '0.6rem 0 0', color: '#475569', lineHeight: 1.55 }}>{t(`landing.a${n}`)}</p>
          </details>
        ))}
      </section>

      {/* PLACEHOLDER: replace with real, permission-given customer reviews only. */}
      <section id="testimonials" data-placeholder="testimonials" style={{ ...section, paddingTop: 0 }}>
        <h2 style={h2}>{t('landing.testimonialsTitle')}</h2>
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: 14, padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
          {t('landing.testimonialsPlaceholder')}
        </div>
      </section>

      <footer style={{ textAlign: 'center', padding: '1.5rem 1rem 2.5rem', color: '#64748b', fontSize: '0.82rem' }}>
        {t('landing.madeIn')}
      </footer>
    </div>
  );
}
