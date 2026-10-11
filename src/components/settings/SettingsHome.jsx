import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Search, ChevronRight } from 'lucide-react';
import { SETTINGS_PAGES } from './pages';

// Settings home: eight big cards in plain language plus a search box.
// Each card opens a page that shows only the matching settings.

export default function SettingsHome({ onOpen, allowed }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const pages = SETTINGS_PAGES.filter(p => !allowed || allowed.includes(p.id));
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return pages;
    return pages.filter(p => `${t(`settingsHome.${p.id}`)} ${t(`settingsHome.${p.id}Desc`)} ${t(`settingsHome.${p.id}Keys`)} ${p.words}`.toLowerCase().includes(needle));
  }, [q, pages, t]);
  return (
    <div className="settings-home">
      <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>{t('settingsHome.title')}</h1>
      <p className="page-subtitle" style={{ marginTop: 0 }}>{t('settingsHome.subtitle')}</p>
      <label className="settings-search">
        <Search size={18} aria-hidden />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('settingsHome.search')} aria-label={t('settingsHome.search')} />
      </label>
      <div className="settings-cards">
        {shown.map(p => (
          <button key={p.id} type="button" className="settings-card" onClick={() => onOpen(p.id)}>
            <span className="settings-card-icon" style={{ background: `${p.color}18`, color: p.color }}><p.icon size={26} /></span>
            <span className="settings-card-text">
              <strong>{t(`settingsHome.${p.id}`)}</strong>
              <small>{t(`settingsHome.${p.id}Desc`)}</small>
            </span>
            <ChevronRight size={18} className="settings-card-chev" aria-hidden />
          </button>
        ))}
        {shown.length === 0 && <p className="settings-empty">{t('settingsHome.noMatch')}</p>}
      </div>
    </div>
  );
}

export function SettingsPageHeader({ page, onBack }) {
  const { t } = useTranslation();
  const meta = SETTINGS_PAGES.find(p => p.id === page);
  const Icon = meta?.icon || Printer;
  return (
    <div className="settings-page-head">
      <button type="button" className="btn btn-secondary" onClick={onBack}>← {t('settingsHome.back')}</button>
      <span className="settings-card-icon" style={{ background: `${meta?.color || '#7c3aed'}18`, color: meta?.color || '#7c3aed' }}><Icon size={22} /></span>
      <div>
        <h2 style={{ margin: 0 }}>{t(`settingsHome.${page}`)}</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t(`settingsHome.${page}Desc`)}</p>
      </div>
    </div>
  );
}
