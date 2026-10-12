import { useEffect, useState } from 'react';
import { ChevronRight, Settings2, Receipt, Printer, Landmark, Users, MessageCircle, BellRing, Contact, Package, Store, HelpCircle, ExternalLink, IdCard, Languages } from 'lucide-react';
import { getEnabledModules, setEnabledModules, getStockAlertSettings, saveStockAlertSettings } from '../../store';
import { isModuleEnabled, invoiceOptionOn } from '../../utils';
import { getPrintSettings, savePrintSettings } from '../../utils/printSettings';
import { getPrefs, setPref } from '../../lib/prefs';
import { toast } from '../Toast';
import { t as tr } from '../../i18n';

const OPT_KEY = 'freegstbill_invoiceOptions';
const readOpts = () => { try { return JSON.parse(localStorage.getItem(OPT_KEY) || '{}'); } catch { return {}; } };
const writeOpt = (k, v) => { try { localStorage.setItem(OPT_KEY, JSON.stringify({ ...readOpts(), [k]: v })); } catch { /* private mode */ } };

// Settings sections for the phone (/app/preferences/<section>). Every row is
// an existing setting: invoice options (same store the bill editor uses),
// print settings, feature modules, stock alerts, device preferences.
const PREF_SECTIONS = [
  { id: 'general', icon: Settings2 },
  { id: 'transaction', icon: Receipt },
  { id: 'print', icon: Printer },
  { id: 'taxes', icon: Landmark },
  { id: 'users', icon: Users },
  { id: 'messages', icon: MessageCircle },
  { id: 'reminders', icon: BellRing },
  { id: 'party', icon: Contact },
  { id: 'item', icon: Package },
  { id: 'store', icon: Store },
];

const opt = (key) => ({ type: 'opt', key });
const mod = (key) => ({ type: 'mod', key });
const pref = (key) => ({ type: 'pref', key });
const prn = (key) => ({ type: 'print', key });
const ROWS = {
  general: [pref('homeShowBalance'), { type: 'dark' }, mod('expenses'), mod('purchases'), mod('recurring'), { type: 'link', key: 'language', to: ['settings', 'help'] }],
  transaction: [opt('showDueDate'), opt('showDiscount'), opt('showRoundOff'), opt('showMRP'), opt('showNotes'), mod('receipts'), { type: 'link', key: 'numbering', to: ['settings', 'bills'] }],
  print: [{ type: 'paper' }, prn('autoPrintOnSave'), opt('showLogo'), opt('showSignature'), opt('showBankDetails'), opt('showUPI'), opt('showTerms'), opt('showAmountWords'), { type: 'link', key: 'designs', to: ['settings', 'bills'] }],
  taxes: [opt('showGST'), opt('showHSN'), opt('showGSTIN'), opt('showPlaceOfSupply'), opt('showCess'), mod('gstReturns'), mod('incomeTax'), { type: 'link', key: 'gstSetup', to: ['settings', 'gst'] }],
  users: [{ type: 'link', key: 'staff', to: ['settings', 'staff'] }],
  messages: [pref('waAfterSave'), { type: 'link', key: 'waTemplates', to: ['settings', 'bills'] }],
  reminders: [{ type: 'stock' }, prn('reminderEnabled')],
  party: [pref('partyShowBalance'), opt('showState'), mod('clients'), { type: 'link', key: 'parties', to: ['clients'] }],
  item: [pref('itemShowPurchase'), opt('showItemQty'), mod('inventory'), { type: 'link', key: 'itemTools', to: ['inventory', 'manage'] }],
  store: [{ type: 'link', key: 'storeSetup', to: ['store', 'settings'] }, { type: 'link', key: 'storeOrders', to: ['store', 'orders'] }],
};

export default function PhoneSettings({ sub, onSub, go, darkMode, onToggleDark, onChanged, canManage }) {
  const section = PREF_SECTIONS.find(s => s.id === sub);
  if (!section) {
    return (
      <section className="ph pm" data-testid="phone-settings">
        <button type="button" className="pm-row pm-head" onClick={() => go('profile')}>
          <span className="pm-ic"><IdCard size={20} /></span><span className="pm-label">{tr('ph.mProfile')}<small>{tr('ph.profileHint')}</small></span><ChevronRight size={18} className="pm-chev" />
        </button>
        {PREF_SECTIONS.filter(s => canManage || ['general', 'messages', 'print'].includes(s.id)).map(s => (
          <button type="button" key={s.id} className="pm-row pm-head" onClick={() => onSub(s.id)} data-sec={s.id}>
            <span className="pm-ic"><s.icon size={20} /></span><span className="pm-label">{tr(`ps.${s.id}`)}</span><ChevronRight size={18} className="pm-chev" />
          </button>
        ))}
        <button type="button" className="pm-row pm-head" onClick={() => go('settings')}>
          <span className="pm-ic"><Languages size={20} /></span><span className="pm-label">{tr('ps.allSettings')}<small>{tr('ps.allSettingsHint')}</small></span><ChevronRight size={18} className="pm-chev" />
        </button>
      </section>
    );
  }
  return <SectionPage id={section.id} go={go} darkMode={darkMode} onToggleDark={onToggleDark} onChanged={onChanged} />;
}

