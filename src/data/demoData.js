// ============================================================
// Demo-mode sample data ("Explore without signing up").
//
// Reconstructed from the production bundle (Krishna Supermarket & General,
// Metro Retail Mart, Vasanth Department Stores, Apex Traders) and rewritten
// to use the SAME shapes the real app stores, so every screen works in demo:
//   - profile  -> businessName / city / pin / country (was `name`, so the
//                 business name never printed)
//   - products -> sellingPrice / rate / taxPercent (was price / taxRate, so
//                 the Products table showed "-" for rate and GST%)
//   - bills    -> invoiceType 'tax-invoice', totalAmount, paidAmount,
//                 payments[] and data.{profile,client,details,items,totals}
//                 (was invoiceType 'regular' + `total`, so the Dashboard
//                 showed blank type badges, Rs 0.00 and wrong paid filters)
// Totals are computed with the real tax engine, never hand-typed.
// Dates are relative to "today" so the current month / FY cards light up.
// ============================================================
import { computeInvoiceTotals, getFinancialYearLabel } from '../utils.js';

const pad = (n) => String(n).padStart(2, '0');
const isoDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const DEMO_PROFILE = {
  id: 'demo_profile_1',
  businessName: 'Apex Traders & Distributors',
  tagline: 'Wholesale & Retail FMCG Merchants',
  address: '42, Commercial Complex, MG Road',
  city: 'Chennai',
  state: 'Tamil Nadu',
  pin: '600001',
  country: 'India',
  phone: '9876543210',
  email: 'sales@apextraders.example',
  gstin: '33AABCA1234F1Z8',
  pan: 'AABCA1234F',
  upiId: '9876543210@upi',
  bankName: 'HDFC Bank',
  accountNumber: '50200012345678',
  ifsc: 'HDFC0001234',
  branch: 'Mount Road Branch',
  terms: '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged on overdue payments.\n3. Subject to local Chennai jurisdiction.',
};

export const DEMO_CLIENTS = [
  { id: 'client_demo_1', name: 'Vasanth Department Stores', phone: '9840112233', email: 'vasanthstores@example.com', gstin: '33AAACV4567B1Z2', address: '15, Anna Salai', city: 'Chennai', state: 'Tamil Nadu', pin: '600002', country: 'India' },
  { id: 'client_demo_2', name: 'Krishna Supermarket & General', phone: '9789012345', email: 'krishnasuper@example.com', gstin: '33BBBCK7890D1Z5', address: '88, Bazaar Street', city: 'Coimbatore', state: 'Tamil Nadu', pin: '641001', country: 'India' },
  { id: 'client_demo_3', name: 'Metro Retail Mart', phone: '9444098765', email: 'metroretail@example.com', gstin: '', address: '12, West Car Street', city: 'Madurai', state: 'Tamil Nadu', pin: '625001', country: 'India' },
  { id: 'client_demo_4', name: 'Shree Balaji Kirana Store', phone: '9822012345', email: 'balajikirana@example.com', gstin: '27AAKFS2345C1Z9', address: '7, Laxmi Road', city: 'Pune', state: 'Maharashtra', pin: '411002', country: 'India' },
];

const rawProducts = [
  ['prod_demo_1', 'India Gate Basmati Rice 5kg', 'Grocery & Staples', '1006', 5, 'BAG', 450, 520, 380, '8900000371110', 85],
  ['prod_demo_2', 'Fortune Sunlite Refined Oil 1L', 'Edible Oils', '1512', 5, 'PKT', 135, 155, 118, '8906007280010', 120],
  ['prod_demo_3', 'Tata Salt Vacuum Evaporated 1kg', 'Grocery & Staples', '2501', 0, 'PKT', 25, 28, 21, '8901058852320', 200],
  ['prod_demo_4', 'Aashirvaad Shudh Chakki Atta 5kg', 'Grocery & Staples', '1101', 5, 'BAG', 240, 275, 210, '8901030383720', 60],
  ['prod_demo_5', 'Dettol Original Liquid Handwash 200ml', 'Personal Care', '3401', 18, 'BTL', 95, 110, 78, '8901396123450', 45],
  ['prod_demo_6', 'Surf Excel Quick Wash Detergent 1kg', 'Household', '3402', 18, 'PKT', 185, 215, 158, '8901030712340', 70],
  ['prod_demo_7', 'JK Copier Paper A4 75 GSM (500 Sheets)', 'Stationery', '4802', 12, 'RIM', 290, 340, 245, '8906012456780', 40],
  ['prod_demo_8', 'Philips LED Bulb 9W Cool Day White', 'Electricals', '8539', 18, 'PCS', 110, 140, 82, '8901035028450', 90],
];

