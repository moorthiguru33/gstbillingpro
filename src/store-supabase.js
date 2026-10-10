import { supabase } from './lib/supabase.js';
import { reportPlanLimit } from './lib/planState';
import { t as i18nT } from './i18n';
import { getFinancialYearLabel } from './utils.js';
import { DEMO_PROFILE, DEMO_CLIENTS, DEMO_PRODUCTS, DEMO_BILLS, DEMO_EXPENSES, DEMO_LAST_INVOICE_SEQ } from './data/demoData.js';
import { normalizeProduct } from './utils/products.js';
import { normalizeBill } from './utils/bills.js';
import {
  localToday, isTemplateDue, templateHasEnded, prefixForInvoiceType, profileForTemplate, buildBillFromTemplate,
} from './utils/recurring.js';

// Supabase query builders are lazy "thenables": the request is only sent
// when awaited / .then() is called, and they have NO .catch(). The old
// `supabase.from(...).upsert(...).catch(() => {})` therefore threw a
// TypeError and never sent the request. Use this for fire-and-forget writes.
const quietly = (builder) => Promise.resolve(builder).then(() => {}, () => {});

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
// Reads the locally cached session (no network round-trip per query —
// getUser() hit the Auth server on EVERY store call). The database still
// enforces ownership with RLS, so this is only used to build the queries.
const getUserId = async () => {
  if (_demoMode) return 'demo-guest';
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error('Not authenticated');
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
  if (_demoMode) return;
  getUserId().then(userId => quietly(supabase.from('meta').upsert({
    user_id: userId,
    key: 'regionMode',
    value: mode,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,key' }))).catch(() => {});
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
  if (_demoMode) return;
  getUserId().then(userId => quietly(supabase.from('meta').upsert({
    user_id: userId,
    key: 'enabledModules',
    value: map || {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,key' }))).catch(() => {});
};

// ---- Invoice Counter (Atomic via DB function with separate GST vs Non-GST sequences) ----
// Formats a sequence number exactly like the invoice screen expects:
// branded = <prefix><sep><FY><sep><0001>  (e.g. INV/2026-27/0005)
export const formatInvoiceNumber = (pfx, next, settings = DEFAULT_INV_SETTINGS, date = new Date()) => {
  if (settings.format === 'random') {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${pfx}${settings.separator || '-'}${rand}`;
  }
  const sep = settings.separator || '-';
  const padded = String(next).padStart(settings.padDigits || 4, '0');
  if (settings.showFinYear) return `${pfx}${sep}${getFinancialYearLabel(date)}${sep}${padded}`;
  return `${pfx}${sep}${padded}`;
};

// ---- Invoice Counter (Atomic via DB function with separate GST vs Non-GST sequences) ----
export const getNextInvoiceNumber = async (prefix = 'INV', { peek = false, explicitPrefix = false } = {}) => {
  if (_demoMode) {
    // Same format as a real account (INV/2026-27/0005), continuing after the
    // sample invoices — it used to produce "INV-0003", clashing with them.
    const settings = { ...DEFAULT_INV_SETTINGS, ...getDemoItem('invoiceNumberSettings', {}) };
    const pfx = explicitPrefix ? prefix : (prefix === 'EST' ? 'EST' : (settings.brandPrefix || prefix));
    const counters = getDemoItem('counters', {});
    const current = Number(counters[pfx] ?? (pfx === 'INV' ? DEMO_LAST_INVOICE_SEQ : 0)) || 0;
    const next = current + 1;
    if (!peek) setDemoItem('counters', { ...counters, [pfx]: next });
    return formatInvoiceNumber(pfx, next, settings);
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
      .maybeSingle();
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
      // Fallback if the RPC is missing (older database)
      const { data: current } = await supabase
        .from('meta')
        .select('value')
        .eq('user_id', userId)
        .eq('key', key)
        .maybeSingle();
      const currentNum = Number(current?.value?.count) || (settings.startNumber || 1) - 1;
      next = currentNum + 1;
      const { error: upErr } = await supabase.from('meta').upsert({
        user_id: userId,
        key,
        value: { count: next },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' });
      if (upErr) console.warn('Invoice counter update failed:', upErr.message);
    }
  }

  return formatInvoiceNumber(actualPrefix, next, settings);
};

// Free-plan limits are enforced by database triggers (migration 002). Turn
// their error into a readable one and let the UI open the upgrade modal.
function planLimitError(error) {
  const kind = reportPlanLimit(error);
  if (!kind) return error;
  const err = new Error(i18nT(kind === 'invoices' ? 'plans.limitTitle' : 'plans.businessLimitTitle'));
  err.code = 'PLAN_LIMIT';
  err.planLimit = kind;
  return err;
}

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
    status: bill.status || 'unpaid',
    invoice_type: bill.invoiceType,
    client_gstin: bill.clientGstin || bill.data?.client?.gstin || '',
    // Bills carry `totalAmount`; `total` only existed on the old demo data,
    // so the column was always 0 for real invoices.
    total: Number(bill.totalAmount ?? bill.total ?? bill.data?.totals?.total) || 0,
    data: bill,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('bills').upsert(row, { onConflict: 'id,user_id' });
  if (error) throw planLimitError(error);
  return { success: true };
};

export const getAllBills = async () => {
  if (_demoMode) return getDemoItem('bills', DEMO_BILLS).map(normalizeBill);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('bills')
    .select('data')
    .eq('user_id', userId)
    .order('invoice_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean).map(normalizeBill);
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
      data: { ...bill.data, _trashedAt: new Date().toISOString() },
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
  if (_demoMode) {
    const p = getDemoItem('profile', DEMO_PROFILE);
    // Older demo sessions stored the business name as `name`.
    return p && !p.businessName && p.name ? { ...p, businessName: p.name } : p;
  }
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
  if (_demoMode) return getDemoItem('products', DEMO_PRODUCTS).map(normalizeProduct);
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('products')
    .select('data')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean).map(normalizeProduct);
};

export const saveProduct = async (rawProduct) => {
  const product = normalizeProduct(rawProduct);
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
    price: product.sellingPrice || 0,
    tax_rate: product.taxPercent ?? 0,
    stock: product.stock === '' ? null : (product.stock ?? null),
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

export const saveProductsBatch = async (rawProducts = []) => {
  const products = rawProducts.map(normalizeProduct);
  if (_demoMode) {
    const existing = getDemoItem('products', DEMO_PRODUCTS);
    const ids = new Set(products.map(p => p.id).filter(Boolean));
    const combined = [...existing.filter(p => !ids.has(p.id)), ...products];
    setDemoItem('products', combined);
    return { success: true, count: products.length };
  }
  const userId = await getUserId();
  const rows = products.map((p, i) => {
    const id = p.id || `prod_${Date.now()}_${i}`;
    return {
      id,
      user_id: userId,
      name: p.name || '',
      hsn: p.hsn || '',
      price: p.sellingPrice || 0,
      tax_rate: p.taxPercent ?? 0,
      stock: p.stock ?? null,
      unit: p.unit || 'PCS',
      data: { ...p, id },
      updated_at: new Date().toISOString(),
    };
  });

  // Insert in batches of 100 for maximum reliability
  let saved = 0;
  let firstError = null;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'id,user_id' });
    if (error) { console.error('Batch product insert error:', error); firstError = firstError || error; }
    else saved += chunk.length;
  }
  if (!saved && firstError) throw firstError;
  return { success: true, count: saved, failed: rows.length - saved };
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
    const at = recurring.findIndex(r => r.id === id);
    if (at >= 0) recurring[at] = newRec; else recurring.unshift(newRec);
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

// Makes ONE invoice from a template now and moves the template on.
// (Was a stub that returned { invoiceNumber: 'Generated' } and created
// nothing.) Same maths as the desktop server: computeInvoiceTotals with
// CGST/SGST/IGST split, cess, TCS/TDS YTD, end conditions.
const generateFromTemplate = async (tpl, today, cache = {}) => {
  const bills = cache.bills || await getAllBills();
  const [profiles, activeProfile] = cache.profiles
    ? [cache.profiles, cache.activeProfile]
    : await Promise.all([getAllProfiles().catch(() => []), getProfile().catch(() => ({}))]);
  const profile = profileForTemplate(tpl, profiles, activeProfile);
  const prefix = prefixForInvoiceType(tpl.invoiceType);
  const taken = new Set(bills.map(b => b.id));
  let invoiceNumber = await getNextInvoiceNumber(prefix);
  // Never overwrite an existing invoice if the counter lags behind.
  for (let i = 0; i < 50 && taken.has(invoiceNumber); i++) invoiceNumber = await getNextInvoiceNumber(prefix);
  const { bill, nextTemplate } = buildBillFromTemplate({ tpl, profile, invoiceNumber, today, bills });
  await saveBill(bill);
  await saveRecurring(nextTemplate);
  bills.unshift(bill);
  return invoiceNumber;
};

export const generateRecurringNow = async (id) => {
  const templates = await getAllRecurring();
  const tpl = templates.find(t => t && t.id === id);
  if (!tpl) throw new Error('Recurring template not found');
  const today = localToday();
  if (templateHasEnded(tpl, today)) throw new Error('This template has reached its end date or number of invoices');
  const invoiceNumber = await generateFromTemplate(tpl, today);
  return { success: true, invoiceNumber };
};

// Auto-fire: when the app opens, create one invoice for every active
// template whose next date has arrived (the desktop app did this on boot).
// Records a breadcrumb so the notification bell can say what happened.
export const processDueRecurring = async () => {
  const today = localToday();
  const templates = (await getAllRecurring().catch(() => [])).filter(t => isTemplateDue(t, today));
  if (!templates.length) return { count: 0, invoiceNumbers: [] };
  const [bills, profiles, activeProfile] = await Promise.all([
    getAllBills(), getAllProfiles().catch(() => []), getProfile().catch(() => ({})),
  ]);
  const cache = { bills, profiles, activeProfile };
  const invoiceNumbers = [];
  for (const tpl of templates) {
    try { invoiceNumbers.push(await generateFromTemplate(tpl, today, cache)); }
    catch (err) { console.warn('Recurring auto-generate failed for', tpl.id, err); }
  }
  if (invoiceNumbers.length && !_demoMode) {
    await quietly(setMetaValue('lastRecurringAutoFire', { date: today, count: invoiceNumbers.length, invoiceNumbers, at: new Date().toISOString() }));
  }
  return { count: invoiceNumbers.length, invoiceNumbers };
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
  if (error) throw planLimitError(error);
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
  if (_demoMode) return getDemoItem(`meta_${key}`, null);
  const userId = await getUserId();
  const { data } = await supabase
    .from('meta')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();
  return data?.value ?? null;
};

export const setMetaValue = async (key, value) => {
  if (_demoMode) { setDemoItem(`meta_${key}`, value); return; }
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
  // First folder MUST be the user id (storage policy); strip slashes etc.
  const safe = (v, fb) => String(v || fb).replace(/[\\/#?%*:|"<>]+/g, '_').replace(/^\.+/, '_').slice(0, 120) || fb;
  const path = `${userId}/${safe(clientName, 'client')}/${safe(fileName, 'invoice.pdf')}`;
  const { error } = await supabase.storage
    .from('invoices')
    .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  return { saved: true, relPath: path };
};
