import { useState, useEffect, useMemo, useRef } from 'react';
import {
  X, Search, Download, Upload, CheckCircle2, Sparkles,
  Layers, Package, Check, ArrowRight, Loader2, Filter, AlertCircle,
  Building2, Plus
} from 'lucide-react';
import { saveProductsBatch } from '../store';
import { formatCurrency } from '../utils';
import { toast } from './Toast';

export default function MasterCatalogModal({ isOpen, onClose, onImportComplete }) {
  const [activeTab, setActiveTab] = useState('industries'); // 'industries' | 'search' | 'csv'
  const [catalogIndex, setCatalogIndex] = useState(null);
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [industryCatalog, setIndustryCatalog] = useState([]);
  const [loadingIndustry, setLoadingIndustry] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, percent: 0, status: '' });

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [addedItemIds, setAddedItemIds] = useState(new Set());

  // CSV tab state
  const fileInputRef = useRef(null);
  const [csvFile, setCsvFile] = useState(null);
  const [parsedCsvRows, setParsedCsvRows] = useState([]);

  // Load master index
  useEffect(() => {
    if (!isOpen) return;
    fetch('/data/catalogs/index.json')
      .then((res) => res.json())
      .then((data) => {
        setCatalogIndex(data);
        if (data.industries && data.industries.length > 0 && !selectedIndustry) {
          // Default to first industry (Grocery)
          loadIndustryData(data.industries[0]);
        }
      })
      .catch((err) => {
        console.error('Failed to load catalog index:', err);
      });
  }, [isOpen]);

  // Load specific industry catalog
  const loadIndustryData = async (ind) => {
    setSelectedIndustry(ind);
    setLoadingIndustry(true);
    setIndustryCatalog([]);
    setSelectedCategoryFilter('All');
    setSearchQuery('');
    setSelectedItemIds(new Set());

    try {
      const res = await fetch(ind.file);
      if (!res.ok) throw new Error('Failed to load industry catalog');
      const data = await res.json();
      setIndustryCatalog(data);
    } catch (err) {
      console.error('Error fetching industry:', err);
      toast(`Failed to load ${ind.name} data`, 'error');
    } finally {
      setLoadingIndustry(false);
    }
  };

  // Chunked batch importer
  const runChunkedImport = async (itemsToImport, label) => {
    if (!itemsToImport || itemsToImport.length === 0) {
      toast('No products to import', 'error');
      return;
    }

    setImporting(true);
    const total = itemsToImport.length;
    const chunkSize = 250;

    try {
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = itemsToImport.slice(i, i + chunkSize);
        setImportProgress({
          current: i,
          total,
          percent: Math.round((i / total) * 100),
          status: `Importing ${label} (${i + 1} - ${Math.min(i + chunkSize, total)} of ${total})...`,
        });

        await saveProductsBatch(chunk);
        await new Promise((r) => setTimeout(r, 30));
      }

      setImportProgress({
        current: total,
        total,
        percent: 100,
        status: `Complete! Added ${total} products.`,
      });

      toast(`✅ Successfully imported ${total} products!`, 'success', 5000);
      if (onImportComplete) onImportComplete();
      setTimeout(() => {
        setImporting(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Import error:', err);
      toast(`Import encountered an error: ${err.message}`, 'error', 6000);
      setImporting(false);
    }
  };

  // Import entire selected industry
  const handleImportCurrentIndustry = () => {
    if (!industryCatalog.length || !selectedIndustry) return;
    if (!window.confirm(`Import all ${industryCatalog.length.toLocaleString()} products from "${selectedIndustry.name}" into your store inventory?`)) {
      return;
    }
    runChunkedImport(industryCatalog, selectedIndustry.name);
  };

  // Subcategories inside selected industry
  const subcategories = useMemo(() => {
    if (!industryCatalog.length) return [];
    const set = new Set();
    industryCatalog.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [industryCatalog]);

  // Search filtered products
  const filteredProducts = useMemo(() => {
    if (!industryCatalog.length) return [];
    let list = industryCatalog;

    if (selectedCategoryFilter !== 'All') {
      list = list.filter((p) => p.category === selectedCategoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase() === q) ||
          (p.hsn && p.hsn.toLowerCase() === q)
      );
    }

    return list.slice(0, 150); // limit to 150 for ultra fast UI
  }, [industryCatalog, searchQuery, selectedCategoryFilter]);

  // Editable prices per product before adding to store
  const [editedPrices, setEditedPrices] = useState({});

  const handlePriceChange = (productId, field, value) => {
    setEditedPrices((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [field]: value === '' ? '' : Number(value),
      },
    }));
  };

  const getEffectiveItem = (p) => {
    const edits = editedPrices[p.id];
    if (!edits) return p;
    return {
      ...p,
      price: edits.price !== undefined && edits.price !== '' ? Number(edits.price) : p.price,
      mrp: edits.mrp !== undefined && edits.mrp !== '' ? Number(edits.mrp) : p.mrp,
    };
  };

  // Single item add with user-edited pricing
  const handleAddSingleItem = async (item) => {
    try {
      const effectiveItem = getEffectiveItem(item);
      await saveProductsBatch([effectiveItem]);
      setAddedItemIds((prev) => new Set([...prev, item.id]));
      toast(`Added "${effectiveItem.name}" to store at ₹${effectiveItem.price}`, 'success', 2000);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      toast('Failed to add product: ' + err.message, 'error');
    }
  };

  // Toggle selection
  const toggleSelect = (id) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Import selected with user-edited pricing
  const handleImportSelected = () => {
    if (selectedItemIds.size === 0) return;
    const items = industryCatalog
      .filter((p) => selectedItemIds.has(p.id))
      .map(getEffectiveItem);
    runChunkedImport(items, `${items.length} Selected Items`);
  };

  // CSV Template download
  const handleDownloadCsvTemplate = () => {
    const headers = 'name,category,hsn,taxRate,unit,price,mrp,barcode,stock';
    const sampleRows = [
      '"Aashirvaad Shudh Chakki Atta 5kg","Grocery","1101",5,"KG",240,265,"8901030001010",50',
      '"Tata Salt 1kg","Grocery","2501",0,"PKT",28,30,"8901030001027",100',
      '"Parle-G Gold Biscuits 1kg","Snacks","1905",18,"PKT",120,140,"8901030001034",40',
      '"Philips 9W LED Bulb B22","Electricals","8539",18,"PCS",85,110,"8901030001041",30',
      '"Dolo-650 Tablet Strip of 15","Pharmacy","3004",12,"STRIP",32,35,"8901030001058",60',
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...sampleRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'gst_billing_pro_products_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse CSV
  const handleCsvFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          toast('CSV file is empty or missing data rows', 'error');
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.trim().replace(/^["']|["']$/g, ''));
          if (parts.length < 2) continue;

          const rowObj = {};
          headers.forEach((h, idx) => {
            rowObj[h] = parts[idx] || '';
          });

          if (rowObj.name) {
            rows.push({
              id: `csv_${Date.now()}_${i}`,
              name: rowObj.name,
              category: rowObj.category || 'General',
              hsn: rowObj.hsn || '',
              taxRate: parseFloat(rowObj.taxrate || rowObj.taxpercent || 0),
              unit: rowObj.unit || 'Nos',
              price: parseFloat(rowObj.price || rowObj.sellingprice || rowObj.rate || 0),
              mrp: parseFloat(rowObj.mrp || 0),
              barcode: rowObj.barcode || '',
              stock: parseInt(rowObj.stock || 10, 10),
            });
          }
        }

        setParsedCsvRows(rows);
        toast(`Parsed ${rows.length} products from CSV!`, 'success');
      } catch (err) {
        toast('Failed to parse CSV file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleImportParsedCsv = () => {
    if (parsedCsvRows.length === 0) {
      toast('No valid products to import from CSV', 'error');
      return;
    }
    runChunkedImport(parsedCsvRows, 'Custom CSV Products');
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary, #ffffff)', color: 'var(--text-primary, #0f172a)',
          borderRadius: '16px', maxWidth: '1000px', width: '100%',
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(79, 70, 229, 0.04))',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📦</span>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                1,25,000+ Master Products Hub (Select Your Business)
              </h2>
              <span
                style={{
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#fff', fontSize: '0.72rem', fontWeight: 700,
                  padding: '0.15rem 0.55rem', borderRadius: 999,
                }}
              >
                1.25 Lakh+ Database
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
              Choose your business type. Add, edit, or remove products freely for your store.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted, #64748b)', padding: '0.4rem',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Progress Bar when importing */}
        {importing && (
          <div
            style={{
              padding: '1rem 1.5rem', background: '#eff6ff',
              borderBottom: '1px solid #bfdbfe', color: '#1e40af',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem', fontWeight: 700 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={16} className="animate-spin" /> {importProgress.status}
              </span>
              <span>{importProgress.percent}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#dbeafe', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${importProgress.percent}%`, height: '100%',
                  background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                  borderRadius: 999, transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex', borderBottom: '1px solid var(--border-color, #e2e8f0)',
            padding: '0 1.5rem', background: 'var(--bg-secondary, #f8fafc)', gap: '1rem',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('industries')}
            style={{
              padding: '0.85rem 0.5rem', border: 'none', background: 'none',
              fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
              color: activeTab === 'industries' ? 'var(--primary, #2563eb)' : 'var(--text-muted, #64748b)',
              borderBottom: activeTab === 'industries' ? '2px solid var(--primary, #2563eb)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            <Building2 size={16} /> Business Sectors (10 Industries)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            style={{
              padding: '0.85rem 0.5rem', border: 'none', background: 'none',
              fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
              color: activeTab === 'search' ? 'var(--primary, #2563eb)' : 'var(--text-muted, #64748b)',
              borderBottom: activeTab === 'search' ? '2px solid var(--primary, #2563eb)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            <Search size={16} /> Search &amp; Pick in {selectedIndustry?.name.split(',')[0] || 'Business'} ({industryCatalog.length.toLocaleString()} Items)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('csv')}
            style={{
              padding: '0.85rem 0.5rem', border: 'none', background: 'none',
              fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
              color: activeTab === 'csv' ? 'var(--primary, #2563eb)' : 'var(--text-muted, #64748b)',
              borderBottom: activeTab === 'csv' ? '2px solid var(--primary, #2563eb)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            <Upload size={16} /> Excel / CSV Bulk Upload
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {/* TAB 1: BUSINESS SECTORS */}
          {activeTab === 'industries' && (
            <div>
              <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Select your business type below to view and import products tailored for your shop:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {catalogIndex?.industries?.map((ind) => {
                  const isCurrent = selectedIndustry?.id === ind.id;
                  return (
                    <div
                      key={ind.id}
                      style={{
                        border: isCurrent ? '2px solid #2563eb' : '1px solid var(--border-color, #e2e8f0)',
                        borderRadius: 12, padding: '1.1rem',
                        background: isCurrent ? 'rgba(37, 99, 235, 0.03)' : 'var(--card-bg, #ffffff)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        boxShadow: isCurrent ? '0 4px 12px rgba(37, 99, 235, 0.1)' : 'none',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.8rem' }}>{ind.icon}</span>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>{ind.name}</h4>
                            <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                              {ind.count.toLocaleString()} products ready
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            loadIndustryData(ind);
                            setActiveTab('search');
                          }}
                          className="btn btn-secondary"
                          style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem' }}
                        >
                          <Search size={14} /> Browse Items
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await loadIndustryData(ind);
                            // Run import for this industry
                            if (window.confirm(`Import all ${ind.count.toLocaleString()} products from "${ind.name}" into your store?`)) {
                              const res = await fetch(ind.file);
                              const items = await res.json();
                              runChunkedImport(items, ind.name);
                            }
                          }}
                          disabled={importing}
                          className="btn btn-primary"
                          style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem', fontWeight: 700 }}
                        >
                          <Plus size={14} /> Import All
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: SEARCH & PICK */}
          {activeTab === 'search' && (
            <div>
              {/* Top Banner for Active Industry */}
              {selectedIndustry && (
                <div
                  style={{
                    background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: '1rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: '0.75rem',
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e40af' }}>
                      {selectedIndustry.icon} {selectedIndustry.name} ({industryCatalog.length.toLocaleString()} Items)
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}>
                      Click on any item to add to your personal shop, or import in bulk.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleImportCurrentIndustry}
                    disabled={importing || loadingIndustry}
                    className="btn btn-primary"
                    style={{ fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    <Plus size={15} /> Import Entire {selectedIndustry.name.split(',')[0]} Database ({industryCatalog.length.toLocaleString()})
                  </button>
                </div>
              )}

              {/* Filters */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                  <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by product name, brand, HSN or barcode..."
                    className="form-input"
                    style={{ paddingLeft: '2.5rem', width: '100%', fontSize: '0.9rem' }}
                    autoFocus
                  />
                </div>

                {subcategories.length > 0 && (
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="form-input"
                    style={{ width: 'auto', minWidth: '180px', fontSize: '0.85rem' }}
                  >
                    <option value="All">All Subcategories</option>
                    {subcategories.map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                )}

                {selectedItemIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleImportSelected}
                    disabled={importing}
                    className="btn btn-primary"
                    style={{ fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    <Plus size={15} /> Import Selected ({selectedItemIds.size})
                  </button>
                )}
              </div>

              {/* Products Table */}
              {loadingIndustry ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                  Loading {selectedIndustry?.name} products database...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No products matched your search.
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                      <tr>
                        <th style={{ padding: '0.6rem 0.8rem', width: 40, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={filteredProducts.length > 0 && filteredProducts.every((p) => selectedItemIds.has(p.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedItemIds(new Set([...selectedItemIds, ...filteredProducts.map((p) => p.id)]));
                              } else {
                                setSelectedItemIds(new Set());
                              }
                            }}
                          />
                        </th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Product Details</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Subcategory</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>HSN</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>GST</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Price / MRP</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => {
                        const isAdded = addedItemIds.has(p.id);
                        const isSelected = selectedItemIds.has(p.id);

                        return (
                          <tr
                            key={p.id}
                            style={{
                              borderBottom: '1px solid var(--border-color, #f1f5f9)',
                              background: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(p.id)}
                              />
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem' }}>
                              <div style={{ fontWeight: 600 }}>{p.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                                Barcode: {p.barcode || 'N/A'} · Unit: {p.unit}
                              </div>
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-muted, #64748b)', fontSize: '0.8rem' }}>
                              {p.category}
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', fontFamily: 'monospace' }}>{p.hsn || '-'}</td>
                            <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>{p.taxRate}%</td>
                            <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>₹</span>
                                  <input
                                    type="number"
                                    value={editedPrices[p.id]?.price !== undefined ? editedPrices[p.id].price : p.price}
                                    onChange={(e) => handlePriceChange(p.id, 'price', e.target.value)}
                                    title="Edit Selling Price before adding"
                                    className="form-input"
                                    style={{
                                      width: '78px', padding: '2px 5px', fontSize: '0.85rem',
                                      textAlign: 'right', fontWeight: 700, borderRadius: '4px',
                                      border: '1px solid #cbd5e1', background: '#fff'
                                    }}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>MRP</span>
                                  <input
                                    type="number"
                                    value={editedPrices[p.id]?.mrp !== undefined ? editedPrices[p.id].mrp : (p.mrp || '')}
                                    onChange={(e) => handlePriceChange(p.id, 'mrp', e.target.value)}
                                    placeholder="MRP"
                                    title="Edit MRP before adding"
                                    className="form-input"
                                    style={{
                                      width: '78px', padding: '1px 5px', fontSize: '0.76rem',
                                      textAlign: 'right', color: '#64748b', borderRadius: '4px',
                                      border: '1px dashed #cbd5e1', background: '#f8fafc'
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                              {isAdded ? (
                                <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: '0.78rem' }}>
                                  <Check size={14} /> Added
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAddSingleItem(p)}
                                  disabled={importing}
                                  className="btn btn-secondary"
                                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                                >
                                  + Add to Store
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CSV BULK UPLOAD */}
          {activeTab === 'csv' && (
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
              <div
                style={{
                  border: '2px dashed var(--border-color, #cbd5e1)', borderRadius: 12,
                  padding: '2rem', textAlign: 'center', background: 'var(--bg-secondary, #f8fafc)',
                  marginBottom: '1.5rem',
                }}
              >
                <Upload size={36} style={{ color: 'var(--primary, #2563eb)', margin: '0 auto 0.75rem' }} />
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
                  Upload Your Own Custom Products (CSV / Excel)
                </h3>
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
                  Easily add 1,000s or 10,000s of your existing products in bulk using a standard spreadsheet.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem' }}
                  >
                    <Download size={16} /> Download Sample CSV Template
                  </button>

                  <label className="btn btn-primary" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                    <Upload size={16} /> Select CSV File
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCsvFileChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {parsedCsvRows.length > 0 && (
                <div
                  style={{
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: 8, padding: '1rem', marginBottom: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#15803d', fontWeight: 600, marginBottom: '0.4rem' }}>
                    <CheckCircle2 size={18} /> File ready: {csvFile?.name}
                  </div>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#166534' }}>
                    Found <strong>{parsedCsvRows.length} valid products</strong> ready to import.
                  </p>
                  <button
                    type="button"
                    onClick={handleImportParsedCsv}
                    disabled={importing}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem', padding: '0.6rem' }}
                  >
                    {importing ? 'Importing...' : `Import All ${parsedCsvRows.length} Products Now`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
            Selected: <strong>{selectedIndustry?.name}</strong> ({industryCatalog.length.toLocaleString()} items ready)
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
