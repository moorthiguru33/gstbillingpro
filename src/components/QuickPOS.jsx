import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Zap, Search, Barcode, Camera, Plus, Minus, Trash2, Printer,
  CheckCircle, ArrowRight, RefreshCw, X, CreditCard, Banknote,
  QrCode, UserPlus, Phone, FileText, ShoppingCart, PauseCircle,
  PlayCircle, Package, DollarSign, TrendingUp, AlertCircle, Calendar,
  Volume2, VolumeX, Percent, Tag, Copy, Sparkles, ChevronDown, Share2
} from 'lucide-react';
import { getAllProducts, saveBill, getNextInvoiceNumber, getProfile, getAllBills, getAllClients, deleteBill, saveProfile } from '../store';
import { formatCurrency, getPaperSize, computeInvoiceTotals } from '../utils';
import { getPrintSettings, savePrintSettings } from '../utils/printSettings';
import { openWhatsAppShare } from '../utils/share';
import { toast } from './Toast';
import BarcodeScannerModal from './BarcodeScannerModal';
import QuickStockModal from './QuickStockModal';
import MasterCatalogModal from './MasterCatalogModal';
import InvoicePreview from './InvoicePreview';

// Web Audio API Sound Synthesizer for Counter Scanners (100% Offline, Zero-Latency)
const playAudioFeedback = (type = 'beep', soundEnabled = true) => {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'beep') {
      // 850Hz crisp barcode scanner beep (65ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.065);
    } else if (type === 'success') {
      // Pleasant three-note checkout chime
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = ctx.currentTime + idx * 0.07;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.18);
      });
    }
  } catch {
    // Audio context may be restricted by autoplay policy until user gesture
  }
};

