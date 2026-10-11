import { useEffect, useMemo, useState } from 'react';
import { Plus, LayoutGrid, Search, Zap, ScanLine, FileText, BarChart3, SlidersHorizontal, ListChecks, Printer, Share2, Phone, Users, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import AiBillButton from '../ai/AiBillButton';
import { getAllBills, getAllClients, getAllPurchases, getAllProducts } from '../../store';
import { formatCurrency, belongsToProfile, INVOICE_TYPES, isCancelledBill } from '../../utils';
import { shareOnWhatsApp } from '../../utils/share';
import { promptAction } from '../ConfirmModal';
import { getPref } from '../../lib/prefs';
import { t as tr } from '../../i18n';
import { aiToDraft } from '../../lib/aiDraft';

const num = (v) => Number(v) || 0;
const fmtDay = (d) => { try { return new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch { return d; } };
const billDate = (b) => String(b.date || b.invoiceDate || b.data?.details?.invoiceDate || '').slice(0, 10);
const billDue = (b) => Math.max(0, num(b.totalAmount) - num(b.paidAmount));
const key = (s) => String(s || '').trim().toLowerCase();

// Phone home: smart-billing strip (our AI voice / photo + scanner), Bills /
// Parties switch, quick links, recent bills as cards and a thumb-reach
// "New Bill" bar above the tab bar.
export default function PhoneHome({ profile, onNewSale, onCreateMenu, onEditBill, onDraft, onOpen, onAllBills, onPaymentIn }) {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('gbp_ph_tab') || 'bills'; } catch { return 'bills'; } });
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all([getAllBills().catch(() => []), getAllClients().catch(() => []), getAllPurchases().catch(() => []), getAllProducts().catch(() => [])])
      .then(([b, c, p, pr]) => { if (alive) setData({ bills: (b || []).filter(x => belongsToProfile(x, profile)), clients: c || [], purchases: (p || []).filter(x => belongsToProfile(x, profile)), products: pr || [] }); });
    return () => { alive = false; };
  }, [profile]);
  const pickTab = (t) => { setTab(t); setQ(''); try { sessionStorage.setItem('gbp_ph_tab', t); } catch { /* ignore */ } };

  const bills = useMemo(() => {
    const s = key(q);
    return (data?.bills || []).filter(b => !s || key(b.clientName).includes(s) || key(b.invoiceNumber).includes(s))
      .sort((a, b) => billDate(b).localeCompare(billDate(a)) || String(b.invoiceNumber).localeCompare(String(a.invoiceNumber))).slice(0, 40);
  }, [data, q]);

  const parties = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    const at = (name, phone) => {
      const k = key(name); if (!k) return null;
      if (!m.has(k)) m.set(k, { name: String(name).trim(), phone: phone || '', collect: 0, pay: 0 });
      const p = m.get(k); if (!p.phone && phone) p.phone = phone; return p;
    };
    for (const c of data.clients) at(c.name, c.phone);
    for (const b of data.bills) {
      if (isCancelledBill(b)) continue;
      const p = at(b.clientName, b.data?.client?.phone); if (!p) continue;
      if (b.invoiceType === 'credit-note') p.collect -= billDue(b);
      else if (['tax-invoice', 'bill-of-supply', 'composition', undefined, ''].includes(b.invoiceType)) p.collect += billDue(b);
    }
    for (const pu of data.purchases) {
      const st = key(pu.paymentStatus || 'unpaid'); if (st === 'paid') continue;
      const p = at(pu.supplierName); if (!p) continue;
      const total = num(pu.totalAmount ?? pu.total);
      p.pay += st === 'partial' ? Math.max(0, total - num(pu.paidAmount)) : total;
    }
    const s = key(q);
    return [...m.values()].filter(p => !s || key(p.name).includes(s) || String(p.phone).includes(s))
      .sort((a, b) => (Math.abs(b.collect) + b.pay) - (Math.abs(a.collect) + a.pay) || a.name.localeCompare(b.name));
  }, [data, q]);
  const totals = useMemo(() => parties.reduce((t, p) => ({ collect: t.collect + Math.max(0, p.collect), pay: t.pay + p.pay }), { collect: 0, pay: 0 }), [parties]);

  const shareBill = (b) => {
    const due = billDue(b);
    const msg = [`*${INVOICE_TYPES[b.invoiceType]?.title || 'INVOICE'} ${b.invoiceNumber}*`, `${fmtDay(billDate(b))} · ${b.clientName || ''}`, `${tr('ph.total')}: ${formatCurrency(b.totalAmount)}`,
      due > 0.005 ? `*${tr('ph.balance')}: ${formatCurrency(due)}*` : `✅ ${tr('ph.paid')}`, '', profile?.businessName ? `— ${profile.businessName}` : ''].join('\n');
    shareOnWhatsApp({ phone: b.data?.client?.phone || b.clientPhone, message: msg, ask: promptAction, customerName: b.clientName }).catch(() => {});
  };
  const showBal = getPref('homeShowBalance') !== false;
  const quick = [
    { icon: Plus, label: tr('ph.qAddTxn'), go: onCreateMenu },
    { icon: BarChart3, label: tr('ph.qSaleReport'), go: () => onOpen('reports') },
    { icon: SlidersHorizontal, label: tr('ph.qTxnSettings'), go: () => onOpen('prefs', 'transaction') },
    { icon: ListChecks, label: tr('ph.qShowAll'), go: onAllBills },
  ];

  return (
    <section className="ph" data-testid="phone-home">
      <div className="ph-smart" aria-label={tr('ph.smartBilling')}>
        <div className="ph-smart-head"><span>{tr('ph.smartBilling')}</span><small>{tr('ph.smartHint')}</small></div>
        <div className="ph-smart-row">
          <AiBillButton mode="voice" products={data?.products || []} onApply={(r) => onDraft(aiToDraft(r))} />
          <AiBillButton mode="photo" products={data?.products || []} onApply={(r) => onDraft(aiToDraft(r))} />
          <button type="button" className="btn btn-secondary ai-bill-btn" onClick={() => onOpen('pos')}><ScanLine size={16} /> {tr('ph.scanSell')}</button>
        </div>
      </div>

      <div className="ph-seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'bills'} className={tab === 'bills' ? 'on' : ''} onClick={() => pickTab('bills')}><FileText size={16} /> {tr('ph.tabBills')}</button>
        <button type="button" role="tab" aria-selected={tab === 'parties'} className={tab === 'parties' ? 'on' : ''} onClick={() => pickTab('parties')}><Users size={16} /> {tr('ph.tabParties')}</button>
      </div>

      {tab === 'bills' && (
        <div className="ph-quick">
          {quick.map(a => <button type="button" key={a.label} onClick={a.go}><span><a.icon size={20} /></span>{a.label}</button>)}
        </div>
      )}
      {tab === 'parties' && (
        <div className="ph-sum">
          <div><small>{tr('ph.toCollect')}</small><b className="pos">{formatCurrency(totals.collect)}</b></div>
          <div><small>{tr('ph.toPay')}</small><b className="neg">{formatCurrency(totals.pay)}</b></div>
        </div>
      )}

      <label className="ph-search"><Search size={18} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={tr(tab === 'bills' ? 'ph.searchBills' : 'ph.searchParties')} enterKeyHint="search" /></label>

      {data === null ? <div className="ph-empty"><p>{tr('mod.loading')}</p></div>
        : tab === 'bills' ? (
          bills.length === 0 ? (
            <div className="ph-empty"><FileText size={40} /><p>{tr('ph.noBills')}</p><button type="button" className="btn btn-primary" onClick={onNewSale}><Plus size={18} /> {tr('ph.newBill')}</button></div>
          ) : (
            <div className="ph-list" data-testid="ph-bills">
              {bills.map(b => {
                const due = billDue(b); const cancelled = isCancelledBill(b);
                const paid = due <= 0.005; const partial = !paid && num(b.paidAmount) > 0;
                return (
                  <div key={b.id || b.invoiceNumber} className="ph-card" role="button" tabIndex={0} onClick={() => onEditBill(b)} onKeyDown={e => { if (e.key === 'Enter') onEditBill(b); }}>
                    <div className="ph-card-top">
                      <b className="ph-card-name">{b.clientName || tr('ph.walkIn')}</b>
                      <span className={`ph-chip ${cancelled ? 'gray' : paid ? 'green' : partial ? 'amber' : 'red'}`}>{tr(cancelled ? 'ph.cancelled' : paid ? 'ph.paid' : partial ? 'ph.partial' : 'ph.unpaid')}</span>
                    </div>
                    <div className="ph-card-sub">{INVOICE_TYPES[b.invoiceType]?.label || tr('ph.sale')} · {b.invoiceNumber} · {fmtDay(billDate(b))}</div>
                    <div className="ph-card-bot">
                      <div><small>{tr('ph.total')}</small><b>{formatCurrency(b.totalAmount)}</b></div>
                      {showBal && <div><small>{tr('ph.balance')}</small><b className={due > 0.005 ? 'neg' : ''}>{formatCurrency(due)}</b></div>}
                      <div className="ph-card-acts" onClick={e => e.stopPropagation()} role="presentation">
                        {due > 0.005 && onPaymentIn && <button type="button" aria-label={tr('ph.receive')} title={tr('ph.receive')} onClick={() => onPaymentIn(b)}><ArrowDownLeft size={18} /></button>}
                        <button type="button" aria-label={tr('ph.print')} onClick={() => onEditBill(b)}><Printer size={18} /></button>
                        <button type="button" aria-label={tr('ph.share')} onClick={() => shareBill(b)}><Share2 size={18} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          parties.length === 0 ? (
            <div className="ph-empty"><Users size={40} /><p>{tr('ph.noParties')}</p><button type="button" className="btn btn-primary" onClick={() => onOpen('clients')}><Plus size={18} /> {tr('ph.addParty')}</button></div>
          ) : (
            <div className="ph-list ph-rows" data-testid="ph-parties">
              {parties.map(p => (
                <div key={p.name} className="ph-row" role="button" tabIndex={0} onClick={() => onOpen('clients')} onKeyDown={e => { if (e.key === 'Enter') onOpen('clients'); }}>
                  <span className="ph-avatar">{p.name.charAt(0).toUpperCase()}</span>
                  <span className="ph-row-main"><b>{p.name}</b>{p.phone ? <small>{p.phone}</small> : null}</span>
                  <span className="ph-row-amt">
                    {p.collect > 0.005 && <b className="pos"><ArrowDownLeft size={13} />{formatCurrency(p.collect)}</b>}
                    {p.pay > 0.005 && <b className="neg"><ArrowUpRight size={13} />{formatCurrency(p.pay)}</b>}
                    {p.collect <= 0.005 && p.pay <= 0.005 && <small>{tr('ph.settled')}</small>}
                  </span>
                  {p.phone ? <a className="ph-call" href={`tel:${p.phone}`} onClick={e => e.stopPropagation()} aria-label={tr('mod.call')}><Phone size={16} /></a> : null}
                </div>
              ))}
            </div>
          )
        )}

      <div className="ph-cta">
        <button type="button" className="ph-cta-main" data-testid="ph-new-bill" onClick={onNewSale}><Plus size={22} strokeWidth={2.6} /> {tr('ph.newBill')}</button>
        <button type="button" className="ph-cta-pos" onClick={() => onOpen('pos')} aria-label={tr('mobile.counterSale')} title={tr('mobile.counterSale')}><Zap size={20} /></button>
        <button type="button" className="ph-cta-more" onClick={onCreateMenu} aria-label={tr('ph.otherTxn')} title={tr('ph.otherTxn')}><LayoutGrid size={20} /></button>
      </div>
    </section>
  );
}
