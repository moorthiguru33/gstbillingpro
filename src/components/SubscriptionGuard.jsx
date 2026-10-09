import { useState, useEffect } from 'react';
import { Zap, Clock, CheckCircle, X, CreditCard, Shield, Star } from 'lucide-react';
import { getSubscription, getTrialDaysLeft, isSubscriptionActive } from '../lib/supabase.js';

// ============================================================
// SubscriptionGuard — Wraps the app, shows payment wall
// when trial expires or subscription lapses
// ============================================================

export default function SubscriptionGuard({ user, children, onSignOut }) {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [selectedPlan, setSelectedPlan] = useState('annual'); // 'monthly' | 'annual'

  useEffect(() => {
    if (!user || user.isDemo) {
      setLoading(false);
      return;
    }
    loadSubscription();
  }, [user]);

  const loadSubscription = async () => {
    try {
      let s = await getSubscription(user.id);
      if (!s) {
        // Fallback default 30-day trial
        const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        s = { status: 'trial', trial_end: trialEnd, trial_start: new Date().toISOString() };
      }
      setSub(s);
    } catch (err) {
      console.warn('Subscription fetch error, defaulting to trial:', err);
      const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      setSub({ status: 'trial', trial_end: trialEnd, trial_start: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  };

  const handleRazorpay = (plan = selectedPlan) => {
    const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!razorpayKey) {
      alert('Payment setup incomplete. Contact support.');
      return;
    }
    setPaymentLoading(true);

    const isAnnual = plan === 'annual';
    const amount = isAnnual ? 99900 : 9900;
    const planLabel = isAnnual ? 'Annual Subscription (1 Year)' : 'Monthly Subscription (30 Days)';

    // Create Razorpay order via Cloudflare Function
    fetch('/api/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.id}`,
      },
      body: JSON.stringify({ amount, plan, currency: 'INR', userId: user.id, email: user.email }),
    })
      .then(async r => {
        const data = await r.json();
        if (!r.ok || !data.id) {
          throw new Error(data.error || 'Failed to create order');
        }
        return data;
      })
      .then(order => {
        const options = {
          key: razorpayKey,
          amount: order.amount || amount,
          currency: 'INR',
          name: 'GST Billing Pro',
          description: planLabel,
          order_id: order.id,
          prefill: { email: user.email, name: user.email?.split('@')[0] || '' },
          theme: { color: '#2563eb' },
          handler: async (response) => {
            try {
              // Verify payment on server
              const verifyRes = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...response, userId: user.id, plan, amount }),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok || !verifyData.success) {
                throw new Error(verifyData.error || 'Payment verification failed');
              }
              await loadSubscription();
              setShowPayment(false);
              alert(`🎉 Payment successful! Your subscription is active for ${isAnnual ? '365 days' : '30 days'}.`);
            } catch (vErr) {
              alert(`Payment verification issue: ${vErr.message}. If money was deducted, contact support.`);
            } finally {
              setPaymentLoading(false);
            }
          },
          modal: {
            ondismiss: () => setPaymentLoading(false),
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      })
      .catch(err => {
        setPaymentLoading(false);
        alert(`Payment error: ${err.message || 'Payment initiation failed. Please try again.'}`);
      });
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg, #f0f2f5)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, border: '3px solid #e2e8f0',
            borderTopColor: '#2563eb', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem',
          }} />
          <p style={{ color: '#64748b' }}>Loading your account...</p>
        </div>
      </div>
    );
  }

  const active = isSubscriptionActive(sub);
  const daysLeft = getTrialDaysLeft(sub);
  const isTrial = sub?.status === 'trial';
  const isExpired = !active;

  // Show full payment wall if expired
  if (isExpired && sub) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
        padding: '1rem',
      }}>
        <div style={{
          background: '#fff', borderRadius: 20, padding: '2.5rem',
          maxWidth: 480, width: '100%', textAlign: 'center',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        }}>
          <div style={{
            width: 64, height: 64, background: '#fef2f2', borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}>
            <Clock size={32} color="#dc2626" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem' }}>
            Your Free Trial Has Ended
          </h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Thank you for trying GST Billing Pro! Subscribe now to continue creating invoices and managing your business.
          </p>

          {/* Plan Selector */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem'
          }}>
            <div
              onClick={() => setSelectedPlan('monthly')}
              style={{
                border: selectedPlan === 'monthly' ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                background: selectedPlan === 'monthly' ? '#eff6ff' : '#fff',
                borderRadius: 12, padding: '0.85rem 0.5rem', cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Monthly</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1e293b' }}>₹99</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>per month</div>
            </div>

            <div
              onClick={() => setSelectedPlan('annual')}
              style={{
                border: selectedPlan === 'annual' ? '2px solid #16a34a' : '1.5px solid #e2e8f0',
                background: selectedPlan === 'annual' ? '#f0fdf4' : '#fff',
                borderRadius: 12, padding: '0.85rem 0.5rem', cursor: 'pointer', transition: 'all 0.2s',
                position: 'relative', overflow: 'hidden'
              }}
            >
              <span style={{
                position: 'absolute', top: 0, right: 0, background: '#16a34a', color: '#fff',
                fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderBottomLeftRadius: 6
              }}>SAVE 16%</span>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#16a34a' }}>Annual (Best Value)</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1e293b' }}>₹999</div>
              <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>2 Months Free!</div>
            </div>
          </div>

          {/* Features */}
          {['Unlimited GST Invoices & E-Way Ready', 'GSTR-1 & GSTR-3B Auto-Tax Export', 'Clients, Inventory & Barcode Scanner',
            'PDF Download & Direct WhatsApp Share', 'Thermal (58mm/80mm) & A4 Printing', 'Priority Support & Cloud Sync'].map(f => (
            <div key={f} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.35rem 0', textAlign: 'left', color: '#374151', fontSize: '0.85rem',
            }}>
              <CheckCircle size={15} color="#059669" />
              {f}
            </div>
          ))}

          {/* Pay Button */}
          <button onClick={() => handleRazorpay(selectedPlan)} disabled={paymentLoading}
            style={{
              width: '100%', padding: '1rem', marginTop: '1.25rem',
              background: paymentLoading ? '#93c5fd' : selectedPlan === 'annual' ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: '1.05rem', fontWeight: 700, cursor: paymentLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              boxShadow: '0 4px 20px rgba(37,99,235,0.3)',
            }}>
            <CreditCard size={20} />
            {paymentLoading ? 'Processing...' : selectedPlan === 'annual' ? 'Subscribe for ₹999/year (Save 16%)' : 'Subscribe for ₹99/month'}
          </button>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0.5rem', marginTop: '1rem', color: '#64748b', fontSize: '0.8rem',
          }}>
            <Shield size={14} /> Secured by Razorpay • 100% Safe Payment
          </div>

          {onSignOut && (
            <button
              onClick={onSignOut}
              style={{
                marginTop: '1.25rem', background: 'none', border: 'none',
                color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Sign out ({user?.email})
            </button>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Active subscription — render app with optional trial banner
  return (
    <>
      {isTrial && daysLeft <= 7 && (
        <TrialBanner daysLeft={daysLeft} onUpgrade={() => setShowPayment(true)} />
      )}
      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onPay={handleRazorpay}
          paymentLoading={paymentLoading}
        />
      )}
      {children}
    </>
  );
}

// ---- Trial Warning Banner ----
function TrialBanner({ daysLeft, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const urgent = daysLeft <= 3;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: urgent
        ? 'linear-gradient(90deg, #dc2626, #b91c1c)'
        : 'linear-gradient(90deg, #d97706, #b45309)',
      color: '#fff', padding: '0.6rem 1rem',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
      fontSize: '0.875rem', fontWeight: 600,
    }}>
      <Zap size={16} />
      <span>
        {daysLeft === 0
          ? '⚠️ Your trial expires TODAY!'
          : `⚡ ${daysLeft} day${daysLeft > 1 ? 's' : ''} left in your free trial`}
      </span>
      <button onClick={onUpgrade} style={{
        background: '#fff', color: urgent ? '#dc2626' : '#d97706',
        border: 'none', borderRadius: 20, padding: '0.25rem 0.85rem',
        fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem',
      }}>
        Upgrade ₹99/mo
      </button>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0,
      }}>
        <X size={16} />
      </button>
    </div>
  );
}