export default function QuickPOS({ onBackToDashboard, onPrintInvoice }) {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedSearchIdx, setSelectedSearchIdx] = useState(0);
  const [cart, setCart] = useState([]);
  const [profile, setProfile] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash'); // 'cash' | 'upi' | 'card'
  const [cashTendered, setCashTendered] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completedBill, setCompletedBill] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Settings & Printer Formats (Persistent)
  const printSettings = useMemo(() => getPrintSettings(), []);
  const [paperSize, setPaperSize] = useState(() => {
    return localStorage.getItem('gst_pos_paperSize') || printSettings.defaultPaperSize || 'thermal80';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('pos_sound_enabled') !== 'false';
  });

  const handlePaperSizeChange = (newSize) => {
    setPaperSize(newSize);
    try {
      localStorage.setItem('gst_pos_paperSize', newSize);
      savePrintSettings({ ...printSettings, defaultPaperSize: newSize });
    } catch {}
  };

  // Uploaded Static Shop UPI QR Code (No dynamic QR)
  const qrFileInputRef = useRef(null);
  const [uploadedQr, setUploadedQr] = useState(() => {
    try {
      return localStorage.getItem('user_upi_qr_image') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (profile?.upiQrImage || profile?.upiQr) {
      setUploadedQr(profile.upiQrImage || profile.upiQr);
    }
  }, [profile]);

  const handleQrUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result;
      if (!dataUrl) return;
      setUploadedQr(dataUrl);
      try {
        localStorage.setItem('user_upi_qr_image', dataUrl);
        if (profile) {
          const updated = { ...profile, upiQrImage: dataUrl };
          await saveProfile(updated);
          setProfile(updated);
        }
        toast('✅ Shop UPI QR Code uploaded successfully!', 'success');
      } catch {
        toast('QR Code saved locally', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  // Card Payment Details
  const [cardDetails, setCardDetails] = useState({
    cardType: 'RuPay',
    last4: '',
    rrn: '',
    terminal: '',
  });

  // UPI Payment Details
  const [upiDetails, setUpiDetails] = useState({
    utr: '',
  });

  // Bill Discount (F7 / Alt+D)
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [billDiscountType, setBillDiscountType] = useState('flat'); // 'flat' | 'percent'
  const [billDiscountValue, setBillDiscountValue] = useState(0);

  // Billing Boy Pro State & History Management
  const [billType, setBillType] = useState('gst'); // 'gst' | 'non-gst'
  const [editingBillId, setEditingBillId] = useState(null);
  const [allBillsList, setAllBillsList] = useState([]);
  const [showBillsHistoryModal, setShowBillsHistoryModal] = useState(false);
  const [showMasterCatalog, setShowMasterCatalog] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'gst' | 'non-gst'
  const [heldBills, setHeldBills] = useState([]);
  const [showQuickStock, setShowQuickStock] = useState(false);
  const [showDaySummary, setShowDaySummary] = useState(false);
  const [todayBills, setTodayBills] = useState([]);
  const [counterExpenses, setCounterExpenses] = useState(() => {
    try {
      const saved = localStorage.getItem('counter_expenses_' + new Date().toISOString().split('T')[0]);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newExpenseTitle, setNewExpenseTitle] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');

  const searchInputRef = useRef(null);
  const hiddenReceiptRef = useRef(null);

  const loadData = () => {
    getAllProducts().then((p) => setProducts(Array.isArray(p) ? p : [])).catch(() => {});
    getAllClients().then((c) => setClients(Array.isArray(c) ? c : [])).catch(() => {});
    getProfile().then(setProfile).catch(() => {});
    getAllBills().then((bills) => {
      const validBills = Array.isArray(bills) ? bills.filter(Boolean) : [];
      setAllBillsList(validBills);
      const todayStr = new Date().toISOString().split('T')[0];
      const todayOnly = validBills.filter((b) => b && (b.invoiceDate === todayStr || b.date === todayStr));
      setTodayBills(todayOnly);
    }).catch(() => {});
  };

  useEffect(() => {
    loadData();
    searchInputRef.current?.focus();
  }, []);

  // Quick sound toggle
  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('pos_sound_enabled', String(next));
      if (next) playAudioFeedback('beep', true);
      return next;
    });
  };

  // Auto-match client phone number
  const handlePhoneChange = (val) => {
    setCustomerPhone(val);
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      const match = clients.find(c => (c.phone || '').replace(/\D/g, '') === cleaned);
      if (match && match.name) {
        setCustomerName(match.name);
        toast(`Found registered customer: ${match.name}`, 'info', 2000);
      }
    }
  };

  // Filtered search results
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        const name = (p.name || '').toLowerCase();
        const code = (p.barcode || '').toLowerCase();
        const hsn = (p.hsn || '').toLowerCase();
        return name.includes(q) || code.includes(q) || hsn.includes(q);
      })
      .slice(0, 8);
  }, [products, search]);

  useEffect(() => {
    setSelectedSearchIdx(0);
  }, [search]);

  // Fast-selling Quick Pick speed-dial items
  const quickPicks = useMemo(() => {
    if (!products.length) return [];
    return products.slice(0, 6);
  }, [products]);

  // Add item to cart with optional multiplier
  const addToCart = (product, qty = 1) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.id === product.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].qty += qty;
        return updated;
      }
      const price = Number(product.sellingPrice || product.rate || product.price || 0);
      const mrp = Number(product.mrp || 0) || (price > 0 ? Math.round(price * 1.15) : 0);
      const taxRate = Number(product.taxRate || product.taxPercent || 0);
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          hsn: product.hsn || '',
          mrp,
          price,
          taxRate,
          unit: product.unit || 'PCS',
          qty,
          barcode: product.barcode || '',
          discount: 0,
        },
      ];
    });
    playAudioFeedback('beep', soundEnabled);
    setSearch('');
    searchInputRef.current?.focus();
  };

  // Barcode scanned from hardware reader or camera
  const handleBarcodeScanned = (code) => {
    const raw = String(code).trim();
    if (!raw) return;

    // Check for multiplier: e.g. 5*8901030 or 8901030*5
    let scanQty = 1;
    let targetCode = raw;
    if (raw.includes('*')) {
      const parts = raw.split('*');
      if (!isNaN(parts[0]) && isNaN(parts[1])) {
        scanQty = Math.max(1, parseFloat(parts[0]));
        targetCode = parts[1].trim();
      } else if (isNaN(parts[0]) && !isNaN(parts[1])) {
        targetCode = parts[0].trim();
        scanQty = Math.max(1, parseFloat(parts[1]));
      }
    }

    const trimmed = targetCode.toLowerCase();
    const match = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === trimmed) ||
        (p.id && String(p.id).toLowerCase() === trimmed) ||
        (p.name && p.name.toLowerCase() === trimmed)
    );

    if (match) {
      addToCart(match, scanQty);
      toast(`Added ${match.name} (x${scanQty})`, 'success', 2000);
    } else {
      toast(`Barcode ${raw} not found in catalog`, 'error', 3000);
    }
  };

  // Handle Search Input Arrow Keys & Enter navigation
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setSelectedSearchIdx((prev) => (prev + 1) % searchResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setSelectedSearchIdx((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0 && searchResults[selectedSearchIdx]) {
        addToCart(searchResults[selectedSearchIdx], 1);
        setSelectedSearchIdx(0);
      } else if (search.trim()) {
        handleBarcodeScanned(search.trim());
      }
    } else if (e.key === '+' && !search.trim() && cart.length > 0) {
      e.preventDefault();
      updateQty(cart[cart.length - 1].id, 1);
    } else if (e.key === '-' && !search.trim() && cart.length > 0) {
      e.preventDefault();
      updateQty(cart[cart.length - 1].id, -1);
    }
  };

  // Quantity helpers
  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
    playAudioFeedback('beep', soundEnabled);
  };

  const setItemExactQty = (id, newQty) => {
    const q = Math.max(1, parseFloat(newQty) || 1);
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, qty: q } : item)));
  };

  const setItemExactPrice = (id, newPrice) => {
    const p = Math.max(0, parseFloat(newPrice) || 0);
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, price: p } : item)));
  };

  const setItemExactMrp = (id, newMrp) => {
    const m = Math.max(0, parseFloat(newMrp) || 0);
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, mrp: m } : item)));
  };

  const removeItem = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  // Edit and Delete existing bills in POS
  const handleEditExistingBill = (bill) => {
    const rawItems = bill.items || bill.data?.items || [];
    const loadedCart = rawItems.map((it, idx) => ({
      id: it.id || `item_${idx}_${Date.now()}`,
      name: it.name || it.description || 'Item',
      hsn: it.hsn || '',
      mrp: Number(it.mrp || it.rate || it.price || 0),
      price: Number(it.price || it.rate || 0),
      taxRate: Number(it.taxRate || it.taxPercent || 0),
      unit: it.unit || 'PCS',
      qty: Number(it.quantity || it.qty || 1),
      barcode: it.barcode || '',
      discount: Number(it.discount || 0),
    }));
    setCart(loadedCart);
    setCustomerName(bill.clientName || bill.client?.name || '');
    setCustomerPhone(bill.client?.phone || bill.phone || '');
    const isNonGst = bill.billType === 'non-gst' || bill.isNonGst || bill.invoiceType === 'estimate';
    setBillType(isNonGst ? 'non-gst' : 'gst');
    setPaymentMode(bill.paymentMode || 'cash');
    setEditingBillId(bill.invoiceNumber || bill.id);
    setShowBillsHistoryModal(false);
    toast(`✏️ Bill #${bill.invoiceNumber} loaded for editing`, 'info');
  };

  const handleDeleteBillFromPOS = async (bill) => {
    if (!window.confirm(`Are you sure you want to delete Bill #${bill.invoiceNumber}? This will move it to trash.`)) {
      return;
    }
    try {
      await deleteBill(bill.id);
      playAudioFeedback('beep', soundEnabled);
      toast(`🗑️ Bill #${bill.invoiceNumber} deleted!`, 'success');
      loadData();
    } catch (err) {
      toast('Failed to delete bill: ' + err.message, 'error');
    }
  };

  // Hold & Recall Bill (F4)
  const handleHoldBill = () => {
    if (cart.length === 0) {
      if (heldBills.length > 0) {
        const latest = heldBills[heldBills.length - 1];
        setCart(latest.cart);
        setCustomerName(latest.customerName);
        setCustomerPhone(latest.customerPhone);
        setBillType(latest.billType);
        setHeldBills((prev) => prev.slice(0, -1));
        toast(`Recalled Bill #${latest.id}`, 'info');
      } else {
        toast('Cart is empty. Nothing to hold.', 'info');
      }
      return;
    }

    const newHeld = {
      id: Date.now().toString().slice(-4),
      cart: [...cart],
      customerName,
      customerPhone,
      billType,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };

    setHeldBills((prev) => [...prev, newHeld]);
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    toast(`⏸️ Bill #${newHeld.id} parked on Hold. (Press F4 to Recall)`, 'success');
    searchInputRef.current?.focus();
  };

  // Bill totals calculation (respects GST vs Non-GST and MRP/Discounts).
  // Uses the same computeInvoiceTotals() as the invoice editor and the
  // printed receipt so the screen, the saved bill and the receipt agree.
  // MRP savings (MRP - selling price) are INFORMATIONAL ONLY: the selling
  // price is already the charged price, so they are never subtracted
  // again. Only the bill-level discount reduces the total.
  const totals = useMemo(() => {
    const isNonGst = billType === 'non-gst';
    const items = cart.map((item) => {
      const qty = Number(item.qty) || 0;
      const price = Number(item.price) || 0;
      return {
        quantity: qty,
        rate: price,
        mrp: Number(item.mrp) || price,
        taxPercent: isNonGst ? 0 : Number(item.taxRate) || 0,
        discount: Number(item.discount) || 0,
      };
    });
    const totalMrp = items.reduce((sum, it) => sum + it.quantity * it.mrp, 0);
    const mrpSavings = Math.round(items.reduce(
      (sum, it) => sum + (it.mrp > it.rate ? (it.mrp - it.rate) * it.quantity : 0), 0,
    ) * 100) / 100;

    const preview = computeInvoiceTotals({ items, profile, showGST: !isNonGst });
    const discValue = parseFloat(billDiscountValue) || 0;
    // Percent discount keeps its historical meaning: % of the item value
    // (before GST). Converted to a fixed amount for computeInvoiceTotals.
    const billDiscAmount = billDiscountType === 'percent'
      ? (preview.subtotal * Math.min(Math.max(discValue, 0), 100)) / 100
      : Math.max(discValue, 0);

    const full = computeInvoiceTotals({
      items,
      profile,
      showGST: !isNonGst,
      invoiceOptions: {
        invoiceDiscountType: 'fixed',
        invoiceDiscountValue: Math.min(billDiscAmount, preview.subtotal),
        showRoundOff: true,
      },
    });

    return {
      subtotal: full.subtotal,
      totalMrp,
      taxAmount: full.totalTaxAmount,
      billDiscount: full.invoiceDiscountAmount,
      lineDiscount: full.totalDiscount,
      mrpSavings,
      total: full.total,
      roundDiff: full.roundOff,
      totalSavings: mrpSavings + full.totalDiscount + full.invoiceDiscountAmount,
      full,
    };
  }, [cart, billType, billDiscountType, billDiscountValue, profile]);

  // Vector HTML Thermal & Sheet Direct Print via hidden iframe
  const printDirectly = async (billToPrint) => {
    try {
      const paperCfg = getPaperSize(paperSize);
      const widthMm = paperCfg.widthMm || 80;
      const isThermal = paperCfg.kind === 'thermal';

      // Collect application stylesheets for bit-accurate rendering
      const parts = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules;
          if (rules) {
            for (const rule of Array.from(rules)) parts.push(rule.cssText);
          }
        } catch {}
      }

      const receiptEl = hiddenReceiptRef.current?.querySelector('#invoice-preview') || hiddenReceiptRef.current;
      if (!receiptEl) {
        window.print();
        return;
      }

      const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Print Bill - ${billToPrint.invoiceNumber}</title>
  <style>
    @page {
      size: ${isThermal ? `${widthMm}mm auto` : `${paperCfg.widthMm || 210}mm ${paperCfg.heightMm || 297}mm`};
      margin: ${isThermal ? '0' : '8mm'};
    }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #000;
      font-family: ${isThermal ? '"Courier New", monospace' : 'system-ui, sans-serif'};
    }
    #invoice-preview {
      margin: 0 auto !important; padding: ${isThermal ? '0' : '10px'} !important;
      border: none !important; box-shadow: none !important; background: #fff !important;
      color: #000 !important; width: 100% !important; min-height: 0 !important;
    }
    ${parts.join('\n')}
  </style>
