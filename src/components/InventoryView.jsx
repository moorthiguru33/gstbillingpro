import { useState, useEffect, useRef } from 'react';
import { Package, Search, Plus, Edit3, Trash2, X, Save, Upload, Sparkles, Barcode } from 'lucide-react';
import { getAllProducts, saveProduct, saveProductsBatch, deleteProduct, getProfile, getStockAlertSettings } from '../store';
import { getAllUnits, getCountryConfig, formatCurrency } from '../utils';
import { STARTER_CATALOG } from '../data/starterCatalog';
import MasterCatalogModal from './MasterCatalogModal';
import QuickStockModal from './QuickStockModal';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';
import HelpButton from './HelpButton';
import { productSellingPrice, productTaxPercent } from '../utils/products.js';
import { t as tr } from '../i18n';

// v1.10.29 — reported: "here purchase price and selling price need".
// Product now carries BOTH: `purchasePrice` (what we paid the supplier) and
// `sellingPrice` (what we charge the customer). Legacy `rate` field is
// still written on save (mirrors sellingPrice) so any pre-v1.10.29 reader
// still gets a valid number, but the form no longer edits it directly —
// dead state removed for clarity.
const emptyForm = {
  name: '', hsn: '', barcode: '', purchasePrice: '', sellingPrice: '', taxPercent: '', unit: 'Pcs', stock: '', description: '',
};

