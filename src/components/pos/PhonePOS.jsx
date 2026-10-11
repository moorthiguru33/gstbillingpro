import { useState } from 'react';
import { Search, ScanLine, Minus, Plus, X, Printer, MessageCircle, RotateCcw, Banknote, Smartphone, CreditCard, BookUser, Delete, CheckCircle2 } from 'lucide-react';
import BottomSheet from '../mobile/BottomSheet';
import AiBillButton from '../ai/AiBillButton';
import { formatCurrency } from '../../utils';
import { keypad } from '../../lib/posPicks';
import { t as tr } from '../../i18n';

const MODES = [['cash', Banknote], ['upi', Smartphone], ['card', CreditCard], ['credit', BookUser]];
const NOTES = [50, 100, 200, 500, 2000];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'];
const priceOf = (p) => Number(p.sellingPrice ?? p.rate ?? p.price ?? 0);

/** Phone counter billing: search/scan on top, favourites, compact cart,
 *  sticky Pay bar, payment sheet with a cash keypad, then print / share. */
export default function PhonePOS(p) {
  const { products, picks, search, setSearch, results, onAdd, cart, onQty, onRemove, totals, billType, onToggleBillType,
    mode, setMode, tendered, setTendered, customerName, setCustomerName, customerPhone, onPhone, cardLast4, setCardLast4,
    saving, onComplete, done, onPrint, onWhatsApp, onNewSale, onScan, onAi, upiQr, upiId, hasPrinter } = p;
  const [payOpen, setPayOpen] = useState(false);
  const count = cart.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const total = totals.total;
  const given = Number(tendered) || 0;
  const change = given - total;
  const inCart = new Map(cart.map(i => [i.id, i.qty]));

  const newSale = () => { setPayOpen(false); onNewSale(); };

  return (
    <section className="pp" data-testid="phone-pos">
      <div className="pp-top">
        <label className="pp-search">
          <Search size={18} />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('posm.searchPh')} enterKeyHint="search" data-testid="pp-search"
            onKeyDown={e => { if (e.key === 'Enter' && results[0]) onAdd(results[0]); }} />
        </label>
        <button type="button" className="pp-icon" onClick={onScan} aria-label={tr('posm.scan')} data-testid="pp-scan"><ScanLine size={20} /></button>
        <AiBillButton mode="voice" compact products={products} onApply={onAi} />
      </div>
      <div className="pp-sub">
        <button type="button" className={`pp-gst ${billType === 'gst' ? 'on' : ''}`} onClick={onToggleBillType}>{billType === 'gst' ? tr('posm.gst') : tr('posm.nonGst')}</button>
        <span>{cart.length ? tr('posm.lines', { count: cart.length }) : tr(picks.length ? 'posm.favourites' : 'posm.noItems')}</span>
      </div>

      {search.trim() ? (
        <div className="pp-results">
          {results.length === 0 && <p className="pp-empty">{tr('posm.noResults')}</p>}
          {results.map(r => (
            <button type="button" key={r.id} className="pp-result" onClick={() => onAdd(r)}>
              <span className="pp-r-name">{r.name}{r.stock != null && r.stock !== '' && <small>{tr('posm.stock', { n: r.stock })}</small>}</span>
              <b>{formatCurrency(priceOf(r))}</b><Plus size={18} />
            </button>
          ))}
        </div>
      ) : (
        <div className={cart.length ? 'pp-chips' : 'pp-grid'} data-testid="pp-picks">
          {picks.map(it => (
            <button type="button" key={it.id} className="pp-pick" onClick={() => onAdd(it)}>
              <span className="pp-pick-name">{it.name}</span>
              <span className="pp-pick-price">{formatCurrency(priceOf(it))}</span>
              {inCart.has(it.id) && <i className="pp-badge">{inCart.get(it.id)}</i>}
            </button>
          ))}
        </div>
      )}

      {cart.length === 0 ? (
        <p className="pp-empty pp-hint">{tr('posm.emptyCart')}</p>
      ) : (
        <ul className="pp-cart" data-testid="pp-cart">
          {cart.map(it => (
            <li key={it.id} className="pp-line">
              <div className="pp-line-main">
                <span className="pp-line-name">{it.name}</span>
                <small>{formatCurrency(it.price)} × {it.qty}</small>
              </div>
              <b className="pp-line-amt">{formatCurrency(it.price * it.qty)}</b>
              <div className="pp-step">
                <button type="button" onClick={() => onQty(it.id, -1)} aria-label={tr('posm.less')}><Minus size={16} /></button>
                <span>{it.qty}</span>
                <button type="button" onClick={() => onQty(it.id, 1)} aria-label={tr('posm.more')}><Plus size={16} /></button>
              </div>
              <button type="button" className="pp-x" onClick={() => onRemove(it.id)} aria-label={tr('posm.remove')}><X size={16} /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="pp-bar">
        <div className="pp-bar-sum">
          <small>{tr('posm.items', { count })}</small>
          <b data-testid="pp-total">{formatCurrency(total)}</b>
        </div>
        <button type="button" className="pp-pay" disabled={!cart.length} onClick={() => setPayOpen(true)} data-testid="pp-pay">{tr('posm.pay')}</button>
      </div>

      {payOpen && !done && (
        <BottomSheet title={`${tr('posm.payTitle')} · ${formatCurrency(total)}`} onClose={() => setPayOpen(false)} className="pp-sheet">
          <div className="pp-modes" role="radiogroup" data-testid="pp-modes">
            {MODES.map(([m, Icon]) => (
              <button type="button" key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}><Icon size={18} />{tr(`posm.${m}`)}</button>
            ))}
          </div>

          {mode === 'cash' && (
            <div className="pp-cash">
              <div className="pp-tender">
                <span>{tr('posm.tendered')}</span><b data-testid="pp-tendered">{tendered ? formatCurrency(given) : '—'}</b>
              </div>
              <div className="pp-change">
                {given > 0 && (change >= 0
                  ? <><span>{tr('posm.change')}</span><b className="pos">{formatCurrency(change)}</b></>
                  : <><span>{tr('posm.short')}</span><b className="neg">{formatCurrency(-change)}</b></>)}
              </div>
              <div className="pp-notes">
                <button type="button" onClick={() => setTendered(String(total))}>{tr('posm.exact')}</button>
                {NOTES.map(n => <button type="button" key={n} onClick={() => setTendered(String(Math.round((given + n) * 100) / 100))}>+₹{n}</button>)}
              </div>
              <div className="pp-keys">
                {KEYS.map(k => <button type="button" key={k} onClick={() => setTendered(keypad(tendered, k))} aria-label={k === 'back' ? tr('posm.backspace') : k}>{k === 'back' ? <Delete size={20} /> : k}</button>)}
              </div>
            </div>
          )}
          {mode === 'upi' && (
            <div className="pp-upi">
              {upiQr ? <img src={upiQr} alt="UPI QR" /> : null}
              <p>{upiId ? `UPI: ${upiId}` : tr('posm.upiHint')}</p>
            </div>
          )}
          {mode === 'card' && (
            <label className="pp-field">{tr('posm.last4')}<input className="form-input" inputMode="numeric" maxLength={4} value={cardLast4} onChange={e => setCardLast4(e.target.value.replace(/\D/g, ''))} /></label>
          )}

          <div className="pp-cust">
            <small>{tr(mode === 'credit' ? 'posm.customerReq' : 'posm.customer')}</small>
            <div className="pp-cust-row">
              <input className="form-input" type="tel" inputMode="tel" placeholder={tr('posm.phone')} value={customerPhone} onChange={e => onPhone(e.target.value)} />
              <input className="form-input" placeholder={tr('posm.name')} value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
          </div>

          <button type="button" className="pp-pay pp-complete" disabled={saving} onClick={onComplete} data-testid="pp-complete">
            <CheckCircle2 size={20} /> {saving ? tr('posm.saving') : `${tr(mode === 'credit' ? 'posm.saveCredit' : 'posm.complete')} · ${formatCurrency(total)}`}
          </button>
        </BottomSheet>
      )}

      {done && (
        <BottomSheet title={tr('posm.done')} onClose={newSale} className="pp-sheet">
          <div className="pp-done" data-testid="pp-done">
            <CheckCircle2 size={40} className="pos" />
            <b>{done.invoiceNumber}</b>
            <span className="pp-done-amt">{formatCurrency(done.totalAmount)}</span>
            {done.status === 'unpaid'
              ? <small className="neg">{tr('posm.toCollect')}</small>
              : done.paymentMode === 'cash' && Number(done.details?.cashTendered) > done.totalAmount && <small>{tr('posm.change')}: {formatCurrency(Number(done.details.cashTendered) - done.totalAmount)}</small>}
          </div>
          <div className="pp-done-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onPrint(done)}><Printer size={18} /> {tr(hasPrinter ? 'posm.printBt' : 'posm.print')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => onWhatsApp(done)}><MessageCircle size={18} /> {tr('posm.whatsapp')}</button>
          </div>
          <button type="button" className="pp-pay pp-complete" onClick={newSale} data-testid="pp-new"><RotateCcw size={18} /> {tr('posm.newSale')}</button>
        </BottomSheet>
      )}
    </section>
  );
}
