import { useState, useEffect, useRef } from 'react';
import { X, Barcode, Camera, Plus, Check, ArrowRight, Package, AlertCircle } from 'lucide-react';
import { getAllProducts, saveProduct } from '../store';
import { formatCurrency } from '../utils';
import { toast } from './Toast';
import BarcodeScannerModal from './BarcodeScannerModal';

export default function QuickStockModal({ isOpen, onClose, onStockUpdated }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [addQuantity, setAddQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [saving, setSaving] = useState(false);

  // New product quick create state if scanned barcode is not found
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');

  const searchInputRef = useRef(null);
  const addQtyRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      getAllProducts().then(setProducts).catch(() => {});
      setSearch('');
      setSelectedProduct(null);
      setAddQuantity('');
      setIsNewProduct(false);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Find product by barcode or name
  const handleLookup = (code) => {
    const trimmed = String(code).trim().toLowerCase();
    if (!trimmed) return;

    const match = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === trimmed) ||
        (p.id && String(p.id).toLowerCase() === trimmed) ||
        (p.name && p.name.toLowerCase() === trimmed)
    );

    if (match) {
      setSelectedProduct(match);
      setPurchasePrice(match.purchasePrice ?? '');
      setSellingPrice(match.sellingPrice ?? match.rate ?? match.price ?? '');
      setAddQuantity('10');
      setIsNewProduct(false);
      setTimeout(() => addQtyRef.current?.focus(), 100);
    } else {
      // Prompt for fast product creation
      setSelectedProduct(null);
      setIsNewProduct(true);
      setNewProductName('');
      setPurchasePrice('');
      setSellingPrice('');
      setAddQuantity('10');
    }
  };

  const handleBarcodeScanned = (code) => {
    setSearch(code);
    setShowCameraScanner(false);
    handleLookup(code);
  };

  // Quick delta helpers (+5, +10, +25, +50, +100)
  const applyPresetQty = (qty) => {
    setAddQuantity(String(qty));
    addQtyRef.current?.focus();
  };

  // Submit stock update
  const handleSaveStock = async () => {
    const qtyToAdd = parseInt(addQuantity, 10);
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
      toast('Please enter a valid quantity to add', 'error');
      return;
    }

    setSaving(true);
    try {
      if (selectedProduct) {
        // Update existing product stock
        const currentStock = parseInt(selectedProduct.stock || 0, 10);
        const newStock = currentStock + qtyToAdd;

        const updated = {
          ...selectedProduct,
          stock: newStock,
          purchasePrice: purchasePrice ? parseFloat(purchasePrice) : selectedProduct.purchasePrice,
          sellingPrice: sellingPrice ? parseFloat(sellingPrice) : (selectedProduct.sellingPrice ?? selectedProduct.rate),
          rate: sellingPrice ? parseFloat(sellingPrice) : (selectedProduct.rate ?? selectedProduct.sellingPrice),
        };

        await saveProduct(updated);
        toast(`✅ Added +${qtyToAdd} to "${selectedProduct.name}" (New Stock: ${newStock})`, 'success');
      } else if (isNewProduct) {
        // Quick create new product
        if (!newProductName.trim()) {
          toast('Please enter product name', 'error');
          setSaving(false);
          return;
        }

        const newProd = {
          id: `prod_${Date.now()}`,
          name: newProductName.trim(),
          barcode: search.trim(),
          stock: qtyToAdd,
          purchasePrice: parseFloat(purchasePrice) || 0,
          sellingPrice: parseFloat(sellingPrice) || 0,
          rate: parseFloat(sellingPrice) || 0,
          price: parseFloat(sellingPrice) || 0,
          unit: 'PCS',
          taxPercent: 18,
          hsn: '',
        };

        await saveProduct(newProd);
        toast(`✅ Created "${newProd.name}" with ${qtyToAdd} in stock!`, 'success');
      }

      if (onStockUpdated) onStockUpdated();
      // Reset for next scan
      setSelectedProduct(null);
      setIsNewProduct(false);
      setSearch('');
      setAddQuantity('');
      searchInputRef.current?.focus();
    } catch (err) {
      toast('Failed to update stock: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          borderRadius: '14px',
          maxWidth: '540px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--border-color, #e2e8f0)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.1rem 1.4rem',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #059669, #047857)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Package size={22} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                ⚡ Quick Stock In / Scan to Add Stock
              </h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#a7f3d0' }}>
                Counter Stock Entry: Scan barcode &amp; press Enter to add inventory in 2 seconds.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#ffffff',
              padding: '0.3rem',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.4rem' }}>
          {/* Barcode Search Row */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Scan Barcode or Type Product Name
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Barcode size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLookup(search);
                    }
                  }}
                  placeholder="Scan barcode with scanner or enter name..."
                  className="form-input"
                  style={{ paddingLeft: '2.4rem', fontSize: '0.92rem', width: '100%' }}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowCameraScanner(true)}
                className="btn btn-secondary"
                title="Use Mobile Camera"
                style={{ padding: '0.5rem 0.8rem' }}
              >
                <Camera size={18} />
              </button>

              <button
                type="button"
                onClick={() => handleLookup(search)}
                className="btn btn-primary"
                style={{ fontSize: '0.88rem' }}
              >
                Find
              </button>
            </div>
          </div>

          {/* Product Found State */}
          {selectedProduct && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '1.1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#166534' }}>
                    {selectedProduct.name}
                  </h4>
                  <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '0.2rem' }}>
                    Barcode: {selectedProduct.barcode || 'N/A'} · HSN: {selectedProduct.hsn || '-'} · Selling Price: {formatCurrency(selectedProduct.sellingPrice || selectedProduct.price)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#15803d' }}>Current Stock</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#166534' }}>
                    {selectedProduct.stock ?? 0} {selectedProduct.unit || 'PCS'}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #86efac' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#14532d', marginBottom: '0.4rem' }}>
                  Stock Quantity to Add (+)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <input
                    ref={addQtyRef}
                    type="number"
                    min="1"
                    value={addQuantity}
                    onChange={(e) => setAddQuantity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveStock();
                      }
                    }}
                    placeholder="Enter qty (e.g. 10)"
                    className="form-input"
                    style={{ fontSize: '1.1rem', fontWeight: 700, width: '120px', color: '#166534' }}
                  />

                  {/* Preset Quick Chips */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {[5, 10, 25, 50, 100].map((qty) => (
                      <button
                        type="button"
                        key={qty}
                        onClick={() => applyPresetQty(qty)}
                        style={{
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          border: '1px solid #86efac',
                          background: '#ffffff',
                          color: '#15803d',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        +{qty}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#15803d' }}>Update Purchase Rate (₹)</label>
                    <input
                      type="number"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="Optional"
                      className="form-input"
                      style={{ fontSize: '0.82rem', padding: '0.35rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#15803d' }}>Update Selling Price (₹)</label>
                    <input
                      type="number"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      placeholder="Optional"
                      className="form-input"
                      style={{ fontSize: '0.82rem', padding: '0.35rem' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* New Product Fast Create State */}
          {isNewProduct && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '10px',
                padding: '1.1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#b45309', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <AlertCircle size={16} /> Barcode not found. Quick Create New Product:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e' }}>Product Name</label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="e.g. Parle Hide & Seek 120g"
                    className="form-input"
                    style={{ fontSize: '0.88rem' }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e' }}>Initial Stock</label>
                    <input
                      type="number"
                      value={addQuantity}
                      onChange={(e) => setAddQuantity(e.target.value)}
                      className="form-input"
                      style={{ fontSize: '0.88rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e' }}>Selling Price (₹)</label>
                    <input
                      type="number"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      placeholder="e.g. 50"
                      className="form-input"
                      style={{ fontSize: '0.88rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e' }}>Cost Price (₹)</label>
                    <input
                      type="number"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="e.g. 42"
                      className="form-input"
                      style={{ fontSize: '0.88rem' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-secondary"
              style={{ fontSize: '0.88rem' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveStock}
              disabled={saving || (!selectedProduct && !isNewProduct)}
              className="btn btn-primary"
              style={{
                background: '#059669',
                borderColor: '#059669',
                fontSize: '0.88rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Check size={18} />
              {saving ? 'Updating...' : 'Save Stock (Enter)'}
            </button>
          </div>
        </div>
      </div>

      {showCameraScanner && (
        <BarcodeScannerModal
          isOpen={showCameraScanner}
          onClose={() => setShowCameraScanner(false)}
          onDetected={handleBarcodeScanned}
        />
      )}
    </div>
  );
}
