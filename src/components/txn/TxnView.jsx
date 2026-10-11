import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Undo2, ClipboardList, PackageOpen, FileCheck2, Wallet, Landmark, Plus, Trash2, MessageCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import PageHeader from '../PageHeader';
import BottomSheet from '../mobile/BottomSheet';
import ModuleGate, { ModuleTabs, EmptyState } from '../modules/ModuleGate';
import { toast } from '../Toast';
import { confirmAction } from '../ConfirmModal';
import { t as tr } from '../../i18n';
import { formatCurrency, localDateISO } from '../../utils';
import { openInNewTab, whatsAppUrl } from '../../utils/share';
import { getAllProducts } from '../../store';
import { DOC_TABLE, listDocs, saveDoc, deleteDoc, removeDoc, saveReturn, myPurchases, payOut, convertPurchaseOrder } from '../../lib/txnData';
import { PAY_MODES, itemsTotal, loanSummary, purchaseDue, saleOrderToDraft } from '../../../shared/txn.js';

// Payment-out, purchase returns, sale / purchase orders, cheques, cash in
// hand and loans: one screen per document kind (/app/txn/<page>).
const TXN_PAGES = [
  { id: 'payment-out', kind: 'payment_out', icon: ArrowUpRight },
  { id: 'purchase-return', kind: 'purchase_return', icon: Undo2 },
  { id: 'sale-order', kind: 'sale_order', icon: ClipboardList },
  { id: 'purchase-order', kind: 'purchase_order', icon: PackageOpen },
  { id: 'cheques', kind: 'cheque', icon: FileCheck2 },
  { id: 'cash', kind: 'cash_adj', icon: Wallet },
  { id: 'loans', kind: 'loan', icon: Landmark },
];
const fmtDay = (d) => { try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } };
const ERR = { need_party: 'txn.errParty', need_amount: 'txn.errAmount', need_items: 'txn.errItems', bad_date: 'txn.errDate', need_loan: 'txn.errAmount' };

export default function TxnView(props) {
  return (
    <ModuleGate module="docs" tables={[DOC_TABLE]} title={tr('txn.title')} icon={<ClipboardList size={22} />}>
      <Txn {...props} />
    </ModuleGate>
  );
}

function Txn({ sub, onSub, profile, onConvertSaleOrder }) {
  const page = TXN_PAGES.find(p => p.id === sub) || TXN_PAGES[0];
  const [docs, setDocs] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [edit, setEdit] = useState(null);
  const reload = useCallback(() => Promise.all([listDocs(profile), myPurchases(profile), getAllProducts().catch(() => [])])
    .then(([d, p, pr]) => { setDocs(d); setPurchases(p); setProducts(pr || []); }, (e) => { console.warn(e); toast(tr('mod.loadError'), 'error'); setDocs(x => x || []); }), [profile]);
  useEffect(() => { reload(); }, [reload]);
  const all = useMemo(() => docs || [], [docs]);
  const list = useMemo(() => all.filter(d => d.kind === page.kind).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))), [all, page.kind]);
  const total = list.filter(d => d.status !== 'cancelled').reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const blank = () => ({ kind: page.kind, date: localDateISO(), party: '', amount: '', mode: 'cash', ...(page.kind === 'sale_order' || page.kind === 'purchase_order' ? { items: [{ name: '', qty: 1, rate: '', taxPercent: 0 }] } : page.kind === 'purchase_return' ? { items: [] } : {}), direction: page.kind === 'loan' ? 'taken' : page.kind === 'cheque' ? 'received' : 'add', status: page.kind === 'cheque' ? 'pending' : 'open' });
  const ctx = { all, purchases, products, profile, reload, setEdit, onConvertSaleOrder };

  return (
    <div className="mod-page no-mcards" data-testid={`txn-${page.id}`}>
      <PageHeader title={tr(`txn.page_${page.kind}`)} subtitle={tr(`txn.hint_${page.kind}`)} />
      <ModuleTabs tabs={TXN_PAGES.map(p => ({ id: p.id, label: tr(`txn.page_${p.kind}`), icon: p.icon }))} active={page.id} onChange={(id) => onSub(id === TXN_PAGES[0].id ? '' : id)} />
      {page.kind === 'loan' ? null : list.length > 0 && (
        <div className="mod-grid" style={{ marginBottom: 10 }}>
          <div className="mod-stat"><span className="mod-muted">{tr('txn.total')}</span><b>{formatCurrency(total)}</b></div>
          <div className="mod-stat"><span className="mod-muted">{tr('txn.count')}</span><b>{list.length}</b></div>
        </div>
      )}
      <div className="mod-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-primary" data-testid="txn-add" onClick={() => setEdit(blank())}><Plus size={16} /> {tr(`txn.new_${page.kind}`)}</button>
      </div>
      {docs === null ? <div className="mod-card mod-muted">{tr('mod.loading')}</div>
        : !list.length ? <EmptyState icon={page.icon} text={tr(`txn.empty_${page.kind}`)} />
          : page.kind === 'loan' ? <LoanList list={list} {...ctx} />
            : (
              <div className="mod-list">
                {list.map(d => <DocRow key={d.id} d={d} {...ctx} />)}
              </div>
            )}
      {edit && <DocSheet doc={edit} onClose={() => setEdit(null)} {...ctx} />}
    </div>
  );
}

