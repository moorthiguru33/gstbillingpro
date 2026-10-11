// Source for the static legal pages in public/ (terms, privacy, refund,
// contact). They are plain HTML so Razorpay / Google / customers can read
// them without signing in or running JavaScript.
// Edit the text here, then run: node scripts/legal-pages.mjs
import fs from 'fs';
import path from 'path';

import { COMPANY as BASE } from '../shared/company.js';

const COMPANY = { ...BASE, updated: '11 October 2026' };
const C = COMPANY;

const pages = {
  terms: {
    title: 'Terms of Service',
    body: `
<p>These Terms of Service ("Terms") govern your use of <strong>${C.product}</strong> (the "Service"), a cloud GST billing, invoicing and point-of-sale web application operated by <strong>${C.owner}</strong>, ${C.city}, ${C.state}, ${C.country} ("we", "us"). By creating an account or using the Service you agree to these Terms. If you are using the Service for a business, you confirm you are authorised to accept these Terms for it.</p>

<h2>1. The Service</h2>
<p>The Service lets you create GST invoices, bills of supply, quotations, receipts and other documents, manage customers, products and stock, and prepare data for GST returns (such as GSTR-1 and GSTR-3B). The Service is a tool: <strong>you remain solely responsible</strong> for the correctness of the invoices you issue, the tax rates and HSN/SAC codes you use, and the returns you file with the GST portal or any other authority. Calculations and reports are provided to assist you and do not constitute tax, legal or accounting advice.</p>

<h2>2. Accounts</h2>
<ul>
<li>You must provide accurate information and keep your password confidential. You are responsible for all activity under your account.</li>
<li>You must be at least 18 years old and capable of entering into a contract under Indian law.</li>
<li>Tell us immediately at <a href="mailto:${C.email}">${C.email}</a> if you suspect unauthorised use of your account.</li>
</ul>

<h2>3. Free trial, plans and payment</h2>
<ul>
<li>New accounts get a free trial (currently 30 days). No card is required for the trial.</li>
<li>After the trial you may buy a paid plan (currently ₹99 per month or ₹999 per year). Prices are in Indian Rupees; applicable taxes, if any, are shown at checkout. We may change prices for future periods with at least 15 days' notice in the app or by email; already-paid periods are not affected.</li>
<li>Payments are processed by our payment partner Razorpay. We do not see or store your card, UPI PIN or net-banking credentials.</li>
<li>Plans are prepaid for a fixed period and <strong>do not renew automatically</strong>. Paying again before your period ends adds the new period on top of the remaining time.</li>
<li>Refunds and cancellations are governed by our <a href="/refund.html">Refund &amp; Cancellation Policy</a>.</li>
</ul>

<h2>4. Your data</h2>
<p>You own the business data you enter (invoices, customers, products, etc.). You grant us a limited licence to host, process, back up and display it only to provide the Service to you. How we handle personal data is explained in our <a href="/privacy.html">Privacy Policy</a>. You can export your data from Settings at any time. After your account is closed or your subscription has lapsed for an extended period, we may delete your data after giving you reasonable notice.</p>

<h2>5. Acceptable use</h2>
<p>You must not use the Service to: issue fake or fraudulent invoices or claim input tax credit you are not entitled to; break any law (including the CGST/SGST/IGST Acts and the Information Technology Act, 2000); upload malware; attempt to access other users' data; probe, overload or reverse-engineer the Service; or resell the Service without our written permission. We may suspend accounts that do so.</p>

<h2>6. Availability and changes</h2>
<p>We aim to keep the Service available at all times but do not guarantee uninterrupted or error-free operation. We may add, change or remove features. Planned maintenance will be kept short where possible. Please keep your own copies of important documents (for example the PDFs you issue to customers).</p>

<h2>7. Intellectual property and open source</h2>
<p>The Service, its design and the "${C.product}" name belong to ${C.owner}. Parts of the Service are based on the open-source <em>Free GST Billing Software</em>, used under the MIT Licence; the original copyright and licence notice are retained in our source code.</p>

<h2>8. Limitation of liability</h2>
<p>To the maximum extent permitted by law, the Service is provided "as is". We are not liable for indirect, incidental or consequential losses, lost profits, tax penalties or interest arising from your use of the Service. Our total liability for any claim relating to the Service is limited to the amount you paid us for the Service in the 12 months before the claim.</p>

<h2>9. Termination</h2>
<p>You may stop using the Service and request account deletion at any time by writing to <a href="mailto:${C.email}">${C.email}</a>. We may suspend or terminate access for breach of these Terms, non-payment after the trial, or where required by law.</p>

<h2>10. Governing law and disputes</h2>
<p>These Terms are governed by the laws of India. Subject to applicable consumer-protection law, the courts having jurisdiction over ${C.city}, ${C.state} shall have exclusive jurisdiction. Please contact us first — most issues can be solved quickly.</p>

<h2>11. Grievance officer and contact</h2>
<p>For complaints or questions about these Terms, contact our Grievance Officer at <a href="mailto:${C.email}">${C.email}</a> or <a href="tel:${C.phoneHref}">${C.phone}</a>. We acknowledge complaints within 48 hours and aim to resolve them within 15 days. See also our <a href="/contact.html">Contact page</a>.</p>`,
  },
  privacy: {
    title: 'Privacy Policy',
    body: `
<p>This Privacy Policy explains how <strong>${C.owner}</strong> ("we") collects, uses and protects personal data when you use <strong>${C.product}</strong>. We process personal data in accordance with the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and rules made under them.</p>

<h2>1. Data we collect</h2>
<ul>
<li><strong>Account data:</strong> your email address and a securely hashed password (or your Google sign-in identity if you choose "Continue with Google").</li>
<li><strong>Business data you enter:</strong> business name, address, GSTIN, PAN, bank/UPI details, logo, and your invoices, customers (including their names, phone numbers, addresses and GSTINs), products, expenses and purchases.</li>
<li><strong>Payment data:</strong> plan, amount, date, and Razorpay order and payment IDs. Card, UPI and bank credentials are collected and processed by Razorpay, not by us.</li>
<li><strong>Technical data:</strong> basic logs (IP address, browser type, time of request) kept by our hosting providers for security and troubleshooting.</li>
</ul>

<h2>2. Why we use it</h2>
<ul>
<li>To provide the Service: store your data, generate invoices and reports, and sync across your devices.</li>
<li>To manage your trial and subscription and to verify payments.</li>
<li>To give support when you contact us, and to send important service messages (security, billing, policy changes).</li>
<li>To keep the Service secure and prevent fraud or abuse.</li>
</ul>
<p>We do <strong>not</strong> sell your data, and we do not use your customers' details for our own marketing.</p>

<h2>3. Who we share it with</h2>
<p>Only with service providers who help us run the Service, under contracts that require them to protect it:</p>
<ul>
<li><strong>Supabase</strong> — database, authentication and file storage.</li>
<li><strong>Cloudflare</strong> — website hosting, content delivery and server functions.</li>
<li><strong>Razorpay</strong> — payment processing.</li>
<li><strong>Google</strong> — only if you use Google sign-in or choose to back up to your own Google Drive.</li>
</ul>
<p>We may also disclose data where required by law, a court order or a government authority. When you share an invoice by WhatsApp or email, it goes from your device through the app you choose.</p>

<h2>4. Storage and security</h2>
<p>Data is encrypted in transit (HTTPS) and stored with our providers, which may be located outside India. Each account's data is isolated with database row-level security so that one customer cannot read another's data. No system is perfectly secure; please use a strong password and sign out on shared computers.</p>

<h2>5. Retention</h2>
<p>We keep your data while your account is active. If you ask us to delete your account we will delete your personal and business data within 30 days, except records we must keep by law (for example payment records for tax purposes, usually 8 years).</p>

<h2>6. Your rights</h2>
<p>You may access, correct, export or erase your personal data, withdraw consent, and nominate another person to exercise these rights. Most data can be edited or exported directly in the app; for anything else write to <a href="mailto:${C.email}">${C.email}</a>. If you are not satisfied with our response you may approach the Data Protection Board of India.</p>

<h2>7. Cookies and local storage</h2>
<p>We use browser local storage to keep you signed in and to remember app preferences. We do not use advertising or cross-site tracking cookies.</p>

<h2>8. Children</h2>
<p>The Service is meant for businesses and is not directed at children under 18.</p>

<h2>9. Changes</h2>
<p>We will post changes to this policy on this page and, for significant changes, notify you in the app or by email.</p>

<h2>10. Contact / Grievance Officer</h2>
<p>${C.owner} (${C.product}), ${C.city}, ${C.state}, ${C.country}<br>Email: <a href="mailto:${C.email}">${C.email}</a> · Phone: <a href="tel:${C.phoneHref}">${C.phone}</a></p>`,
  },
  refund: {
    title: 'Refund & Cancellation Policy',
    body: `
<p>This policy applies to payments made for <strong>${C.product}</strong> subscriptions to <strong>${C.owner}</strong>.</p>

<h2>1. Try before you pay</h2>
<p>Every new account gets a free trial (currently 30 days) with full features, so you can check that the Service suits your business before paying anything.</p>

<h2>2. Plans and cancellation</h2>
<ul>
<li>Plans (₹99/month or ₹999/year) are <strong>one-time prepaid payments</strong> for a fixed period. They do not auto-renew and no mandate or standing instruction is created, so there is nothing to cancel to stop future charges.</li>
<li>If you no longer want to use the Service, simply do not renew. Your access continues until the end of the period you paid for.</li>
<li>To close your account and delete your data, email <a href="mailto:${C.email}">${C.email}</a> from your registered email address.</li>
</ul>

<h2>3. Refunds</h2>
<ul>
<li><strong>Duplicate or failed payments:</strong> if you were charged twice, or money was debited but your plan was not activated, we will either activate your plan or refund the amount in full.</li>
<li><strong>Annual plan — 7-day refund:</strong> if you are not satisfied, you may request a full refund within 7 days of your <em>first</em> annual payment.</li>
<li><strong>Other cases:</strong> monthly payments and annual payments older than 7 days are non-refundable, except where the Service was unavailable for an extended period due to our fault or where required by law; such requests are reviewed case by case.</li>
</ul>

<h2>4. How to request a refund</h2>
<p>Email <a href="mailto:${C.email}">${C.email}</a> (or WhatsApp/call <a href="tel:${C.phoneHref}">${C.phone}</a>) with your registered email address and the Razorpay payment ID (starts with <code>pay_</code>, shown in the payment confirmation). We respond within 2 business days.</p>

<h2>5. Refund timelines</h2>
<p>Approved refunds are initiated within 5–7 business days to the <strong>original payment method</strong> through Razorpay. Depending on your bank, UPI app or card issuer, it may take a further 5–10 business days to reflect in your account.</p>`,
  },
  contact: {
    title: 'Contact Us',
    body: `
<p>We are a small team in Tamil Nadu and we read every message.</p>
<div class="card">
<p><strong>${C.product}</strong><br>Operated by <strong>${C.owner}</strong><br>${C.city}, ${C.state}, ${C.country}</p>
<p>📞 Phone / WhatsApp: <a href="tel:${C.phoneHref}">${C.phone}</a><br>
✉️ Email: <a href="mailto:${C.email}">${C.email}</a><br>
🕘 Support hours: Monday – Saturday, 10:00 AM – 7:00 PM IST</p>
</div>
<h2>Billing and refunds</h2>
<p>Please include your registered email address and the Razorpay payment ID (starts with <code>pay_</code>). See our <a href="/refund.html">Refund &amp; Cancellation Policy</a>.</p>
<h2>Privacy and grievances</h2>
<p>Write to <a href="mailto:${C.email}">${C.email}</a> with the subject "Grievance". We acknowledge within 48 hours. See our <a href="/privacy.html">Privacy Policy</a> and <a href="/terms.html">Terms of Service</a>.</p>`,
  },
};

