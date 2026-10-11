import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, PackageX, Package, ScanLine, Wrench, Trash2 } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { getAllProducts, saveProduct, deleteProduct, getStockAlertSettings } from '../../store';
import { formatCurrency } from '../../utils';
import { toast } from '../Toast';
import { confirmAction } from '../ConfirmModal';
import { getPref } from '../../lib/prefs';
import { t as tr } from '../../i18n';

const BarcodeScannerModal = lazy(() => import('../BarcodeScannerModal'));
const UNITS = ['Pcs', 'Nos', 'Kg', 'Gm', 'Ltr', 'Ml', 'Mtr', 'Box', 'Pack', 'Set', 'Hrs'];
const num = (v) => Number(v) || 0;

// Phone "Items" tab: search, low-stock filter, scan to find, quick add/edit.
// Bulk import, barcodes labels etc. stay on the full Inventory screen.
export default function PhoneItems({ onManage }) {
  const [items, setItems] = useState(null);
  const [threshold, setThreshold] = useState(5);
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [scan, setScan] = useState(false);
  const load = useCallback(() => Promise.all([getAllProducts().catch(() => []), getStockAlertSettings().catch(() => ({ threshold: 5 }))])
    .then(([p, a]) => { setItems(p || []); setThreshold(Number(a?.threshold ?? 5)); }), []);
  useEffect(() => { load(); }, [load]);
  const isLow = useCallback((p) => num(p.stock) <= threshold, [threshold]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items || []).filter(p => (!low || isLow(p)) && (!s || String(p.name || '').toLowerCase().includes(s) || String(p.hsn || '').includes(s) || String(p.barcode || '').toLowerCase() === s))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [items, q, low, isLow]);
  const lowCount = useMemo(() => (items || []).filter(isLow).length, [items, isLow]);
  const showBuy = getPref('itemShowPurchase') !== false;

  return (
    <section className="ph" data-testid="phone-items">
      <div className="ph-toolbar">
        <label className="ph-search"><Search size={18} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={tr('mobile.searchItems')} enterKeyHint="search" /></label>
        <button type="button" className="ph-icon-btn" onClick={() => setScan(true)} aria-label={tr('mobile.scan')}><ScanLine size={20} /></button>
      </div>
      <div className="ph-filters">
        <button type="button" className={`ph-pill${!low ? ' on' : ''}`} onClick={() => setLow(false)}>{tr('ph.allItems')} {items ? `(${items.length})` : ''}</button>
        <button type="button" className={`ph-pill warn${low ? ' on' : ''}`} onClick={() => setLow(true)} data-testid="ph-low"><PackageX size={14} /> {tr('ph.lowStock')} ({lowCount})</button>
        <button type="button" className="ph-pill ghost" onClick={onManage}><Wrench size={14} /> {tr('ph.moreTools')}</button>
      </div>
      {items === null ? <div className="ph-empty"><p>{tr('mod.loading')}</p></div>
        : list.length === 0 ? (
          <div className="ph-empty"><Package size={40} /><p>{tr(low ? 'ph.noLowStock' : q ? 'mobile.noItems' : 'ph.noItemsYet')}</p>{!low && <button type="button" className="btn btn-primary" onClick={() => setEdit({ name: q, unit: 'Pcs' })}><Plus size={18} /> {tr('ph.addItem')}</button>}</div>
        ) : (
          <div className="ph-list ph-rows" data-testid="ph-items">
            {list.map(p => (
              <div key={p.id} className="ph-row" role="button" tabIndex={0} onClick={() => setEdit(p)} onKeyDown={e => { if (e.key === 'Enter') setEdit(p); }}>
                <span className="ph-row-main">
                  <b>{p.name}</b>
                  <small>{tr('ph.sale')} {formatCurrency(p.sellingPrice ?? p.rate ?? 0)}{showBuy && num(p.purchasePrice) ? ` · ${tr('ph.buy')} ${formatCurrency(p.purchasePrice)}` : ''}{p.taxPercent ? ` · GST ${p.taxPercent}%` : ''}</small>
                </span>
                <span className={`ph-stock${isLow(p) ? ' low' : ''}`}><b>{num(p.stock)}</b><small>{p.unit || ''}</small></span>
              </div>
            ))}
          </div>
        )}
      <div className="ph-cta">
        <button type="button" className="ph-cta-main" data-testid="ph-add-item" onClick={() => setEdit({ unit: 'Pcs' })}><Plus size={22} strokeWidth={2.6} /> {tr('ph.addItem')}</button>
      </div>
      {edit && <ItemSheet item={edit} onClose={() => setEdit(null)} onSaved={load} />}
      {scan && (
        <Suspense fallback={null}>
          <BarcodeScannerModal isOpen mode="single" onClose={() => setScan(false)} onScan={(code) => {
            setScan(false);
            const hit = (items || []).find(p => String(p.barcode || '') === String(code));
            if (hit) setEdit(hit); else setEdit({ unit: 'Pcs', barcode: String(code) });
          }} />
        </Suspense>
      )}
    </section>
  );
}

