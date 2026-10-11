import { useMemo, useState } from 'react';
import { Search, ScanBarcode, Plus } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { formatCurrency } from '../../utils';
import { t as tr } from '../../i18n';

// Phone quick-add: search the catalogue, tap to add; barcode + voice at the top.
export default function QuickAddSheet({ products, onPick, onScan, onBlank, voice, onClose }) {
  const [q, setQ] = useState('');
  const [added, setAdded] = useState(0);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const src = s ? products.filter(p => String(p.name || '').toLowerCase().includes(s) || String(p.hsn || '').toLowerCase().includes(s) || String(p.barcode || '').toLowerCase() === s) : products;
    return src.slice(0, 60);
  }, [q, products]);
  return (
    <BottomSheet title={tr('mobile.pickItem')} onClose={onClose} className="msheet-tall">
      <div className="mqa-search">
        <Search size={18} />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={tr('mobile.searchItems')} autoFocus enterKeyHint="search" />
      </div>
      <div className="mqa-tools">
        <button type="button" className="btn btn-secondary" onClick={onScan}><ScanBarcode size={18} /> {tr('mobile.scan')}</button>
        {voice}
        <button type="button" className="btn btn-secondary" onClick={onBlank}><Plus size={18} /> {tr('mobile.blankLine')}</button>
      </div>
      {added > 0 && <p className="mqa-added">{tr('mobile.added', { count: added })}</p>}
      <div className="mqa-list">
        {list.length === 0 && <p className="mqa-empty">{tr('mobile.noItems')}</p>}
        {list.map(p => (
          <button type="button" key={p.id} className="mqa-item" onClick={() => { onPick(p); setAdded(n => n + 1); }}>
            <span className="mqa-name">{p.name}</span>
            <span className="mqa-meta">
              {p.hsn ? `HSN ${p.hsn} · ` : ''}{p.stock != null ? `${tr('mobile.stock')} ${p.stock}` : ''}
            </span>
            <span className="mqa-price">{formatCurrency(p.sellingPrice ?? p.rate ?? 0)}</span>
            <span className="mqa-plus"><Plus size={18} /></span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
