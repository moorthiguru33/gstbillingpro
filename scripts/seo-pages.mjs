#!/usr/bin/env node
// Generates the static SEO landing pages (public/<slug>.html), sitemap.xml
// and robots.txt. Run: node scripts/seo-pages.mjs   (add --check to verify
// the committed files are up to date; used by test:unit).
//
// Comparison pages use ONLY these published facts (verify before launch):
//   Vyapar Silver from ₹3,399/yr, myBillBook from ₹3,490/yr, excl. GST.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://gst-billing-pro.pages.dev';
const OUR = 'Free plan: 50 invoices/month · Starter ₹999/yr (or ₹129/mo) · Pro ₹1,999/yr (or ₹199/mo) · Business ₹3,999/yr · prices excl. GST';

const COMMON_FEATURES = [
  'GST tax invoice, bill of supply, estimate, credit note and delivery challan with automatic CGST / SGST / IGST',
  'Share bills as PDF on WhatsApp in one tap',
  'Works on Android, iPhone and computer — install it like an app',
  'App screens in English, हिन्दी, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം, मराठी, বাংলা and ગુજરાતી',
  'GSTR-1 and GSTR-3B summaries for your accountant',
];

const PAGES = [
  { slug: 'kirana', title: 'Billing Software for Kirana & General Stores', h1: 'GST billing for kirana and general stores',
    intro: 'Fast counter billing for grocery and general stores: scan or search items, take cash or UPI and print a thermal receipt in seconds.',
    points: ['Quick POS counter with barcode scanning', '58 mm and 80 mm thermal receipts', 'Product list with HSN and GST rate, low-stock alerts', 'Cash, UPI and card payment modes'] },
  { slug: 'medical-shop', title: 'Billing Software for Medical Shops & Pharmacies', h1: 'GST billing for medical shops',
    intro: 'Make GST bills for medicines and FMCG items, keep your product list with HSN codes and track stock.',
    points: ['Product catalogue with HSN, GST rate and selling price', 'Low-stock alerts', 'Purchase bills and expenses', 'Customer-wise outstanding'] },
  { slug: 'printing-press', title: 'Billing Software for Printing Presses', h1: 'GST billing for printing presses',
    intro: 'Built first for a printing press in Chidambaram: quotations, job invoices and A4 tax invoices with your logo.',
    points: ['Quotation / estimate → invoice', 'A4 tax invoices with logo, signature and bank / UPI QR', 'Client ledger and payment reminders', 'Recurring invoices for regular customers'] },
  { slug: 'textile', title: 'Billing Software for Textile & Garment Shops', h1: 'GST billing for textile and garment shops',
    intro: 'Bill sarees, fabrics and ready-mades with the right GST rate per item and share the bill on WhatsApp.',
    points: ['Item-wise GST rates', 'Discounts per line', 'Thermal or A4 bills', 'Stock tracking for products'] },
  { slug: 'hardware', title: 'Billing Software for Hardware & Paint Shops', h1: 'GST billing for hardware shops',
    intro: 'Bill contractors and walk-in customers, track credit and stock, and keep GST returns ready.',
    points: ['Customer outstanding and aging reports', 'Units like Nos, Kg, Mtr, Box', 'Purchase bills', 'GSTR-1 / GSTR-3B summaries'] },
  { slug: 'restaurant', title: 'Billing Software for Restaurants & Cafes', h1: 'GST billing for restaurants and cafes',
    intro: 'Quick counter bills with thermal printing for small restaurants, cafes, bakeries and sweet shops.',
    points: ['Quick POS with thermal receipts', 'Cash / UPI / card', 'Daily sales report', 'Works on a phone or a counter PC'] },
  { slug: 'vyapar-alternative', title: 'Vyapar Alternative — GST Billing Pro', h1: 'Looking for a Vyapar alternative?', compare: 'Vyapar Silver from ₹3,399/yr (excl. GST)',
    intro: 'GST Billing Pro is a simpler, lower-priced option for small shops that mainly need GST billing, POS, WhatsApp sharing and GST summaries.',
    points: [] },
  { slug: 'mybillbook-alternative', title: 'myBillBook Alternative — GST Billing Pro', h1: 'Looking for a myBillBook alternative?', compare: 'myBillBook from ₹3,490/yr (excl. GST)',
    intro: 'GST Billing Pro is a simpler, lower-priced option for small shops that mainly need GST billing, POS, WhatsApp sharing and GST summaries.',
    points: [] },
];

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function page(p) {
  const url = `${SITE}/${p.slug}`;
  const desc = `${p.intro} Free plan available; paid plans from ₹999/year.`;
  const list = [...p.points, ...COMMON_FEATURES].map(x => `<li>${esc(x)}</li>`).join('\n        ');
  const compare = p.compare ? `
    <h2>Price comparison (published starting prices)</h2>
    <table>
      <tr><th>Product</th><th>Starting price</th></tr>
      <tr><td>${esc(p.compare.split(' from ')[0])}</td><td>${esc('from ' + p.compare.split(' from ')[1])}</td></tr>
      <tr><td>GST Billing Pro Starter</td><td>₹999/yr (excl. GST) — or the Free plan, 50 invoices/month</td></tr>
    </table>
    <p class="note">Prices are the publicly listed starting prices at the time of writing and may change — please check each vendor's website. Features differ between products; try GST Billing Pro free for 30 days and decide for yourself. Vyapar and myBillBook are trademarks of their respective owners; we are not affiliated with them.</p>` : '';
  return `<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(p.title)} | GST Billing Pro</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:locale" content="en_IN" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: p.title, url, description: desc, isPartOf: { '@type': 'WebSite', name: 'GST Billing Pro', url: SITE + '/' } })}</script>
  <style>
    body{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;color:#0f172a;background:#f8fafc;line-height:1.6}
    header{background:#0f172a;color:#fff;padding:.8rem 1.2rem}header a{color:#fff;text-decoration:none;font-weight:700}
    main{max-width:860px;margin:0 auto;padding:2rem 1.2rem}h1{font-size:1.9rem;line-height:1.25}
    .cta{display:inline-block;background:#2563eb;color:#fff;padding:.75rem 1.3rem;border-radius:10px;text-decoration:none;font-weight:700;margin:.5rem 0}
    table{border-collapse:collapse;width:100%;background:#fff}td,th{border:1px solid #e2e8f0;padding:.5rem;text-align:left}
    .note{font-size:.85rem;color:#64748b}.price{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:.8rem 1rem}
    footer{text-align:center;color:#64748b;font-size:.85rem;padding:2rem 1rem}
  </style>
</head>
<body>
  <header><a href="/">GST Billing Pro</a></header>
  <main>
    <h1>${esc(p.h1)}</h1>
    <p>${esc(p.intro)}</p>
    <a class="cta" href="/?utm_source=seo&amp;utm_campaign=${p.slug}">Start free — 30 days of Pro</a>
    <h2>What you get</h2>
    <ul>
        ${list}
    </ul>
    <h2>Pricing</h2>
    <p class="price">${esc(OUR)}. Founder Lifetime ₹6,999 one-time (limited seats).</p>${compare}
    <p><a class="cta" href="/#pricing">See plans</a></p>
  </main>
  <footer>Made by D Printers, Chidambaram, Tamil Nadu · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a> · <a href="/contact.html">Contact</a></footer>
</body>
</html>
`;
}

const files = {};
for (const p of PAGES) files[`public/${p.slug}.html`] = page(p);
const urls = ['', ...PAGES.map(p => p.slug), 'terms.html', 'privacy.html', 'refund.html', 'contact.html'];
files['public/sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}/${u}</loc></url>`).join('\n')}
</urlset>
`;
files['public/robots.txt'] = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`;

const check = process.argv.includes('--check');
let stale = 0;
for (const [rel, body] of Object.entries(files)) {
  const abs = path.join(ROOT, rel);
  if (check) {
    if (!existsSync(abs) || readFileSync(abs, 'utf8') !== body) { console.error(`stale: ${rel} (run node scripts/seo-pages.mjs)`); stale++; }
  } else writeFileSync(abs, body);
}
if (check) {
  if (stale) process.exit(1);
  console.log(`seo-pages: ${Object.keys(files).length} files up to date`);
} else console.log(`seo-pages: wrote ${Object.keys(files).length} files`);
