// Small device preferences used by the phone settings pages (localStorage).
const KEY = 'gbp_prefs';
const DEFAULTS = { waAfterSave: false, homeShowBalance: true, posQuickPick: true, itemShowPurchase: true, partyShowBalance: true, density: 'compact' };
export function getPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export const getPref = (k) => getPrefs()[k];
export function setPref(k, v) {
  const next = { ...getPrefs(), [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  if (k === 'density') applyDensity(next);
  return next;
}
/** Compact (default) or Comfortable spacing on phones: a class on <html>. */
export function applyDensity(prefs = getPrefs()) {
  try { document.documentElement.classList.toggle('compact', prefs.density !== 'comfortable'); } catch { /* no DOM */ }
}
