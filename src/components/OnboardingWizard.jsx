import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { saveProfile, setRegionMode } from '../store';
import { getPrintSettings, savePrintSettings, BUSINESS_PRESETS, applyBusinessPreset } from '../utils/printSettings';
import { setDefaultPaperSize } from '../utils/paperDefaults';
import { LANGUAGES, setLanguage, currentLanguage, PRINT_LABEL_LANGUAGES } from '../i18n';
import { toast } from './Toast';

// ============================================================
// One 3-step onboarding (replaces WelcomeGuide + SetupWizard):
//   1. Business name + optional GSTIN
//   2. Business type → bill style, paper size and defaults (BUSINESS_PRESETS)
//   3. App language (invoice print language stays separate; optional tick)
// Skippable; the "Finish setup" pill and the dashboard checklist bring
// people back.
// ============================================================
export const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export default function OnboardingWizard({ profile, onDone }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(profile?.businessName || '');
  const [gstin, setGstin] = useState(profile?.gstin || '');
  const [biz, setBiz] = useState('');
  const [lang, setLang] = useState(currentLanguage());
  const [printToo, setPrintToo] = useState(false);
  const [saving, setSaving] = useState(false);
  const gstinBad = gstin.trim() !== '' && !GSTIN_RE.test(gstin.trim().toUpperCase());

  const markDone = (skipped) => {
    savePrintSettings({ ...getPrintSettings(), onboardingComplete: true, onboardingSkipped: !!skipped });
    try { localStorage.setItem('freegstbill_onboarded', 'true'); } catch { /* private mode */ }
  };

  const finish = async () => {
    setSaving(true);
    try {
      let saved = null;
      if (name.trim()) {
        setRegionMode('india');
        saved = { ...(profile || {}), businessName: name.trim(), gstin: gstin.trim().toUpperCase(), country: profile?.country || 'India' };
        await saveProfile(saved);
      }
      let ps = getPrintSettings();
      if (biz && BUSINESS_PRESETS[biz]) {
        ps = applyBusinessPreset(ps, biz);
        await setDefaultPaperSize(BUSINESS_PRESETS[biz].paper);
      }
      if (printToo && PRINT_LABEL_LANGUAGES.includes(lang)) ps.labelLanguage = lang;
      savePrintSettings({ ...ps, onboardingComplete: true, onboardingSkipped: false });
      try { localStorage.setItem('freegstbill_onboarded', 'true'); } catch { /* ignore */ }
      await setLanguage(lang);
      toast(t('onboarding.saved'), 'success');
      onDone(saved);
    } catch {
      toast(t('onboarding.saveFailed'), 'error');
    }
    setSaving(false);
  };

  const pill = (active) => ({
    padding: '0.7rem', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontSize: '0.88rem',
    background: active ? 'var(--primary)' : 'var(--bg-secondary, #fff)', color: active ? '#fff' : 'var(--text-primary)',
    border: `2px solid ${active ? 'var(--primary)' : 'var(--border-color, #e2e8f0)'}`,
  });
  const input = { width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--border-color, #cbd5e1)', fontSize: '1rem', background: 'var(--bg-secondary, #fff)', color: 'inherit', boxSizing: 'border-box' };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} data-testid="onboarding">
      <div className="modal-content" style={{ maxWidth: 600, width: '100%', maxHeight: '92vh', overflow: 'auto' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem' }}>👋 {t('onboarding.title')}</h2>
        <p style={{ margin: '0.2rem 0 0.8rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('onboarding.stepOf', { step, total: 3 })}</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: '1.2rem' }}>
          {[1, 2, 3].map(n => <div key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= step ? 'var(--primary)' : 'var(--border-color, #e2e8f0)' }} />)}
        </div>

        {step === 1 && (
          <div>
            <h3 style={{ marginTop: 0 }}>{t('onboarding.s1Title')}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('onboarding.s1Desc')}</p>
            <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t('onboarding.businessName')}
              <input style={input} value={name} autoFocus onChange={e => setName(e.target.value)} placeholder={t('onboarding.businessNamePh')} data-testid="onb-name" />
            </label>
            <label style={{ display: 'block', marginTop: '0.9rem', fontWeight: 600, fontSize: '0.85rem' }}>{t('onboarding.gstin')} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({t('common.optional')})</span>
              <input style={{ ...input, textTransform: 'uppercase' }} value={gstin} maxLength={15} onChange={e => setGstin(e.target.value)} placeholder="33ABCDE1234F1Z5" />
            </label>
            <div style={{ fontSize: '0.78rem', marginTop: 4, color: gstinBad ? '#dc2626' : 'var(--text-muted)' }}>{gstinBad ? t('onboarding.gstinInvalid') : t('onboarding.gstinHint')}</div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ marginTop: 0 }}>{t('onboarding.s2Title')}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('onboarding.s2Desc')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              {Object.keys(BUSINESS_PRESETS).map(key => (
                <button key={key} type="button" style={pill(biz === key)} onClick={() => setBiz(key)}>
                  <div style={{ fontWeight: 700 }}>{t(`biz.${key}`, { defaultValue: BUSINESS_PRESETS[key].label })}</div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>{BUSINESS_PRESETS[key].hint}</div>
                </button>
              ))}
              <button type="button" style={pill(biz === '')} onClick={() => setBiz('')}><div style={{ fontWeight: 700 }}>{t('biz.other')}</div></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 style={{ marginTop: 0 }}>{t('onboarding.s3Title')}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('onboarding.s3Desc')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {LANGUAGES.map(l => (
                <button key={l.code} type="button" style={pill(lang === l.code)} onClick={() => { setLang(l.code); setLanguage(l.code); }}>
                  <div style={{ fontWeight: 700 }}>{l.native}</div><div style={{ fontSize: '0.72rem', opacity: 0.85 }}>{l.english}</div>
                </button>
              ))}
            </div>
            {PRINT_LABEL_LANGUAGES.includes(lang) && lang !== 'en' && (
              <label style={{ display: 'flex', gap: 8, marginTop: '0.9rem', fontSize: '0.85rem', alignItems: 'center' }}>
                <input type="checkbox" checked={printToo} onChange={e => setPrintToo(e.target.checked)} /> {t('onboarding.printToo')}
              </label>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.4rem', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => { markDone(true); onDone(null); }}>{t('onboarding.skip')}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 && <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> {t('common.back')}</button>}
            {step < 3
              ? <button type="button" className="btn btn-primary" data-testid="onb-next" disabled={step === 1 && (!name.trim() || gstinBad)} onClick={() => setStep(step + 1)}>{t('common.continue')} <ChevronRight size={16} /></button>
              : <button type="button" className="btn btn-primary" data-testid="onb-finish" disabled={saving} onClick={finish}><Check size={16} /> {saving ? t('onboarding.saving') : t('onboarding.finish')}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