function ItemSheet({ item, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ name: '', sellingPrice: item.sellingPrice ?? item.rate ?? '', purchasePrice: '', stock: '', taxPercent: '', hsn: '', barcode: '', ...item }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    if (!String(f.name || '').trim()) { toast(tr('ph.errItemName'), 'warning'); return; }
    const gst = num(f.taxPercent);
    if (gst < 0 || gst > 100) { toast(tr('ph.errGst'), 'warning'); return; }
    setBusy(true);
    try {
      const sp = num(f.sellingPrice);
      await saveProduct({ ...item, name: String(f.name).trim(), sellingPrice: sp, rate: sp, purchasePrice: num(f.purchasePrice), stock: num(f.stock), taxPercent: gst, unit: f.unit || 'Pcs', hsn: String(f.hsn || '').trim(), barcode: String(f.barcode || '').trim() });
      toast(tr('ph.itemSaved'), 'success'); await onSaved(); onClose();
    } catch { toast(tr('mod.saveError'), 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmAction({ title: tr('ph.deleteItem'), message: tr('ph.deleteItemMsg', { name: f.name }), tone: 'danger', confirmLabel: tr('mod.delete'), cancelLabel: tr('mod.cancel') }))) return;
    try { await deleteProduct(item.id); await onSaved(); onClose(); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  return (
    <BottomSheet title={item.id ? item.name : tr('ph.addItem')} onClose={onClose}>
      <div className="mod-form two" data-testid="ph-item-form">
        <label style={{ gridColumn: '1 / -1' }}>{tr('ph.itemName')}<input className="form-input" value={f.name} onChange={set('name')} autoFocus={!item.id} maxLength={120} /></label>
        <div className="row2">
          <label>{tr('ph.salePrice')}<input className="form-input" type="number" inputMode="decimal" min="0" value={f.sellingPrice} onChange={set('sellingPrice')} /></label>
          <label>{tr('ph.purchasePrice')}<input className="form-input" type="number" inputMode="decimal" min="0" value={f.purchasePrice} onChange={set('purchasePrice')} /></label>
        </div>
        <div className="row2">
          <label>{tr('ph.openingStock')}<input className="form-input" type="number" inputMode="decimal" value={f.stock} onChange={set('stock')} /></label>
          <label>{tr('ph.unit')}<select className="form-input" value={f.unit} onChange={set('unit')}>{[...new Set([f.unit, ...UNITS])].filter(Boolean).map(u => <option key={u} value={u}>{u}</option>)}</select></label>
        </div>
        <div className="row2">
          <label>GST %<select className="form-input" value={String(f.taxPercent || 0)} onChange={set('taxPercent')}>{[...new Set([String(num(f.taxPercent)), '0', '0.25', '3', '5', '12', '18', '28', '40'])].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
          <label>HSN / SAC<input className="form-input" inputMode="numeric" value={f.hsn} onChange={set('hsn')} maxLength={8} /></label>
        </div>
        <label>{tr('ph.barcode')}<input className="form-input" value={f.barcode} onChange={set('barcode')} maxLength={40} /></label>
      </div>
      <div className="mod-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save} data-testid="ph-item-save">{tr('txn.save')}</button>
        {item.id && <button type="button" className="btn btn-secondary" style={{ color: '#dc2626' }} onClick={remove}><Trash2 size={16} /> {tr('mod.delete')}</button>}
      </div>
    </BottomSheet>
  );
}
