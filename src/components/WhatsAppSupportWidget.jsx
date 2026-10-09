import { useState } from 'react';
import { MessageCircle, X, Send, ShieldCheck } from 'lucide-react';

export default function WhatsAppSupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const supportPhone = '919944880248';

  const handleOpenChat = () => {
    const text = encodeURIComponent('Hi GST Billing Pro Team, I have a query regarding billing / setup.');
    window.open(`https://wa.me/${supportPhone}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 99990,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Expanded Popup */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '70px',
          right: '0',
          width: '320px',
          maxWidth: 'calc(100vw - 32px)',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          animation: 'fadeInUp 0.25s ease-out',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #128c7e, #075e54)',
            color: '#fff',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: '#25d366',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}>
                <MessageCircle size={22} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>GST Billing Pro Support</div>
                <div style={{ fontSize: '0.75rem', color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                  Online • Replies quickly
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '50%',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer',
              }}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '1.25rem', background: '#f8fafc' }}>
            <div style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
              border: '1px solid #e2e8f0',
              fontSize: '0.875rem',
              color: '#334155',
              lineHeight: 1.5,
              marginBottom: '1rem',
            }}>
              👋 Hello! Need help setting up your GST invoices, connecting a thermal printer, or choosing a plan?
            </div>

            <button
              onClick={handleOpenChat}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: '#25d366',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37,211,102,0.35)',
                transition: 'transform 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Send size={16} /> Chat on WhatsApp
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              marginTop: '0.75rem',
              fontSize: '0.7rem',
              color: '#94a3b8',
            }}>
              <ShieldCheck size={13} color="#10b981" /> Official Customer Support (+91 99448 80248)
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#25d366',
          color: '#ffffff',
          border: 'none',
          boxShadow: '0 6px 20px rgba(37,211,102,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title="WhatsApp Support"
        aria-label="WhatsApp Support"
      >
        {isOpen ? <X size={26} color="#fff" /> : <MessageCircle size={28} color="#fff" />}
        {!isOpen && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 14,
            height: 14,
            background: '#ef4444',
            borderRadius: '50%',
            border: '2px solid #fff',
          }} />
        )}
      </button>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
