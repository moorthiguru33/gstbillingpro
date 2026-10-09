import { useState, useEffect } from 'react';
import { FileText, Eye, EyeOff, Loader2, CheckCircle, ArrowRight, Zap, Shield, BarChart3, Users, RefreshCw, Download } from 'lucide-react';
import { signIn, signUp, resetPassword, signInWithGoogle } from '../lib/supabase.js';

// ============================================================
// AuthPage — Beautiful Login / Register / Forgot Password
// ============================================================

export default function AuthPage({ onAuth, onStartDemo }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google Sign-in failed. Please try email login.');
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await signIn(email, password);
      onAuth(data.user, data.session);
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Incorrect email or password. Please try again.'
        : err.message);
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const data = await signUp(email, password);
      if (data?.session) {
        onAuth(data.user, data.session);
      } else {
        setSuccess('✅ Account created! Check your email to verify, then login.');
        setTab('login');
      }
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await resetPassword(email);
      setSuccess('✅ Password reset link sent to your email!');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const features = [
    { icon: FileText, text: 'GST Tax Invoices, Credit Notes, Proforma' },
    { icon: BarChart3, text: 'GSTR-1, GSTR-3B automatic export' },
    { icon: Users, text: 'Unlimited clients & products' },
    { icon: Shield, text: 'Your data is 100% private & secure' },
    { icon: RefreshCw, text: 'Recurring invoices & auto-billing' },
    { icon: Download, text: 'PDF download & WhatsApp share' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Left Panel — Branding */}
      <div style={{
        flex: '0 0 45%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '3rem',
        color: '#fff',
        background: 'rgba(0,0,0,0.2)',
      }} className="auth-left-panel">
        <div style={{ maxWidth: 420 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
            <div style={{
              width: 48, height: 48, background: '#3b82f6', borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
            }}>
              <FileText size={26} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>GST Billing Pro</h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#93c5fd' }}>India's Smartest Billing Software</p>
            </div>
          </div>

          {/* Headline */}
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '1rem' }}>
            Create Professional<br />
            <span style={{ color: '#60a5fa' }}>GST Invoices</span><br />
            in Seconds
          </h2>
          <p style={{ color: '#bfdbfe', fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
            Complete GST billing solution for Indian businesses. GSTR-1, GSTR-3B, TDS, multi-currency and much more.
          </p>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {features.map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={16} color="#60a5fa" />
                </div>
                <span style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>{text}</span>
              </div>
            ))}
          </div>

          {/* Pricing Badge */}
          <div style={{
            marginTop: '2rem',
            background: 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 12,
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <Zap size={20} color="#34d399" />
            <div>
              <div style={{ fontWeight: 700, color: '#34d399', fontSize: '1rem' }}>
                30 Days FREE Trial
              </div>
              <div style={{ color: '#a7f3d0', fontSize: '0.8rem' }}>
                Then only ₹99/month • Cancel anytime
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Auth Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(10px)',
      }}>
        {/* Mobile Header Branding (Shown only on small screens) */}
        <div className="auth-mobile-header" style={{
          display: 'none',
          textAlign: 'center',
          marginBottom: '1.25rem',
          color: '#fff',
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <div style={{
              width: 36, height: 36, background: '#3b82f6', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileText size={20} color="#fff" />
            </div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>GST Billing Pro</h1>
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#93c5fd' }}>30 Days Free Trial • Unlimited Invoices</p>
        </div>

        <div style={{
          background: '#fff',
          borderRadius: 20,
          padding: '2rem',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        }}>
          {/* Quick Demo Mode Action */}
          {onStartDemo && (
            <div style={{ marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={onStartDemo}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
                  transition: 'all 0.2s',
                }}
              >
                <Zap size={18} /> Try Live Demo (No Sign-in Needed)
              </button>
              <div style={{ textAlign: 'center', marginTop: 4, fontSize: '0.72rem', color: '#64748b' }}>
                Instant access with preloaded sample invoices & inventory
              </div>
            </div>
          )}

          {/* Google Sign-in */}
          {tab !== 'forgot' && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: '#ffffff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 12,
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  color: '#1e293b',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s',
                  marginBottom: '1rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>

              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                margin: '1rem 0 1.25rem', color: '#94a3b8', fontSize: '0.8rem'
              }}>
                <span style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                <span>or continue with email</span>
                <span style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              </div>
            </>
          )}

          {/* Tabs */}
          {tab !== 'forgot' && (
            <div style={{
              display: 'flex',
              background: '#f1f5f9',
              borderRadius: 10,
              padding: 4,
              marginBottom: '1.25rem',
            }}>
              {['login', 'register'].map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(''); setSuccess(''); }}
                  style={{
                    flex: 1, padding: '0.55rem', border: 'none', borderRadius: 8,
                    fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: tab === t ? '#fff' : 'transparent',
                    color: tab === t ? '#1e40af' : '#64748b',
                    boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {t === 'login' ? '🔑 Login' : '🚀 Register Free'}
                </button>
              ))}
            </div>
          )}

          {/* Title */}
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
            {tab === 'login' ? 'Sign in to Account' : tab === 'register' ? 'Create your account' : 'Reset Password'}
          </h2>
          <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.85rem' }}>
            {tab === 'login' ? 'Manage your GST invoices and inventory'
              : tab === 'register' ? 'Start your 30-day free trial — no credit card needed'
              : 'Enter your email to receive a reset link'}
          </p>

          {/* Messages */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '0.75rem 1rem',
              color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem',
            }}>
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, padding: '0.75rem 1rem',
              color: '#166534', fontSize: '0.875rem', marginBottom: '1rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <CheckCircle size={16} /> {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={tab === 'login' ? handleLogin : tab === 'register' ? handleRegister : handleForgot}>
            {/* Email */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: '#374151', marginBottom: '0.4rem' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', fontSize: '0.95rem',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            {/* Password */}
            {tab !== 'forgot' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: '#374151', marginBottom: '0.4rem' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={tab === 'register' ? 'Minimum 8 characters' : '••••••••'}
                    required
                    style={{
                      width: '100%', padding: '0.75rem 2.75rem 0.75rem 1rem', borderRadius: 10,
                      border: '1.5px solid #e2e8f0', fontSize: '0.95rem',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#3b82f6'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)} style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                    display: 'flex', alignItems: 'center',
                  }}>
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password */}
            {tab === 'register' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: '#374151', marginBottom: '0.4rem' }}>
                  Confirm Password
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  style={{
                    width: '100%', padding: '0.75rem 1rem', borderRadius: 10,
                    border: '1.5px solid #e2e8f0', fontSize: '0.95rem',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
            )}

            {/* Forgot link */}
            {tab === 'login' && (
              <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                <button type="button" onClick={() => { setTab('forgot'); setError(''); setSuccess(''); }}
                  style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.85rem',
                background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                boxShadow: '0 4px 15px rgba(37,99,235,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? (
                <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Please wait...</>
              ) : tab === 'login' ? (
                <>Login <ArrowRight size={18} /></>
              ) : tab === 'register' ? (
                <>Start Free Trial <ArrowRight size={18} /></>
              ) : (
                <>Send Reset Link <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          {/* Back to login from forgot */}
          {tab === 'forgot' && (
            <button onClick={() => { setTab('login'); setError(''); setSuccess(''); }}
              style={{ marginTop: '1rem', background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.875rem', cursor: 'pointer', width: '100%', textAlign: 'center' }}>
              ← Back to login
            </button>
          )}

          {/* Terms */}
          {tab === 'register' && (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', marginTop: '1rem', lineHeight: 1.5 }}>
              By registering, you agree to our Terms of Service.<br />
              First 30 days free, then ₹99/month.
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .auth-left-panel { display: none !important; }
          .auth-mobile-header { display: block !important; }
        }
      `}</style>
    </div>
  );
}
