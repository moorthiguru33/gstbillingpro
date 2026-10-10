// v1.10.31 — Single WhatsApp URL opener used by Dashboard, ClientsView,
// InvoiceGenerator (share button + payment reminder). Prior to this the
// same 4-line snippet — sanitize phone, encode message, pick wa.me route,
// window.open with noopener — was inlined at every call site. When a bug
// showed up ("share opens in same tab" or "phone with + prefix breaks the
// url") it had to be fixed in every copy. Now: one function, one bug fix
// spot.
//
// Kept intentionally narrow: only the URL open. Caller composes the
// message because those legitimately differ (Dashboard has rich
// payment-status caption, ClientsView has a minimal blurb, invoice-form
// has totals). Attempting to unify the message text would collapse three
// UX-tuned strings into one lowest-common-denominator string.

/**
 * Sanitize a phone number for a WhatsApp deep-link: digits only, with the
 * country code. Indian numbers are usually saved without it ("98765 43210",
 * "098765 43210"), which WhatsApp read as a foreign number, so a bare
 * 10-digit mobile gets 91 in front. Returns '' when it is not a usable
 * number (caller then asks, or opens the contact picker).
 */
export function sanitizeWhatsAppPhone(phone, defaultCountryCode = '91') {
  if (!phone) return '';
  let d = String(phone).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);               // 0091…
  if (defaultCountryCode === '91') {
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1); // 0 + 10-digit mobile
    if (d.length === 10 && /^[6-9]/.test(d)) d = `91${d}`;
  }
  if (d.length < 8 || d.length > 15) return '';
  return d;
}

/**
 * Open a URL in a new tab IN THE FOREGROUND. `window.open(url, '_blank',
 * 'noopener')` (the old call) returns null and some browsers treat the
 * feature string as "open a popup window", which then lands behind the
 * app. Open plainly, cut the opener link, focus it; if the popup was
 * blocked, fall back to a real link click.
 */
export function openInNewTab(url) {
  let w = null;
  try { w = window.open(url, '_blank'); } catch { w = null; }
  if (w) {
    try { w.opener = null; } catch { /* cross-origin already */ }
    try { w.focus(); } catch { /* ignore */ }
    return w;
  }
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch { /* nothing else we can do */ }
  return null;
}

export function whatsAppUrl(phone, message) {
  const clean = sanitizeWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message || '');
  return clean ? `https://wa.me/${clean}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/**
 * Open WhatsApp with the given phone (optional) and prefilled message, in
 * a new foreground tab so the user's current invoice / draft isn't lost
 * (GH #12).
 *
 * @param {string|null|undefined} phone — recipient phone; empty → contact picker
 * @param {string} message — plain text (WhatsApp caption); may include *bold*
 */
export function openWhatsAppShare(phone, message) {
  return openInNewTab(whatsAppUrl(phone, message));
}

/**
 * Like openWhatsAppShare, but when the customer has no usable phone number
 * it first asks for one (blank = pick the contact inside WhatsApp).
 * `ask` is an async prompt (ConfirmModal's promptAction). Resolves to the
 * number used ('' for the picker) or null when the user cancelled.
 */
export async function shareOnWhatsApp({ phone, message, ask, customerName }) {
  let number = sanitizeWhatsAppPhone(phone);
  if (!number && typeof ask === 'function') {
    const raw = await ask({
      title: 'Customer WhatsApp number',
      message: `${customerName ? `${customerName} has` : 'This customer has'} no mobile number saved. Enter it to send directly, or leave blank to choose the contact in WhatsApp.`,
      defaultValue: phone || '',
      placeholder: 'e.g. 98765 43210',
      inputType: 'tel',
      confirmLabel: 'Open WhatsApp',
    });
    if (raw === null || raw === undefined) return null;
    number = sanitizeWhatsAppPhone(raw);
    if (String(raw).trim() && !number) {
      // Typed something unusable — still open WhatsApp, let them pick.
      number = '';
    }
  }
  openWhatsAppShare(number, message);
  return number;
}
