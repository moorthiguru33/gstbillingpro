import { StrictMode, Component, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { useTranslation } from 'react-i18next'
import './i18n'
import App from './App.jsx'
import './index.css'

// /admin is a separate, lazily loaded screen (its own chunk). Access is
// decided by the server (/api/admin/*), never by this route.
const AdminApp = lazy(() => import('./components/admin/AdminApp.jsx'))
const isAdminRoute = () => /^\/admin\/?$/.test(window.location.pathname)

// Re-render the whole tree when the UI language changes. <App /> is created
// here (not passed in as children) so React does not bail out of the update.
// eslint-disable-next-line react-refresh/only-export-components
function Root() {
  useTranslation()
  if (isAdminRoute()) {
    return <Suspense fallback={<div style={{ padding: '2rem', fontFamily: 'Inter, sans-serif' }}>Loading…</div>}><AdminApp /></Suspense>
  }
  return <App />
}

// v1.10.2 — Deferred SW update. Prior code called `updateSW(true)`
// inside `onNeedRefresh` which triggers `location.reload()` immediately.
// If the user was mid-invoice (typing line items, editing terms), that
// state was blown away on every deploy.
//
// v1.10.33 — Reported "it work in incognito only ... it should auto
// refresh hard cache after update". Root cause: v1.10.2's deferred
// pattern only fired the update on blur, but if the user never blurred
// the tab AND the old bundle hashes stopped matching the new
// index.html assets, the tab served a broken bundle → white screen.
// Now:
//   1. onNeedRefresh: stash flag + dispatch event (existing UI hook).
//   2. Auto-apply after 20 seconds of no user activity — long enough
//      that a mid-form user can save/finish, short enough that we
//      don't wait for a browser blur that may never come.
//   3. Still auto-apply on blur (fastest safe moment).
//   4. Also auto-apply immediately if the user is on a read-only view
//      (dashboard, clients, reports). Detected via presence of ANY
//      `contenteditable`, `<input>`, or `<textarea>` with a non-empty
//      value — if none, we're not editing.
let __updateSW = null;
window.__fgsbSwUpdateReady = false;

const hasUnsavedInput = () => {
  try {
    const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
    for (const el of inputs) {
      if (el.value && String(el.value).trim().length > 0) return true;
      if (el.getAttribute?.('contenteditable') === 'true' && el.textContent?.trim().length > 0) return true;
    }
    return false;
  } catch { return false; }
};

__updateSW = registerSW({
  onNeedRefresh() {
    window.__fgsbSwUpdateReady = true;
    window.dispatchEvent(new CustomEvent('fgsb-sw-update-ready'));
    // If user is on a read-only view, apply immediately — no white-screen
    // risk from stale hash-mismatched bundle.
    if (!hasUnsavedInput()) {
      setTimeout(() => window.__fgsbApplyUpdate?.(), 500);
      return;
    }
    // Otherwise wait 20s — enough to finish typing a line or two, then
    // auto-apply. User can also blur / navigate to trigger it sooner.
    setTimeout(() => window.__fgsbApplyUpdate?.(), 20_000);
  },
  onOfflineReady() {
    // Prior console.log removed — production hygiene (v1.9.15 audit L1).
    window.dispatchEvent(new CustomEvent('fgsb-sw-offline-ready'));
  },
});

// Called by whichever UI component (or auto-defer logic) decides now is
// the right moment to activate the pending SW and reload.
window.__fgsbApplyUpdate = () => {
  if (!window.__fgsbSwUpdateReady) return;
  window.__fgsbSwUpdateReady = false;
  if (__updateSW) __updateSW(true);
};

// Auto-apply on blur (user tabbed away from the app) — safe moment.
window.addEventListener('blur', () => {
  if (window.__fgsbSwUpdateReady) window.__fgsbApplyUpdate();
});

// v1.10.35 — Nuclear defensive path for the "still white screen on
// refresh after v1.10.33" report. Root cause: users' currently-running
// SW was installed BEFORE we set skipWaiting=true, so their SW still
// behaves the old way — stalls in `waiting` state and never activates
// the fresh SW that was published. Result: browser reloads → SW serves
// stale index.html + stale bundle names → the referenced JS chunks
// no longer exist → white screen.
//
// On every load:
//   1. If a `waiting` SW registration exists, force it to skipWaiting
//      via message post AND reload once it activates. One-time cost:
//      one auto-reload the first time the user hits v1.10.35.
//   2. If the loaded main bundle hits a `chunk-load` error (imports
//      referencing files the SW's cache doesn't have), auto-reload
//      once — belt-and-braces after case 1.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;
    // Take the waiting SW live if there is one.
    if (reg.waiting) {
      try {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch { /* ignore */ }
    }
    // Any time a fresh SW takes control, reload once so the client
    // JS matches the SW's manifest. Only fires when we didn't cause
    // it ourselves (already-mounted app).
    let alreadyReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (alreadyReloaded) return;
      alreadyReloaded = true;
      window.location.reload();
    });
  }).catch(() => { /* not registered yet — first load */ });

  // Chunk-load safety net. Vite's dynamic imports produce
  // `Failed to fetch dynamically imported module` (Chrome) or
  // `error loading dynamically imported module` (Firefox/Safari) when
  // the requested chunk name changed post-deploy. Reload once to
  // fetch the current index.html + its correct chunk map.
  let chunkReloadFired = false;
  window.addEventListener('error', (e) => {
    const msg = String(e?.message || e?.error?.message || '');
    if (!chunkReloadFired && /dynamically imported module|Loading chunk|Failed to fetch dynamically/i.test(msg)) {
      chunkReloadFired = true;
      // Small delay so we don't reload-loop on a genuine broken state.
      setTimeout(() => window.location.reload(), 200);
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = String(e?.reason?.message || e?.reason || '');
    if (!chunkReloadFired && /dynamically imported module|Loading chunk|Failed to fetch dynamically/i.test(msg)) {
      chunkReloadFired = true;
      setTimeout(() => window.location.reload(), 200);
    }
  });
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', padding: '1.5rem', fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: 480, width: '100%', background: '#fff', borderRadius: 16, padding: '2rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.08)', textAlign: 'center', border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {this.state.error?.message || 'An unexpected error occurred while loading the application.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  try {
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(regs => {
                        for (let r of regs) r.unregister();
                      });
                    }
                    localStorage.removeItem('freegstbill_dismissedUpdate');
                  } catch {}
                  window.location.reload();
                }}
                style={{
                  padding: '0.65rem 1.25rem', background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem'
                }}
              >
                Reload App
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.clear();
                    sessionStorage.clear();
                  } catch {}
                  window.location.reload();
                }}
                style={{
                  padding: '0.65rem 1.25rem', background: '#f1f5f9', color: '#475569',
                  border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem'
                }}
              >
                Clear Data & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
)
