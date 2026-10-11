// ============================================================
// Online Store — pure helpers shared by the public shop page
// (functions/s/[slug].js), the order API (functions/api/store/order.js)
// and the app (src/components/store/*). Unit tested in
// scripts/store-test.mjs.
// ============================================================
import { esc } from './email-templates.js';
import { normalizePhone } from './staff.js';
import { formatInr } from './bill-link.js';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const RESERVED_SLUGS = Object.freeze(['admin', 'api', 'app', 'www', 'shop', 'store', 'login', 'signup', 'support', 'help', 'gstbillingpro', 'test']);
export const ORDER_LIMITS = Object.freeze({ maxItems: 50, maxQty: 999, ipPer10Min: 5, shopPerHour: 60, maxBody: 20000 });
export const ORDER_STATUSES = Object.freeze(['new', 'confirmed', 'invoiced', 'cancelled']);

/** "Sri Murugan Stores!" -> "sri-murugan-stores" (3-40 chars, or '' when unusable). */
export function slugify(name) {
  const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return s.length >= 3 ? s : '';
}
export const isValidSlug = (s) => typeof s === 'string' && SLUG_RE.test(s) && !RESERVED_SLUGS.includes(s);

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
const okChar = (c) => { const n = c.charCodeAt(0); return n === 9 || n === 10 || n === 13 || (n >= 32 && n !== 127); };
const cleanText = (s, max) => [...String(s ?? '')].filter(okChar).join('').trim().slice(0, max);

/** Product row (products table or app object) -> public catalogue entry, or null when hidden. */
export function catalogueItem(p, shop = {}) {
  if (!p || !p.id) return null;
  const d = p.data && typeof p.data === 'object' ? { ...p.data, ...p, data: undefined } : p;
  const cfg = shop.products?.[p.id] || {};
  if (cfg.hidden) return null;
  if (shop.visibility === 'selected' && !cfg.shown) return null;
  const price = round2(num(d.sellingPrice ?? d.rate ?? d.price));
  if (!(price > 0)) return null;
  const stockRaw = d.stock;
  const tracked = stockRaw !== null && stockRaw !== undefined && stockRaw !== '';
  const mrp = round2(num(d.mrp));
  return {
    id: String(p.id),
    name: cleanText(d.name, 120) || 'Item',
    price,
    mrp: mrp > price ? mrp : 0,
    unit: cleanText(d.unit, 12),
    category: cleanText(d.category, 60),
    image: typeof cfg.image === 'string' && /^https:\/\//.test(cfg.image) ? cfg.image : '',
    desc: cleanText(cfg.desc || '', 200),
    inStock: !tracked || num(stockRaw) > 0,
  };
}

export function buildCatalogue(products, shop = {}) {
  const items = (products || []).map(p => catalogueItem(p, shop)).filter(Boolean);
  if (shop.showOutOfStock === false) {
    for (let i = items.length - 1; i >= 0; i--) if (!items[i].inStock) items.splice(i, 1);
  }
  items.sort((a, b) => (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name));
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
  return { items, categories };
}

/**
 * Validates an order from the public page against the catalogue (prices
 * always come from the server-side catalogue). Returns { ok, order } or
 * { ok:false, code }.
 */
export function validateOrder(body, catalogue) {
  if (!body || typeof body !== 'object') return { ok: false, code: 'bad_request' };
  if (body.website) return { ok: false, code: 'spam' }; // honeypot
  const name = cleanText(body.name, 80);
  if (!name) return { ok: false, code: 'need_name' };
  const phone = normalizePhone(body.phone);
  if (!phone) return { ok: false, code: 'need_phone' };
  const list = Array.isArray(body.items) ? body.items : [];
  if (!list.length) return { ok: false, code: 'empty' };
  if (list.length > ORDER_LIMITS.maxItems) return { ok: false, code: 'too_many_items' };
  const byId = new Map((catalogue?.items || []).map(i => [i.id, i]));
  const merged = new Map();
  for (const it of list) {
    const id = String(it?.id ?? '');
    const qty = Math.floor(num(it?.qty));
    const item = byId.get(id);
    if (!item) return { ok: false, code: 'unknown_item' };
    if (!item.inStock) return { ok: false, code: 'out_of_stock' };
    if (qty < 1 || qty > ORDER_LIMITS.maxQty) return { ok: false, code: 'bad_qty' };
    merged.set(id, Math.min(ORDER_LIMITS.maxQty, (merged.get(id) || 0) + qty));
  }
  const items = [...merged].map(([id, qty]) => {
    const it = byId.get(id);
    return { id, name: it.name, unit: it.unit, price: it.price, qty, amount: round2(it.price * qty) };
  });
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  return {
    ok: true,
    order: { name, phone, address: cleanText(body.address, 300), note: cleanText(body.note, 300), items, total },
  };
}

/** Rate limit decision from recent order counts. */
export function rateLimitOk({ ipRecent = 0, shopRecent = 0 } = {}) {
  if (ipRecent >= ORDER_LIMITS.ipPer10Min) return { ok: false, code: 'rate_ip' };
  if (shopRecent >= ORDER_LIMITS.shopPerHour) return { ok: false, code: 'rate_shop' };
  return { ok: true };
}