function Toggle({ label, help, on, onChange, testid }) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className="ps-row" data-testid={testid}>
      <span className="ps-label">{label}
        {help && <button type="button" className="ps-help" aria-label={tr('ps.whatIsThis')} aria-expanded={showHelp} title={help} onClick={() => setShowHelp(v => !v)}><HelpCircle size={15} /></button>}
        {showHelp && <small className="ps-help-text">{help}</small>}
      </span>
      <label className="ps-switch"><input type="checkbox" checked={!!on} onChange={e => onChange(e.target.checked)} aria-label={label} /><span /></label>
    </div>
  );
}

function SectionPage({ id, go, darkMode, onToggleDark, onChanged }) {
  const [, setTick] = useState(0);
  const bump = () => { setTick(n => n + 1); onChanged?.(); };
  const [stock, setStock] = useState(null);
  useEffect(() => { if (id === 'reminders') getStockAlertSettings().then(setStock).catch(() => setStock({ enabled: true, threshold: 5 })); }, [id]);
  const opts = readOpts(); const prefs = getPrefs(); const ps = getPrintSettings(); const mods = getEnabledModules();
  const saveStock = (next) => { setStock(next); saveStockAlertSettings(next).then(() => toast(tr('ps.saved'), 'success', 1200)).catch(() => toast(tr('mod.saveError'), 'error')); };

  return (
    <section className="ph ps" data-testid={`ps-${id}`}>
      <h2 className="ps-title">{tr(`ps.${id}`)}</h2>
      <div className="ps-list">
        {ROWS[id].map((r, i) => {
          const label = tr(`ps.${r.type}_${r.key || r.type}`);
          const help = r.type === 'link' || r.type === 'paper' ? '' : tr(`ps.${r.type}_${r.key || r.type}_help`);
          const k = `${r.type}-${r.key || i}`;
          if (r.type === 'opt') return <Toggle key={k} label={label} help={help} on={invoiceOptionOn(opts, r.key)} onChange={v => { writeOpt(r.key, v); bump(); }} testid={k} />;
          if (r.type === 'pref') return <Toggle key={k} label={label} help={help} on={prefs[r.key]} onChange={v => { setPref(r.key, v); bump(); }} testid={k} />;
          if (r.type === 'print') return <Toggle key={k} label={label} help={help} on={ps[r.key]} onChange={v => { savePrintSettings({ ...getPrintSettings(), [r.key]: v }); bump(); }} testid={k} />;
          if (r.type === 'mod') return <Toggle key={k} label={label} help={help} on={isModuleEnabled(r.key, mods)} onChange={v => { setEnabledModules({ ...getEnabledModules(), [r.key]: v }); bump(); }} testid={k} />;
          if (r.type === 'dark') return <Toggle key={k} label={label} help={help} on={darkMode} onChange={() => onToggleDark()} testid={k} />;
          if (r.type === 'paper') {
            return (
              <div key={k} className="ps-row"><span className="ps-label">{label}</span>
                <select className="form-input ps-select" value={ps.defaultPaperSize} onChange={e => { savePrintSettings({ ...getPrintSettings(), defaultPaperSize: e.target.value }); bump(); }}>
                  {['thermal58', 'thermal80', 'a5', 'a4', 'a4Landscape', 'a5Landscape'].map(p => <option key={p} value={p}>{tr(`ps.paper_${p}`)}</option>)}
                </select>
              </div>
            );
          }
          if (r.type === 'stock') {
            return stock ? (
              <div key={k}>
                <Toggle label={label} help={help} on={stock.enabled} onChange={v => saveStock({ ...stock, enabled: v })} testid={k} />
                <div className="ps-row"><span className="ps-label">{tr('ps.stockThreshold')}</span>
                  <input className="form-input ps-num" type="number" inputMode="numeric" min="0" value={stock.threshold} onChange={e => setStock(s => ({ ...s, threshold: e.target.value }))} onBlur={() => saveStock({ ...stock, threshold: Math.max(0, Number(stock.threshold) || 0) })} />
                </div>
              </div>
            ) : null;
          }
          return (
            <button type="button" key={k} className="ps-row ps-link" onClick={() => go(...r.to)}>
              <span className="ps-label">{label}</span><ExternalLink size={16} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
