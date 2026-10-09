import { supabase } from './lib/supabase.js';
import { getFinancialYearLabel } from './utils.js';
import { DEMO_PROFILE, DEMO_CLIENTS, DEMO_PRODUCTS, DEMO_BILLS, DEMO_EXPENSES } from './data/demoData.js';

// ============================================================
// Demo Mode Support (Explore live app without signup)
// ============================================================
let _demoMode = typeof window !== 'undefined' && sessionStorage.getItem('gst_demo_mode') === 'true';

export const setDemoMode = (enabled) => {
  _demoMode = !!enabled;
  if (typeof window !== 'undefined') {
    if (enabled) {
      sessionStorage.setItem('gst_demo_mode', 'true');
      initDemoData();
    } else {
      sessionStorage.removeItem('gst_demo_mode');
    }
  }
};

export const isDemoModeActive = () => _demoMode;

const initDemoData = () => {
  try {
    if (!sessionStorage.getItem('gst_demo_profile')) sessionStorage.setItem('gst_demo_profile', JSON.stringify(DEMO_PROFILE));
    if (!sessionStorage.getItem('gst_demo_clients')) sessionStorage.setItem('gst_demo_clients', JSON.stringify(DEMO_CLIENTS));
    if (!sessionStorage.getItem('gst_demo_products')) sessionStorage.setItem('gst_demo_products', JSON.stringify(DEMO_PRODUCTS));
    if (!sessionStorage.getItem('gst_demo_bills')) sessionStorage.setItem('gst_demo_bills', JSON.stringify(DEMO_BILLS));
    if (!sessionStorage.getItem('gst_demo_expenses')) sessionStorage.setItem('gst_demo_expenses', JSON.stringify(DEMO_EXPENSES));
  } catch {}
};

if (_demoMode) {
  initDemoData();
}

