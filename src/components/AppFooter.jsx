import { HelpCircle } from 'lucide-react';

export default function AppFooter({ onOpenSupport }) {
  const link = { color: 'inherit', textDecoration: 'none', fontWeight: 600 };
  return (
    <footer style={{
      marginTop: 'auto', paddingTop: '1.5rem',
      textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center',
        padding: '0.35rem 1rem', borderRadius: 999, background: 'var(--card-bg)', border: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
      }}>
        <span style={{ fontWeight: 600, color: '#2563eb' }}>GST Billing Pro Cloud</span>
        <span aria-hidden="true">·</span>
        <span>Secure Multi-tenant Cloud Platform</span>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={onOpenSupport}
          style={{ ...link, background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <HelpCircle size={12} style={{ color: '#2563eb' }} /> Help & Support
        </button>
      </span>
    </footer>
  );
}
