// Quick-pick tiles for the phone POS: the most-sold products (by quantity in
// recent bills), topped up with the rest of the catalogue in its own order.
const key = (s) => String(s || '').trim().toLowerCase();

export function topSellers(bills = [], products = [], n = 12) {
  const qty = new Map();
  for (const b of bills.slice(0, 500)) {
    if (!b || b.status === 'cancelled' || b.invoiceType === 'credit-note' || b.invoiceType === 'quotation') continue;
    for (const it of b.items || b.data?.items || []) {
      const k = key(it.name);
      if (k) qty.set(k, (qty.get(k) || 0) + (Number(it.quantity ?? it.qty) || 1));
    }
  }
  const sold = products.filter(p => qty.has(key(p.name))).sort((a, b) => qty.get(key(b.name)) - qty.get(key(a.name)));
  const ids = new Set(sold.map(p => p.id));
  return [...sold, ...products.filter(p => !ids.has(p.id))].slice(0, n);
}

/** Cash keypad: applies one key to the tendered string. */
export function keypad(cur, k) {
  const s = String(cur || '');
  if (k === 'C') return '';
  if (k === 'back') return s.slice(0, -1);
  if (k === '.') return s.includes('.') ? s : (s || '0') + '.';
  const next = s === '0' ? k : s + k;
  const dec = next.split('.')[1];
  if (dec && dec.length > 2) return s;
  return next.length > 9 ? s : next;
}