const nav = Object.entries(pages)
  .map(([slug, p]) => `<a href="/${slug}.html">${p.title.replace(' & Cancellation', '')}</a>`).join(' · ');

const page = (slug, p) => `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title} — ${C.product}</title>
<meta name="description" content="${p.title} for ${C.product}, a GST billing app by ${C.owner}, ${C.city}, ${C.state}.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${C.site}/${slug}.html">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Tamil", sans-serif; color: #1e293b; background: #f8fafc; }
  header, main, footer { max-width: 780px; margin: 0 auto; padding: 0 20px; }
  header { padding-top: 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  header a.brand { font-weight: 800; color: #1e40af; text-decoration: none; font-size: 1.1rem; }
  main { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 8px 28px 24px; margin-top: 16px; }
  h1 { font-size: 1.7rem; margin: 20px 0 4px; } h2 { font-size: 1.15rem; margin-top: 1.6em; }
  .updated { color: #64748b; font-size: .85rem; margin-top: 0; }
  a { color: #1d4ed8; } .card { background: #f1f5f9; border-radius: 10px; padding: 4px 18px; }
  footer { font-size: .85rem; color: #64748b; padding: 20px; text-align: center; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #e2e8f0; } main { background: #111827; border-color: #1f2937; }
    a, header a.brand { color: #93c5fd; } .card { background: #1f2937; } .updated, footer { color: #94a3b8; }
  }
</style>
</head>
<body>
<header><a class="brand" href="/">${C.product}</a><a href="/">← Back to app</a></header>
<main>
<h1>${p.title}</h1>
<p class="updated">Last updated: ${C.updated}</p>
${p.body.trim()}
</main>
<footer>${nav}<br>© ${new Date(C.updated).getFullYear()} ${C.owner}, ${C.city}, ${C.state} · Based on open-source Free GST Billing Software (MIT)</footer>
</body>
</html>
`;

for (const [slug, p] of Object.entries(pages)) {
  fs.writeFileSync(path.resolve('public', `${slug}.html`), page(slug, p));
}
console.log('[legal] wrote', Object.keys(pages).map(s => `public/${s}.html`).join(', '));