function chipFor(d) {
  if (d.kind === 'cheque') return { cls: d.status === 'cleared' ? 'green' : d.status === 'bounced' ? 'red' : 'amber', text: tr(`txn.st_${d.status}`) };
  if (d.kind === 'sale_order' || d.kind === 'purchase_order') return { cls: d.status === 'converted' ? 'green' : d.status === 'cancelled' ? 'gray' : 'amber', text: tr(`txn.st_${d.status}`) };
  if (d.kind === 'cash_adj') return { cls: d.direction === 'reduce' ? 'red' : 'green', text: tr(d.direction === 'reduce' ? 'txn.cashReduce' : 'txn.cashAdd') };
  if (d.mode) return { cls: 'gray', text: tr(`txn.mode_${d.mode}`) };
  return null;
}

function DocRow({ d, setEdit }) {
  const chip = chipFor(d);
  const sub = [d.no, fmtDay(d.date), d.kind === 'cheque' && d.chequeNo ? `#${d.chequeNo}` : '', d.kind === 'cheque' ? tr(d.direction === 'issued' ? 'txn.issued' : 'txn.received') : '', d.note].filter(Boolean).join(' · ');
  return (
    <div className="mod-row" role="button" tabIndex={0} style={{ cursor: 'pointer' }} data-testid="txn-row" onClick={() => setEdit(d)} onKeyDown={e => { if (e.key === 'Enter') setEdit(d); }}>
      <div className="mod-row-main">
        <div className="mod-row-title">{d.party || tr('txn.page_cash_adj')}</div>
        <div className="mod-row-sub">{sub}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="mod-amt">{formatCurrency(d.amount)}</div>
        {chip && <span className={`mod-chip ${chip.cls}`}>{chip.text}</span>}
      </div>
    </div>
  );
}

