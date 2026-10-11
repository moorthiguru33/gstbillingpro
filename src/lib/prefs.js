// Small device preferences used by the phone settings pages (localStorage).
const KEY = 'gbp_prefs';
const DEFAULTS = { waAfterSave: false, homeShowBalance: true, posQuickPick: true, itemShowPurchase: true, partyShowBalance: true };
export function getPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export const getPref = (k) => getPrefs()[k];
export function setPref(k, v) {
  const next = { ...getPrefs(), [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}
