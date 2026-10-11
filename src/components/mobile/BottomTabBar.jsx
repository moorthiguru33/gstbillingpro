import { Home, BarChart3, Package, Menu } from 'lucide-react';
import { t as tr } from '../../i18n';

function Tab({ id, active, icon, label, onClick }) {
  const Icon = icon;
  return (
    <button type="button" className={`mtab${active === id ? ' mtab-active' : ''}`} onClick={onClick} aria-current={active === id ? 'page' : undefined} data-tab={id}>
      <Icon size={22} strokeWidth={active === id ? 2.4 : 1.9} />
      <span>{label}</span>
    </button>
  );
}

// Phone-only bottom navigation: Home · Insights · Items · Menu.
// Billing starts from the big "New Bill" bar on Home (thumb reach), so the
// tab bar stays a plain, predictable 4-tab row.
export default function BottomTabBar({ active, onHome, onInsights, onItems, onMenu, showInsights = true }) {
  return (
    <nav className={`mtabbar${showInsights ? '' : ' mtabbar-3'}`} aria-label={tr('mobile.navigation')}>
      <Tab active={active} id="home" icon={Home} label={tr('mobile.home')} onClick={onHome} />
      {showInsights && <Tab active={active} id="insights" icon={BarChart3} label={tr('ph.insights')} onClick={onInsights} />}
      <Tab active={active} id="items" icon={Package} label={tr('mobile.items')} onClick={onItems} />
      <Tab active={active} id="menu" icon={Menu} label={tr('ph.menu')} onClick={onMenu} />
    </nav>
  );
}