function LoanList({ list, all, setEdit }) {
  return (
    <div className="mod-list">
      {list.map(l => {
        const s = loanSummary(l, all);
        return (
          <div key={l.id} className="mod-row" role="button" tabIndex={0} style={{ cursor: 'pointer' }} data-testid="txn-row" onClick={() => setEdit(l)} onKeyDown={e => { if (e.key === 'Enter') setEdit(l); }}>
            <div className="mod-row-main">
              <div className="mod-row-title">{l.party}</div>
              <div className="mod-row-sub">{[l.no, tr(l.direction === 'given' ? 'txn.loanGiven' : 'txn.loanTaken'), fmtDay(l.date), l.emi ? `${tr('txn.emi')} ${formatCurrency(l.emi)}` : ''].filter(Boolean).join(' · ')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mod-amt">{formatCurrency(s.outstanding)}</div>
              <span className="mod-muted" style={{ fontSize: '.75rem' }}>{tr('txn.outstanding')}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocSheet({ doc, onClose, all, purchases, products, profile, reload, onConvertSaleOrder }) {
  const [f, setF] = useState(() => ({ ...doc, items: doc.items ? doc.items.map(i => ({ ...i })) : doc.items }));
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState(null); // loan payment form
  const k = f.kind;
  const isNew = !f.id;
  const set = (key) => (e) => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setF(x => ({ ...x, [key]: v })); };
  const suppliers = useMemo(() => [...new Set(purchases.map(p => p.supplierName).filter(Boolean))].sort(), [purchases]);
  const partyBills = useMemo(() => purchases.filter(p => !f.party || String(p.supplierName || '').trim().toLowerCase() === String(f.party).trim().toLowerCase())
    .map(p => ({ p, due: purchaseDue(p, all.filter(d => d.id !== f.id)) })).filter(x => k !== 'payment_out' || x.due > 0 || x.p.id === f.purchaseId), [purchases, f.party, f.id, f.purchaseId, all, k]);
  const pickBill = (e) => {
    const id = e.target.value; const row = partyBills.find(x => x.p.id === id);
    setF(x => ({ ...x, purchaseId: id || undefined, party: row ? row.p.supplierName : x.party, amount: row && k === 'payment_out' && !x.amount ? String(row.due) : x.amount, interstate: row ? !!row.p.interstate : x.interstate }));
  };
  const setItem = (i, key, v) => setF(x => ({ ...x, items: x.items.map((it, j) => {
    if (j !== i) return it;
    const next = { ...it, [key]: v };
    if (key === 'name') { const p = products.find(pr => String(pr.name || '').toLowerCase() === String(v).toLowerCase()); if (p) Object.assign(next, { productId: p.id, rate: String(k === 'purchase_order' || k === 'purchase_return' ? (p.purchasePrice || p.sellingPrice || 0) : (p.sellingPrice ?? p.rate ?? 0)), taxPercent: Number(p.taxPercent) || 0, unit: p.unit }); else next.productId = undefined; }
    return next;
  }) }));
  const totals = f.items ? itemsTotal(f.items.filter(i => String(i.name || '').trim())) : null;
  const named = (f.items || []).some(i => String(i.name || '').trim());
  const showAmount = !f.items || (k === 'purchase_return' && !named);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast(tr(okMsg), 'success'); await reload(); onClose(); } catch (e) { toast(tr(ERR[e?.message] || 'mod.saveError'), ERR[e?.message] ? 'warning' : 'error'); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const input = { ...f, ...(f.kind === 'cheque' && f.status === 'cleared' && !f.clearedOn ? { clearedOn: localDateISO() } : {}) };
    if (k === 'payment_out') await payOut(input, profile, all, purchases);
    else if (k === 'purchase_return') await saveReturn(input, profile, all);
    else await saveDoc(input, profile, all);
  }, 'txn.saved');
  const remove = async () => {
    if (!(await confirmAction({ title: tr('txn.delete'), message: tr('txn.deleteMsg'), tone: 'danger', confirmLabel: tr('mod.delete'), cancelLabel: tr('mod.cancel') }))) return;
    run(async () => { await removeDoc(f); for (const t of all.filter(d => d.kind === 'loan_txn' && d.loanId === f.id)) await deleteDoc(t.id); });
  };
  const setStatus = (status) => run(() => saveDoc({ ...f, status, ...(status === 'cleared' ? { clearedOn: localDateISO() } : {}) }, profile, all), 'txn.saved');
  const convert = () => {
    if (k === 'purchase_order') return run(() => convertPurchaseOrder(f, profile, all), 'txn.converted');
    return run(async () => {
      await saveDoc({ ...f, status: 'converted' }, profile, all);
      onConvertSaleOrder?.(saleOrderToDraft(f, products));
    });
  };
  const shareOrder = () => {
    const lines = [`*${tr('txn.page_sale_order')} ${f.no || ''}*`, `${profile?.businessName || ''}`, '', ...(f.items || []).map(i => `• ${i.name} × ${i.qty} @ ${formatCurrency(i.rate)}`), '', `*${tr('txn.total')}: ${formatCurrency(f.amount)}*`];
    openInNewTab(whatsAppUrl(f.phone || '', lines.join('\n')));
  };
  const savePay = () => run(() => saveDoc({ kind: 'loan_txn', loanId: f.id, party: f.party, date: pay.date, amount: pay.amount, interest: pay.interest, mode: pay.mode, note: pay.note }, profile, all), 'txn.saved');

  const loanTxns = k === 'loan' && f.id ? all.filter(d => d.kind === 'loan_txn' && d.loanId === f.id) : [];
  const ls = k === 'loan' && f.id ? loanSummary(f, all) : null;
  const ro = !isNew && (k === 'sale_order' || k === 'purchase_order') && f.status !== 'open';

  return (
    <BottomSheet title={isNew ? tr(`txn.new_${k}`) : `${tr(`txn.page_${k}`)} ${f.no || ''}`} onClose={onClose} className="msheet-tall">
      <div className="mod-form two" data-testid="txn-form">
        {k === 'cheque' && <label>{tr('txn.direction')}<select className="form-input" value={f.direction} onChange={set('direction')}><option value="received">{tr('txn.received')}</option><option value="issued">{tr('txn.issued')}</option></select></label>}
        {k === 'loan' && <label>{tr('txn.direction')}<select className="form-input" value={f.direction} onChange={set('direction')} disabled={!isNew}><option value="taken">{tr('txn.loanTaken')}</option><option value="given">{tr('txn.loanGiven')}</option></select></label>}
        {k === 'cash_adj' && <label>{tr('txn.direction')}<select className="form-input" value={f.direction} onChange={set('direction')}><option value="add">{tr('txn.cashAdd')}</option><option value="reduce">{tr('txn.cashReduce')}</option></select></label>}
        {k !== 'cash_adj' && (
          <label>{tr(k === 'loan' ? (f.direction === 'given' ? 'txn.borrower' : 'txn.lender') : (k === 'sale_order' || (k === 'cheque' && f.direction === 'received')) ? 'txn.customer' : 'txn.party')}
            <input className="form-input" data-testid="txn-party" value={f.party} onChange={set('party')} list={k === 'payment_out' || k === 'purchase_return' || k === 'purchase_order' ? 'txn-suppliers' : undefined} maxLength={120} disabled={ro} />
            <datalist id="txn-suppliers">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
          </label>
        )}
        {k === 'sale_order' && <label>{tr('txn.phone')}<input className="form-input" type="tel" inputMode="tel" value={f.phone || ''} onChange={set('phone')} disabled={ro} /></label>}
        {(k === 'payment_out' || k === 'purchase_return') && (
          <label>{tr('txn.againstBill')}
            <select className="form-input" data-testid="txn-bill" value={f.purchaseId || ''} onChange={pickBill}>
              <option value="">{tr('txn.noBill')}</option>
              {partyBills.map(({ p, due }) => <option key={p.id} value={p.id}>{`${p.invoiceNumber || p.id} · ${p.supplierName || ''} · ${k === 'payment_out' ? `${tr('txn.due')} ${formatCurrency(due)}` : formatCurrency(p.totalAmount)}`}</option>)}
            </select>
          </label>
        )}
        {!showAmount ? null : (
          <label>{tr(k === 'loan' ? 'txn.principal' : 'txn.amount')}<input className="form-input" data-testid="txn-amount" type="number" inputMode="decimal" min="0" value={f.amount} onChange={set('amount')} /></label>
        )}
        {k === 'purchase_return' && !named && <label>{tr('txn.gstIncluded')}<input className="form-input" type="number" inputMode="decimal" min="0" value={f.tax || ''} onChange={set('tax')} /></label>}
        {k === 'purchase_return' && <label className="mod-check"><input type="checkbox" checked={!!f.interstate} onChange={set('interstate')} /> {tr('txn.interstate')}</label>}
        {k === 'cheque' && <label>{tr('txn.chequeNo')}<input className="form-input" value={f.chequeNo || ''} onChange={set('chequeNo')} maxLength={30} /></label>}
        {k === 'cheque' && <label>{tr('txn.status')}<select className="form-input" value={f.status} onChange={set('status')}>{['pending', 'cleared', 'bounced'].map(s => <option key={s} value={s}>{tr(`txn.st_${s}`)}</option>)}</select></label>}
        {k === 'loan' && <label>{tr('txn.rate')}<input className="form-input" type="number" inputMode="decimal" min="0" value={f.rate || ''} onChange={set('rate')} /></label>}
        {k === 'loan' && <label>{tr('txn.emi')}<input className="form-input" type="number" inputMode="decimal" min="0" value={f.emi || ''} onChange={set('emi')} /></label>}
        <label>{tr(k === 'cheque' ? 'txn.chequeDate' : 'txn.date')}<input className="form-input" type="date" value={f.date} onChange={set('date')} disabled={ro} /></label>
        {(k === 'payment_out' || k === 'loan') && (
          <label>{tr('txn.mode')}<select className="form-input" value={f.mode} onChange={set('mode')}>{PAY_MODES.map(m => <option key={m} value={m}>{tr(`txn.mode_${m}`)}</option>)}</select></label>
        )}
        <label style={{ gridColumn: '1 / -1' }}>{tr('txn.note')}<input className="form-input" value={f.note || ''} onChange={set('note')} maxLength={500} /></label>
      </div>

      {f.items && (
        <div className="txn-items" data-testid="txn-items">
          {k === 'purchase_return' && <p className="txn-hint">{tr('txn.returnItems')}</p>}
          <datalist id="txn-products">{products.slice(0, 500).map(p => <option key={p.id} value={p.name} />)}</datalist>
          {f.items.map((it, i) => (
            <div className="txn-item" key={i}>
              <input className="form-input txn-item-name" placeholder={tr('txn.itemName')} list="txn-products" value={it.name} onChange={e => setItem(i, 'name', e.target.value)} disabled={ro} />
              <input className="form-input" type="number" inputMode="decimal" min="0" aria-label={tr('txn.qty')} placeholder={tr('txn.qty')} value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} disabled={ro} />
              <input className="form-input" type="number" inputMode="decimal" min="0" aria-label={tr('txn.rateLbl')} placeholder={tr('txn.rateLbl')} value={it.rate} onChange={e => setItem(i, 'rate', e.target.value)} disabled={ro} />
              <select className="form-input" aria-label="GST %" value={it.taxPercent} onChange={e => setItem(i, 'taxPercent', e.target.value)} disabled={ro}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select>
              {!ro && <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={() => setF(x => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}><Trash2 size={16} /></button>}
            </div>
          ))}
          {!ro && <button type="button" className="btn btn-secondary" onClick={() => setF(x => ({ ...x, items: [...x.items, { name: '', qty: 1, rate: '', taxPercent: 0 }] }))}><Plus size={16} /> {tr('txn.addItem')}</button>}
          {named && <div className="txn-total"><span>{tr('txn.total')}</span><b>{formatCurrency(totals.total)}</b></div>}
        </div>
      )}

      {ls && (
        <div className="mod-card" style={{ marginTop: 10 }} data-testid="txn-loan-summary">
          <div className="mod-grid">
            <div className="mod-stat"><span className="mod-muted">{tr('txn.outstanding')}</span><b>{formatCurrency(ls.outstanding)}</b></div>
            <div className="mod-stat"><span className="mod-muted">{tr('txn.interestPaid')}</span><b>{formatCurrency(ls.interestPaid)}</b></div>
          </div>
          {loanTxns.map(t => (
            <div key={t.id} className="mod-row" style={{ border: 0, padding: '6px 0' }}>
              <div className="mod-row-main"><div className="mod-row-title">{fmtDay(t.date)}</div><div className="mod-row-sub">{tr('txn.principal')} {formatCurrency(t.principal)} · {tr('txn.interest')} {formatCurrency(t.interest)}</div></div>
              <div className="mod-amt">{formatCurrency(t.amount)}</div>
              <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={() => run(() => deleteDoc(t.id))}><Trash2 size={16} /></button>
            </div>
          ))}
          {pay ? (
            <div className="mod-form two" style={{ marginTop: 8 }}>
              <label>{tr('txn.amount')}<input className="form-input" type="number" inputMode="decimal" value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} /></label>
              <label>{tr('txn.interest')}<input className="form-input" type="number" inputMode="decimal" value={pay.interest} onChange={e => setPay(p => ({ ...p, interest: e.target.value }))} /></label>
              <label>{tr('txn.date')}<input className="form-input" type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></label>
              <label>{tr('txn.mode')}<select className="form-input" value={pay.mode} onChange={e => setPay(p => ({ ...p, mode: e.target.value }))}>{PAY_MODES.map(m => <option key={m} value={m}>{tr(`txn.mode_${m}`)}</option>)}</select></label>
              <div className="mod-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={savePay}>{tr('txn.save')}</button><button type="button" className="btn btn-secondary" onClick={() => setPay(null)}>{tr('mod.cancel')}</button></div>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setPay({ amount: String(f.emi || ''), interest: '', date: localDateISO(), mode: f.mode || 'cash' })}><Plus size={16} /> {tr(f.direction === 'given' ? 'txn.recordRepayment' : 'txn.recordEmi')}</button>
          )}
        </div>
      )}

      <div className="mod-actions">
        {!ro && <button type="button" className="btn btn-primary" data-testid="txn-save" disabled={busy} onClick={save}>{tr('txn.save')}</button>}
        {!isNew && (k === 'sale_order' || k === 'purchase_order') && f.status === 'open' && (
          <button type="button" className="btn btn-secondary" data-testid="txn-convert" disabled={busy} onClick={convert}><RefreshCw size={16} /> {tr(k === 'sale_order' ? 'txn.toInvoice' : 'txn.toBill')}</button>
        )}
        {!isNew && k === 'sale_order' && <button type="button" className="btn btn-secondary" onClick={shareOrder}><MessageCircle size={16} /> WhatsApp</button>}
        {!isNew && (k === 'sale_order' || k === 'purchase_order') && f.status === 'open' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStatus('cancelled')}><XCircle size={16} /> {tr('txn.cancelOrder')}</button>}
        {!isNew && k === 'cheque' && f.status === 'pending' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStatus('cleared')}><CheckCircle2 size={16} /> {tr('txn.markCleared')}</button>}
        {!isNew && k === 'cheque' && f.status === 'pending' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStatus('bounced')}><XCircle size={16} /> {tr('txn.markBounced')}</button>}
        {!isNew && <button type="button" className="btn btn-secondary" style={{ color: '#dc2626' }} disabled={busy} onClick={remove}><Trash2 size={16} /> {tr('mod.delete')}</button>}
      </div>
    </BottomSheet>
  );
}