/** W251011-7KQ4 style order number. */
export function makeOrderNo(now = new Date(), rand = Math.random) {
  const ist = new Date(now.getTime() + 330 * 60000);
  const d = ist.toISOString().slice(2, 10).replace(/-/g, '');
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 4; i++) r += A[Math.floor(rand() * A.length)];
  return `W${d}-${r}`;
}

// ---------------------------------------------------------------- page text
export const SHOP_T = {
  en: { orderOnline: 'Order online', search: 'Search products', all: 'All', add: 'Add', outOfStock: 'Out of stock', cart: 'Your order', items: '{{n}} items', viewCart: 'View order', total: 'Total', name: 'Your name', phone: 'Mobile number', address: 'Delivery address (optional)', note: 'Note for the shop (optional)', send: 'Send order on WhatsApp', sending: 'Sending…', sent: 'Order {{no}} sent! The shop will confirm on WhatsApp.', pay: 'Pay {{amount}} by UPI', empty: 'Your order is empty', notFound: 'This shop is not available right now.', call: 'Call', whatsapp: 'WhatsApp', errName: 'Please enter your name', errPhone: 'Please enter a valid mobile number', errBusy: 'Too many orders right now. Please try again in a few minutes.', errGeneric: 'Could not save the order. It will still be sent on WhatsApp.', close: 'Close', powered: 'Online store by GST Billing Pro', newOrder: 'New order', qty: 'Qty', mrp: 'MRP', noResults: 'No products found' },
  hi: { orderOnline: 'ऑनलाइन ऑर्डर करें', search: 'प्रोडक्ट खोजें', all: 'सभी', add: 'जोड़ें', outOfStock: 'स्टॉक में नहीं', cart: 'आपका ऑर्डर', items: '{{n}} आइटम', viewCart: 'ऑर्डर देखें', total: 'कुल', name: 'आपका नाम', phone: 'मोबाइल नंबर', address: 'डिलीवरी पता (वैकल्पिक)', note: 'दुकान के लिए नोट (वैकल्पिक)', send: 'WhatsApp पर ऑर्डर भेजें', sending: 'भेजा जा रहा है…', sent: 'ऑर्डर {{no}} भेज दिया गया! दुकान WhatsApp पर पुष्टि करेगी।', pay: 'UPI से {{amount}} भुगतान करें', empty: 'आपका ऑर्डर खाली है', notFound: 'यह दुकान अभी उपलब्ध नहीं है।', call: 'कॉल', whatsapp: 'WhatsApp', errName: 'कृपया अपना नाम लिखें', errPhone: 'कृपया सही मोबाइल नंबर लिखें', errBusy: 'अभी बहुत ज़्यादा ऑर्डर हैं। कृपया कुछ मिनट बाद कोशिश करें।', errGeneric: 'ऑर्डर सेव नहीं हो सका। फिर भी यह WhatsApp पर भेजा जाएगा।', close: 'बंद करें', powered: 'GST Billing Pro द्वारा ऑनलाइन स्टोर', newOrder: 'नया ऑर्डर', qty: 'मात्रा', mrp: 'MRP', noResults: 'कोई प्रोडक्ट नहीं मिला' },
  ta: { orderOnline: 'ஆன்லைனில் ஆர்டர் செய்யுங்கள்', search: 'பொருட்களைத் தேடுங்கள்', all: 'அனைத்தும்', add: 'சேர்', outOfStock: 'இருப்பு இல்லை', cart: 'உங்கள் ஆர்டர்', items: '{{n}} பொருட்கள்', viewCart: 'ஆர்டரைப் பார்க்க', total: 'மொத்தம்', name: 'உங்கள் பெயர்', phone: 'மொபைல் எண்', address: 'டெலிவரி முகவரி (விருப்பம்)', note: 'கடைக்கான குறிப்பு (விருப்பம்)', send: 'WhatsApp-ல் ஆர்டர் அனுப்பு', sending: 'அனுப்புகிறது…', sent: 'ஆர்டர் {{no}} அனுப்பப்பட்டது! கடை WhatsApp-ல் உறுதி செய்யும்.', pay: 'UPI மூலம் {{amount}} செலுத்துங்கள்', empty: 'உங்கள் ஆர்டர் காலியாக உள்ளது', notFound: 'இந்தக் கடை இப்போது கிடைக்கவில்லை.', call: 'அழை', whatsapp: 'WhatsApp', errName: 'உங்கள் பெயரை உள்ளிடவும்', errPhone: 'சரியான மொபைல் எண்ணை உள்ளிடவும்', errBusy: 'இப்போது அதிக ஆர்டர்கள் உள்ளன. சில நிமிடங்கள் கழித்து முயற்சிக்கவும்.', errGeneric: 'ஆர்டரைச் சேமிக்க முடியவில்லை. இருந்தாலும் WhatsApp-ல் அனுப்பப்படும்.', close: 'மூடு', powered: 'GST Billing Pro ஆன்லைன் ஸ்டோர்', newOrder: 'புதிய ஆர்டர்', qty: 'அளவு', mrp: 'MRP', noResults: 'பொருட்கள் எதுவும் இல்லை' },
  te: { orderOnline: 'ఆన్‌లైన్‌లో ఆర్డర్ చేయండి', search: 'ఉత్పత్తులు వెతకండి', all: 'అన్నీ', add: 'జోడించు', outOfStock: 'స్టాక్ లేదు', cart: 'మీ ఆర్డర్', items: '{{n}} వస్తువులు', viewCart: 'ఆర్డర్ చూడండి', total: 'మొత్తం', name: 'మీ పేరు', phone: 'మొబైల్ నంబర్', address: 'డెలివరీ చిరునామా (ఐచ్ఛికం)', note: 'దుకాణానికి గమనిక (ఐచ్ఛికం)', send: 'WhatsApp లో ఆర్డర్ పంపండి', sending: 'పంపుతోంది…', sent: 'ఆర్డర్ {{no}} పంపబడింది! దుకాణం WhatsApp లో నిర్ధారిస్తుంది.', pay: 'UPI తో {{amount}} చెల్లించండి', empty: 'మీ ఆర్డర్ ఖాళీగా ఉంది', notFound: 'ఈ దుకాణం ప్రస్తుతం అందుబాటులో లేదు.', call: 'కాల్', whatsapp: 'WhatsApp', errName: 'దయచేసి మీ పేరు నమోదు చేయండి', errPhone: 'దయచేసి సరైన మొబైల్ నంబర్ నమోదు చేయండి', errBusy: 'ప్రస్తుతం చాలా ఆర్డర్లు ఉన్నాయి. కొన్ని నిమిషాల తర్వాత ప్రయత్నించండి.', errGeneric: 'ఆర్డర్ సేవ్ కాలేదు. అయినా WhatsApp లో పంపబడుతుంది.', close: 'మూసివేయి', powered: 'GST Billing Pro ఆన్‌లైన్ స్టోర్', newOrder: 'కొత్త ఆర్డర్', qty: 'పరిమాణం', mrp: 'MRP', noResults: 'ఉత్పత్తులు ఏవీ లేవు' },
  kn: { orderOnline: 'ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಆರ್ಡರ್ ಮಾಡಿ', search: 'ಉತ್ಪನ್ನಗಳನ್ನು ಹುಡುಕಿ', all: 'ಎಲ್ಲಾ', add: 'ಸೇರಿಸಿ', outOfStock: 'ಸ್ಟಾಕ್ ಇಲ್ಲ', cart: 'ನಿಮ್ಮ ಆರ್ಡರ್', items: '{{n}} ಐಟಂಗಳು', viewCart: 'ಆರ್ಡರ್ ನೋಡಿ', total: 'ಒಟ್ಟು', name: 'ನಿಮ್ಮ ಹೆಸರು', phone: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ', address: 'ಡೆಲಿವರಿ ವಿಳಾಸ (ಐಚ್ಛಿಕ)', note: 'ಅಂಗಡಿಗೆ ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)', send: 'WhatsApp ನಲ್ಲಿ ಆರ್ಡರ್ ಕಳುಹಿಸಿ', sending: 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', sent: 'ಆರ್ಡರ್ {{no}} ಕಳುಹಿಸಲಾಗಿದೆ! ಅಂಗಡಿ WhatsApp ನಲ್ಲಿ ದೃಢೀಕರಿಸುತ್ತದೆ.', pay: 'UPI ಮೂಲಕ {{amount}} ಪಾವತಿಸಿ', empty: 'ನಿಮ್ಮ ಆರ್ಡರ್ ಖಾಲಿಯಾಗಿದೆ', notFound: 'ಈ ಅಂಗಡಿ ಈಗ ಲಭ್ಯವಿಲ್ಲ.', call: 'ಕರೆ', whatsapp: 'WhatsApp', errName: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರು ನಮೂದಿಸಿ', errPhone: 'ದಯವಿಟ್ಟು ಸರಿಯಾದ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ', errBusy: 'ಈಗ ತುಂಬಾ ಆರ್ಡರ್‌ಗಳಿವೆ. ಕೆಲವು ನಿಮಿಷಗಳ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.', errGeneric: 'ಆರ್ಡರ್ ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಆದರೂ WhatsApp ನಲ್ಲಿ ಕಳುಹಿಸಲಾಗುತ್ತದೆ.', close: 'ಮುಚ್ಚಿ', powered: 'GST Billing Pro ಆನ್‌ಲೈನ್ ಸ್ಟೋರ್', newOrder: 'ಹೊಸ ಆರ್ಡರ್', qty: 'ಪ್ರಮಾಣ', mrp: 'MRP', noResults: 'ಯಾವುದೇ ಉತ್ಪನ್ನ ಸಿಗಲಿಲ್ಲ' },
  ml: { orderOnline: 'ഓൺലൈനായി ഓർഡർ ചെയ്യുക', search: 'ഉൽപ്പന്നങ്ങൾ തിരയുക', all: 'എല്ലാം', add: 'ചേർക്കുക', outOfStock: 'സ്റ്റോക്കില്ല', cart: 'നിങ്ങളുടെ ഓർഡർ', items: '{{n}} ഇനങ്ങൾ', viewCart: 'ഓർഡർ കാണുക', total: 'ആകെ', name: 'നിങ്ങളുടെ പേര്', phone: 'മൊബൈൽ നമ്പർ', address: 'ഡെലിവറി വിലാസം (ഓപ്ഷണൽ)', note: 'കടയ്ക്കുള്ള കുറിപ്പ് (ഓപ്ഷണൽ)', send: 'WhatsApp-ൽ ഓർഡർ അയയ്ക്കുക', sending: 'അയയ്ക്കുന്നു…', sent: 'ഓർഡർ {{no}} അയച്ചു! കട WhatsApp-ൽ സ്ഥിരീകരിക്കും.', pay: 'UPI വഴി {{amount}} അടയ്ക്കുക', empty: 'നിങ്ങളുടെ ഓർഡർ ശൂന്യമാണ്', notFound: 'ഈ കട ഇപ്പോൾ ലഭ്യമല്ല.', call: 'വിളിക്കുക', whatsapp: 'WhatsApp', errName: 'ദയവായി നിങ്ങളുടെ പേര് നൽകുക', errPhone: 'ദയവായി ശരിയായ മൊബൈൽ നമ്പർ നൽകുക', errBusy: 'ഇപ്പോൾ ധാരാളം ഓർഡറുകളുണ്ട്. കുറച്ച് മിനിറ്റിന് ശേഷം ശ്രമിക്കുക.', errGeneric: 'ഓർഡർ സേവ് ചെയ്യാനായില്ല. എങ്കിലും WhatsApp-ൽ അയയ്ക്കും.', close: 'അടയ്ക്കുക', powered: 'GST Billing Pro ഓൺലൈൻ സ്റ്റോർ', newOrder: 'പുതിയ ഓർഡർ', qty: 'അളവ്', mrp: 'MRP', noResults: 'ഉൽപ്പന്നങ്ങളൊന്നും കണ്ടെത്തിയില്ല' },
  mr: { orderOnline: 'ऑनलाइन ऑर्डर करा', search: 'उत्पादने शोधा', all: 'सर्व', add: 'जोडा', outOfStock: 'स्टॉक संपला', cart: 'तुमची ऑर्डर', items: '{{n}} वस्तू', viewCart: 'ऑर्डर पाहा', total: 'एकूण', name: 'तुमचे नाव', phone: 'मोबाइल नंबर', address: 'डिलिव्हरी पत्ता (ऐच्छिक)', note: 'दुकानासाठी टीप (ऐच्छिक)', send: 'WhatsApp वर ऑर्डर पाठवा', sending: 'पाठवत आहे…', sent: 'ऑर्डर {{no}} पाठवली! दुकान WhatsApp वर पुष्टी करेल.', pay: 'UPI ने {{amount}} भरा', empty: 'तुमची ऑर्डर रिकामी आहे', notFound: 'हे दुकान सध्या उपलब्ध नाही.', call: 'कॉल', whatsapp: 'WhatsApp', errName: 'कृपया तुमचे नाव लिहा', errPhone: 'कृपया योग्य मोबाइल नंबर लिहा', errBusy: 'सध्या खूप ऑर्डर आहेत. काही मिनिटांनी पुन्हा प्रयत्न करा.', errGeneric: 'ऑर्डर सेव्ह झाली नाही. तरीही ती WhatsApp वर पाठवली जाईल.', close: 'बंद करा', powered: 'GST Billing Pro ऑनलाइन स्टोअर', newOrder: 'नवीन ऑर्डर', qty: 'प्रमाण', mrp: 'MRP', noResults: 'कोणतेही उत्पादन सापडले नाही' },
  bn: { orderOnline: 'অনলাইনে অর্ডার করুন', search: 'পণ্য খুঁজুন', all: 'সব', add: 'যোগ করুন', outOfStock: 'স্টকে নেই', cart: 'আপনার অর্ডার', items: '{{n}}টি আইটেম', viewCart: 'অর্ডার দেখুন', total: 'মোট', name: 'আপনার নাম', phone: 'মোবাইল নম্বর', address: 'ডেলিভারি ঠিকানা (ঐচ্ছিক)', note: 'দোকানের জন্য নোট (ঐচ্ছিক)', send: 'WhatsApp-এ অর্ডার পাঠান', sending: 'পাঠানো হচ্ছে…', sent: 'অর্ডার {{no}} পাঠানো হয়েছে! দোকান WhatsApp-এ নিশ্চিত করবে।', pay: 'UPI দিয়ে {{amount}} পেমেন্ট করুন', empty: 'আপনার অর্ডার খালি', notFound: 'এই দোকানটি এখন পাওয়া যাচ্ছে না।', call: 'কল', whatsapp: 'WhatsApp', errName: 'অনুগ্রহ করে আপনার নাম লিখুন', errPhone: 'অনুগ্রহ করে সঠিক মোবাইল নম্বর লিখুন', errBusy: 'এখন অনেক অর্ডার আসছে। কয়েক মিনিট পরে চেষ্টা করুন।', errGeneric: 'অর্ডার সেভ করা যায়নি। তবুও এটি WhatsApp-এ পাঠানো হবে।', close: 'বন্ধ করুন', powered: 'GST Billing Pro অনলাইন স্টোর', newOrder: 'নতুন অর্ডার', qty: 'পরিমাণ', mrp: 'MRP', noResults: 'কোনো পণ্য পাওয়া যায়নি' },
  gu: { orderOnline: 'ઓનલાઇન ઓર્ડર કરો', search: 'પ્રોડક્ટ શોધો', all: 'બધા', add: 'ઉમેરો', outOfStock: 'સ્ટોકમાં નથી', cart: 'તમારો ઓર્ડર', items: '{{n}} વસ્તુઓ', viewCart: 'ઓર્ડર જુઓ', total: 'કુલ', name: 'તમારું નામ', phone: 'મોબાઇલ નંબર', address: 'ડિલિવરી સરનામું (વૈકલ્પિક)', note: 'દુકાન માટે નોંધ (વૈકલ્પિક)', send: 'WhatsApp પર ઓર્ડર મોકલો', sending: 'મોકલી રહ્યા છીએ…', sent: 'ઓર્ડર {{no}} મોકલાયો! દુકાન WhatsApp પર પુષ્ટિ કરશે.', pay: 'UPI થી {{amount}} ચૂકવો', empty: 'તમારો ઓર્ડર ખાલી છે', notFound: 'આ દુકાન હાલમાં ઉપલબ્ધ નથી.', call: 'કૉલ', whatsapp: 'WhatsApp', errName: 'કૃપા કરી તમારું નામ લખો', errPhone: 'કૃપા કરી સાચો મોબાઇલ નંબર લખો', errBusy: 'હાલમાં ઘણા ઓર્ડર છે. થોડી મિનિટ પછી ફરી પ્રયાસ કરો.', errGeneric: 'ઓર્ડર સેવ થઈ શક્યો નહીં. છતાં તે WhatsApp પર મોકલાશે.', close: 'બંધ કરો', powered: 'GST Billing Pro ઓનલાઇન સ્ટોર', newOrder: 'નવો ઓર્ડર', qty: 'જથ્થો', mrp: 'MRP', noResults: 'કોઈ પ્રોડક્ટ મળી નથી' },
};
export const SHOP_LANGS = Object.keys(SHOP_T);

