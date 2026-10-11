import { Home, FileText, Plus, Package, LayoutGrid } from 'lucide-react';
import { t as tr } from '../../i18n';

function Tab({ id, active, icon, label, onClick }) {
  const Icon = icon;
  return (
    <button type="button" className={`mtab${active === id ? ' mtab-active' : ''}`} onClick={onClick} aria-current={active === id ? 'page' : undefined}>
      <Icon size={22} strokeWidth={active === id ? 2.4 : 1.9} />
      <span>{label}</span>
    </button>
  );
}

// Phone-only bottom navigation: Home · Bills · (New Bill) · Items · More.
export default function BottomTabBar({ active, onHome, onBills, onNew, onItems, onMore }) {
  return (
    <nav className="mtabbar" aria-label={tr('mobile.navigation')}>
      <Tab active={active} id="home" icon={Home} label={tr('mobile.home')} onClick={onHome} />
      <Tab active={active} id="bills" icon={FileText} label={tr('mobile.bills')} onClick={onBills} />
      <div className="mtab-fab-wrap">
        <button type="button" className="mtab-fab" onClick={onNew} aria-label={tr('mobile.newBill')}>
          <Plus size={28} strokeWidth={2.6} />
        </button>
        <span className="mtab-fab-label">{tr('mobile.newBill')}</span>
      </div>
      <Tab active={active} id="items" icon={Package} label={tr('mobile.items')} onClick={onItems} />
      <Tab active={active} id="more" icon={LayoutGrid} label={tr('mobile.more')} onClick={onMore} />
    </nav>
  );
}
