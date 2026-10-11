// ============================================================
// Public bill page (/b/<token>) — pure helpers (rendered by
// functions/b/[token].js, unit-tested in scripts/staff-test.mjs).
// ============================================================
import { esc } from './email-templates.js';

export const BILL_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
export const SIGNED_URL_SECONDS = 3600;

const T = {
  en: { invoice: 'Invoice', from: 'From', to: 'To', amount: 'Bill amount', due: 'Balance due', view: 'View bill (PDF)', download: 'Download PDF', pay: 'Pay {{amount}} with UPI', upiId: 'UPI ID', payNote: 'Opens GPay, PhonePe, Paytm or any UPI app on your phone.', paid: 'This bill is fully paid. Thank you!', gone: 'This bill link has expired or is not valid. Please ask the shop to send it again.', footer: 'Bill shared using GST Billing Pro' },
  hi: { invoice: 'बिल', from: 'विक्रेता', to: 'ग्राहक', amount: 'बिल राशि', due: 'बकाया राशि', view: 'बिल देखें (PDF)', download: 'PDF डाउनलोड करें', pay: 'UPI से {{amount}} भुगतान करें', upiId: 'UPI ID', payNote: 'आपके फ़ोन में GPay, PhonePe, Paytm या कोई भी UPI ऐप खुलेगा।', paid: 'इस बिल का पूरा भुगतान हो चुका है। धन्यवाद!', gone: 'यह बिल लिंक समाप्त हो गया है या सही नहीं है। कृपया दुकान से दोबारा भेजने को कहें।', footer: 'GST Billing Pro से भेजा गया बिल' },
  ta: { invoice: 'பில்', from: 'விற்பனையாளர்', to: 'வாடிக்கையாளர்', amount: 'பில் தொகை', due: 'நிலுவைத் தொகை', view: 'பில்லைப் பார்க்க (PDF)', download: 'PDF பதிவிறக்கு', pay: 'UPI மூலம் {{amount}} செலுத்துக', upiId: 'UPI ID', payNote: 'உங்கள் போனில் GPay, PhonePe, Paytm அல்லது ஏதேனும் UPI ஆப் திறக்கும்.', paid: 'இந்த பில் முழுமையாகச் செலுத்தப்பட்டது. நன்றி!', gone: 'இந்த பில் இணைப்பு காலாவதியானது அல்லது செல்லாது. கடையிடம் மீண்டும் அனுப்பச் சொல்லுங்கள்.', footer: 'GST Billing Pro மூலம் பகிரப்பட்ட பில்' },
  te: { invoice: 'బిల్', from: 'విక్రేత', to: 'కస్టమర్', amount: 'బిల్ మొత్తం', due: 'బాకీ మొత్తం', view: 'బిల్ చూడండి (PDF)', download: 'PDF డౌన్‌లోడ్', pay: 'UPI తో {{amount}} చెల్లించండి', upiId: 'UPI ID', payNote: 'మీ ఫోన్‌లో GPay, PhonePe, Paytm లేదా ఏదైనా UPI యాప్ తెరుచుకుంటుంది.', paid: 'ఈ బిల్ పూర్తిగా చెల్లించబడింది. ధన్యవాదాలు!', gone: 'ఈ బిల్ లింక్ గడువు ముగిసింది లేదా చెల్లదు. దయచేసి దుకాణాన్ని మళ్లీ పంపమని అడగండి.', footer: 'GST Billing Pro ద్వారా పంపిన బిల్' },
  kn: { invoice: 'ಬಿಲ್', from: 'ಮಾರಾಟಗಾರ', to: 'ಗ್ರಾಹಕ', amount: 'ಬಿಲ್ ಮೊತ್ತ', due: 'ಬಾಕಿ ಮೊತ್ತ', view: 'ಬಿಲ್ ನೋಡಿ (PDF)', download: 'PDF ಡೌನ್‌ಲೋಡ್', pay: 'UPI ಮೂಲಕ {{amount}} ಪಾವತಿಸಿ', upiId: 'UPI ID', payNote: 'ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲಿ GPay, PhonePe, Paytm ಅಥವಾ ಯಾವುದೇ UPI ಆ್ಯಪ್ ತೆರೆಯುತ್ತದೆ.', paid: 'ಈ ಬಿಲ್ ಸಂಪೂರ್ಣವಾಗಿ ಪಾವತಿಯಾಗಿದೆ. ಧನ್ಯವಾದ!', gone: 'ಈ ಬಿಲ್ ಲಿಂಕ್ ಅವಧಿ ಮುಗಿದಿದೆ ಅಥವಾ ಮಾನ್ಯವಲ್ಲ. ಅಂಗಡಿಯವರನ್ನು ಮತ್ತೆ ಕಳುಹಿಸಲು ಕೇಳಿ.', footer: 'GST Billing Pro ಮೂಲಕ ಹಂಚಿದ ಬಿಲ್' },
  ml: { invoice: 'ബിൽ', from: 'വിൽപ്പനക്കാരൻ', to: 'ഉപഭോക്താവ്', amount: 'ബിൽ തുക', due: 'ബാക്കി തുക', view: 'ബിൽ കാണുക (PDF)', download: 'PDF ഡൗൺലോഡ്', pay: 'UPI വഴി {{amount}} അടയ്ക്കുക', upiId: 'UPI ID', payNote: 'നിങ്ങളുടെ ഫോണിൽ GPay, PhonePe, Paytm അല്ലെങ്കിൽ ഏതെങ്കിലും UPI ആപ്പ് തുറക്കും.', paid: 'ഈ ബിൽ പൂർണ്ണമായി അടച്ചു. നന്ദി!', gone: 'ഈ ബിൽ ലിങ്ക് കാലഹരണപ്പെട്ടു അല്ലെങ്കിൽ സാധുവല്ല. കടയോട് വീണ്ടും അയയ്ക്കാൻ ആവശ്യപ്പെടുക.', footer: 'GST Billing Pro വഴി പങ്കിട്ട ബിൽ' },
  mr: { invoice: 'बिल', from: 'विक्रेता', to: 'ग्राहक', amount: 'बिलाची रक्कम', due: 'बाकी रक्कम', view: 'बिल पाहा (PDF)', download: 'PDF डाउनलोड करा', pay: 'UPI ने {{amount}} भरा', upiId: 'UPI ID', payNote: 'तुमच्या फोनवर GPay, PhonePe, Paytm किंवा कोणतेही UPI ॲप उघडेल.', paid: 'या बिलाचे पूर्ण पेमेंट झाले आहे. धन्यवाद!', gone: 'ही बिल लिंक कालबाह्य झाली आहे किंवा वैध नाही. कृपया दुकानाला पुन्हा पाठवायला सांगा.', footer: 'GST Billing Pro द्वारे पाठवलेले बिल' },
  bn: { invoice: 'বিল', from: 'বিক্রেতা', to: 'ক্রেতা', amount: 'বিলের পরিমাণ', due: 'বকেয়া', view: 'বিল দেখুন (PDF)', download: 'PDF ডাউনলোড', pay: 'UPI দিয়ে {{amount}} পেমেন্ট করুন', upiId: 'UPI ID', payNote: 'আপনার ফোনে GPay, PhonePe, Paytm বা যেকোনো UPI অ্যাপ খুলবে।', paid: 'এই বিল সম্পূর্ণ পরিশোধিত। ধন্যবাদ!', gone: 'এই বিলের লিংকের মেয়াদ শেষ বা বৈধ নয়। দোকানকে আবার পাঠাতে বলুন।', footer: 'GST Billing Pro দিয়ে পাঠানো বিল' },
  gu: { invoice: 'બિલ', from: 'વેચનાર', to: 'ગ્રાહક', amount: 'બિલની રકમ', due: 'બાકી રકમ', view: 'બિલ જુઓ (PDF)', download: 'PDF ડાઉનલોડ કરો', pay: 'UPI થી {{amount}} ચૂકવો', upiId: 'UPI ID', payNote: 'તમારા ફોનમાં GPay, PhonePe, Paytm કે કોઈપણ UPI એપ ખૂલશે.', paid: 'આ બિલ સંપૂર્ણ ચૂકવાઈ ગયું છે. આભાર!', gone: 'આ બિલ લિંકની મુદત પૂરી થઈ છે અથવા માન્ય નથી. કૃપા કરી દુકાનને ફરી મોકલવા કહો.', footer: 'GST Billing Pro દ્વારા મોકલેલું બિલ' },
};
export const BILL_PAGE_LANGS = Object.keys(T);

