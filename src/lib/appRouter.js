// In-app navigation <-> browser history.
//
// The app keeps its own screen state (currentView etc.); this module mirrors
// it into real URLs (/app, /app/invoices/new, /app/settings/printing …) so the
// browser / phone / TWA Back button walks back through screens instead of
// leaving the site. It also gives every open modal, bottom sheet or drawer its
// own history entry, so Back closes the overlay first.
//
// Pure helpers (routeToPath / pathToRoute / …) are unit tested in
// scripts/router-test.mjs together with the controller, which takes an
// injectable `win` so it runs against a fake history in Node.

export const APP_BASE = '/app';

// view id -> URL segment under /app
export const VIEW_SEGMENTS = {
  dashboard: '',
  new: 'invoices/new',
  pos: 'pos',
  clients: 'parties',
  inventory: 'items',
  expenses: 'expenses',
  purchases: 'purchases',
  recurring: 'recurring',
  receipts: 'receipts',
  reports: 'reports',
  filing: 'gst-returns',
  incometax: 'income-tax',
  settings: 'settings',
  support: 'support',
  controlpanel: 'control-panel',
  store: 'store',
  crm: 'crm',
  accounts: 'accounts',
  payroll: 'payroll',
  insights: 'insights',
  menu: 'menu',
  txn: 'docs',
  prefs: 'preferences',
  profile: 'business-profile',
};
// Views with their own sub pages (/app/<view>/<sub>): module screens.
export const SUB_VIEWS = ['settings', 'store', 'crm', 'accounts', 'payroll', 'txn', 'prefs', 'inventory'];
const SEGMENT_VIEWS = Object.fromEntries(Object.entries(VIEW_SEGMENTS).map(([v, s]) => [s, v]));
const SUB_RE = /^[a-z0-9-]{1,40}$/;

export const OVERLAY_SELECTOR = '.modal-overlay, .msheet-backdrop, .sidebar-backdrop';

export function normalizeRoute(r) {
  const view = r && VIEW_SEGMENTS[r.view] !== undefined ? r.view : 'dashboard';
  let sub = r && typeof r.sub === 'string' ? r.sub : '';
  if (view === 'dashboard' && sub !== 'bills') sub = '';
  if (SUB_VIEWS.includes(view) && (sub === 'home' || !SUB_RE.test(sub))) sub = '';
  if (view !== 'dashboard' && !SUB_VIEWS.includes(view)) sub = '';
  return { view, sub };
}

export function routeToPath(route) {
  const { view, sub } = normalizeRoute(route);
  if (view === 'dashboard') return sub === 'bills' ? `${APP_BASE}/invoices` : APP_BASE;
  const seg = VIEW_SEGMENTS[view];
  return `${APP_BASE}/${seg}${sub ? `/${sub}` : ''}`;
}

export function isAppPath(pathname) {
  return typeof pathname === 'string' && (pathname === APP_BASE || pathname.startsWith(`${APP_BASE}/`));
}

// Returns { view, sub } for an /app path, or null when the path isn't an app
// screen we know (callers then fall back to their default).
export function pathToRoute(pathname) {
  if (!isAppPath(pathname)) return null;
  const rest = pathname.slice(APP_BASE.length).replace(/^\/+|\/+$/g, '').toLowerCase();
  if (rest === '') return { view: 'dashboard', sub: '' };
  if (rest === 'invoices') return { view: 'dashboard', sub: 'bills' };
  if (SEGMENT_VIEWS[rest]) return { view: SEGMENT_VIEWS[rest], sub: '' };
  const m = rest.match(/^([a-z-]+)\/([a-z0-9-]{1,40})$/);
  if (m && SEGMENT_VIEWS[m[1]] && SUB_VIEWS.includes(SEGMENT_VIEWS[m[1]])) return normalizeRoute({ view: SEGMENT_VIEWS[m[1]], sub: m[2] });
  return null;
}

export const routeKey = (r) => { const n = normalizeRoute(r); return n.sub ? `${n.view}/${n.sub}` : n.view; };
export const sameRoute = (a, b) => routeKey(a) === routeKey(b);
const keyToRoute = (k) => { const [view, sub = ''] = String(k).split('/'); return normalizeRoute({ view, sub }); };
const OV = '#ov';