</head>
<body>${receiptEl.outerHTML}</body>
</html>`;

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;border:0;';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      await new Promise((resolve) => {
        iframe.onload = resolve;
        iframe.srcdoc = doc;
      });

      // Wait for images (QR/Logo) to load
      const imgs = iframe.contentDocument?.querySelectorAll('img') || [];
      await Promise.all(Array.from(imgs).map(img => (
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 1500); })
      )));

      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    } catch {
      window.print();
    }
  };

  // Complete & Save Bill (Guarantees 100% IDENTICAL data schema with InvoiceGenerator)
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast('Cart is empty. Add items to bill.', 'error');
      return;
    }

    setSaving(true);
    try {
      const prefix = billType === 'non-gst' ? 'EST' : 'INV';
      const invoiceNo = editingBillId || (await getNextInvoiceNumber(prefix, { explicitPrefix: true }));
      const today = new Date().toISOString().split('T')[0];

      const clientObj = {
        name: customerName.trim() || (billType === 'non-gst' ? 'Cash Customer (Non-GST)' : 'Cash Customer'),
        phone: customerPhone.trim() || '',
        gstin: '',
      };

      const billDetails = {
        invoiceNumber: invoiceNo,
        invoiceDate: today,
        paymentMode,
        billType,
        cardDetails: paymentMode === 'card' ? cardDetails : null,
        upiDetails: paymentMode === 'upi' ? upiDetails : null,
        cashTendered: Number(cashTendered) || totals.total,
        notes: billType === 'non-gst' ? 'Non-GST Cash Memo / Estimate' : 'Tax Invoice (Fast POS)',
      };

      const invoiceItems = cart.map((item, idx) => ({
        id: idx + 1,
        name: item.name,
        hsn: billType === 'non-gst' ? '' : item.hsn,
        quantity: item.qty,
        unit: item.unit,
        rate: item.price,
        mrp: item.mrp || item.price,
        taxRate: billType === 'non-gst' ? 0 : item.taxRate,
        taxPercent: billType === 'non-gst' ? 0 : item.taxRate,
        discount: item.discount || 0,
      }));

      // Full computeInvoiceTotals() result so the receipt/PDF prints
      // Subtotal - discounts + GST + round-off = Total exactly. MRP savings
      // ride along separately for the "You saved" info line.
      const computedTotals = {
        ...totals.full,
        taxAmount: totals.taxAmount,
        mrpSavings: totals.mrpSavings,
      };

      const fullBillData = {
        id: invoiceNo,
        invoiceNumber: invoiceNo,
        invoiceDate: today,
        date: today,
        status: 'paid',
        paymentMode,
        billType,
        isNonGst: billType === 'non-gst',
        invoiceType: billType === 'non-gst' ? 'estimate' : 'tax-invoice',
        clientName: clientObj.name,
        clientGstin: '',
        totalAmount: totals.total,
        totalTaxAmount: totals.taxAmount,
        paidAmount: totals.total,
        payments: [{
          id: 'pay_' + Date.now(),
          date: today,
          amount: totals.total,
          method: paymentMode,
          mode: paymentMode,
          notes: paymentMode === 'card'
            ? `Card ${cardDetails.cardType} **** ${cardDetails.last4}`
            : paymentMode === 'upi' ? `UPI Ref: ${upiDetails.utr || 'Digital'}` : 'Cash',
        }],
        client: clientObj,
        details: billDetails,
        items: invoiceItems,
        totals: computedTotals,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        cardDetails: paymentMode === 'card' ? cardDetails : null,
        upiDetails: paymentMode === 'upi' ? upiDetails : null,
        data: {
          profile,
          client: clientObj,
          details: billDetails,
          items: invoiceItems,
          totals: computedTotals,
          invoiceType: billType === 'non-gst' ? 'estimate' : 'tax-invoice',
          invoiceOptions: {
            paperSize,
            showGST: billType === 'gst',
            showMRP: printSettings.showMRP !== false,
            showDiscount: printSettings.showDiscount !== false,
            showCardDetails: printSettings.showCardDetails !== false,
            showUPI: true,
            showBankDetails: true,
            showAmountWords: true,
            showRoundOff: true,
            invoiceDiscountType: 'fixed',
            invoiceDiscountValue: totals.billDiscount,
          },
        },
      };

      await saveBill(fullBillData, { overwrite: !!editingBillId });
      playAudioFeedback('success', soundEnabled);
      const actionMsg = editingBillId ? 'Updated' : 'Saved';
      toast(`✅ Bill ${invoiceNo} ${actionMsg}! (${billType.toUpperCase()})`, 'success', 2500);

      setCompletedBill(fullBillData);
      setShowReceiptModal(true);
      setEditingBillId(null);
      loadData();

      // Auto-print only on thermal receipt printers. On A4/A5/Letter the
      // receipt modal opens and the user prints from there, instead of a
      // browser print dialog popping up after every sale.
      if (printSettings.autoPrintOnSave && getPaperSize(paperSize).kind === 'thermal') {
        setTimeout(() => printDirectly(fullBillData), 200);
      }
    } catch (err) {
      toast('Failed to save bill: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // WhatsApp receipt share for POS counter
  const handleWhatsAppShare = (bill) => {
    if (!bill) return;
    const phone = bill.client?.phone || customerPhone;
    const cur = 'INR';
    const total = formatCurrency(Number(bill.total || bill.totalAmount) || 0, cur);
    const dateStr = bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const businessName = profile?.businessName || '';
    const clientName = bill.client?.name || customerName || 'Valued Customer';
    const itemCount = (bill.items || []).length;
    const upiId = profile?.upiId || (profile?.paymentAccounts && profile.paymentAccounts[0]?.upiId) || '';

    const lines = [
      `*BILL RECEIPT: ${bill.invoiceNumber || 'BILL'}*`,
      `📅 Date: ${dateStr}`,
      `👤 Customer: ${clientName}`,
      `📦 Items: ${itemCount}`,
      `*💵 Grand Total: ${total}*`,
      `💳 Payment: ${String(bill.paymentMode || 'Paid').toUpperCase()}`,
    ];

    if (upiId && bill.paymentMode !== 'cash') {
      lines.push('', `💳 UPI: ${upiId}`);
    }

    if (businessName) {
      lines.push('', `Thank you for shopping with us! 🙏`, `*${businessName}*`);
      if (profile?.phone) lines.push(`📞 Contact: ${profile.phone}`);
    }

    openWhatsAppShare(phone, lines.join('\n'));
  };

  // Start fresh sale
  const handleStartNewSale = () => {
    setCart([]);
    setSearch('');
    setCustomerName('');
    setCustomerPhone('');
    setCashTendered('');
    setBillDiscountValue(0);
    setCardDetails({ cardType: 'RuPay', last4: '', rrn: '', terminal: '' });
    setUpiDetails({ utr: '' });
    setShowReceiptModal(false);
    setCompletedBill(null);
    setEditingBillId(null);
    searchInputRef.current?.focus();
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F2' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        if (showReceiptModal) {
          if (completedBill) printDirectly(completedBill);
        } else {
          handleCompleteSale();
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        setBillType((prev) => {
          const next = prev === 'gst' ? 'non-gst' : 'gst';
          toast(next === 'gst' ? 'Switched to 🧾 GST Tax Invoice mode' : 'Switched to 📝 Non-GST Estimate mode', 'info');
          return next;
        });
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F7' || (e.altKey && (e.key === 'd' || e.key === 'D'))) {
        e.preventDefault();
        setShowDiscountModal(true);
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setShowQuickStock(true);
      } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        const sizes = ['thermal80', 'thermal58', 'a5', 'a4'];
        const currentIdx = sizes.indexOf(paperSize);
        const nextSize = sizes[(currentIdx + 1) % sizes.length];
        handlePaperSizeChange(nextSize);
        toast(`Printer Paper Format: ${nextSize.toUpperCase()}`, 'info');
      } else if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setShowBillsHistoryModal(true);
      } else if (e.key === 'F8' || (e.altKey && (e.key === 'b' || e.key === 'B'))) {
        e.preventDefault();
        setShowMasterCatalog(true);
      } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setPaymentMode('cash');
        setCashTendered(String(totals.total));
      } else if (e.altKey && e.key === '5') {
        e.preventDefault();
        setPaymentMode('cash');
        setCashTendered('500');
      } else if (e.altKey && e.key === '1') {
        e.preventDefault();
        setPaymentMode('cash');
        setCashTendered('1000');
      } else if (e.altKey && e.key === '2') {
        e.preventDefault();
        setPaymentMode('cash');
        setCashTendered('2000');
      } else if (showReceiptModal && e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (completedBill) handleWhatsAppShare(completedBill);
      } else if (e.key === 'Escape') {
        if (showReceiptModal) {
          handleStartNewSale();
        } else if (showDiscountModal) {
          setShowDiscountModal(false);
        } else if (cart.length > 0 && window.confirm('Clear current sale?')) {
          setCart([]);
          setSearch('');
          setCustomerName('');
          setCustomerPhone('');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [cart, billType, heldBills, paymentMode, cashTendered, customerName, customerPhone, showScanner, showQuickStock, showDaySummary, showReceiptModal, completedBill, paperSize]);

  const changeDue = Math.max(0, (Number(cashTendered) || 0) - totals.total);

  // Counter Daily Totals
  const dayStats = useMemo(() => {
    let gstSales = 0;
    let nonGstSales = 0;
    let cash = 0;
    let upi = 0;
    let card = 0;

    todayBills.forEach((b) => {
      const amt = Number(b.totalAmount || b.total || 0);
      if (b.billType === 'non-gst' || b.isNonGst || b.invoiceType === 'estimate') {
        nonGstSales += amt;
      } else {
        gstSales += amt;
      }

      const mode = b.paymentMode || b.details?.paymentMode || 'cash';
      if (mode === 'upi') upi += amt;
      else if (mode === 'card') card += amt;
      else cash += amt;
    });

    const totalSpent = counterExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const netCashInDrawer = Math.max(0, cash - totalSpent);

    return {
      gstSales,
      nonGstSales,
      totalSales: gstSales + nonGstSales,
      cash,
      upi,
      card,
      totalSpent,
      netCashInDrawer,
      billCount: todayBills.length,
    };
  }, [todayBills, counterExpenses]);

  // Add counter petty cash expense
  const handleAddCounterExpense = (e) => {
    e.preventDefault();
    const amt = parseFloat(newExpenseAmount);
    if (!newExpenseTitle.trim() || isNaN(amt) || amt <= 0) {
      toast('Enter expense reason and amount', 'error');
      return;
    }

    const exp = {
      id: Date.now(),
      title: newExpenseTitle.trim(),
      amount: amt,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };

    const updated = [exp, ...counterExpenses];
    setCounterExpenses(updated);
    try {
      localStorage.setItem('counter_expenses_' + new Date().toISOString().split('T')[0], JSON.stringify(updated));
    } catch {}

    setNewExpenseTitle('');
    setNewExpenseAmount('');
    toast(`Recorded ₹${amt} expense (${exp.title})`, 'success');
  };

  // Filtered bills for history modal
  const filteredHistoryBills = useMemo(() => {
    let list = allBillsList || [];
    if (historyFilter === 'gst') {
      list = list.filter((b) => b.billType === 'gst' || (!b.isNonGst && b.invoiceType !== 'estimate'));
    } else if (historyFilter === 'non-gst') {
      list = list.filter((b) => b.billType === 'non-gst' || b.isNonGst || b.invoiceType === 'estimate');
    }
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase().trim();
      list = list.filter((b) => {
        const no = (b.invoiceNumber || b.id || '').toLowerCase();
        const client = (b.clientName || b.client?.name || '').toLowerCase();
        const phone = (b.client?.phone || b.phone || '').toLowerCase();
        return no.includes(q) || client.includes(q) || phone.includes(q);
      });
    }
    return list;
  }, [allBillsList, historyFilter, historySearch]);

  const gstBillsCount = useMemo(() => {
    return (allBillsList || []).filter((b) => b && (b.billType === 'gst' || (!b.isNonGst && b.invoiceType !== 'estimate'))).length;
  }, [allBillsList]);

  const nonGstBillsCount = useMemo(() => {
    return (allBillsList || []).filter((b) => b && (b.billType === 'non-gst' || b.isNonGst || b.invoiceType === 'estimate')).length;
  }, [allBillsList]);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        minHeight: '85vh', background: 'var(--bg, #f8fafc)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Top Counter Bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.65rem 1.25rem', background: '#0f172a', color: '#fff',
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)', flexWrap: 'wrap', gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              background: billType === 'gst' ? '#2563eb' : '#059669',
              padding: '0.4rem', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Zap size={20} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>⚡ Counter Billing POS</h2>
              <span
                style={{
                  background: billType === 'gst' ? '#1d4ed8' : '#047857',
                  color: '#fff', fontSize: '0.7rem', fontWeight: 800,
                  padding: '0.15rem 0.5rem', borderRadius: 999, letterSpacing: '0.04em',
                }}
              >
                {billType === 'gst' ? '🧾 GST TAX INVOICE' : '📝 NON-GST ESTIMATE'}
              </span>
            </div>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
              {profile?.businessName || 'GST Billing Pro'} • Press <strong>F3</strong> to switch GST/Non-GST
            </span>
          </div>
        </div>

        {/* Action Controls for Billing Boy */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Printer Size Selector (58mm, 80mm, A5, A4) */}
          <div style={{ display: 'flex', background: '#1e293b', borderRadius: 8, padding: 3, border: '1px solid #334155' }}>
            {[
              { id: 'thermal58', label: '58mm' },
              { id: 'thermal80', label: '80mm' },
              { id: 'a5', label: 'A5' },
              { id: 'a4', label: 'A4' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePaperSizeChange(p.id)}
                style={{
                  background: paperSize === p.id ? '#2563eb' : 'transparent',
                  color: paperSize === p.id ? '#fff' : '#94a3b8',
                  border: 'none', borderRadius: 6, padding: '0.3rem 0.55rem',
                  fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                }}
                title={`Printer Size: ${p.label} (Alt+P to cycle)`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            style={{
              background: soundEnabled ? '#1e293b' : '#334155',
              color: soundEnabled ? '#38bdf8' : '#94a3b8',
              border: '1px solid #475569', borderRadius: 8, padding: '0.45rem 0.6rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem',
            }}
            title={soundEnabled ? 'Scanner Beep On' : 'Scanner Muted'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {/* GST / Non-GST Switcher */}
          <div style={{ display: 'flex', background: '#1e293b', borderRadius: 8, padding: 3, border: '1px solid #334155' }}>
            <button
              type="button"
              onClick={() => setBillType('gst')}
              style={{
                background: billType === 'gst' ? '#2563eb' : 'transparent',
                color: billType === 'gst' ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: 6, padding: '0.35rem 0.7rem',
                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              🧾 GST (F3)
            </button>
            <button
              type="button"
              onClick={() => setBillType('non-gst')}
              style={{
                background: billType === 'non-gst' ? '#059669' : 'transparent',
                color: billType === 'non-gst' ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: 6, padding: '0.35rem 0.7rem',
                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              📝 Non-GST (F3)
            </button>
          </div>

          {/* Hold / Recall Bill */}
          <button
            type="button"
            onClick={handleHoldBill}
            style={{
              background: heldBills.length > 0 ? '#f59e0b' : '#334155',
              color: heldBills.length > 0 ? '#000' : '#f8fafc',
              border: 'none', borderRadius: 8, padding: '0.45rem 0.8rem',
              fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            title="Hold current sale or recall parked bill (F4)"
          >
            {heldBills.length > 0 ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
            {heldBills.length > 0 ? `Recall (${heldBills.length}) (F4)` : 'Hold (F4)'}
          </button>

          {/* Quick Stock Update */}
          <button
            type="button"
            onClick={() => setShowQuickStock(true)}
            style={{
              background: '#047857', color: '#fff',
              border: 'none', borderRadius: 8, padding: '0.45rem 0.8rem',
              fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            title="Scan barcode and add stock instantly (Alt+S)"
          >
            <Package size={15} /> Stock In (Alt+S)
          </button>

          {/* Master Catalog 1 Lakh+ Database */}
          <button
            type="button"
            onClick={() => setShowMasterCatalog(true)}
            style={{
              background: '#7c3aed', color: '#fff',
              border: 'none', borderRadius: 8, padding: '0.45rem 0.8rem',
              fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            title="Browse & add items from 1 Lakh+ catalog (F8 / Alt+B)"
          >
            <Sparkles size={15} /> 1 Lakh+ Catalog
          </button>

          {/* Day Register Summary */}
          <button
            type="button"
            onClick={() => setShowDaySummary(true)}
            style={{
              background: '#334155', color: '#e2e8f0',
              border: '1px solid #475569', borderRadius: 8, padding: '0.45rem 0.8rem',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <TrendingUp size={15} /> Register (₹{dayStats.totalSales.toLocaleString()})
          </button>

          {/* Bills History (Edit, Delete, Print) */}
          <button
            type="button"
            onClick={() => setShowBillsHistoryModal(true)}
            style={{
              background: '#1e293b', color: '#f8fafc',
              border: '1px solid #475569', borderRadius: 8, padding: '0.45rem 0.8rem',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            title="View past bills, edit or delete bills (Alt+H)"
          >
            <FileText size={15} /> Bills History
          </button>

          <button
            type="button"
            onClick={() => setShowScanner(true)}
            style={{
              background: '#1e293b', color: '#38bdf8',
              border: '1px solid #38bdf8', borderRadius: 8, padding: '0.45rem 0.8rem',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <Camera size={15} /> Camera
          </button>

          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem' }}
            >
              Exit
            </button>
          )}
        </div>
      </div>

      {/* Editing Bill Notice Banner */}
      {editingBillId && (
        <div
          style={{
            background: '#fffbeb', borderBottom: '2px solid #f59e0b', padding: '0.55rem 1.25rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#92400e',
            fontWeight: 700, fontSize: '0.88rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✏️ Currently Editing Bill <strong>#{editingBillId}</strong></span>
            <span style={{ fontSize: '0.75rem', background: '#fef3c7', padding: '2px 8px', borderRadius: 4, border: '1px solid #fde68a' }}>
              Pressing Save / Checkout (F2) will update this existing bill
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Cancel editing this bill and start fresh sale?')) {
                handleStartNewSale();
              }
            }}
            style={{
              background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6,
              padding: '0.25rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Cancel Editing
          </button>
        </div>
      )}

      {/* Main Counter Workspace */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(340px, 1fr)',
          gap: '1rem', padding: '1rem', flex: 1,
        }}
      >
        {/* Left Column: Product Search, Speed Dial & Cart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Quick-Pick Speed Dial Chips */}
          {quickPicks.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: 2 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3, paddingRight: 4 }}>
                <Sparkles size={13} color="#2563eb" /> Quick:
              </span>
              {quickPicks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addToCart(item, 1)}
                  style={{
                    padding: '0.35rem 0.65rem', borderRadius: 999, border: '1px solid #cbd5e1',
                    background: '#fff', fontSize: '0.76rem', fontWeight: 700, color: '#1e293b',
                    cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <span>{item.name}</span>
                  <span style={{ color: '#2563eb' }}>{formatCurrency(item.sellingPrice || item.rate || item.price || 0)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search Bar with Arrow Keys Navigation */}
          <div style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', background: '#fff',
                border: `2px solid ${billType === 'gst' ? '#2563eb' : '#059669'}`,
                borderRadius: 12, padding: '0.45rem 0.85rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              }}
            >
              <Barcode size={22} color={billType === 'gst' ? '#2563eb' : '#059669'} style={{ marginRight: '0.5rem' }} />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Scan barcode or type name (↑ ↓ to pick, Enter to add, 5*item for 5 qty)"
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  fontSize: '1rem', fontWeight: 600, color: '#0f172a',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Live Autocomplete with Keyboard Arrow Selection */}
            {searchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: '#fff', borderRadius: 10, marginTop: 4,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.18)', zIndex: 100,
                  maxHeight: 320, overflowY: 'auto', border: '1px solid #cbd5e1',
                }}
              >
                {searchResults.map((p, idx) => {
                  const isSelected = idx === selectedSearchIdx;
                  const price = Number(p.sellingPrice || p.rate || p.price || 0);
                  const mrp = Number(p.mrp || 0);
                  return (
                    <div
                      key={p.id}
                      onClick={() => addToCart(p)}
                      onMouseEnter={() => setSelectedSearchIdx(idx)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.65rem 1rem', borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        background: isSelected ? '#dbeafe' : '#ffffff',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: isSelected ? '#1e40af' : '#0f172a' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {p.barcode ? `Barcode: ${p.barcode} • ` : ''}
                          {p.hsn ? `HSN: ${p.hsn} • ` : ''}Stock: <strong>{p.stock ?? '∞'}</strong>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {mrp > price && printSettings.showMRP !== false && (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', textDecoration: 'line-through', marginRight: 6 }}>
                            {formatCurrency(mrp)}
                          </span>
                        )}
                        <span style={{ fontWeight: 800, color: '#2563eb', fontSize: '1rem' }}>
                          {formatCurrency(price)}
                        </span>
                        {billType === 'gst' && (
                          <span style={{ fontSize: '0.7rem', color: '#059669', display: 'block' }}>
                            +{p.taxRate || p.taxPercent || 0}% GST
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Items Cart Table */}
          <div
            style={{
              flex: 1, background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid', gridTemplateColumns: '2fr 85px 135px 95px 35px',
                padding: '0.65rem 1rem', background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0', fontWeight: 700,
                fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase',
              }}
            >
              <div>Item Description</div>
              <div style={{ textAlign: 'center' }}>Qty</div>
              <div style={{ textAlign: 'right' }}>Rate {printSettings.showMRP !== false ? '/ MRP' : ''}</div>
              <div style={{ textAlign: 'right' }}>Amount</div>
              <div></div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '46vh' }}>
              {cart.length === 0 ? (
                <div
                  style={{
                    height: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', padding: '3.5rem',
                    color: '#94a3b8', textAlign: 'center',
                  }}
                >
                  <ShoppingCart size={48} strokeWidth={1.5} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>Cart is empty</p>
                  <span style={{ fontSize: '0.82rem', marginTop: 4 }}>
                    Scan barcode or type item name above. (Press F1 to search)
                  </span>
                  {products.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowMasterCatalog(true)}
                      className="btn btn-primary"
                      style={{ marginTop: '1rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Sparkles size={16} /> Load Products from 1 Lakh+ Catalog
                    </button>
                  )}
                </div>
              ) : (
                cart.map((item) => {
                  const lineAmount = item.qty * item.price;
                  const hasSavings = (item.mrp || 0) > item.price;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '2fr 85px 135px 95px 35px',
                        alignItems: 'center', padding: '0.65rem 1rem',
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{item.name}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span>{billType === 'gst' && item.hsn ? `HSN ${item.hsn} • GST ${item.taxRate}%` : 'Non-GST'}</span>
                          {hasSavings && printSettings.showMRP !== false && (
                            <span style={{ color: '#059669', fontWeight: 700 }}>
                              Save ₹{((item.mrp - item.price) * item.qty).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, -1)}
                          style={{
                            width: 24, height: 24, borderRadius: 6, border: '1px solid #cbd5e1',
                            background: '#fff', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Minus size={11} />
                        </button>
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => setItemExactQty(item.id, e.target.value)}
                          style={{
                            width: 38, textAlign: 'center', fontWeight: 700, fontSize: '0.92rem',
                            border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 0',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, 1)}
                          style={{
                            width: 24, height: 24, borderRadius: 6, border: '1px solid #cbd5e1',
                            background: '#fff', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>₹</span>
                          <input
                            type="number"
                            value={item.price}
                            onChange={(e) => setItemExactPrice(item.id, e.target.value)}
                            title="Click to edit selling price"
                            style={{
                              width: 65, textAlign: 'right', fontWeight: 700, fontSize: '0.88rem',
                              border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px',
                              color: '#0f172a', background: '#fff'
                            }}
                          />
                        </div>
                        {printSettings.showMRP !== false && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>MRP</span>
                            <input
                              type="number"
                              value={item.mrp || ''}
                              placeholder="MRP"
                              onChange={(e) => setItemExactMrp(item.id, e.target.value)}
                              title="Click to edit MRP"
                              style={{
                                width: 58, textAlign: 'right', fontWeight: 600, fontSize: '0.74rem',
                                border: '1px dashed #cbd5e1', borderRadius: 4, padding: '1px 3px',
                                color: '#64748b', background: '#f8fafc'
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                        {formatCurrency(lineAmount)}
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Savings Pill */}
            {totals.totalSavings > 0 && printSettings.showMRP !== false && (
              <div
                style={{
                  padding: '0.45rem 1rem', background: '#ecfdf5', color: '#065f46',
                  fontSize: '0.8rem', fontWeight: 700, borderTop: '1px solid #a7f3d0',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>🎉 Customer Total Savings Today:</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>{formatCurrency(totals.totalSavings)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Customer Info, Payment Modes, Tender Calculator, Checkout */}
        <div
          style={{
            background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
            padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.85rem',
            boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
          }}
        >
          {/* Customer Info with Phone Lookup */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                Customer Phone
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="9876543210"
                className="form-input"
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.6rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Cash Customer"
                className="form-input"
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.6rem' }}
              />
            </div>
          </div>

          {/* Payment Mode Selector */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', margin: 0 }}>
                Payment Mode
              </label>
              <button
                type="button"
                onClick={() => setShowDiscountModal(true)}
                style={{
                  background: 'none', border: 'none', color: '#2563eb',
                  fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                <Percent size={12} /> Discount (F7)
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {[
                { id: 'cash', label: 'Cash (Alt+C)', icon: Banknote },
                { id: 'upi', label: 'UPI QR', icon: QrCode },
                { id: 'card', label: 'Card Swipe', icon: CreditCard },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPaymentMode(id)}
                  style={{
                    padding: '0.55rem', borderRadius: 8, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    border: paymentMode === id ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: paymentMode === id ? '#eff6ff' : '#fff',
                    color: paymentMode === id ? '#2563eb' : '#475569',
                    fontWeight: 700, fontSize: '0.76rem',
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* UPI QR View (User Uploaded Shop QR Code) */}
          {paymentMode === 'upi' && (
            <div
              style={{
                textAlign: 'center', padding: '0.75rem', background: '#f8fafc',
                borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '0.5rem',
              }}
            >
              {uploadedQr ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <img
                    src={uploadedQr}
                    alt="Shop UPI QR"
                    style={{
                      width: 150, height: 150, objectFit: 'contain',
                      borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', padding: 4,
                    }}
                  />
                  <div style={{ fontSize: '0.74rem', color: '#1e293b', fontWeight: 700 }}>
                    {profile?.businessName || 'Shop UPI QR'} {profile?.upiId ? `• ${profile.upiId}` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => qrFileInputRef.current?.click()}
                    style={{
                      background: 'none', border: 'none', color: '#2563eb', fontSize: '0.72rem',
                      fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
                    }}
                  >
                    Change Shop QR Image
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => qrFileInputRef.current?.click()}
                  style={{
                    padding: '1.25rem 1rem', border: '2px dashed #94a3b8', borderRadius: 8,
                    cursor: 'pointer', background: '#fff', width: '100%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <QrCode size={34} color="#2563eb" />
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                    Upload Shop UPI QR Code
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Click to select GPay, PhonePe, Paytm, or BharatPe QR image
                  </span>
                </div>
              )}
              <input
                ref={qrFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleQrUpload}
              />
              <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 700 }}>
                Scan QR to Pay {formatCurrency(totals.total)}
              </div>
              <input
                type="text"
                value={upiDetails.utr}
                onChange={(e) => setUpiDetails({ utr: e.target.value })}
                placeholder="Optional: UTR / UPI Ref #"
                className="form-input"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem', width: '90%', textAlign: 'center' }}
              />
            </div>
          )}

          {/* Card Details View */}
          {paymentMode === 'card' && (
            <div
              style={{
                padding: '0.75rem', background: '#f8fafc', borderRadius: 10,
                border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {['RuPay', 'Visa', 'Mastercard', 'Amex'].map((ctype) => (
                  <button
                    key={ctype}
                    type="button"
                    onClick={() => setCardDetails(prev => ({ ...prev, cardType: ctype }))}
                    style={{
                      flex: 1, padding: '0.3rem 0', borderRadius: 6, fontSize: '0.72rem',
                      fontWeight: 700, cursor: 'pointer',
                      border: cardDetails.cardType === ctype ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: cardDetails.cardType === ctype ? '#dbeafe' : '#fff',
                      color: cardDetails.cardType === ctype ? '#1e40af' : '#475569',
                    }}
                  >
                    {ctype}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Last 4 Digits</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={cardDetails.last4}
                    onChange={(e) => setCardDetails(prev => ({ ...prev, last4: e.target.value.replace(/\D/g, '') }))}
                    placeholder="•••• 1234"
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.35rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>RRN / Auth Ref</label>
                  <input
                    type="text"
                    value={cardDetails.rrn}
                    onChange={(e) => setCardDetails(prev => ({ ...prev, rrn: e.target.value }))}
                    placeholder="Ref # / 981245"
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.35rem' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Cash Tender Calculation & Fast Denomination Buttons */}
          {paymentMode === 'cash' && (
            <div>
              {/* Denomination Quick Buttons */}
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'Exact', amt: totals.total },
                  { label: '₹100', amt: 100 },
                  { label: '₹200', amt: 200 },
                  { label: '₹500', amt: 500 },
                  { label: '₹1000', amt: 1000 },
                  { label: '₹2000', amt: 2000 },
                ].map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setCashTendered(String(d.amt))}
                    style={{
                      flex: 1, minWidth: 42, padding: '0.35rem 0', borderRadius: 6,
                      background: Number(cashTendered) === d.amt ? '#2563eb' : '#f1f5f9',
                      color: Number(cashTendered) === d.amt ? '#fff' : '#0f172a',
                      border: '1px solid #cbd5e1', fontSize: '0.72rem', fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                    Cash Received (₹)
                  </label>
                  <input
                    type="number"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    placeholder={totals.total ? String(totals.total) : '0'}
                    className="form-input"
                    style={{ fontSize: '1rem', fontWeight: 800, padding: '0.45rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                    Change Return
                  </label>
                  <div
                    style={{
                      padding: '0.45rem', borderRadius: 8, background: '#f1f5f9',
                      fontSize: '1.1rem', fontWeight: 900, color: changeDue > 0 ? '#059669' : '#64748b',
                      display: 'flex', alignItems: 'center', height: 38,
                    }}
                  >
                    {formatCurrency(changeDue)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Totals */}
          <div
            style={{
              marginTop: 'auto', background: '#f8fafc', borderRadius: 12,
              padding: '0.85rem', border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#64748b', marginBottom: 3 }}>
              <span>Taxable Value</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.billDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#dc2626', marginBottom: 3 }}>
                <span>Discount on Total</span>
                <span>-{formatCurrency(totals.billDiscount)}</span>
              </div>
            )}
            {billType === 'gst' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#64748b', marginBottom: 5 }}>
                <span>GST Total</span>
                <span>{formatCurrency(totals.taxAmount)}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#059669', marginBottom: 5 }}>
                <span>Tax Mode</span>
                <span>Non-GST (₹0 Tax)</span>
              </div>
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '2px dashed #cbd5e1', paddingTop: 6, marginTop: 4,
              }}
            >
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Grand Total</span>
              <span style={{ fontSize: '1.6rem', fontWeight: 900, color: billType === 'gst' ? '#2563eb' : '#059669' }}>
                {formatCurrency(totals.total)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear current sale?')) {
                  handleStartNewSale();
                }
              }}
              className="btn btn-secondary"
              style={{ flex: 1, padding: '0.8rem' }}
              disabled={cart.length === 0}
            >
              Clear (Esc)
            </button>
            <button
              type="button"
              onClick={handleCompleteSale}
              disabled={saving || cart.length === 0}
              className="btn btn-primary"
              style={{
                flex: 2, padding: '0.8rem', fontSize: '1rem', fontWeight: 800,
                background: billType === 'gst' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'linear-gradient(135deg, #059669, #047857)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Printer size={18} /> {saving ? 'Printing...' : 'Tender & Print (F2)'}
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Bar for Billing Boy */}
      <div
        style={{
          background: '#1e293b', color: '#94a3b8', padding: '0.4rem 1.25rem',
          fontSize: '0.74rem', display: 'flex', gap: '1.1rem', flexWrap: 'wrap',
          alignItems: 'center', borderTop: '1px solid #334155',
        }}
      >
        <span><strong style={{ color: '#fff' }}>F1</strong>: Search</span>
        <span><strong style={{ color: '#fff' }}>↑ ↓</strong>: Pick</span>
        <span><strong style={{ color: '#fff' }}>Enter</strong>: Add</span>
        <span><strong style={{ color: '#fff' }}>F2</strong>: Tender/Print</span>
        <span><strong style={{ color: '#fff' }}>F3</strong>: GST/Non-GST</span>
        <span><strong style={{ color: '#fff' }}>F4</strong>: Hold/Recall</span>
        <span><strong style={{ color: '#fff' }}>F7</strong>: Discount</span>
        <span><strong style={{ color: '#fff' }}>Alt+S</strong>: Stock In</span>
        <span><strong style={{ color: '#fff' }}>Alt+P</strong>: Paper ({paperSize})</span>
        <span><strong style={{ color: '#fff' }}>Alt+C</strong>: Exact Cash</span>
        <span><strong style={{ color: '#fff' }}>Esc</strong>: Reset</span>
      </div>

      {/* Hidden container for bit-accurate direct vector thermal printing */}
      <div style={{ position: 'fixed', left: -99999, top: 0, opacity: 0, pointerEvents: 'none' }} ref={hiddenReceiptRef}>
        {completedBill && (
          <InvoicePreview
            profile={profile}
            client={completedBill.client}
            details={completedBill.details}
            items={completedBill.items}
            totals={completedBill.totals}
            invoiceType={completedBill.invoiceType}
            // Always the CURRENTLY selected paper size, so switching the pill
            // in the receipt modal changes what actually gets printed.
            options={{ ...(completedBill.data?.invoiceOptions || {}), paperSize }}
          />
        )}
      </div>

      {/* Bill Receipt & Print Modal inside POS */}
      {showReceiptModal && completedBill && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)',
            zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowReceiptModal(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 14, maxWidth: 650, width: '100%',
              maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header with Paper Switcher */}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.9rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={18} color="#059669" /> Bill {completedBill.invoiceNumber} Ready!
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Grand Total: <strong>{formatCurrency(completedBill.total)}</strong> • Paid via {completedBill.paymentMode?.toUpperCase()}
                </span>
              </div>

              {/* Format pills */}
              <div style={{ display: 'flex', gap: 4, background: '#e2e8f0', padding: 3, borderRadius: 8 }}>
                {[
                  { id: 'thermal58', label: '58mm' },
                  { id: 'thermal80', label: '80mm' },
                  { id: 'a5', label: 'A5' },
                  { id: 'a4', label: 'A4' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPaperSize(p.id)}
                    style={{
                      background: paperSize === p.id ? '#2563eb' : 'transparent',
                      color: paperSize === p.id ? '#fff' : '#475569',
                      border: 'none', borderRadius: 6, padding: '0.25rem 0.6rem',
                      fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Receipt Preview Area */}
            <div
              style={{
                flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#f1f5f9',
                display: 'flex', justifyContent: 'center',
              }}
            >
              <div style={{ background: '#fff', padding: '0.5rem', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', borderRadius: 4 }}>
                <InvoicePreview
                  profile={profile}
                  client={completedBill.client}
                  details={completedBill.details}
                  items={completedBill.items}
                  totals={completedBill.totals}
                  invoiceType={completedBill.invoiceType}
                  options={{
                    ...(completedBill.data?.invoiceOptions || {}),
                    paperSize,
                  }}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.85rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                gap: '0.6rem', flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handleStartNewSale}
                className="btn btn-secondary"
                style={{ flex: 1, fontWeight: 700 }}
              >
                Next Customer (Space)
              </button>
              {onPrintInvoice && (
                <button
                  type="button"
                  onClick={() => {
                    setShowReceiptModal(false);
                    onPrintInvoice(completedBill);
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1, fontSize: '0.82rem' }}
                >
                  <FileText size={15} /> Open in Invoice Editor
                </button>
              )}
              <button
                type="button"
                onClick={() => handleWhatsAppShare(completedBill)}
                className="btn btn-secondary"
                style={{ flex: 1, color: '#16a34a', borderColor: '#86efac', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                title="Send receipt to customer phone on WhatsApp"
              >
                <Share2 size={15} /> WhatsApp Bill
              </button>
              <button
                type="button"
                onClick={() => printDirectly(completedBill)}
                className="btn btn-primary"
                style={{ flex: 1.5, fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Printer size={18} /> Print Bill (F2)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Discount Modal (F7 / Alt+D) */}
      {showDiscountModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)',
            zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', backdropFilter: 'blur(2px)',
          }}
          onClick={() => setShowDiscountModal(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 14, maxWidth: 380, width: '100%',
              padding: '1.25rem', boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Percent size={18} color="#2563eb" /> Apply Bill Discount
              </h3>
              <button onClick={() => setShowDiscountModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setBillDiscountType('flat')}
                style={{
                  flex: 1, padding: '0.45rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                  border: billDiscountType === 'flat' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: billDiscountType === 'flat' ? '#eff6ff' : '#fff',
                  color: billDiscountType === 'flat' ? '#2563eb' : '#475569',
                  cursor: 'pointer',
                }}
              >
                Flat Amount (₹)
              </button>
              <button
                type="button"
                onClick={() => setBillDiscountType('percent')}
                style={{
                  flex: 1, padding: '0.45rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                  border: billDiscountType === 'percent' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: billDiscountType === 'percent' ? '#eff6ff' : '#fff',
                  color: billDiscountType === 'percent' ? '#2563eb' : '#475569',
                  cursor: 'pointer',
                }}
              >
                Percentage (%)
              </button>
            </div>

            <input
              type="number"
              value={billDiscountValue}
              onChange={(e) => setBillDiscountValue(e.target.value)}
              placeholder="0"
              autoFocus
              className="form-input"
              style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', marginBottom: '1rem' }}
            />

            <button
              type="button"
              onClick={() => setShowDiscountModal(false)}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Apply Discount
            </button>
          </div>
        </div>
      )}

      {/* Quick Stock Modal */}
      {showQuickStock && (
        <QuickStockModal
          isOpen={showQuickStock}
          onClose={() => setShowQuickStock(false)}
          onStockUpdated={loadData}
        />
      )}

      {/* Barcode Camera Modal */}
      {showScanner && (
        <BarcodeScannerModal
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={handleBarcodeScanned}
        />
      )}

      {/* Day Register Modal */}
      {showDaySummary && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', backdropFilter: 'blur(3px)',
          }}
          onClick={() => setShowDaySummary(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 14, maxWidth: 560, width: '100%',
              padding: '1.5rem', boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={22} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                  Today's Counter Day Register
                </h3>
              </div>
              <button onClick={() => setShowDaySummary(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Sales Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>🧾 GST Sales</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d4ed8' }}>
                  {formatCurrency(dayStats.gstSales)}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>📝 Non-GST Sales</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d' }}>
                  {formatCurrency(dayStats.nonGstSales)}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>💵 Total Cash Received</span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  {formatCurrency(dayStats.cash)}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>📱 Digital Payments</span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  {formatCurrency(dayStats.upi + dayStats.card)}
                </div>
              </div>
            </div>

            {/* Cash in Hand Calculation */}
            <div style={{ padding: '0.85rem', background: '#fef3c7', borderRadius: 10, border: '1px solid #fde68a', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
                <span>Counter Cash In:</span>
                <strong>{formatCurrency(dayStats.cash)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4, color: '#b45309' }}>
                <span>Less: Petty Cash / Counter Spents:</span>
                <strong>- {formatCurrency(dayStats.totalSpent)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #d97706', paddingTop: 6, fontSize: '1rem', fontWeight: 800, color: '#92400e' }}>
                <span>Actual Cash in Drawer:</span>
                <span>{formatCurrency(dayStats.netCashInDrawer)}</span>
              </div>
            </div>

            {/* Quick Petty Cash Record */}
            <form onSubmit={handleAddCounterExpense} style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                Record Counter Spent (Tea, Transport, Helper)
              </label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="text"
                  value={newExpenseTitle}
                  onChange={(e) => setNewExpenseTitle(e.target.value)}
                  placeholder="e.g. Tea / Snacks"
                  className="form-input"
                  style={{ flex: 1, fontSize: '0.82rem' }}
                />
                <input
                  type="number"
                  value={newExpenseAmount}
                  onChange={(e) => setNewExpenseAmount(e.target.value)}
                  placeholder="₹ Amount"
                  className="form-input"
                  style={{ width: 90, fontSize: '0.82rem' }}
                />
                <button type="submit" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
                  Add
                </button>
              </div>
            </form>

            <button
              onClick={() => setShowDaySummary(false)}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Close Register
            </button>
          </div>
        </div>
      )}

      {/* Bills History & Edit / Delete Modal */}
      {showBillsHistoryModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', backdropFilter: 'blur(3px)',
          }}
          onClick={() => setShowBillsHistoryModal(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, maxWidth: 900, width: '100%',
              maxHeight: '90vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <FileText size={24} color="#2563eb" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                    📋 Bills History & Management
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Edit existing bills, delete bills, or re-print thermal / sheet receipts
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBillsHistoryModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div
              style={{
                padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {[
                  { id: 'all', label: `All Bills (${allBillsList.length})` },
                  { id: 'gst', label: `🧾 GST Invoices (${gstBillsCount})` },
                  { id: 'non-gst', label: `📝 Non-GST Invoices (${nonGstBillsCount})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHistoryFilter(tab.id)}
                    style={{
                      padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                      cursor: 'pointer',
                      border: historyFilter === tab.id ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: historyFilter === tab.id ? '#eff6ff' : '#fff',
                      color: historyFilter === tab.id ? '#1d4ed8' : '#475569',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 360 }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search by Bill #, Customer name, Phone..."
                  className="form-input"
                  style={{ paddingLeft: '2.2rem', fontSize: '0.84rem', width: '100%' }}
                />
              </div>
            </div>

            {/* Bills List / Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 1.5rem' }}>
              {filteredHistoryBills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94a3b8' }}>
                  <FileText size={42} style={{ opacity: 0.4, margin: '0 auto 0.5rem' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>No bills found matching your filter</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '0.65rem 0.5rem' }}>Bill #</th>
                      <th style={{ padding: '0.65rem 0.5rem' }}>Date</th>
                      <th style={{ padding: '0.65rem 0.5rem' }}>Customer</th>
                      <th style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>Items</th>
                      <th style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>Total Amount</th>
                      <th style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>Mode</th>
                      <th style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryBills.map((b) => {
                      const isNonGst = b.billType === 'non-gst' || b.isNonGst || b.invoiceType === 'estimate';
                      const itemCount = b.items?.length || b.data?.items?.length || 0;
                      const billNo = b.invoiceNumber || b.id;
                      const amount = Number(b.totalAmount || b.total || 0);

                      return (
                        <tr key={b.id || billNo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.65rem 0.5rem' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{billNo}</div>
                            <span
                              style={{
                                fontSize: '0.68rem', fontWeight: 800,
                                padding: '1px 6px', borderRadius: 4,
                                background: isNonGst ? '#f0fdf4' : '#eff6ff',
                                color: isNonGst ? '#166534' : '#1e40af',
                                border: isNonGst ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
                              }}
                            >
                              {isNonGst ? '📝 Non-GST' : '🧾 GST Tax'}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                            {b.invoiceDate || b.date}
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem' }}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>
                              {b.clientName || b.client?.name || 'Cash Customer'}
                            </div>
                            {(b.client?.phone || b.phone) && (
                              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                {b.client?.phone || b.phone}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', color: '#64748b' }}>
                            {itemCount}
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                            {formatCurrency(amount)}
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                            <span
                              style={{
                                fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px',
                                borderRadius: 4, background: '#f1f5f9', color: '#334155',
                                textTransform: 'uppercase',
                              }}
                            >
                              {b.paymentMode || 'cash'}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              {/* Edit Bill */}
                              <button
                                type="button"
                                onClick={() => handleEditExistingBill(b)}
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem', fontWeight: 700 }}
                                title="Load bill into counter to edit items and prices"
                              >
                                ✏️ Edit
                              </button>

                              {/* Print Bill */}
                              <button
                                type="button"
                                onClick={() => printDirectly(b)}
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.74rem' }}
                                title="Re-print Bill"
                              >
                                🖨️ Print
                              </button>

                              {/* Delete Bill */}
                              <button
                                type="button"
                                onClick={() => handleDeleteBillFromPOS(b)}
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.45rem', fontSize: '0.74rem', color: '#ef4444' }}
                                title="Delete Bill"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                Showing {filteredHistoryBills.length} bills
              </span>
              <button
                type="button"
                onClick={() => setShowBillsHistoryModal(false)}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1 Lakh+ Master Catalog Database Modal */}
      {showMasterCatalog && (
        <MasterCatalogModal
          isOpen={showMasterCatalog}
          onClose={() => setShowMasterCatalog(false)}
          onImportComplete={loadData}
        />
      )}
    </div>
  );
}
