// Unit tests for the in-app router (src/lib/appRouter.js): URL mapping and the
// history controller (Back steps through screens, closes overlays first,
// never duplicates entries, root exit guard, unsaved-work guard).
import assert from 'node:assert/strict';
import {
  routeToPath, pathToRoute, routeKey, sameRoute, isAppPath, normalizeRoute, VIEW_SEGMENTS, createAppRouter,
} from '../src/lib/appRouter.js';

let n = 0;
const tick = () => new Promise(r => setTimeout(r, 5));
const test = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

// Minimal browser-history fake: entries + index, async go() firing popstate.
function fakeWin(startPath = '/') {
  const entries = [{ state: null, path: startPath }];
  let i = 0; let left = 0;
  const listeners = new Set();
  const win = {
    history: {
      get state() { return entries[i].state; },
      get length() { return entries.length; },
      pushState(state, _t, path) { entries.splice(i + 1); entries.push({ state, path }); i++; },
      replaceState(state, _t, path) { entries[i] = { state, path }; },
      go(d) {
        setTimeout(() => {
          const j = i + d;
          if (j < 0) { left++; return; }
          if (j >= entries.length || d === 0) return;
          i = j;
          listeners.forEach(fn => fn({ state: entries[i].state }));
        }, 0);
      },
    },
    location: { get pathname() { return entries[i].path; } },
    addEventListener: (t, fn) => { if (t === 'popstate') listeners.add(fn); },
    removeEventListener: (t, fn) => { if (t === 'popstate') listeners.delete(fn); },
  };
  return { win, back: async () => { win.history.go(-1); await tick(); await tick(); }, entries, idx: () => i, left: () => left };
}
const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

function harness({ guard = false, path = '/', start = { view: 'dashboard' } } = {}) {
  const f = fakeWin(path);
  const h = { f, routes: [], exits: 0, closes: 0, overlays: 0, view: normalizeRoute(start) };
  h.router = createAppRouter({
    win: f.win, storage: memStorage(), useExitGuard: guard,
    onRoute: (r) => { h.routes.push(routeKey(r)); h.view = r; h.router.navigate(r); },
    onExitAttempt: () => { h.exits++; },
    overlayCount: () => h.overlays,
    closeTopOverlay: () => { h.closes++; h.overlays = Math.max(0, h.overlays - 1); },
  });
  h.router.start(h.view);
  h.go = async (r) => { h.view = normalizeRoute(r); h.router.navigate(h.view); await tick(); };
  h.openOverlay = async () => { h.overlays++; h.router.syncOverlays(); await tick(); };
  h.closeOverlayByUi = async () => { h.overlays--; h.router.syncOverlays(); await tick(); await tick(); };
  h.path = () => f.win.location.pathname;
  return h;
}

await test('route <-> path mapping', () => {
  assert.equal(routeToPath({ view: 'dashboard' }), '/app');
  assert.equal(routeToPath({ view: 'dashboard', sub: 'bills' }), '/app/invoices');
  assert.equal(routeToPath({ view: 'new' }), '/app/invoices/new');
  assert.equal(routeToPath({ view: 'settings', sub: 'printing' }), '/app/settings/printing');
  assert.equal(routeToPath({ view: 'settings', sub: 'home' }), '/app/settings');
  assert.equal(routeToPath({ view: 'nope' }), '/app');
  for (const view of Object.keys(VIEW_SEGMENTS)) {
    assert.deepEqual(pathToRoute(routeToPath({ view })), { view, sub: '' }, view);
  }
  assert.deepEqual(pathToRoute('/app/invoices'), { view: 'dashboard', sub: 'bills' });
  assert.deepEqual(pathToRoute('/app/settings/printing/'), { view: 'settings', sub: 'printing' });
  assert.deepEqual(pathToRoute('/app/'), { view: 'dashboard', sub: '' });
  assert.equal(pathToRoute('/app/unknown'), null);
  assert.equal(pathToRoute('/kirana'), null);
  assert.equal(pathToRoute('/b/abc'), null);
  assert.equal(pathToRoute('/application'), null);
  assert.equal(isAppPath('/admin'), false);
  assert.equal(isAppPath('/app/pos'), true);
  assert.equal(sameRoute({ view: 'pos', sub: 'x' }, { view: 'pos' }), true);
  assert.equal(routeKey({ view: 'settings', sub: 'gst' }), 'settings/gst');
});

await test('Back walks sheet -> list -> dashboard', async () => {
  const h = harness();
  assert.equal(h.path(), '/app');
  await h.go({ view: 'dashboard', sub: 'bills' });
  await h.go({ view: 'new' });
  await h.openOverlay();
  assert.equal(h.f.entries.length, 4);
  assert.equal(h.path(), '/app/invoices/new');
  await h.f.back();
  assert.equal(h.closes, 1, 'first Back closes the sheet');
  assert.equal(h.routes.length, 0, 'screen unchanged');
  await h.f.back();
  assert.deepEqual(h.routes, ['dashboard/bills']);
  assert.equal(h.path(), '/app/invoices');
  await h.f.back();
  assert.deepEqual(h.routes, ['dashboard/bills', 'dashboard']);
  assert.equal(h.path(), '/app');
  assert.equal(h.f.left(), 0);
});