export default function InventoryView() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [units, setUnits] = useState(getAllUnits());
  const [profileCountry, setProfileCountry] = useState('India');
  const profileCurrency = getCountryConfig(profileCountry).currency;
  // The colour-coded stock badge in the table respects the user's threshold
  // — defaults to 5 if no setting saved yet. When alerts are disabled
  // entirely, items at or below threshold render in the same plain colour
  // as everything else (still "Out of Stock" red for 0 — that's a hard fact,
  // not an alert preference).
  const [stockAlerts, setStockAlerts] = useState({ enabled: true, threshold: 5 });

  const loadProducts = async () => {
    try {
      const data = await getAllProducts();
      setProducts(data);
    } catch {
      toast('Failed to load products', 'error');
    }
  };

  useEffect(() => {
    loadProducts();
    setUnits(getAllUnits());
    getProfile().then(p => { if (p?.country) setProfileCountry(p.country); }).catch(() => {});
    getStockAlertSettings().then(setStockAlerts).catch(() => {});
  }, []);

  const [showMasterCatalogModal, setShowMasterCatalogModal] = useState(false);
  const [showQuickStockModal, setShowQuickStockModal] = useState(false);
  const [importingCatalog, setImportingCatalog] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setShowQuickStockModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleImportStarterCatalog = async () => {
    if (!window.confirm('Import 1,000+ popular Indian retail & FMCG items (Kirana, Snacks, Dairy, Stationery, Hardware, Electronics, Pharma) into your catalog?')) return;
    setImportingCatalog(true);
    try {
      toast('Importing 1,000+ products... please wait', 'info', 6000);
      const res = await saveProductsBatch(STARTER_CATALOG);
      toast(`Successfully imported ${res.count || 1000}+ products!`, 'success', 6000);
      await loadProducts();
    } catch (err) {
      toast('Failed to import catalog: ' + err.message, 'error');
    } finally {
      setImportingCatalog(false);
    }
  };

  const filtered = search.trim()
    ? products.filter(p =>
        (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.hsn || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode || '').toLowerCase().includes(search.toLowerCase())
      )
    : products;

  const openAdd = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (product) => {
    // v1.10.29 — Backward-compat: pre-v1.10.29 products only had `rate`.
    // Read `sellingPrice` if set, else fall back to `rate`. `purchasePrice`
    // is new — starts empty for legacy products until the user fills it.
    setForm({
      name: product.name || '',
      hsn: product.hsn || '',
      barcode: product.barcode || '',
      purchasePrice: product.purchasePrice ?? '',
      sellingPrice: product.sellingPrice ?? product.rate ?? product.price ?? '',
      taxPercent: productTaxPercent(product) ?? '',
      unit: product.unit || 'Nos',
      stock: product.stock ?? '', // v1.10.74 - was `|| ''`, which blanked a stock of 0
      description: product.description || '',
    });
    setEditingId(product.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast('Product name is required', 'warning');
      return;
    }
    // v1.10.74 - the input's min/max are not enforced by the browser on save.
    const gst = form.taxPercent === '' ? 0 : Number(form.taxPercent);
    if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
      toast('GST % must be between 0 and 100', 'warning');
      return;
    }
    try {
      // v1.10.29 — Persist both prices. `rate` mirrors sellingPrice so any
      // old caller reading .rate still gets the right number.
      const sellingPrice = form.sellingPrice ? parseFloat(form.sellingPrice) : 0;
      const purchasePrice = form.purchasePrice ? parseFloat(form.purchasePrice) : 0;
      const product = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        hsn: form.hsn.trim(),
        barcode: form.barcode ? form.barcode.trim() : '',
        purchasePrice,
        sellingPrice,
        rate: sellingPrice, // mirror for legacy readers
        taxPercent: form.taxPercent ? parseFloat(form.taxPercent) : 0,
        unit: form.unit,
        stock: form.stock ? parseFloat(form.stock) : 0,
        description: form.description.trim(),
      };
      await saveProduct(product);
      toast(editingId ? 'Product updated' : 'Product added', 'success');
      closeForm();
      loadProducts();
    } catch {
      toast('Failed to save product', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (await confirmAction({
      title: 'Delete this product?',
      message: 'Existing invoices that used this product keep their line items unchanged. This just removes the product from your catalog.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })) {
      try {
        await deleteProduct(id);
        toast('Product deleted', 'success');
        loadProducts();
      } catch {
        toast('Failed to delete', 'error');
      }
    }
  };

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const csvInputRef = useRef(null);

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
      else { current += ch; }
    }
    result.push(current);
    return result;
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast('CSV file is empty or has no data rows', 'warning'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      let imported = 0;
      // v1.10.74 - importing the same file twice made duplicates. Skip names
      // already in the list (trimmed, any case), including repeats inside the file.
      let skipped = 0;
      const known = new Set(products.map(p => (p.name || '').trim().toLowerCase()));
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
        const name = row.name || row.product || row['product name'] || '';
        if (!name) continue;
        if (known.has(name.toLowerCase())) { skipped++; continue; }
        known.add(name.toLowerCase());
        await saveProduct({
          name,
          hsn: row.hsn || row['hsn code'] || row['sac'] || '',
          sellingPrice: parseFloat(row.sellingprice || row['selling price'] || row.rate || row.price || row.mrp) || 0,
          purchasePrice: parseFloat(row.purchaseprice || row['purchase price'] || row.cost) || undefined,
          barcode: row.barcode || row.ean || '',
          taxPercent: row.taxpercent || row['tax%'] || row['gst%'] || row['tax'] ? parseFloat(row.taxpercent || row['tax%'] || row['gst%'] || row['tax']) || 0 : 0,
          unit: row.unit || 'Nos',
          stock: row.stock || row.quantity ? parseFloat(row.stock || row.quantity) || 0 : 0,
          description: row.description || '',
        });
        imported++;
      }
      toast(`Imported ${imported} product(s)${skipped ? `, skipped ${skipped} already in your list` : ''}`, 'success');
      loadProducts();
    } catch {
      toast('Failed to parse CSV file', 'error');
    }
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div>
            <h1 className="page-title">{tr('products.title')}</h1>
            <p className="page-subtitle">Manage your products and services catalog</p>
          </div>
          <HelpButton title="Products — how to use" doc="products">
            <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
              <li><strong>Add Product</strong>: name, HSN/SAC, purchase and selling price, GST %, unit and stock. Typing the name on an invoice fills the rest in.</li>
              <li><strong>Stock</strong> goes down when you save an invoice and up when you save a purchase bill.</li>
              <li><strong>Import CSV</strong>: columns <code>name, hsn, rate, gst%, unit, stock</code>.</li>
              <li><strong>Low stock</strong> shows in amber, none in red. Set the level in Settings → Low-stock alerts.</li>
            </ul>
          </HelpButton>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0', fontWeight: 700 }}
            onClick={() => setShowQuickStockModal(true)}
            title="Scan barcode and add stock instantly (Alt+S)"
          >
            <Package size={16} /> ⚡ Scan Stock In (Alt+S)
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ background: 'linear-gradient(135deg, #eff6ff, #e0e7ff)', color: '#1e40af', borderColor: '#bfdbfe', fontWeight: 700 }}
            onClick={() => setShowMasterCatalogModal(true)}
          >
            <Sparkles size={16} /> ✨ 1,25,000+ Master Products Hub
          </button>
          <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCSVImport} />
          <button className="btn btn-secondary" onClick={() => csvInputRef.current?.click()}>
            <Upload size={16} /> Import CSV
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={18} /> Add Product
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="glass-panel p-4 mb-6">
        <div className="search-box" style={{ maxWidth: '400px' }}>
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search by name or HSN..." value={search}
            onChange={e => setSearch(e.target.value)} className="search-input" />
          {search && <button className="icon-btn" onClick={() => setSearch('')} title="Clear search" aria-label="Clear search"><X size={14} /></button>}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="section-title">{editingId ? 'Edit Product' : 'Add Product'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Product / Service Name *</label>
                <input type="text" className="form-input" value={form.name}
                  onChange={e => updateField('name', e.target.value)} placeholder="e.g. Web Development" />
              </div>
              <div className="form-group">
                <label className="form-label">HSN / SAC Code</label>
                <input type="text" className="form-input" value={form.hsn}
                  onChange={e => updateField('hsn', e.target.value)} placeholder="e.g. 998314" />
              </div>
              <div className="form-group">
                <label className="form-label">Barcode / EAN (Optional)</label>
                <input type="text" className="form-input" value={form.barcode || ''}
                  onChange={e => updateField('barcode', e.target.value)} placeholder="e.g. 8901030123456" />
              </div>
              {/* v1.10.29 — Purchase price + selling price side by side.
                  Selling price seeds the invoice rate; purchase price seeds
                  the purchase-bill rate. Legacy `rate` field kept invisible
                  for backward compat — writes through to sellingPrice. */}
              <div className="form-group">
                <label className="form-label">Purchase Price</label>
                <input type="number" className="form-input" value={form.purchasePrice}
                  onChange={e => updateField('purchasePrice', e.target.value)}
                  placeholder="0.00" min="0" step="any"
                  title="What you pay the supplier. Auto-fills on new Purchase Bills." />
              </div>
              <div className="form-group">
                <label className="form-label">Selling Price</label>
                <input type="number" className="form-input" value={form.sellingPrice}
                  onChange={e => updateField('sellingPrice', e.target.value)}
                  placeholder="0.00" min="0" step="any"
                  title="What you charge the customer. Auto-fills on new Invoices." />
              </div>
              <div className="form-group">
                <label className="form-label">GST %</label>
                <input type="number" className="form-input" value={form.taxPercent}
                  onChange={e => updateField('taxPercent', e.target.value)} placeholder="18" min="0" max="100" />
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-input" value={form.unit}
                  onChange={e => updateField('unit', e.target.value)}>
                  {form.unit && !units.some(u => u.label === form.unit) && (
                    <option value={form.unit}>{form.unit}</option>
                  )}
                  {units.map(u => <option key={u.label} value={u.label}>{u.label}{u.custom ? ' ★' : ''}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Stock Quantity</label>
                <input type="number" className="form-input" value={form.stock}
                  onChange={e => updateField('stock', e.target.value)} placeholder="0" min="0" />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Description (optional)</label>
                <input type="text" className="form-input" value={form.description}
                  onChange={e => updateField('description', e.target.value)} placeholder="Brief description..." />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                <Save size={16} /> {editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Table */}
      <div className="glass-panel">
        <div className="table-header"><h3>Products & Services</h3></div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Package size={48} />
            <p>{products.length === 0 ? 'No products yet. Add your first product.' : 'No products match your search.'}</p>
            {products.length === 0 && (
              <button className="btn btn-primary" onClick={openAdd}><Plus size={18} /> {tr('products.add')}</button>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>HSN/SAC</th>
                  <th>Rate</th>
                  <th>GST %</th>
                  <th>Unit</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(product => (
                  <tr key={product.id}>
                    <td className="font-medium" title={product.description || ''}>{product.name}</td>
                    <td className="text-muted">{product.hsn || '-'}</td>
                    <td className="font-bold">{productSellingPrice(product) ? formatCurrency(productSellingPrice(product), profileCurrency) : '-'}</td>
                    <td>{productTaxPercent(product) !== undefined ? `${productTaxPercent(product)}%` : '-'}</td>
                    <td className="text-muted">{product.unit || 'Nos'}</td>
                    <td>
                      {(product.stock ?? 0) <= 0 ? (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>Out of Stock</span>
                      ) : (stockAlerts.enabled !== false && (product.stock ?? 0) <= Number(stockAlerts.threshold ?? 5)) ? (
                        <span style={{ color: '#d97706', fontWeight: 600 }}>{product.stock}</span>
                      ) : (
                        product.stock
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="icon-btn icon-btn-blue" onClick={() => openEdit(product)} title="Edit">
                          <Edit3 size={15} />
                        </button>
                        <button className="icon-btn icon-btn-red" onClick={() => handleDelete(product.id)} title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MasterCatalogModal
        isOpen={showMasterCatalogModal}
        onClose={() => setShowMasterCatalogModal(false)}
        onImportComplete={loadProducts}
      />

      <QuickStockModal
        isOpen={showQuickStockModal}
        onClose={() => setShowQuickStockModal(false)}
        onStockUpdated={loadProducts}
      />
    </div>
  );
}