export function formatInr(n, currency = 'INR') {
  const v = Number(n) || 0;
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v); }
  catch { return `₹${v.toFixed(2)}`; }
}

const UPI_VPA_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$/;
/** upi:// deep link, or null when no valid VPA / nothing to pay. */
export function upiPayUrl({ upiId, payee, amount, note }) {
  if (!upiId || !UPI_VPA_RE.test(String(upiId).trim())) return null;
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) return null;
  const p = new URLSearchParams({ pa: String(upiId).trim(), pn: String(payee || '').slice(0, 50), am: amt.toFixed(2), cu: 'INR' });
  if (note) p.set('tn', String(note).slice(0, 50));
  return `upi://pay?${p.toString()}`;
}

export function renderBillPage(link, { viewUrl, downloadUrl } = {}) {
  const lang = BILL_PAGE_LANGS.includes(link?.lang) ? link.lang : 'en';
  const t = T[lang];
  const shell = (inner, title) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>body{margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans',sans-serif;color:#0f172a}main{max-width:480px;margin:0 auto;padding:20px}.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 4px 18px rgba(15,23,42,.08)}h1{font-size:1.25rem;margin:0 0 4px}.muted{color:#64748b;font-size:.9rem}.row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #e2e8f0}.big{font-size:1.6rem;font-weight:800}.btn{display:block;text-align:center;text-decoration:none;font-weight:700;border-radius:12px;padding:14px;margin-top:12px;font-size:1rem}.pri{background:#16a34a;color:#fff}.sec{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}.ok{background:#ecfdf5;color:#065f46;border-radius:12px;padding:12px;margin-top:12px}footer{text-align:center;color:#94a3b8;font-size:.75rem;margin-top:18px}</style></head><body><main>${inner}<footer>${esc(t.footer)}</footer></main></body></html>`;
  if (!link) return shell(`<div class="card"><p>${esc(t.gone)}</p></div>`, t.invoice);
  const cur = link.currency || 'INR';
  const due = link.amount_due != null ? Number(link.amount_due) : Number(link.amount);
  const upi = cur === 'INR' ? upiPayUrl({ upiId: link.upi_id, payee: link.upi_name || link.business_name, amount: due, note: `${t.invoice} ${link.invoice_number || ''}`.trim() }) : null;
  const inner = `<div class="card">
<div class="muted">${esc(t.from)}</div><h1>${esc(link.business_name || '')}</h1>
<div class="row"><span>${esc(t.invoice)}</span><strong>${esc(link.invoice_number || '')}</strong></div>
${link.client_name ? `<div class="row"><span>${esc(t.to)}</span><span>${esc(link.client_name)}</span></div>` : ''}
<div class="row"><span>${esc(t.amount)}</span><span>${esc(formatInr(link.amount, cur))}</span></div>
<div class="row"><span>${esc(t.due)}</span><span class="big">${esc(formatInr(Math.max(0, due), cur))}</span></div>
${viewUrl ? `<a class="btn sec" href="${esc(viewUrl)}" rel="noopener">📄 ${esc(t.view)}</a>` : ''}
${downloadUrl ? `<a class="btn sec" href="${esc(downloadUrl)}" rel="noopener">⬇️ ${esc(t.download)}</a>` : ''}
${due > 0.005 && upi ? `<a class="btn pri" href="${esc(upi)}">💸 ${esc(t.pay.replace('{{amount}}', formatInr(due, cur)))}</a><p class="muted">${esc(t.payNote)}<br>${esc(t.upiId)}: <strong>${esc(link.upi_id)}</strong></p>` : ''}
${due <= 0.005 ? `<div class="ok">✅ ${esc(t.paid)}</div>` : ''}
</div>`;
  return shell(inner, `${t.invoice} ${link.invoice_number || ''} · ${link.business_name || ''}`);
}

export const BILL_PAGE_HEADERS = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
});