await test('no duplicate entries; returning to previous screen pops instead of pushing', async () => {
  const h = harness();
  await h.go({ view: 'clients' });
  await h.go({ view: 'clients' });
  assert.equal(h.f.entries.length, 2);
  await h.go({ view: 'dashboard' }); // in-app "Home" = previous entry
  await tick();
  assert.equal(h.f.idx(), 0);
  assert.equal(h.path(), '/app');
  await h.go({ view: 'reports' });
  assert.equal(h.f.entries.length, 2, 'forward history replaced, not grown');
});

await test('overlay closed by its own button removes its history entry', async () => {
  const h = harness();
  await h.go({ view: 'pos' });
  await h.openOverlay();
  assert.equal(h.f.idx(), 2);
  await h.closeOverlayByUi();
  assert.equal(h.f.idx(), 1);
  await h.go({ view: 'reports' });
  assert.equal(h.path(), '/app/reports');
  await h.f.back();
  assert.deepEqual(h.routes, ['pos']);
});

await test('root guard: first Back warns, second leaves (phones)', async () => {
  const h = harness({ guard: true });
  await h.f.back();
  assert.equal(h.exits, 1);
  assert.equal(h.f.left(), 0);
  assert.equal(h.path(), '/app');
  await h.f.back();
  await tick();
  assert.equal(h.f.left(), 1, 'second Back leaves the site');
});

await test('deep link: Back goes Home before the exit warning', async () => {
  const h = harness({ guard: true, path: '/app/settings/printing', start: { view: 'settings', sub: 'printing' } });
  assert.equal(h.path(), '/app/settings/printing');
  await h.f.back();
  assert.deepEqual(h.routes, ['dashboard']);
  assert.equal(h.exits, 0);
  assert.equal(h.path(), '/app');
  await h.f.back();
  assert.equal(h.exits, 1);
});

await test('unsaved work blocks Back until the screen allows it', async () => {
  const h = harness();
  await h.go({ view: 'new' });
  let blocked = 0;
  h.router.setLeaveGuard(() => { blocked++; return false; });
  await h.f.back(); await tick();
  assert.equal(blocked, 1);
  assert.equal(h.routes.length, 0);
  assert.equal(h.path(), '/app/invoices/new', 'stays on the editor');
  h.router.setLeaveGuard(null);
  await h.f.back();
  assert.deepEqual(h.routes, ['dashboard']);
  assert.deepEqual(h.router.previousRoute(), null);
});

await test('leave dialog opened during the restore keeps the editor URL', async () => {
  const h = harness();
  await h.go({ view: 'dashboard', sub: 'bills' });
  await h.go({ view: 'new' });
  h.router.setLeaveGuard(() => { h.overlays++; h.router.syncOverlays(); return false; });
  await h.f.back(); await tick(); await tick();
  assert.equal(h.path(), '/app/invoices/new');
  assert.equal(h.router._debug().stack.at(-1), 'new#ov');
  h.router.setLeaveGuard(null);
  await h.f.back(); // Back closes the dialog
  assert.equal(h.closes, 1);
  assert.equal(h.path(), '/app/invoices/new');
});

await test('previousRoute for in-app back buttons', async () => {
  const h = harness();
  await h.go({ view: 'settings' });
  await h.go({ view: 'settings', sub: 'printing' });
  assert.deepEqual(h.router.previousRoute(), { view: 'settings', sub: '' });
  await h.go({ view: 'settings' });
  await tick();
  assert.equal(h.f.idx(), 1, 'All settings pops back');
});

await test('phone pages: insights, menu, docs, preferences, profile, items', async () => {
  assert.deepEqual(pathToRoute('/app/insights'), { view: 'insights', sub: '' });
  assert.deepEqual(pathToRoute('/app/menu'), { view: 'menu', sub: '' });
  assert.deepEqual(pathToRoute('/app/docs/cheques'), { view: 'txn', sub: 'cheques' });
  assert.equal(routeToPath({ view: 'txn', sub: 'loans' }), '/app/docs/loans');
  assert.deepEqual(pathToRoute('/app/preferences/print'), { view: 'prefs', sub: 'print' });
  assert.deepEqual(pathToRoute('/app/business-profile'), { view: 'profile', sub: '' });
  assert.deepEqual(pathToRoute('/app/items/manage'), { view: 'inventory', sub: 'manage' });
});

console.log(`router-test: ${n} groups passed`);
