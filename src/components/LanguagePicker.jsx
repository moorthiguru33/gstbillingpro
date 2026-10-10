import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LANGUAGES, setLanguage, currentLanguage } from '../i18n';

// Compact language <select>. Native names, so a Tamil reader can find
// "தமிழ்" without reading English.
export default function LanguagePicker({ compact = false, style, onChange, id = 'gbp-lang-picker' }) {
  const { t, i18n } = useTranslation();
  const value = currentLanguage() || i18n.language;
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
      <Globe size={16} aria-hidden="true" />
      {!compact && <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('lang.label')}</span>}
      <select id={id} value={value} aria-label={t('lang.label')} data-testid="language-picker"
        onChange={(e) => { setLanguage(e.target.value); onChange?.(e.target.value); }}
        style={{ padding: '0.35rem 0.5rem', borderRadius: 8, border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--bg-secondary, #fff)', color: 'inherit', fontSize: '0.88rem' }}>
        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.native}{l.code !== 'en' ? ` (${l.english})` : ''}</option>)}
      </select>
    </label>
  );
}
