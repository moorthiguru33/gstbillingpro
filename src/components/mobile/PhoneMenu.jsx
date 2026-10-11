import { useState } from 'react';
import {
  ChevronDown, ChevronRight, FileText, Zap, ArrowDownLeft, Undo2, FileSignature, ClipboardList, Truck, ShoppingCart, ArrowUpRight, PackageOpen,
  Wallet, Landmark, Banknote, FileCheck2, HandCoins, Store, Target, BookOpen, Briefcase, BarChart3, Wrench, DatabaseBackup, Settings, IdCard,
  Crown, MessageCircle, Monitor, Smartphone, Share2, Star, Users, RefreshCw, Calculator, Receipt, Moon, Sun, LogOut, Sparkles,
} from 'lucide-react';
import { usePlan } from '../../lib/planContext';
import { moduleAllowed } from '../../../shared/modules.js';
import { openInNewTab } from '../../utils/share';
import { WINDOWS_DOWNLOAD_URL, ANDROID_DOWNLOAD_URL } from '../../lib/appLinks';
import { t as tr } from '../../i18n';

const SUPPORT_WA = '919442745754';
const APP_URL = 'https://gst-billing-pro.pages.dev';

// Phone "Menu" tab: a plain list grouped into sections that expand in
// place. Role (can) and module (show) gating mirror the desktop sidebar.
export default function PhoneMenu({ can, show, go, newDoc, payIn, darkMode, onToggleDark, onSignOut }) {
  const { plan, openUpgrade } = usePlan();
  const tier = plan?.tier || 'free';
  const [open, setOpen] = useState(() => { try { return sessionStorage.getItem('gbp_menu_open') || 'sell'; } catch { return 'sell'; } });
  const toggle = (id) => { const next = open === id ? '' : id; setOpen(next); try { sessionStorage.setItem('gbp_menu_open', next); } catch { /* ignore */ } };
  const lock = (mod) => (moduleAllowed(tier, mod) ? null : tr('ph.upgradeTag'));
  const share = async () => {
    const text = `${tr('ph.shareText')} ${APP_URL}`;
    try { if (navigator.share) { await navigator.share({ title: 'GST Billing Pro', text, url: APP_URL }); return; } } catch { /* cancelled */ }
    openInNewTab(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const sections = [
    { id: 'sell', icon: FileText, label: tr('ph.mSell'), items: [
      { icon: FileText, label: tr('ph.mSaleInvoice'), run: () => newDoc('tax-invoice'), ok: can('new') && show('invoicing') },
      { icon: Zap, label: tr('ph.mPos'), run: () => go('pos'), ok: can('pos') },
      { icon: ArrowDownLeft, label: tr('ph.mPaymentIn'), run: payIn, ok: can('receipts') && show('receipts') },
      { icon: Undo2, label: tr('ph.mSaleReturn'), run: () => newDoc('credit-note'), ok: can('new') && show('invoicing') },
      { icon: FileSignature, label: tr('ph.mQuotation'), run: () => newDoc('quotation'), ok: can('new') && show('invoicing') },
      { icon: ClipboardList, label: tr('ph.mSaleOrder'), run: () => go('txn', 'sale-order'), ok: can('txn') },
      { icon: Truck, label: tr('ph.mChallan'), run: () => newDoc('delivery-challan'), ok: can('new') && show('invoicing') },
      { icon: RefreshCw, label: tr('nav.recurring'), run: () => go('recurring'), ok: can('recurring') && show('recurring') },
    ] },
    { id: 'buy', icon: ShoppingCart, label: tr('ph.mBuy'), items: [
      { icon: ShoppingCart, label: tr('ph.mPurchaseBill'), run: () => go('purchases'), ok: can('purchases') && show('purchases') },
      { icon: ArrowUpRight, label: tr('ph.mPaymentOut'), run: () => go('txn', ''), ok: can('txn') },
      { icon: Undo2, label: tr('ph.mPurchaseReturn'), run: () => go('txn', 'purchase-return'), ok: can('txn') },
      { icon: PackageOpen, label: tr('ph.mPurchaseOrder'), run: () => go('txn', 'purchase-order'), ok: can('txn') },
    ] },
    { id: 'expenses', icon: Receipt, label: tr('nav.expenses'), run: () => go('expenses'), ok: can('expenses') && show('expenses') },
    { id: 'parties', icon: Users, label: tr('mobile.parties'), run: () => go('clients'), ok: can('clients') && show('clients') },
    { id: 'money', icon: Wallet, label: tr('ph.mMoney'), items: [
      { icon: Landmark, label: tr('ph.mBankAccounts'), run: () => go('settings', 'business'), ok: can('settings') },
      { icon: Banknote, label: tr('ph.mCash'), run: () => go('txn', 'cash'), ok: can('txn') },
      { icon: FileCheck2, label: tr('ph.mCheques'), run: () => go('txn', 'cheques'), ok: can('txn') },
      { icon: HandCoins, label: tr('ph.mLoans'), run: () => go('txn', 'loans'), ok: can('txn') },
    ] },
    { id: 'grow', icon: Sparkles, label: tr('ph.mGrow'), hint: tr('ph.mGrowHint'), items: [
      { icon: Store, label: tr('nav.onlineStore'), run: () => go('store'), ok: can('store'), tag: lock('onlineStore') },
      { icon: Target, label: tr('nav.crm'), run: () => go('crm'), ok: can('crm'), tag: lock('crm') },
    ] },
    { id: 'books', icon: BookOpen, label: tr('ph.mBooks'), items: [
      { icon: BookOpen, label: tr('nav.accounting'), run: () => go('accounts'), ok: can('accounts'), tag: lock('accounting') },
      { icon: Briefcase, label: tr('nav.payroll'), run: () => go('payroll'), ok: can('payroll'), tag: lock('payroll') },
      { icon: Landmark, label: tr('nav.gstReturns'), run: () => go('filing'), ok: can('filing') && show('gstReturns') },
      { icon: Calculator, label: tr('nav.incomeTax'), run: () => go('incometax'), ok: can('incometax') && show('incomeTax') },
    ] },
    { id: 'reports', icon: BarChart3, label: tr('nav.reports'), run: () => go('reports'), ok: can('reports') && show('reports') },
    { id: 'utils', icon: Wrench, label: tr('ph.mUtilities'), items: [
      { icon: DatabaseBackup, label: tr('ph.mBackup'), run: () => go('settings', 'data'), ok: can('settings') },
      { icon: Wrench, label: tr('ph.mItemTools'), run: () => go('inventory', 'manage'), ok: can('inventory') },
    ] },
    { id: 'settings', icon: Settings, label: tr('nav.settings'), run: () => go('prefs'), ok: can('prefs') },
    { id: 'profile', icon: IdCard, label: tr('ph.mProfile'), run: () => go('profile'), ok: can('profile') },
    { id: 'plans', icon: Crown, label: tr('ph.mPlans'), run: () => openUpgrade(null), ok: can('prefs') },
    { id: 'help', icon: MessageCircle, label: tr('ph.mHelp'), run: () => openInNewTab(`https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(tr('ph.helpMsg'))}`), ok: true },
    { id: 'desktop', icon: Monitor, label: tr('ph.mDesktop'), run: () => openInNewTab(WINDOWS_DOWNLOAD_URL), ok: true },
    { id: 'android', icon: Smartphone, label: tr('mobile.getAndroid'), run: () => openInNewTab(ANDROID_DOWNLOAD_URL), ok: true },
    { id: 'share', icon: Share2, label: tr('ph.mShare'), run: share, ok: true },
    { id: 'rate', icon: Star, label: tr('ph.mRate'), run: () => openInNewTab(ANDROID_DOWNLOAD_URL), ok: true },
    { id: 'dark', icon: darkMode ? Sun : Moon, label: darkMode ? tr('ph.light') : tr('ph.dark'), run: onToggleDark, ok: true },
    { id: 'out', icon: LogOut, label: tr('mobile.signOut'), run: onSignOut, ok: true, danger: true },
  ];

  return (
    <section className="ph pm" data-testid="phone-menu">
      {sections.map(s => {
        const items = s.items ? s.items.filter(i => i.ok) : null;
        if (items ? !items.length : !s.ok) return null;
        const expanded = items && open === s.id;
        return (
          <div key={s.id} className={`pm-sec${expanded ? ' open' : ''}`}>
            <button type="button" className={`pm-row pm-head${s.danger ? ' danger' : ''}`} aria-expanded={items ? expanded : undefined} data-sec={s.id}
              onClick={items ? () => toggle(s.id) : s.run}>
              <span className="pm-ic"><s.icon size={20} /></span>
              <span className="pm-label">{s.label}{s.hint ? <small>{s.hint}</small> : null}</span>
              {items ? <ChevronDown size={18} className="pm-chev" /> : <ChevronRight size={18} className="pm-chev" />}
            </button>
            {expanded && (
              <div className="pm-sub">
                {items.map(i => (
                  <button type="button" key={i.label} className="pm-row pm-item" onClick={i.run}>
                    <i.icon size={18} /><span className="pm-label">{i.label}</span>{i.tag && <span className="pm-tag">{i.tag}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="pm-foot">GST Billing Pro · {tr('ph.madeInIndia')}</p>
    </section>
  );
}