/**
 * createAppRouter({ win, onRoute, onExitAttempt, onLeaveBlocked, useExitGuard, storage })
 *  - onRoute(route)        apply a route coming from Back/Forward
 *  - onExitAttempt()       first Back on the root screen (show "press again")
 *  - useExitGuard          keep a guard entry under the root (phones / TWA)
 *  - leave guard           setLeaveGuard(fn): fn() returns true when it's OK
 *                          to leave the current screen; false keeps the user
 *                          (the screen shows its own "unsaved changes" dialog)
 */
export function createAppRouter({ win, onRoute, onExitAttempt, useExitGuard = false, storage, overlayCount, closeTopOverlay }) {
  const H = win.history;
  const STACK_KEY = 'gbp_nav_stack';
  let stack = [];
  let cur = 0;
  let guard = false;
  let overlayDepth = 0;
  let exitArmed = false;
  let exitTimer = null;
  let leaveGuard = null;
  const ops = [];
  let waiting = null; // { apply, idx } while our own history.go() is in flight
  let waitTimer = null;
  let late = null; // a go() whose popstate arrived after the queue moved on
  let started = false;
  let holding = false; // queue paused while a leave guard decides

  const save = () => { try { storage?.setItem(STACK_KEY, JSON.stringify({ stack, guard })); } catch { /* ignore */ } };
  const state = (idx, extra = {}) => ({ gbp: 1, idx, key: stack[idx], ...extra });
  const viewKey = () => { let i = cur; while (i > 0 && String(stack[i]).endsWith(OV)) i--; return String(stack[i]).replace(OV, ''); };
  const firstIdx = () => (guard ? 1 : 0);

  function run() {
    while (!waiting && !holding && ops.length) ops.shift()();
  }
  function startGo(delta, apply) {
    if (!delta) return;
    waiting = { apply, idx: cur + delta };
    clearTimeout(waitTimer);
    // never wedge the queue if the popstate is slow (busy main thread)
    waitTimer = setTimeout(() => { late = { ...waiting, until: Date.now() + 4000 }; waiting = null; run(); }, 1500);
    H.go(delta);
  }
  function go(delta, apply) {
    ops.push(() => startGo(delta, apply));
    run();
  }
  // Pop up to `want` overlay entries — only ever our own '#ov' entries on top,
  // so this can never step out of the app.
  function popOverlays(want) {
    ops.push(() => {
      let k = 0;
      while (k < want && cur - k > 0 && String(stack[cur - k]).endsWith(OV)) k++;
      startGo(-k, false);
    });
    run();
  }
  function push(keyOrFn, extra) {
    ops.push(() => {
      const key = typeof keyOrFn === 'function' ? keyOrFn() : keyOrFn;
      stack = stack.slice(0, cur + 1).concat(key);
      cur = stack.length - 1;
      H.pushState(state(cur, extra), '', routeToPath(keyToRoute(key.replace(OV, ''))));
      save();
    });
    run();
  }

  function syncOverlays() {
    if (!started || !overlayCount) return;
    const n = overlayCount();
    if (n > overlayDepth) {
      // key resolved when the op runs: a pending go() may still move us
      for (let i = overlayDepth; i < n; i++) push(() => viewKey() + OV);
      overlayDepth = n;
    } else if (n < overlayDepth) {
      popOverlays(overlayDepth - n);
      overlayDepth = n;
    }
  }

  function start(route) {
    const key = routeKey(route);
    const st = H.state;
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(STACK_KEY) || 'null'); } catch { saved = null; }
    started = true;
    if (st && st.gbp && saved && Array.isArray(saved.stack) && saved.stack[st.idx] !== undefined) {
      // Refresh: keep the existing history; drop overlay entries we can't restore.
      stack = saved.stack; guard = !!saved.guard; cur = st.idx;
      stack[cur] = key;
      H.replaceState(state(cur), '', routeToPath(route));
      save();
      return;
    }
    guard = !!useExitGuard;
    if (guard) {
      stack = [key, key]; cur = 1;
      H.replaceState(state(0, { guard: 1 }), '', routeToPath(route));
      H.pushState(state(1), '', routeToPath(route));
    } else {
      stack = [key]; cur = 0;
      H.replaceState(state(0), '', routeToPath(route));
    }
    save();
  }

  // Called whenever the app's screen changes (clicks, links, after Back).
  function navigate(route) {
    if (!started) return;
    syncOverlays(); // an overlay closing in the same click must be popped first
    const key = routeKey(route);
    ops.push(() => {
      if (stack[cur] === key) return; // same screen: no duplicate entry
      if (cur - 1 >= firstIdx() && stack[cur - 1] === key) { go(-1, false); return; } // it's where Back would go
      push(key);
    });
    run();
  }

  // Previous screen (for in-app "Back" buttons), or null.
  function previousRoute() {
    let i = cur - 1;
    while (i >= firstIdx() && String(stack[i]).endsWith(OV)) i--;
    return i >= firstIdx() ? keyToRoute(stack[i]) : null;
  }

  function onPop(e) {
    const st = e.state;
    if (!waiting && late && st && st.gbp && st.idx === late.idx && Date.now() < late.until) {
      cur = st.idx; late = null; return; // our slow go() finally landed
    }
    late = null;
    if (waiting) {
      const { apply } = waiting;
      waiting = null; clearTimeout(waitTimer);
      if (st && st.gbp) cur = st.idx;
      if (apply) onRoute(pathToRoute(win.location.pathname) || { view: 'dashboard', sub: '' });
      run();
      return;
    }
    if (!st || !st.gbp) return; // not ours (e.g. a hash jump) — leave it alone
    const from = cur;
    const to = st.idx;
    // Back out of an open modal / sheet / drawer: close it, stay on the screen.
    if (to < from && overlayDepth > 0 && String(stack[from]).endsWith(OV)) {
      cur = to;
      overlayDepth = Math.max(0, overlayDepth - (from - to));
      closeTopOverlay?.();
      // If it refused to close (e.g. a required dialog), give it its entry back.
      setTimeout(syncOverlays, 350);
      return;
    }
    // Root guard reached: second Back within 2 s leaves, first one warns.
    if (st.guard) {
      const prevKey = String(stack[from] || '').replace(OV, '');
      stack = stack.slice(0, 1); cur = 0;
      if (prevKey && prevKey !== 'dashboard') {
        // Not on Home yet (e.g. opened via a deep link): Back goes Home first.
        push('dashboard');
        onRoute({ view: 'dashboard', sub: '' });
        return;
      }
      if (exitArmed) { // second Back within 2 s: really leave
        clearTimeout(exitTimer); exitArmed = false;
        H.go(-1);
        return;
      }
      exitArmed = true;
      clearTimeout(exitTimer);
      exitTimer = setTimeout(() => { exitArmed = false; }, 2000);
      push('dashboard');
      onExitAttempt?.();
      return;
    }
    // Leaving a screen with unsaved work: stay (the screen shows its dialog).
    if (leaveGuard && to !== from) {
      cur = to;
      holding = true; // the guard may open its dialog (an overlay push) right now
      let ok = true;
      try { ok = leaveGuard() !== false; } finally { holding = false; }
      if (!ok) {
        ops.unshift(() => startGo(from - to, false)); // first return to the screen
        run();
        return;
      }
      run();
    }
    cur = to;
    const route = pathToRoute(win.location.pathname) || keyToRoute(String(stack[to] || 'dashboard').replace(OV, ''));
    // Landed on a stale overlay entry (overlay already gone): skip past it.
    if (String(stack[to]).endsWith(OV) && overlayCount && overlayCount() === 0) {
      overlayDepth = 0;
      onRoute(route);
      go(to < from ? -1 : 1, false);
      return;
    }
    onRoute(route);
  }

  win.addEventListener('popstate', onPop);
  return {
    start,
    navigate,
    previousRoute,
    syncOverlays,
    setLeaveGuard: (fn) => { leaveGuard = fn; },
    stop() {
      win.removeEventListener('popstate', onPop);
      clearTimeout(exitTimer); clearTimeout(waitTimer);
      started = false;
    },
    // for tests
    _debug: () => ({ stack: [...stack], cur, overlayDepth, guard, exitArmed }),
  };
}

// The live router instance (App owns it) so screens can register a leave
// guard without prop drilling. A guard set before the router exists (child
// effects run before the parent's) is kept and handed over on creation.
let activeRouter = null;
let leaveGuardFn = null;
export function setActiveRouter(r) {
  activeRouter = r;
  if (r) r.setLeaveGuard(leaveGuardFn);
}
export function setLeaveGuard(fn) {
  leaveGuardFn = fn || null;
  activeRouter?.setLeaveGuard(leaveGuardFn);
}
