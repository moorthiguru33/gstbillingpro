// The invoice screen takes its paper size from the invoice defaults (browser
// copy + server copy, server wins) and Fast POS from its own browser key,
// not from print settings. Writing it only to print settings meant a
// business-type choice ("Retail / Kirana -> 80mm thermal") did nothing.
import { getInvoiceDisplayOptions, saveInvoiceDisplayOptions } from '../store';

export async function setDefaultPaperSize(paperSize) {
  if (!paperSize) return;
  try {
    const local = JSON.parse(localStorage.getItem('freegstbill_invoiceOptions') || '{}');
    localStorage.setItem('freegstbill_invoiceOptions', JSON.stringify({ ...local, paperSize }));
    localStorage.setItem('gst_pos_paperSize', paperSize);
  } catch { /* private window: server copy below still applies */ }
  try {
    const server = (await getInvoiceDisplayOptions()) || {};
    await saveInvoiceDisplayOptions({ ...server, paperSize });
  } catch { /* offline: the browser copy above still applies */ }
}
