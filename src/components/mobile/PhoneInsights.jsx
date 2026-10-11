import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, ArrowDownLeft, ArrowUpRight, Boxes, Wallet, Landmark, PackageX, ChevronRight } from 'lucide-react';
import { getAllBills, getAllPurchases, getAllProducts, getAllExpenses, getStockAlertSettings } from '../../store';
import { formatCurrency, belongsToProfile, salesSign, localDateISO } from '../../utils';
import { tableReady, listRecords } from '../../lib/modData';
import { bizKeyOf } from '../../lib/accData';
import { accountBalances } from '../../../shared/accounting.js';
import { t as tr } from '../../i18n';
import { estimateCashBank } from '../../lib/insights';

const num = (v) => Number(v) || 0;
const billDate = (b) => String(b.date || b.invoiceDate || b.data?.details?.invoiceDate || '').slice(0, 10);

// Phone "Insights" tab: six KPI cards and a 7-day / 6-month sales chart.
export default function PhoneInsights({ profile, onOpen }) {
  const [d, setD] = useState(null);
  const [range, setRange] = useState('week');
  useEffect(() => {
    let alive = true;
    const own = (r) => belongsToProfile(r, profile);
    const biz = bizKeyOf(profile);
    (async () => {
      const [bills, purchases, products, expenses, alert] = await Promise.all([getAllBills().catch(() => []), getAllPurchases().catch(() => []), getAllProducts().catch(() => []), getAllExpenses().catch(() => []), getStockAlertSettings().catch(() => ({ threshold: 5 }))]);
      const docs = (await tableReady('biz_docs')) === 'ready' ? (await listRecords('biz_docs', { limit: 20000 }).catch(() => [])).filter(x => !x.biz || x.biz === biz) : [];
      let books = null;
      if ((await tableReady('acc_vouchers')) === 'ready') {
        const vouchers = (await listRecords('acc_vouchers', { order: ['vdate', true], limit: 100000 }).catch(() => [])).filter(v => !v.biz || v.biz === biz);
        if (vouchers.length) {
          const accs = await listRecords('acc_accounts', { limit: 2000 }).catch(() => []);
          const bal = accountBalances(vouchers);
          const bankIds = ['bank', ...accs.filter(a => a.group === 'bank').map(a => a.id)];
          books = { cash: bal.get('cash')?.close || 0, bank: bankIds.reduce((s, id) => s + (bal.get(id)?.close || 0), 0) };
        }
      }
      if (alive) setD({ bills: (bills || []).filter(own), purchases: (purchases || []).filter(own), products: products || [], expenses: (expenses || []).filter(own), docs, books, threshold: Number(alert?.threshold ?? 5) });
    })();
    return () => { alive = false; };
  }, [profile]);

  const k = useMemo(() => {
    if (!d) return null;
    const month = localDateISO().slice(0, 7);
    let sales = 0; let receivable = 0;
    for (const b of d.bills) {
      const s = salesSign(b);
      if (s && billDate(b).startsWith(month)) sales += s * num(b.totalAmount);
      if (s > 0) receivable += Math.max(0, num(b.totalAmount) - num(b.paidAmount));
    }
    let payable = 0;
    for (const p of d.purchases) {
      const st = String(p.paymentStatus || 'unpaid').toLowerCase(); if (st === 'paid') continue;
      const total = num(p.totalAmount ?? p.total);
      payable += st === 'partial' ? Math.max(0, total - num(p.paidAmount)) : total;
    }
    let stock = 0; let low = 0;
    for (const p of d.products) {
      const q = num(p.stock); if (q > 0) stock += q * (num(p.purchasePrice) || num(p.sellingPrice ?? p.rate));
      if (q <= d.threshold) low += 1;
    }
    const cb = d.books || estimateCashBank(d);
    return { sales, receivable, payable, stock, low, cash: cb.cash, bank: cb.bank, est: !d.books };
  }, [d]);

  const chart = useMemo(() => {
    if (!d) return [];
    const out = [];
    const now = new Date();
    if (range === 'week') {
      for (let i = 6; i >= 0; i--) { const x = new Date(now); x.setDate(now.getDate() - i); const iso = localDateISO(x); out.push({ key: iso, label: x.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2), v: 0 }); }
    } else {
      for (let i = 5; i >= 0; i--) { const x = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: localDateISO(x).slice(0, 7), label: x.toLocaleDateString('en-IN', { month: 'short' }), v: 0 }); }
    }
    const idx = new Map(out.map((o, i) => [o.key, i]));
    for (const b of d.bills) {
      const s = salesSign(b); if (!s) continue;
      const kk = range === 'week' ? billDate(b) : billDate(b).slice(0, 7);
      if (idx.has(kk)) out[idx.get(kk)].v += s * num(b.totalAmount);
    }
    return out;
  }, [d, range]);
  const max = Math.max(1, ...chart.map(c => c.v));

  if (!k) return <section className="ph"><div className="ph-empty"><p>{tr('mod.loading')}</p></div></section>;
  const cards = [
    { icon: TrendingUp, cls: 'blue', label: tr('ph.kSales'), v: k.sales, go: () => onOpen('reports') },
    { icon: ArrowDownLeft, cls: 'green', label: tr('ph.kReceivable'), v: k.receivable, go: () => onOpen('dashboard', 'bills') },
    { icon: ArrowUpRight, cls: 'red', label: tr('ph.kPayable'), v: k.payable, go: () => onOpen('purchases') },
    { icon: Boxes, cls: 'violet', label: tr('ph.kStock'), v: k.stock, go: () => onOpen('inventory') },
    { icon: Wallet, cls: 'teal', label: k.est ? tr('ph.kCashEst') : tr('ph.kCash'), v: k.cash, go: () => onOpen('txn', 'cash') },
    { icon: Landmark, cls: 'slate', label: k.est ? tr('ph.kBankEst') : tr('ph.kBank'), v: k.bank, go: () => onOpen('accounts') },
  ];
  return (
    <section className="ph" data-testid="phone-insights">
      <div className="pi-grid">
        {cards.map(c => (
          <button type="button" key={c.label} className={`pi-card ${c.cls}`} onClick={c.go}>
            <span className="pi-ic"><c.icon size={18} /></span>
            <small>{c.label}</small>
            <b>{formatCurrency(c.v)}</b>
          </button>
        ))}
      </div>
      {k.low > 0 && (
        <button type="button" className="pi-alert" onClick={() => onOpen('inventory')}><PackageX size={18} /> <span>{tr('ph.lowStockN', { count: k.low })}</span><ChevronRight size={18} /></button>
      )}
      <div className="pi-chart-card">
        <div className="pi-chart-head">
          <b>{tr('ph.salesTrend')}</b>
          <div className="ph-seg sm">
            <button type="button" className={range === 'week' ? 'on' : ''} onClick={() => setRange('week')}>{tr('ph.days7')}</button>
            <button type="button" className={range === 'months' ? 'on' : ''} onClick={() => setRange('months')}>{tr('ph.months6')}</button>
          </div>
        </div>
        <div className="pi-chart" role="img" aria-label={tr('ph.salesTrend')}>
          {chart.map(c => (
            <div key={c.key} className="pi-bar-col">
              <span className="pi-bar-v">{c.v > 0 ? formatCurrency(c.v).replace(/\.\d+$/, '').replace('₹', '') : ''}</span>
              <span className="pi-bar" style={{ height: `${Math.max(2, Math.round((Math.max(0, c.v) / max) * 100))}%` }} />
              <small>{c.label}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
