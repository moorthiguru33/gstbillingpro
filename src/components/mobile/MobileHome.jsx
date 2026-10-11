import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Wallet, ShoppingCart, PackageX, FileText, Zap, Users, Receipt, Camera } from 'lucide-react';
import { getAllPurchases } from '../../store';
import { formatCurrency, belongsToProfile, salesSign, localDateISO } from '../../utils';
import { t as tr } from '../../i18n';

// Phone dashboard header: four big KPI tiles + one-tap quick actions.
// Hidden on desktop by CSS (.mobile-only); computed from data already loaded.
export default function MobileHome({ bills, profile, lowStockCount, onNew, onOpenPOS, onOpen }) {
  const [purchases, setPurchases] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!window.matchMedia?.('(max-width: 768px)').matches) return undefined;
    getAllPurchases().then((p) => { if (alive) setPurchases(Array.isArray(p) ? p : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const k = useMemo(() => {
    const today = localDateISO();
    let sales = 0, count = 0, collect = 0;
    for (const b of bills) {
      const sign = salesSign(b);
      if (!sign) continue;
      if (String(b.date || b.invoiceDate || '').slice(0, 10) === today) { sales += sign * (b.totalAmount || 0); count += 1; }
      if (sign > 0 && b.status !== 'paid') collect += Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0));
    }
    let pay = 0;
    for (const p of purchases) {
      if (!belongsToProfile(p, profile)) continue;
      const st = String(p.paymentStatus || 'Unpaid').toLowerCase();
      if (st === 'paid') continue;
      const total = Number(p.totalAmount ?? p.total ?? p.grandTotal) || 0;
      pay += st === 'partial' ? Math.max(0, total - (Number(p.paidAmount) || 0)) : total;
    }
    return { sales, count, collect, pay };
  }, [bills, purchases, profile]);

  const tiles = [
    { cls: 'kpi-blue', icon: TrendingUp, label: tr('mobile.kpiToday'), value: formatCurrency(k.sales), sub: tr('mobile.kpiBills', { count: k.count }), go: () => onOpen('bills') },
    { cls: 'kpi-green', icon: Wallet, label: tr('mobile.kpiCollect'), value: formatCurrency(k.collect), go: () => onOpen('reports') },
    { cls: 'kpi-amber', icon: ShoppingCart, label: tr('mobile.kpiPay'), value: formatCurrency(k.pay), go: () => onOpen('purchases') },
    { cls: 'kpi-red', icon: PackageX, label: tr('mobile.kpiLowStock'), value: String(lowStockCount || 0), sub: tr('mobile.kpiItems'), go: () => onOpen('inventory') },
  ];
  const actions = [
    { icon: FileText, label: tr('mobile.newInvoice'), go: onNew },
    { icon: Zap, label: tr('mobile.counterSale'), go: onOpenPOS },
    { icon: ShoppingCart, label: tr('mobile.purchase'), go: () => onOpen('purchases') },
    { icon: Receipt, label: tr('mobile.expense'), go: () => onOpen('expenses') },
    { icon: Users, label: tr('mobile.parties'), go: () => onOpen('clients') },
    { icon: Camera, label: tr('mobile.scanBill'), go: () => onOpen('purchases') },
  ];
  return (
    <section className="mobile-only mhome">
      <div className="mkpi-grid">
        {tiles.map((t) => (
          <button type="button" key={t.label} className={`mkpi ${t.cls}`} onClick={t.go}>
            <span className="mkpi-icon"><t.icon size={18} /></span>
            <span className="mkpi-label">{t.label}</span>
            <span className="mkpi-value">{t.value}</span>
            {t.sub && <span className="mkpi-sub">{t.sub}</span>}
          </button>
        ))}
      </div>
      <h3 className="mhome-title">{tr('mobile.quickActions')}</h3>
      <div className="mquick-grid">
        {actions.map((a) => (
          <button type="button" key={a.label} className="mquick" onClick={a.go}>
            <span className="mquick-icon"><a.icon size={22} /></span>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