export const DEMO_PRODUCTS = rawProducts.map(([id, name, category, hsn, tax, unit, price, mrp, purchasePrice, barcode, stock]) => ({
  id, name, category, hsn, unit, barcode, stock, mrp, purchasePrice,
  sellingPrice: price, rate: price, price,
  taxPercent: tax, taxRate: tax,
}));

const productById = Object.fromEntries(DEMO_PRODUCTS.map(p => [p.id, p]));
const clientById = Object.fromEntries(DEMO_CLIENTS.map(c => [c.id, c]));

const buildBill = ({ seq, daysAgo, clientId, lines, paid, mode, notes, dueInDays = 15 }) => {
  const invoiceDate = isoDaysAgo(daysAgo);
  const fy = getFinancialYearLabel(new Date(invoiceDate));
  const invoiceNumber = `INV/${fy}/${String(seq).padStart(4, '0')}`;
  const client = { ...clientById[clientId] };
  const items = lines.map(([pid, qty], i) => {
    const p = productById[pid];
    return { id: `item_${seq}_${i}`, name: p.name, hsn: p.hsn, quantity: qty, unit: p.unit, rate: p.sellingPrice, mrp: p.mrp, discount: 0, taxPercent: p.taxPercent, cessPercent: 0 };
  });
  const due = new Date(invoiceDate); due.setDate(due.getDate() + dueInDays);
  const details = {
    invoiceNumber, invoiceDate,
    dueDate: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`,
    placeOfSupply: client.state, paymentMode: mode,
  };
  const totals = computeInvoiceTotals({ items, profile: DEMO_PROFILE, client, details, showGST: true });
  const total = Number(totals.total) || 0;
  const paidAmount = paid === 'full' ? total : (Number(paid) || 0);
  const payments = paidAmount > 0
    ? [{ id: `pay_demo_${seq}`, amount: paidAmount, date: invoiceDate, mode, note: 'Demo payment', recordedAt: `${invoiceDate}T10:00:00.000Z` }]
    : [];
  const status = paidAmount >= total - 0.005 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid');
  return {
    id: invoiceNumber, invoiceNumber, invoiceDate,
    clientName: client.name, clientGstin: client.gstin || '',
    invoiceType: 'tax-invoice', currency: 'INR',
    totalAmount: total,
    totalTaxAmount: totals.totalTaxAmount ?? ((totals.cgst || 0) + (totals.sgst || 0) + (totals.igst || 0) + (totals.cess || 0)),
    status, paidAmount, payments,
    printedCount: 0, lastPrintedAt: null,
    data: { profile: DEMO_PROFILE, client, details, items, totals, invoiceType: 'tax-invoice', customNotes: notes || '', invoiceOptions: { currency: 'INR' }, taxInclusive: false },
  };
};

export const DEMO_BILLS = [
  buildBill({ seq: 4, daysAgo: 1, clientId: 'client_demo_4', lines: [['prod_demo_7', 10], ['prod_demo_8', 20]], paid: 0, mode: 'bank-transfer', notes: 'Inter-state supply (IGST).' }),
  buildBill({ seq: 3, daysAgo: 2, clientId: 'client_demo_2', lines: [['prod_demo_4', 8], ['prod_demo_3', 40], ['prod_demo_6', 6]], paid: 1000, mode: 'cash', notes: 'Balance on next delivery.' }),
  buildBill({ seq: 2, daysAgo: 3, clientId: 'client_demo_3', lines: [['prod_demo_6', 4], ['prod_demo_5', 6]], paid: 0, mode: 'cash', notes: 'Payment due within 15 days.' }),
  buildBill({ seq: 1, daysAgo: 4, clientId: 'client_demo_1', lines: [['prod_demo_1', 5], ['prod_demo_2', 10]], paid: 'full', mode: 'upi', notes: 'Thank you for your business!' }),
];

// Counter continues after the samples so a new demo invoice is INV/<FY>/0005.
export const DEMO_LAST_INVOICE_SEQ = 4;

export const DEMO_EXPENSES = [
  { id: 'exp_demo_1', date: isoDaysAgo(4), category: 'Shipping & Courier', description: 'Tempo delivery freight charges', amount: 850, gstAmount: '', gstPercent: '', paymentMode: 'Cash', vendorName: 'Murugan Transports', note: '' },
  { id: 'exp_demo_2', date: isoDaysAgo(6), category: 'Utilities', description: 'TNEB power bill (shop)', amount: 1420, gstAmount: '', gstPercent: '', paymentMode: 'UPI', vendorName: 'TANGEDCO', note: '' },
];
