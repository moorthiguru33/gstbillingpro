import { useState } from 'react';
import { HelpCircle, Mail, MessageSquare, Zap, BookOpen, Shield, CheckCircle, Keyboard, FileText, Smartphone } from 'lucide-react';
import { COMPANY, LEGAL_LINKS } from '../../shared/company.js';
import { t as tr } from '../i18n';

export default function SupportView() {
  const [copied, setCopied] = useState(false);

  const shortcuts = [
    { key: 'Alt + Q', desc: 'Open Quick POS / Express Billing' },
    { key: 'Ctrl + K', desc: 'Universal Search / Command Palette' },
    { key: 'Ctrl + P', desc: 'Print / Save Current Invoice' },
    { key: 'F2', desc: 'Complete Sale / Tender in POS' },
    { key: 'Ctrl + Enter', desc: 'Quick Save Bill' },
    { key: 'Esc', desc: 'Close dialogs / Clear search' },
  ];

  const faqs = [
    {
      q: 'How does cloud backup work?',
      a: 'All your invoices, products, and clients are automatically synchronized with high-availability Supabase PostgreSQL cloud storage. You can access your account from any device at any time.'
    },
    {
      q: 'Can I use thermal printers (58mm / 80mm)?',
      a: 'Yes! GST Billing Pro supports all standard ESC/POS 2-inch (58mm) and 3-inch (80mm) thermal receipt printers, as well as regular A4 and A5 laser/inkjet printers.'
    },
    {
      q: 'How do I file GSTR-1 and GSTR-3B?',
      a: 'Go to the GST Returns tab from the sidebar. You can instantly download government-compliant JSON and Excel files ready for upload on the official GST portal.'
    },
    {
      q: 'Can I scan barcodes using my mobile phone camera?',
      a: 'Yes! In Quick POS or Invoice Generator, click the Camera Barcode icon. It turns on your rear camera and instantly scans standard product barcodes.'
    }
  ];

  return (
    <div className="view-container" style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 54, height: 54, borderRadius: 16, background: '#eff6ff', color: '#2563eb',
          marginBottom: '1rem', boxShadow: '0 4px 12px rgba(37,99,235,0.15)'
        }}>
          <HelpCircle size={28} />
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--text-main)' }}>
          GST Billing Pro Help & Support
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0 }}>
          Dedicated support, keyboard shortcuts, and guides for your business.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {/* Support Cards */}
        <div className="card" style={{ padding: '1.5rem', borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ padding: 10, borderRadius: 10, background: '#ecfdf5', color: '#059669' }}>
              <MessageSquare size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{tr('support.whatsapp')}</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Quick assistance & onboarding</p>
            </div>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
            Need help with setup, thermal printer connection, or customization? Message our support team directly.
          </p>
          <a
            href="https://wa.me/919944880248?text=Hi%20GST%20Billing%20Pro%20Support,%20I%20need%20assistance"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', width: '100%', justifyContent: 'center' }}
          >
            <Smartphone size={16} /> Open WhatsApp Chat
          </a>
        </div>

        <div className="card" style={{ padding: '1.5rem', borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ padding: 10, borderRadius: 10, background: '#eff6ff', color: '#2563eb' }}>
              <Mail size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{tr('support.emailDesk')}</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Detailed inquiries & feature requests</p>
            </div>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
            Send us your queries, feedback, or custom invoice layout requests anytime.
          </p>
          <a
            href="mailto:support@gstbillingpro.com"
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', width: '100%', justifyContent: 'center' }}
          >
            <Mail size={16} /> support@gstbillingpro.com
          </a>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--card-bg)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <Keyboard size={20} color="#2563eb" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Pro Keyboard Shortcuts (Fast Billing)</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          {shortcuts.map(({ key, desc }) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 0.9rem', borderRadius: 8, background: 'var(--bg-muted, #f8fafc)',
              border: '1px solid var(--border-color)'
            }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>{desc}</span>
              <kbd style={{
                padding: '0.2rem 0.5rem', borderRadius: 6, background: '#fff',
                border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 700,
                color: '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}>{key}</kbd>
            </div>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <BookOpen size={20} color="#059669" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{tr('support.faq')}</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {faqs.map(({ q, a }) => (
            <div key={q} style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>{q}</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* About & legal */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--card-bg)', marginTop: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Shield size={20} color="#2563eb" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>About {COMPANY.product}</h2>
        </div>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {COMPANY.product} is made and supported by <strong>{COMPANY.owner}</strong>, {COMPANY.city}, {COMPANY.state}.
          Phone / WhatsApp <a href={`tel:${COMPANY.phoneHref}`}>{COMPANY.phone}</a> · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
        </p>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Based on the open-source <em>{COMPANY.upstreamName}</em>, used under the {COMPANY.upstreamLicense} licence. The original copyright notice is kept in the LICENSE file of our source code.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', fontSize: '0.85rem' }}>
          {LEGAL_LINKS.map(l => <a key={l.href} href={l.href} target="_blank" rel="noopener">{l.label}</a>)}
        </div>
      </div>
    </div>
  );
}