// ---- Payment Modal ----
function PaymentModal({ onClose, onPay, paymentLoading }) {
  const [plan, setPlan] = useState('annual');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '2rem',
        maxWidth: 420, width: '100%', textAlign: 'center',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem' }}>
          Upgrade to Pro
        </h3>
        <p style={{ color: '#64748b', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          Choose your plan for uninterrupted GST billing & cloud sync
        </p>

        {/* Plan Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div
            onClick={() => setPlan('monthly')}
            style={{
              border: plan === 'monthly' ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
              background: plan === 'monthly' ? '#eff6ff' : '#fff',
              borderRadius: 12, padding: '0.75rem 0.5rem', cursor: 'pointer', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Monthly</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>₹99</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>per month</div>
          </div>

          <div
            onClick={() => setPlan('annual')}
            style={{
              border: plan === 'annual' ? '2px solid #16a34a' : '1.5px solid #e2e8f0',
              background: plan === 'annual' ? '#f0fdf4' : '#fff',
              borderRadius: 12, padding: '0.75rem 0.5rem', cursor: 'pointer', textAlign: 'center',
              position: 'relative', overflow: 'hidden'
            }}
          >
            <span style={{
              position: 'absolute', top: 0, right: 0, background: '#16a34a', color: '#fff',
              fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderBottomLeftRadius: 5
            }}>SAVE 16%</span>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a' }}>Annual (Best)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>₹999</div>
            <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>2 Months Free!</div>
          </div>
        </div>

        <button onClick={() => onPay(plan)} disabled={paymentLoading}
          style={{
            width: '100%', padding: '0.9rem',
            background: paymentLoading ? '#93c5fd' : plan === 'annual' ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#fff', border: 'none', borderRadius: 12,
            fontSize: '1rem', fontWeight: 700, cursor: paymentLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          }}>
          <CreditCard size={18} />
          {paymentLoading ? 'Processing...' : plan === 'annual' ? 'Pay ₹999 / Year (Save 16%)' : 'Pay ₹99 / Month'}
        </button>
        <button onClick={onClose}
          style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>
          Maybe later
        </button>
        <div style={{ marginTop: '0.75rem', color: '#94a3b8', fontSize: '0.75rem' }}>
          <Shield size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Secured by Razorpay
        </div>
      </div>
    </div>
  );
}