/** WhatsApp message for an order (also built in the browser by the page script). */
export function orderMessage(order, { lang = 'en', orderNo = '' } = {}) {
  const t = SHOP_T[lang] || SHOP_T.en;
  const lines = [`🛒 ${t.newOrder}${orderNo ? ` ${orderNo}` : ''}`, `${t.name}: ${order.name}`, `${t.phone}: ${order.phone}`, ''];
  order.items.forEach((i, n) => lines.push(`${n + 1}. ${i.name} × ${i.qty}${i.unit ? ` ${i.unit}` : ''} = ${formatInr(i.amount)}`));
  lines.push('', `${t.total}: ${formatInr(order.total)}`);
  if (order.address) lines.push(`📍 ${order.address}`);
  if (order.note) lines.push(`📝 ${order.note}`);
  return lines.join('\n');
}
export const waLink = (phone, text) => `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;

/** Public shop info from a store_shops row (only what the page may show). */
export function publicShop(row) {
  const d = row?.data || {};
  return {
    slug: row?.slug,
    name: cleanText(d.name, 100) || 'Shop',
    tagline: cleanText(d.tagline, 160),
    logo: typeof d.logo === 'string' && /^https:\/\//.test(d.logo) ? d.logo : '',
    whatsapp: normalizePhone(d.whatsapp),
    phone: normalizePhone(d.phone || d.whatsapp),
    upi: cleanText(d.upi, 80),
    address: cleanText(d.address, 300),
    city: cleanText(d.city, 60),
    lang: SHOP_LANGS.includes(d.lang) ? d.lang : 'en',
  };
}

const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function shopPageHeaders(nonce, { found = true } = {}) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': found ? 'public, max-age=60, s-maxage=60' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
}

/** Full HTML of the public shop page (SEO meta + catalogue + cart script). */
export function renderShopPage(shop, catalogue, { origin = '', nonce = '' } = {}) {
  const lang = shop?.lang || 'en';
  const t = SHOP_T[lang] || SHOP_T.en;
  const css = `*{box-sizing:border-box}body{margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans',sans-serif;color:#0f172a}a{color:inherit}
header{background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;padding:18px 16px 22px}.hd{max-width:960px;margin:0 auto;display:flex;gap:12px;align-items:center}.logo{width:56px;height:56px;border-radius:14px;background:#fff;object-fit:contain;flex-shrink:0}
h1{font-size:1.25rem;margin:0}.tag{opacity:.9;font-size:.88rem;margin-top:2px}.addr{opacity:.85;font-size:.8rem;margin-top:4px}.hbtn{display:flex;gap:8px;max-width:960px;margin:12px auto 0}.hbtn a{flex:1;text-align:center;background:rgba(255,255,255,.18);border-radius:10px;padding:9px;text-decoration:none;font-weight:700;font-size:.9rem}
main{max-width:960px;margin:0 auto;padding:12px 12px 110px}.search{width:100%;padding:12px 14px;border-radius:12px;border:1px solid #cbd5e1;font-size:1rem;background:#fff}
.cats{display:flex;gap:8px;overflow-x:auto;padding:10px 0;scrollbar-width:none}.cats button{flex:0 0 auto;border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 14px;font-weight:600;font-size:.85rem}.cats button.on{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px}.card{background:#fff;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(15,23,42,.06)}.ph{aspect-ratio:1/1;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#94a3b8}.ph img{width:100%;height:100%;object-fit:cover}
.ci{padding:9px 10px 10px;display:flex;flex-direction:column;gap:4px;flex:1}.nm{font-weight:600;font-size:.9rem;line-height:1.25}.pr{font-weight:800}.pr s{color:#94a3b8;font-weight:500;font-size:.78rem;margin-left:4px}.oos{color:#b91c1c;font-size:.8rem;font-weight:700}.ds{color:#64748b;font-size:.78rem}
.add{margin-top:auto;border:0;background:#16a34a;color:#fff;border-radius:10px;padding:9px;font-weight:700;font-size:.9rem}.step{margin-top:auto;display:flex;align-items:center;justify-content:space-between;background:#dcfce7;border-radius:10px}.step button{border:0;background:#16a34a;color:#fff;width:36px;height:36px;border-radius:10px;font-size:1.2rem;font-weight:800}.step b{min-width:28px;text-align:center}
.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -4px 18px rgba(15,23,42,.12);display:none}.bar button{width:100%;max-width:960px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;border:0;background:#16a34a;color:#fff;border-radius:12px;padding:14px 16px;font-weight:800;font-size:1rem}
.sheet{position:fixed;inset:0;background:rgba(15,23,42,.5);display:none;align-items:flex-end;justify-content:center;z-index:10}.sheet.on{display:flex}.sb{background:#fff;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px}.sb h2{margin:0 0 10px;font-size:1.1rem;display:flex;justify-content:space-between}.x{border:0;background:#f1f5f9;border-radius:10px;width:36px;height:36px;font-size:1.1rem}
.li{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0}.li .n{flex:1;font-size:.9rem}.li .step{margin:0;width:110px}.tot{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem;padding:12px 0}
input.f,textarea.f{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:1rem;margin-top:8px;font-family:inherit}.go{width:100%;margin-top:12px;border:0;background:#16a34a;color:#fff;border-radius:12px;padding:14px;font-weight:800;font-size:1rem}.go:disabled{opacity:.6}.err{color:#b91c1c;font-size:.88rem;margin-top:8px;min-height:1em}
.ok{background:#ecfdf5;color:#065f46;border-radius:12px;padding:14px;margin-top:6px}.pay{display:block;text-align:center;background:#1d4ed8;color:#fff;border-radius:12px;padding:13px;margin-top:10px;text-decoration:none;font-weight:800}.hp{position:absolute;left:-9999px}footer{text-align:center;color:#94a3b8;font-size:.75rem;padding:18px}.empty{text-align:center;color:#64748b;padding:30px}`;
  if (!shop) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.notFound)}</title><style>${css}</style></head><body><main><div class="empty">🏪<p>${esc(t.notFound)}</p></div></main><footer>${esc(t.powered)}</footer></body></html>`;
  }
  const url = `${origin}/s/${shop.slug}`;
  const desc = shop.tagline || `${t.orderOnline}: ${shop.name}${shop.city ? `, ${shop.city}` : ''}. ${catalogue.items.slice(0, 6).map(i => i.name).join(', ')}`.slice(0, 300);
  const ld = { '@context': 'https://schema.org', '@type': 'Store', name: shop.name, url, ...(shop.logo ? { image: shop.logo } : {}), ...(shop.phone ? { telephone: `+${shop.phone}` } : {}), ...(shop.address ? { address: shop.address } : {}) };
  const data = { shop: { slug: shop.slug, name: shop.name, whatsapp: shop.whatsapp, upi: shop.upi, lang }, items: catalogue.items, categories: catalogue.categories, t };
  const script = `(function(){var D=JSON.parse(document.getElementById('d').textContent),T=D.t,S=D.shop,K='gbp_cart_'+S.slug,cart={},cat='',q='';
try{cart=JSON.parse(localStorage.getItem(K)||'{}')||{}}catch(e){}
var by={};D.items.forEach(function(i){by[i.id]=i});Object.keys(cart).forEach(function(k){if(!by[k]||!by[k].inStock)delete cart[k]});
function $(s){return document.querySelector(s)}function E(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function inr(n){try{return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n)}catch(e){return '₹'+n.toFixed(2)}}
function f(s,v){return String(s).replace(/\\{\\{(\\w+)\\}\\}/g,function(_,k){return v[k]==null?'':v[k]})}
function save(){try{localStorage.setItem(K,JSON.stringify(cart))}catch(e){}}
function lines(){return Object.keys(cart).map(function(k){var i=by[k];return{id:k,name:i.name,unit:i.unit,price:i.price,qty:cart[k],amount:Math.round(i.price*cart[k]*100)/100}})}
function total(){return Math.round(lines().reduce(function(s,l){return s+l.amount},0)*100)/100}
function setQ(id,n){n=Math.max(0,Math.min(999,n));if(n)cart[id]=n;else delete cart[id];save();draw();drawCart()}
function stepper(id){var w=E('div','step'),m=E('button',null,'−'),b=E('b',null,String(cart[id])),p=E('button',null,'+');m.type=p.type='button';m.setAttribute('aria-label','-');p.setAttribute('aria-label','+');m.onclick=function(){setQ(id,cart[id]-1)};p.onclick=function(){setQ(id,cart[id]+1)};w.append(m,b,p);return w}
function draw(){var g=$('#g');g.textContent='';var ql=q.toLowerCase(),n=0;D.items.forEach(function(i){if(cat&&i.category!==cat)return;if(ql&&i.name.toLowerCase().indexOf(ql)<0)return;n++;var c=E('div','card'),ph=E('div','ph');if(i.image){var im=E('img');im.src=i.image;im.alt=i.name;im.loading='lazy';ph.append(im)}else ph.textContent='🛍️';c.append(ph);var b=E('div','ci');b.append(E('div','nm',i.name));var pr=E('div','pr',inr(i.price)+(i.unit?' / '+i.unit:''));if(i.mrp){var s=E('s',null,T.mrp+' '+inr(i.mrp));pr.append(s)}b.append(pr);if(i.desc)b.append(E('div','ds',i.desc));if(!i.inStock)b.append(E('div','oos',T.outOfStock));else if(cart[i.id])b.append(stepper(i.id));else{var a=E('button','add','+ '+T.add);a.type='button';a.onclick=function(){setQ(i.id,1)};b.append(a)}c.append(b);g.append(c)});if(!n)g.append(E('div','empty',T.noResults));
var cnt=Object.keys(cart).reduce(function(s,k){return s+cart[k]},0);$('#bar').style.display=cnt?'block':'none';$('#bc').textContent=f(T.items,{n:cnt});$('#bt').textContent=inr(total())}
function drawCart(){var l=$('#cl');l.textContent='';var ls=lines();if(!ls.length){l.append(E('div','empty',T.empty))}ls.forEach(function(x){var r=E('div','li');r.append(E('div','n',x.name+' · '+inr(x.price)),stepper(x.id),E('b',null,inr(x.amount)));l.append(r)});$('#ct').textContent=inr(total());$('#go').disabled=!ls.length}
function cats(){var w=$('#cats');if(!D.categories.length){w.style.display='none';return}[''].concat(D.categories).forEach(function(c){var b=E('button',c===cat?'on':'',c||T.all);b.type='button';b.onclick=function(){cat=c;[].forEach.call(w.children,function(x){x.className=''});b.className='on';draw()};w.append(b)})}
function msg(o,no){var L=['🛒 '+T.newOrder+(no?' '+no:''),T.name+': '+o.name,T.phone+': '+o.phone,''];o.items.forEach(function(i,n){L.push((n+1)+'. '+i.name+' × '+i.qty+(i.unit?' '+i.unit:'')+' = '+inr(i.amount))});L.push('',T.total+': '+inr(o.total));if(o.address)L.push('📍 '+o.address);if(o.note)L.push('📝 '+o.note);return L.join('\\n')}
function upi(amt,no){if(!S.upi||!/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$/.test(S.upi)||!(amt>0))return '';var p=new URLSearchParams({pa:S.upi,pn:S.name.slice(0,50),am:amt.toFixed(2),cu:'INR',tn:('Order '+no).slice(0,50)});return 'upi://pay?'+p.toString()}
$('#q').oninput=function(e){q=e.target.value;draw()};$('#open').onclick=function(){drawCart();$('#sh').className='sheet on'};$('#x').onclick=function(){$('#sh').className='sheet'};$('#sh').onclick=function(e){if(e.target===this)this.className='sheet'};
$('#go').onclick=function(){var nm=$('#nm').value.trim(),ph=$('#ph').value.replace(/\\D/g,''),er=$('#er');er.textContent='';if(!nm){er.textContent=T.errName;return}if(ph.length<10){er.textContent=T.errPhone;return}
var body={slug:S.slug,name:nm,phone:ph,address:$('#ad').value,note:$('#nt').value,website:$('#hp').value,items:lines().map(function(l){return{id:l.id,qty:l.qty}})};var b=this;b.disabled=true;b.textContent=T.sending;
var w=null;try{w=window.open('','_blank')}catch(e){}
function done(no,o){var text=msg(o,no);var url='https://wa.me/'+S.whatsapp+'?text='+encodeURIComponent(text);if(w&&!w.closed){w.location.href=url}else{location.href=url}cart={};save();draw();var l=$('#cl');l.textContent='';var ok=E('div','ok',f(T.sent,{no:no||''}));l.append(ok);var u=upi(o.total,no);if(u){var a=E('a','pay',f(T.pay,{amount:inr(o.total)}));a.href=u;l.append(a)}$('#form').style.display='none'}
fetch('/api/store/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})}).then(function(x){if(x.s===200&&x.j.ok){done(x.j.orderNo,x.j.order)}else if(x.s===429){if(w)w.close();er.textContent=T.errBusy;b.disabled=false;b.textContent=T.send}else if(x.s>=500||x.s===404){er.textContent=T.errGeneric;done('',{name:nm,phone:ph,address:body.address.trim(),note:body.note.trim(),items:lines(),total:total()})}else{if(w)w.close();er.textContent=(x.j&&x.j.code==='need_phone')?T.errPhone:T.errGeneric;b.disabled=false;b.textContent=T.send}})
.catch(function(){er.textContent=T.errGeneric;done('',{name:nm,phone:ph,address:body.address.trim(),note:body.note.trim(),items:lines(),total:total()})})};
cats();draw()})();`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(shop.name)} · ${esc(t.orderOnline)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}"><meta name="robots" content="index,follow">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(shop.name)} · ${esc(t.orderOnline)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${shop.logo ? `<meta property="og:image" content="${esc(shop.logo)}">` : ''}<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#1d4ed8"><script type="application/ld+json" nonce="${esc(nonce)}">${jsonForScript(ld)}</script><style>${css}</style></head><body>
<header><div class="hd">${shop.logo ? `<img class="logo" src="${esc(shop.logo)}" alt="">` : ''}<div><h1>${esc(shop.name)}</h1>${shop.tagline ? `<div class="tag">${esc(shop.tagline)}</div>` : ''}${shop.address ? `<div class="addr">📍 ${esc(shop.address)}</div>` : ''}</div></div>
<div class="hbtn">${shop.phone ? `<a href="tel:+${esc(shop.phone)}">📞 ${esc(t.call)}</a>` : ''}${shop.whatsapp ? `<a href="https://wa.me/${esc(shop.whatsapp)}" rel="noopener">💬 ${esc(t.whatsapp)}</a>` : ''}</div></header>
<main><input id="q" class="search" type="search" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"><div id="cats" class="cats"></div><div id="g" class="grid"></div></main>
<div id="bar" class="bar"><button id="open" type="button"><span id="bc"></span><span>${esc(t.viewCart)} · <span id="bt"></span></span></button></div>
<div id="sh" class="sheet" role="dialog" aria-modal="true"><div class="sb"><h2>${esc(t.cart)}<button id="x" class="x" type="button" aria-label="${esc(t.close)}">✕</button></h2><div id="cl"></div>
<div id="form"><div class="tot"><span>${esc(t.total)}</span><span id="ct"></span></div><input id="nm" class="f" autocomplete="name" placeholder="${esc(t.name)}" maxlength="80"><input id="ph" class="f" type="tel" inputmode="tel" autocomplete="tel" placeholder="${esc(t.phone)}" maxlength="15"><textarea id="ad" class="f" rows="2" placeholder="${esc(t.address)}" maxlength="300"></textarea><input id="nt" class="f" placeholder="${esc(t.note)}" maxlength="300"><input id="hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><div id="er" class="err" role="alert"></div><button id="go" class="go" type="button">💬 ${esc(t.send)}</button></div></div></div>
<footer>${esc(t.powered)}</footer>
<script type="application/json" id="d">${jsonForScript(data)}</script><script nonce="${esc(nonce)}">${script}</script></body></html>`;
}

/**
 * Online order -> invoice draft for the invoice editor (opened as a new,
 * unsaved bill). Tax / HSN come from the product when it still exists.
 */
export function orderToBillDraft(order, products = []) {
  const byId = new Map(products.map(p => [String(p.id), p]));
  const items = (order?.data?.items || []).map((it, i) => {
    const p = byId.get(String(it.id)) || {};
    const tax = Number(p.taxPercent ?? p.taxRate ?? p.tax_rate);
    return {
      id: `item_${Date.now().toString(36)}_${i}`,
      productId: p.id || undefined,
      name: it.name, hsn: p.hsn || '', quantity: Number(it.qty) || 1, unit: it.unit || p.unit || 'NOS',
      rate: Number(it.price) || 0, mrp: Number(p.mrp) || 0, discount: 0,
      taxPercent: Number.isFinite(tax) ? tax : 0, cessPercent: 0,
    };
  });
  const client = { name: order?.customer_name || '', phone: order?.customer_phone || '', address: order?.data?.address || '' };
  return {
    _isDuplicate: true,
    _fromOnlineOrder: order?.id,
    clientName: client.name,
    invoiceType: 'tax-invoice',
    data: { client, items, details: {}, invoiceType: 'tax-invoice', customNotes: `Online order ${order?.order_no || ''}`.trim() },
  };
}
