import { HelpCircle } from 'lucide-react';
import { COMPANY, LEGAL_LINKS } from '../../shared/company.js';

export default function AppFooter({ onOpenSupport }) {
  const link = { color: 'inherit', textDecoration: 'none', fontWeight: 600 };
  const sep = <span aria-hidden="true">·</span>;
  return (
    <footer style={{
      marginTop: 'auto', paddingTop: '1.5rem',
      textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center',
        padding: '0.35rem 1rem', borderRadius: 999, background: 'var(--card-bg)', border: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
      }}>
        <span style={{ fontWeight: 600, color: '#2563eb' }}>{COMPANY.product}</span>
        {sep}
        <span>by {COMPANY.owner}, {COMPANY.city}</span>
        {sep}
        <button type="button" onClick={onOpenSupport}
          style={{ ...link, background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <HelpCircle size={12} style={{ color: '#2563eb' }} /> Help & Support
        </button>
      </span>
      <nav aria-label="Legal" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.8rem', justifyContent: 'center' }}>
        {LEGAL_LINKS.map(l => (
          <a key={l.href} href={l.href} target="_blank" rel="noopener" style={{ color: 'inherit' }}>{l.label}</a>
        ))}
      </nav>
      <span style={{ opacity: 0.8 }}>
        Based on open-source {COMPANY.upstreamName} ({COMPANY.upstreamLicense})
      </span>
    </footer>
  );
}