const getDemoItem = (key, fallback) => {
  try {
    const raw = sessionStorage.getItem(`gst_demo_${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};

const setDemoItem = (key, val) => {
  try { sessionStorage.setItem(`gst_demo_${key}`, JSON.stringify(val)); } catch {}
};

// ---- Get current user ID ----
const getUserId = async () => {
  if (_demoMode) return 'demo-guest';
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (_demoMode) return 'demo-guest';
    throw new Error('Not authenticated');
  }
  return user.id;
};

// ---- Invoice Number Settings ----
const DEFAULT_INV_SETTINGS = {
  format: 'branded',
  brandPrefix: '',
  separator: '/',
  showFinYear: true,
  startNumber: 1,
  padDigits: 4,
};

export const getInvoiceNumberSettings = async () => {
  if (_demoMode) return getDemoItem('invoiceNumberSettings', DEFAULT_INV_SETTINGS);
  const userId = await getUserId();
  const { data } = await supabase
    .from('meta')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'invoiceNumberSettings')
    .single();
  return { ...DEFAULT_INV_SETTINGS, ...(data?.value || {}) };
};

export const saveInvoiceNumberSettings = async (settings) => {
  if (_demoMode) { setDemoItem('invoiceNumberSettings', settings); return; }
  const userId = await getUserId();
  await supabase.from('meta').upsert({
    user_id: userId,
    key: 'invoiceNumberSettings',
    value: settings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,key' });
};

// ---- Stock Alert Settings ----
const DEFAULT_STOCK_ALERT_SETTINGS = { enabled: true, threshold: 5 };

export const getStockAlertSettings = async () => {
  if (_demoMode) return getDemoItem('stockAlertSettings', DEFAULT_STOCK_ALERT_SETTINGS);
  const userId = await getUserId();
  const { data } = await supabase
    .from('meta')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'stockAlertSettings')
    .single();
  return { ...DEFAULT_STOCK_ALERT_SETTINGS, ...(data?.value || {}) };
};

export const saveStockAlertSettings = async (settings) => {
  if (_demoMode) { setDemoItem('stockAlertSettings', settings); return; }
  const userId = await getUserId();
  await supabase.from('meta').upsert({
    user_id: userId,
    key: 'stockAlertSettings',
    value: settings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,key' });
};

// ---- Apply Stock Changes ----
export const applyStockChanges = async (changes) => {
  const ids = Object.keys(changes || {}).filter(id => changes[id]);
  if (!ids.length) return [];
  const products = await getAllProducts();
  const saved = [];
  for (const id of ids) {
    const p = products.find(x => x.id === id);
    if (!p) continue;
    const next = { ...p, stock: Math.round(((Number(p.stock) || 0) + changes[id]) * 1000) / 1000 };
    await saveProduct(next);
    saved.push(next);
  }
  return saved;
};

// ---- Invoice Display Options ----
export const getInvoiceDisplayOptions = async () => {
  const userId = await getUserId();
  const { data } = await supabase
    .from('meta')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'invoiceDisplayOptions')
    .single();
  return data?.value || null;
};

export const saveInvoiceDisplayOptions = async (options) => {
  const userId = await getUserId();
  await supabase.from('meta').upsert({
    user_id: userId,
    key: 'invoiceDisplayOptions',
    value: options,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,key' });
};

// ---- Region Mode ----
const REGION_KEY = 'gst_regionMode';
export const getRegionMode = () => {
  try { return localStorage.getItem(REGION_KEY) || 'both'; } catch { return 'both'; }
};
export const setRegionMode = (mode) => {
  if (!['india', 'international', 'both'].includes(mode)) return;
  try { localStorage.setItem(REGION_KEY, mode); } catch {}
  // Also save to meta table async
  getUserId().then(userId => {
    supabase.from('meta').upsert({
      user_id: userId,
      key: 'regionMode',
      value: mode,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' }).catch(() => {});
  }).catch(() => {});
};

// ---- Enabled Modules ----
const MODULES_KEY = 'gst_enabledModules';
export const getEnabledModules = () => {
  try {
    const raw = localStorage.getItem(MODULES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};
export const setEnabledModules = (map) => {
  try { localStorage.setItem(MODULES_KEY, JSON.stringify(map || {})); } catch {}
  getUserId().then(userId => {
    supabase.from('meta').upsert({
      user_id: userId,
      key: 'enabledModules',
      value: map || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' }).catch(() => {});
  }).catch(() => {});
};

// ---- Invoice Counter (Atomic via DB function with separate GST vs Non-GST sequences) ----
export const getNextInvoiceNumber = async (prefix = 'INV', { peek = false, explicitPrefix = false } = {}) => {
  if (_demoMode) {
    const currentNum = Number(getDemoItem('counter', 2)) || 2;
    const next = peek ? currentNum + 1 : currentNum + 1;
    if (!peek) setDemoItem('counter', next);
    const pfx = explicitPrefix ? prefix : (prefix === 'EST' ? 'EST' : 'INV');
    return `${pfx}-${String(next).padStart(4, '0')}`;
  }
  const userId = await getUserId();
  const settings = await getInvoiceNumberSettings();
  const actualPrefix = explicitPrefix ? prefix : (prefix === 'EST' ? 'EST' : (settings.brandPrefix || prefix));
  const key = `counter_${actualPrefix}`;
  let next;

  if (peek) {
    const { data } = await supabase
      .from('meta')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .single();
    const currentNum = Number(data?.value?.count) || (settings.startNumber || 1) - 1;
    next = currentNum + 1;
  } else {
    // Use atomic DB function to avoid race conditions
    const { data, error } = await supabase.rpc('increment_meta_counter', {
      p_user_id: userId,
      p_key: key,
      p_start: settings.startNumber || 1,
    });
    if (!error && data !== null && data !== undefined) {
      next = data;
    } else {
      // Robust fallback if RPC function not defined
      const { data: current } = await supabase
        .from('meta')
        .select('value')
        .eq('user_id', userId)
        .eq('key', key)
        .single();
      const currentNum = Number(current?.value?.count) || (settings.startNumber || 1) - 1;
      next = currentNum + 1;
      await supabase.from('meta').upsert({
        user_id: userId,
        key,
        value: { count: next },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' }).catch(() => {});
    }
  }

  const pfx = actualPrefix;

  if (settings.format === 'random') {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${pfx}${settings.separator || '-'}${rand}`;
  }

  const sep = settings.separator || '-';
  const padded = String(next).padStart(settings.padDigits || 4, '0');

  if (settings.showFinYear) {
    return `${pfx}${sep}${getFinancialYearLabel()}${sep}${padded}`;
  }

  return `${pfx}${sep}${padded}`;
};

// ---- Bills ----
export const saveBill = async (bill, { overwrite = false } = {}) => {
  if (_demoMode) {
    const bills = getDemoItem('bills', DEMO_BILLS);
    const idx = bills.findIndex(b => b.id === bill.id);
    if (idx >= 0) bills[idx] = bill;
    else bills.unshift(bill);
    setDemoItem('bills', bills);
    return { success: true };
  }
  const userId = await getUserId();

  if (!overwrite) {
    // Check if bill exists
    const { data: existing } = await supabase
      .from('bills')
      .select('id')
      .eq('id', bill.id)
      .eq('user_id', userId)
      .single();

    if (existing) {
      const err = new Error('A bill with this invoice number already exists');
      err.status = 409;
      throw err;
    }
  }

  const row = {
    id: bill.id,
    user_id: userId,
    invoice_number: bill.invoiceNumber,
    invoice_date: bill.invoiceDate,
    client_name: bill.clientName,
    client_gstin: bill.clientGstin,
    status: bill.status || 'unpaid',
    invoice_type: bill.invoiceType,
    total: bill.total || 0,
    data: bill,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('bills').upsert(row, { onConflict: 'id,user_id' });
  if (error) throw error;
  return { success: true };
};

export const getAllBills = async () => {
  if (_demoMode) return getDemoItem('bills', DEMO_BILLS);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('bills')
    .select('data')
    .eq('user_id', userId)
    .order('invoice_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const deleteBill = async (id) => {
  if (_demoMode) {
    const bills = getDemoItem('bills', DEMO_BILLS).filter(b => b.id !== id);
    setDemoItem('bills', bills);
    return { success: true };
  }
  const userId = await getUserId();
  // Soft delete: move to trash
  const { data: bill } = await supabase
    .from('bills')
    .select('data')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (bill?.data) {
    await supabase.from('trash').upsert({
      id,
      user_id: userId,
      data: bill.data,
      deleted_at: new Date().toISOString(),
    }, { onConflict: 'id,user_id' });
  }

  await supabase.from('bills').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

// ---- Trash ----
export const getTrashedBills = async () => {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('trash')
    .select('data')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const restoreTrashedBill = async (id) => {
  const userId = await getUserId();
  const { data } = await supabase
    .from('trash')
    .select('data')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (data?.data) {
    await saveBill(data.data, { overwrite: true });
    await supabase.from('trash').delete().eq('id', id).eq('user_id', userId);
  }
  return { success: true };
};

export const purgeTrashedBill = async (id) => {
  const userId = await getUserId();
  await supabase.from('trash').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

// ---- Backups (Export/Import) ----
export const getBackupsList = async () => {
  // No server-side backup list for cloud version; return empty
  return [];
};
export const triggerBackup = async () => ({ success: true });
export const deleteBackup = async () => ({ success: true });
export const restoreBackup = async () => ({ success: true });

// ---- Profile ----
const DEFAULT_PROFILE = {
  businessName: '', address: '', state: '', gstin: '', pan: '',
  email: '', phone: '', bankName: '', accountNumber: '', ifsc: '',
  logo: '', signature: '', upiId: '', googleClientId: '',
  googleDriveFolder: 'GST Billing Invoices',
};

export const saveProfile = async (profile) => {
  if (_demoMode) { setDemoItem('profile', profile); return { success: true }; }
  const userId = await getUserId();
  const { error } = await supabase.from('profiles').upsert({
    user_id: userId,
    business_name: profile.businessName || '',
    address: profile.address || '',
    state: profile.state || '',
    gstin: profile.gstin || '',
    pan: profile.pan || '',
    email: profile.email || '',
    phone: profile.phone || '',
    bank_name: profile.bankName || '',
    account_number: profile.accountNumber || '',
    ifsc: profile.ifsc || '',
    upi_id: profile.upiId || '',
    data: profile,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return { success: true };
};

export const getProfile = async () => {
  if (_demoMode) return getDemoItem('profile', DEMO_PROFILE);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('data')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.data || DEFAULT_PROFILE;
};

// ---- Clients ----
export const saveClient = async (client) => {
  if (_demoMode) {
    const clients = getDemoItem('clients', DEMO_CLIENTS);
    const id = client.id || `cli_demo_${Date.now()}`;
    const newClient = { ...client, id };
    const idx = clients.findIndex(c => c.id === id);
    if (idx >= 0) clients[idx] = newClient;
    else clients.unshift(newClient);
    setDemoItem('clients', clients);
    return newClient;
  }
  const userId = await getUserId();
  if (!client.id) client.id = 'cli_' + Date.now();
  const { error } = await supabase.from('clients').upsert({
    id: client.id,
    user_id: userId,
    name: client.name || '',
    gstin: client.gstin || '',
    phone: client.phone || '',
    email: client.email || '',
    address: client.address || '',
    state: client.state || '',
    data: client,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id,user_id' });
  if (error) throw error;
  return client;
};

export const getAllClients = async () => {
  if (_demoMode) return getDemoItem('clients', DEMO_CLIENTS);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('clients')
    .select('data')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const deleteClient = async (id) => {
  if (_demoMode) {
    const clients = getDemoItem('clients', DEMO_CLIENTS).filter(c => c.id !== id);
    setDemoItem('clients', clients);
    return { success: true };
  }
  const userId = await getUserId();
  await supabase.from('clients').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

// ---- Terms Templates ----
export const getTermsTemplates = async () => {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('templates')
    .select('data')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  const templates = (data || []).map(r => r.data).filter(Boolean);
  if (templates.length === 0) {
    const defaultTpl = {
      id: 'default',
      name: 'Standard Terms',
      content: '1. Payment is due within 15 days of invoice date.\n2. Interest @ 18% p.a. on overdue payments.\n3. Subject to jurisdiction at service provider\'s location.\n4. E. & O.E.',
    };
    await saveTermsTemplate(defaultTpl);
    return [defaultTpl];
  }
  return templates;
};

export const saveTermsTemplate = async (template) => {
  const userId = await getUserId();
  if (!template.id) template.id = 'tpl_' + Date.now();
  const { error } = await supabase.from('templates').upsert({
    id: template.id,
    user_id: userId,
    name: template.name || '',
    content: template.content || '',
    data: template,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id,user_id' });
  if (error) throw error;
  return template;
};

export const deleteTermsTemplate = async (id) => {
  const userId = await getUserId();
  await supabase.from('templates').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

// ---- Products ----
export const getAllProducts = async () => {
  if (_demoMode) return getDemoItem('products', DEMO_PRODUCTS);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('products')
    .select('data')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const saveProduct = async (product) => {
  if (_demoMode) {
    const products = getDemoItem('products', DEMO_PRODUCTS);
    const id = product.id || `prod_demo_${Date.now()}`;
    const newProd = { ...product, id };
    const idx = products.findIndex(p => p.id === id);
    if (idx >= 0) products[idx] = newProd;
    else products.unshift(newProd);
    setDemoItem('products', products);
    return newProd;
  }
  const userId = await getUserId();
  if (!product.id) product.id = 'prod_' + Date.now();
  const { error } = await supabase.from('products').upsert({
    id: product.id,
    user_id: userId,
    name: product.name || '',
    hsn: product.hsn || '',
    price: product.price || 0,
    tax_rate: product.taxRate || 0,
    stock: product.stock ?? null,
    unit: product.unit || 'NOS',
    data: product,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id,user_id' });
  if (error) throw error;
  return product;
};

export const deleteProduct = async (id) => {
  if (_demoMode) {
    const products = getDemoItem('products', DEMO_PRODUCTS).filter(p => p.id !== id);
    setDemoItem('products', products);
    return { success: true };
  }
  const userId = await getUserId();
  await supabase.from('products').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

export const saveProductsBatch = async (products = []) => {
  if (_demoMode) {
    const existing = getDemoItem('products', DEMO_PRODUCTS);
    const combined = [...existing, ...products];
    setDemoItem('products', combined);
    return { success: true, count: products.length };
  }
  const userId = await getUserId();
  const rows = products.map((p, i) => {
    const id = p.id || `prod_${Date.now()}_${i}`;
    const taxRate = Number(p.taxRate ?? p.tax_rate ?? 0);
    const price = Number(p.price || 0);
    return {
      id,
      user_id: userId,
      name: p.name || '',
      hsn: p.hsn || '',
      price,
      tax_rate: taxRate,
      stock: p.stock ?? null,
      unit: p.unit || 'PCS',
      data: {
        ...p,
        id,
        price,
        taxRate,
      },
      updated_at: new Date().toISOString(),
    };
  });

  // Insert in batches of 100 for maximum reliability
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'id,user_id' });
    if (error) console.error('Batch product insert error:', error);
  }
  return { success: true, count: rows.length };
};

// ---- Expenses ----
export const getAllExpenses = async () => {
  if (_demoMode) return getDemoItem('expenses', DEMO_EXPENSES);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('expenses')
    .select('data')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const saveExpense = async (expense) => {
  if (_demoMode) {
    const expenses = getDemoItem('expenses', DEMO_EXPENSES);
    const id = expense.id || `exp_demo_${Date.now()}`;
    const newExp = { ...expense, id };
    expenses.unshift(newExp);
    setDemoItem('expenses', expenses);
    return newExp;
  }
  const userId = await getUserId();
  if (!expense.id) expense.id = 'exp_' + Date.now();
  const { error } = await supabase.from('expenses').upsert({
    id: expense.id,
    user_id: userId,
    description: expense.description || '',
    amount: expense.amount || 0,
    date: expense.date || '',
    category: expense.category || '',
    data: expense,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id,user_id' });
  if (error) throw error;
  return expense;
};

export const deleteExpense = async (id) => {
  if (_demoMode) {
    const expenses = getDemoItem('expenses', DEMO_EXPENSES).filter(e => e.id !== id);
    setDemoItem('expenses', expenses);
    return { success: true };
  }
  const userId = await getUserId();
  await supabase.from('expenses').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

// ---- Purchases ----
export const getAllPurchases = async () => {
  if (_demoMode) return getDemoItem('purchases', []);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('purchases')
    .select('data')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const savePurchase = async (purchase) => {
  if (_demoMode) {
    const purchases = getDemoItem('purchases', []);
    const id = purchase.id || `pur_demo_${Date.now()}`;
    const newPur = { ...purchase, id };
    purchases.unshift(newPur);
    setDemoItem('purchases', purchases);
    return newPur;
  }
  const userId = await getUserId();
  if (!purchase.id) purchase.id = 'pur_' + Date.now();
  const { error } = await supabase.from('purchases').upsert({
    id: purchase.id,
    user_id: userId,
    supplier_name: purchase.supplierName || '',
    invoice_number: purchase.invoiceNumber || '',
    date: purchase.date || '',
    total: purchase.total || 0,
    data: purchase,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id,user_id' });
  if (error) throw error;
  return purchase;
};

export const deletePurchase = async (id) => {
  if (_demoMode) {
    const purchases = getDemoItem('purchases', []).filter(p => p.id !== id);
    setDemoItem('purchases', purchases);
    return { success: true };
  }
  const userId = await getUserId();
  await supabase.from('purchases').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

// ---- Recurring ----
export const getAllRecurring = async () => {
  if (_demoMode) return getDemoItem('recurring', []);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('recurring')
    .select('data')
    .eq('user_id', userId)
    .order('client_name');
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const saveRecurring = async (item) => {
  if (_demoMode) {
    const recurring = getDemoItem('recurring', []);
    const id = item.id || `rec_demo_${Date.now()}`;
    const newRec = { ...item, id };
    recurring.unshift(newRec);
    setDemoItem('recurring', recurring);
    return newRec;
  }
  const userId = await getUserId();
  if (!item.id) item.id = 'rec_' + Date.now();
  const { error } = await supabase.from('recurring').upsert({
    id: item.id,
    user_id: userId,
    client_name: item.clientName || '',
    frequency: item.frequency || 'monthly',
    next_date: item.nextDate || '',
    data: item,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id,user_id' });
  if (error) throw error;
  return item;
};

export const deleteRecurring = async (id) => {
  if (_demoMode) {
    const recurring = getDemoItem('recurring', []).filter(r => r.id !== id);
    setDemoItem('recurring', recurring);
    return { success: true };
  }
  const userId = await getUserId();
  await supabase.from('recurring').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

export const generateRecurringNow = async () => {
  return { invoiceNumber: 'Generated' };
};

// ---- Receipts ----
export const getAllReceipts = async () => {
  if (_demoMode) return getDemoItem('receipts', []);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('receipts')
    .select('data')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const saveReceipt = async (receipt) => {
  if (_demoMode) {
    const receipts = getDemoItem('receipts', []);
    const id = receipt.id || `rcp_demo_${Date.now()}`;
    const newRcp = { ...receipt, id };
    receipts.unshift(newRcp);
    setDemoItem('receipts', receipts);
    return newRcp;
  }
  const userId = await getUserId();
  if (!receipt.id) receipt.id = 'rcp_' + Date.now();
  const { error } = await supabase.from('receipts').upsert({
    id: receipt.id,
    user_id: userId,
    client_name: receipt.clientName || '',
    amount: receipt.amount || 0,
    date: receipt.date || '',
    data: receipt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id,user_id' });
  if (error) throw error;
  return receipt;
};

export const deleteReceipt = async (id) => {
  if (_demoMode) {
    const receipts = getDemoItem('receipts', []).filter(r => r.id !== id);
    setDemoItem('receipts', receipts);
    return { success: true };
  }
  const userId = await getUserId();
  await supabase.from('receipts').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

// ---- Business Profiles ----
export const getAllProfiles = async () => {
  if (_demoMode) return [getDemoItem('profile', DEMO_PROFILE)];
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('business_profiles')
    .select('data')
    .eq('user_id', userId)
    .order('business_name');
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
};

export const saveBusinessProfile = async (profile) => {
  if (_demoMode) { setDemoItem('profile', profile); return profile; }
  const userId = await getUserId();
  if (!profile.id) profile.id = 'biz_' + Date.now();
  const { error } = await supabase.from('business_profiles').upsert({
    id: profile.id,
    user_id: userId,
    business_name: profile.businessName || '',
    data: profile,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id,user_id' });
  if (error) throw error;
  return profile;
};

export const deleteBusinessProfile = async (id) => {
  if (_demoMode) return { success: true };
  const userId = await getUserId();
  await supabase.from('business_profiles').delete().eq('id', id).eq('user_id', userId);
  return { success: true };
};

// ---- Meta ----
export const getMetaValue = async (key) => {
  const userId = await getUserId();
  const { data } = await supabase
    .from('meta')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .single();
  return data?.value ?? null;
};

export const setMetaValue = async (key, value) => {
  const userId = await getUserId();
  await supabase.from('meta').upsert({
    user_id: userId,
    key,
    value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,key' });
};

// ---- Export / Import (Full backup) ----
const EXPORTABLE_LOCALSTORAGE_KEYS = [
  'gst_customUnits', 'gst_regionMode', 'gst_enabledModules',
  'gst_filing_status', 'gst_printSettings', 'gst_itrCalcInputs',
  'gst_itrPresumptive', 'gst_itrAdvanceTax', 'gst_stockAlertSettings',
  'freegstbill_invoiceOptions', 'freegstbill_theme',
  'freegstbill_onboarded', 'freegstbill_dismissedUpdate',
];

export const exportAllData = async () => {
  const [bills, clients, products, expenses, purchases, recurring, receipts, profile, profiles, templates] =
    await Promise.all([
      getAllBills().catch(() => []),
      getAllClients().catch(() => []),
      getAllProducts().catch(() => []),
      getAllExpenses().catch(() => []),
      getAllPurchases().catch(() => []),
      getAllRecurring().catch(() => []),
      getAllReceipts().catch(() => []),
      getProfile().catch(() => ({})),
      getAllProfiles().catch(() => []),
      getTermsTemplates().catch(() => []),
    ]);

  const lsData = {};
  EXPORTABLE_LOCALSTORAGE_KEYS.forEach(k => {
    try { const v = localStorage.getItem(k); if (v !== null) lsData[k] = v; } catch {}
  });

  const data = {
    exportedAt: new Date().toISOString(),
    version: 'saas',
    __freegstbill_backup: true,
    profile, profiles, bills, clients, products, expenses,
    purchases, recurring, receipts, termsTemplates: templates,
    localStorage: lsData,
  };

  return JSON.stringify(data, null, 2);
};

export const inspectBackup = (jsonString) => {
  let data;
  try { data = JSON.parse(jsonString); }
  catch { throw new Error('Not a valid JSON file'); }
  return {
    valid: !!data && (data.__freegstbill_backup || data.bills || data.profile),
    exportedAt: data.exportedAt || null,
    version: data.version || null,
    counts: {
      bills: Array.isArray(data.bills) ? data.bills.length : 0,
      clients: Array.isArray(data.clients) ? data.clients.length : 0,
      products: Array.isArray(data.products) ? data.products.length : 0,
      expenses: Array.isArray(data.expenses) ? data.expenses.length : 0,
    },
    raw: data,
  };
};

export const importData = async (jsonString) => {
  const { raw: data } = inspectBackup(jsonString);
  const results = {};

  if (data.profile) { await saveProfile(data.profile); results.profile = 1; }
  if (data.bills) { for (const b of data.bills) await saveBill(b, { overwrite: true }).catch(() => {}); results.bills = data.bills.length; }
  if (data.clients) { for (const c of data.clients) await saveClient(c).catch(() => {}); results.clients = data.clients.length; }
  if (data.products) { for (const p of data.products) await saveProduct(p).catch(() => {}); results.products = data.products.length; }
  if (data.expenses) { for (const e of data.expenses) await saveExpense(e).catch(() => {}); results.expenses = data.expenses.length; }
  if (data.purchases) { for (const p of data.purchases) await savePurchase(p).catch(() => {}); results.purchases = data.purchases.length; }
  if (data.recurring) { for (const r of data.recurring) await saveRecurring(r).catch(() => {}); results.recurring = data.recurring.length; }
  if (data.receipts) { for (const r of data.receipts) await saveReceipt(r).catch(() => {}); results.receipts = data.receipts.length; }

  if (data.localStorage) {
    Object.entries(data.localStorage).forEach(([k, v]) => {
      if (EXPORTABLE_LOCALSTORAGE_KEYS.includes(k)) {
        try { localStorage.setItem(k, v); } catch {}
      }
    });
  }

  return results;
};

// ---- Update (not applicable for cloud version) ----
export const runUpdateNow = async () => {
  return { ok: false, error: 'Auto-update not available in cloud version. The app updates automatically.' };
};

// ---- Save PDF (upload to Supabase Storage) ----
export const savePdfToStorage = async (pdfBlob, fileName, clientName) => {
  if (_demoMode) return { saved: true, relPath: `demo/${fileName}` };
  const userId = await getUserId();
  const path = `${userId}/${clientName}/${fileName}`;
  const { error } = await supabase.storage
    .from('invoices')
    .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  return { saved: true, relPath: path };
};
