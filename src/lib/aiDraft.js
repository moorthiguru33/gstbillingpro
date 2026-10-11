const num = (v) => Number(v) || 0;

/** AI voice / photo result -> invoice editor draft. */
export function aiToDraft({ items = [], customer }) {
  const rows = items.map((it, i) => ({
    id: `item_${Date.now().toString(36)}_${i}`, productId: it.product?.id, name: it.product?.name || it.name, hsn: it.hsn || it.product?.hsn || '',
    quantity: num(it.qty) || 1, unit: it.unit || it.product?.unit || 'NOS', rate: num(it.rate || it.product?.sellingPrice || it.product?.rate),
    mrp: num(it.product?.mrp), discount: 0, taxPercent: num(it.gst ?? it.product?.taxPercent), cessPercent: 0,
  }));
  const client = { name: customer?.name || '', phone: customer?.phone || '', address: '' };
  return { _isDuplicate: true, clientName: client.name, invoiceType: 'tax-invoice', data: { client, items: rows, details: {}, invoiceType: 'tax-invoice' } };
}

