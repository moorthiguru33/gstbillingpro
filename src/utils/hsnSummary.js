// GSTR-1 Table 12 (HSN-wise summary) aggregation — pure, unit-tested in
// scripts/hsn-summary-test.mjs, used by both the on-screen table and the
// CSV export so the two can never disagree.
//
// Rows are grouped by HSN + GST rate + UQC (the portal's key). HSN codes
// are normalised ("4802 " / "48 02" -> "4802") so one code gives one row.
// Items with no valid HSN/SAC are collected in ONE "Missing HSN" row per
// rate/UQC, listed last and flagged, instead of disappearing among "N/A"
// rows or being split per product.

import { getUnitUQC } from '../utils.js';
import { suggestGstRate } from './hsnRates.js';

export const normalizeHsn = (raw) => {
  const s = String(raw ?? '').replace(/[\s.-]+/g, '').toUpperCase();
  return /^\d{4}(?:\d{2}){0,2}$/.test(s) ? s : '';
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {Array} bills      bills with .data.items
 * @param {Object} fns
 *   split(item, bill)  -> { taxable, cgst, sgst, utgst, igst, cess }
 *   sign(bill)         -> +1 / -1 (credit notes reduce the row)
 */
export function buildHsnSummary(bills, { split, sign = () => 1 }) {
  const map = new Map();
  for (const bill of bills || []) {
    const items = bill?.data?.items || [];
    const sg = sign(bill);
    for (const item of items) {
      if (!item) continue;
      const hsn = normalizeHsn(item.hsn);
      const rate = Number(item.taxPercent ?? item.taxRate) || 0;
      const uqc = getUnitUQC(item.unit) || 'OTH';
      const key = `${hsn || 'MISSING'}|${rate}|${uqc}`;
      let row = map.get(key);
      if (!row) {
        row = {
          key, hsn, missing: !hsn, rate, uqc,
          description: '', names: new Map(), invoices: new Set(),
          quantity: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, totalTax: 0, totalValue: 0,
        };
        map.set(key, row);
      }
      const s = split(item, bill);
      const sgstBucket = (s.sgst || 0) + (s.utgst || 0); // GSTN 'samt' covers UTGST
      const tax = (s.cgst || 0) + sgstBucket + (s.igst || 0) + (s.cess || 0);
      row.quantity += sg * (Number(item.quantity) || 0);
      row.taxable += sg * (s.taxable || 0);
      row.cgst += sg * (s.cgst || 0);
      row.sgst += sg * sgstBucket;
      row.igst += sg * (s.igst || 0);
      row.cess += sg * (s.cess || 0);
      row.totalTax += sg * tax;
      row.totalValue += sg * ((s.taxable || 0) + tax);
      const nm = String(item.name || '').trim();
      if (nm) row.names.set(nm, (row.names.get(nm) || 0) + 1);
      if (bill.invoiceNumber) row.invoices.add(bill.invoiceNumber);
    }
  }

  const rows = [...map.values()].map((row) => {
    const topName = [...row.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const description = row.missing
      ? `Missing HSN/SAC — ${row.names.size} item${row.names.size === 1 ? '' : 's'} on ${row.invoices.size} invoice${row.invoices.size === 1 ? '' : 's'}`
      : (suggestGstRate(row.hsn)?.label || topName);
    return {
      key: row.key, hsn: row.hsn, missing: row.missing, rate: row.rate, uqc: row.uqc,
      description,
      itemNames: [...row.names.keys()],
      invoiceNumbers: [...row.invoices],
      quantity: r2(row.quantity), taxable: r2(row.taxable), cgst: r2(row.cgst), sgst: r2(row.sgst),
      igst: r2(row.igst), cess: r2(row.cess), totalTax: r2(row.totalTax), totalValue: r2(row.totalValue),
    };
  });

  rows.sort((a, b) => {
    if (a.missing !== b.missing) return a.missing ? 1 : -1;
    return a.hsn.localeCompare(b.hsn) || a.rate - b.rate || a.uqc.localeCompare(b.uqc);
  });
  return rows;
}
