// ============================================================
// Transactional e-mail templates (English). Every template returns
// { subject, html, text }. User-provided values are always escaped.
// ============================================================
import { COMPANY } from './company.js';
import { PLAN_LABELS, TIERS, formatPlanPrice, getPlan } from './plans.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  if (d.getUTCFullYear() >= 2099) return 'Lifetime';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function layout({ title, body, appUrl }) {
  const url = esc(appUrl || COMPANY.site);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1e40af;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">${esc(COMPANY.product)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#64748b">
${esc(COMPANY.product)} · ${esc(COMPANY.owner)}, ${esc(COMPANY.city)}, ${esc(COMPANY.state)} · <a href="${url}" style="color:#1e40af">${url.replace(/^https?:\/\//, '')}</a><br>
Questions? Reply to this e-mail or WhatsApp ${esc(COMPANY.phone)}.
</td></tr></table></td></tr></table></body></html>`;
}
const button = (href, label) => `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#1e40af;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;
const hello = (name) => `<p>Namaste${name ? ` ${esc(name)}` : ''},</p>`;

export function welcomeEmail({ name, appUrl, trialEnd }) {
  const url = appUrl || COMPANY.site;
  return {
    subject: `Welcome to ${COMPANY.product} — your 30-day free trial has started`,
    html: layout({ title: 'Welcome', appUrl: url, body: `${hello(name)}
<p>Thank you for choosing ${esc(COMPANY.product)}. Your <strong>free Pro trial runs until ${esc(fmtDate(trialEnd))}</strong> — every feature is unlocked.</p>
<p>Get started in 3 steps:</p>
<ol><li>Add your business name and GSTIN (optional)</li><li>Add your products with HSN and GST rate</li><li>Create your first invoice and share it on WhatsApp</li></ol>
<p>After the trial you can keep using the <strong>Free plan (50 invoices / month)</strong> or upgrade from ₹129/month.</p>
${button(url, 'Open GST Billing Pro')}` }),
    text: `Namaste${name ? ` ${name}` : ''},\n\nThank you for choosing ${COMPANY.product}. Your free Pro trial runs until ${fmtDate(trialEnd)}.\n\nAfter the trial you can keep using the Free plan (50 invoices / month) or upgrade from ₹129/month.\n\nOpen: ${url}\n`,
  };
}

export function trialEndingEmail({ name, appUrl, daysLeft, trialEnd }) {
  const url = `${appUrl || COMPANY.site}/?view=pricing`;
  const when = daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`;
  return {
    subject: `Your free trial ends ${when}`,
    html: layout({ title: 'Trial ending', appUrl, body: `${hello(name)}
<p>Your ${esc(COMPANY.product)} trial ends <strong>${esc(when)} (${esc(fmtDate(trialEnd))})</strong>.</p>
<p>Nothing is deleted. After the trial your account moves to the <strong>Free plan</strong>: 50 invoices a month, 1 business, with a small “Made with ${esc(COMPANY.product)}” line on bills.</p>
<p>Upgrade to keep unlimited invoices and remove the branding — Starter is ₹999/year (about ₹83 a month).</p>
${button(url, 'See plans')}` }),
    text: `Your ${COMPANY.product} trial ends ${when} (${fmtDate(trialEnd)}). Nothing is deleted — you move to the Free plan (50 invoices/month). Upgrade: ${url}\n`,
  };
}

export function renewalDueEmail({ name, appUrl, daysLeft, periodEnd, planId }) {
  const url = `${appUrl || COMPANY.site}/?view=pricing`;
  const label = PLAN_LABELS[planId] || TIERS[getPlan(planId)?.tier]?.name || 'paid';
  const when = daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`;
  return {
    subject: `Your ${label} plan renews ${when}`,
    html: layout({ title: 'Renewal due', appUrl, body: `${hello(name)}
<p>Your <strong>${esc(label)}</strong> plan ends <strong>${esc(when)} (${esc(fmtDate(periodEnd))})</strong>.</p>
<p>Renew now and the new period is added on top of the days you still have — nothing is lost by renewing early.</p>
${button(url, 'Renew now')}
<p style="color:#64748b;font-size:13px">If you do not renew, your account moves to the Free plan. Your data stays safe.</p>` }),
    text: `Your ${label} plan ends ${when} (${fmtDate(periodEnd)}). Renew: ${url}\n`,
  };
}

export function expiredEmail({ name, appUrl, wasTrial }) {
  const url = `${appUrl || COMPANY.site}/?view=pricing`;
  return {
    subject: wasTrial ? 'Your free trial has ended — you are now on the Free plan' : 'Your plan has ended — you are now on the Free plan',
    html: layout({ title: 'Now on Free', appUrl, body: `${hello(name)}
<p>Your ${wasTrial ? 'free trial' : 'paid plan'} has ended, so your account is now on the <strong>Free plan</strong>.</p>
<ul><li>All your invoices, clients and products are safe</li><li>You can create up to 50 invoices a month</li><li>Bills show a small “Made with ${esc(COMPANY.product)}” line</li></ul>
${button(url, 'Upgrade from ₹129/month')}` }),
    text: `Your ${wasTrial ? 'free trial' : 'plan'} has ended; you are on the Free plan (50 invoices/month). Your data is safe. Upgrade: ${url}\n`,
  };
}

/**
 * GST-style payment receipt (HTML). Becomes a "Tax Invoice" automatically
 * once SELLER_GSTIN is set; SAC is shown only if SELLER_SAC is set (confirm
 * the right code with your CA).
 */
export function receiptEmail({ order, customer, env = {}, appUrl }) {
  const plan = getPlan(order.plan);
  const label = PLAN_LABELS[order.plan] || order.plan;
  const gstin = (env.SELLER_GSTIN || '').trim();
  const sac = (env.SELLER_SAC || '').trim();
  const title = gstin ? 'Tax Invoice' : 'Payment Receipt';
  const base = Number(order.base_amount ?? order.amount) || 0;
  const discount = Number(order.discount) || 0;
  const gst = Number(order.gst_amount) || 0;
  const taxable = base - discount;
  const total = Number(order.amount) || 0;
  const gstPct = taxable > 0 ? Math.round((gst / taxable) * 100) : 0;
  const sellerState = env.SELLER_STATE || COMPANY.state;
  const row = (k, v, bold) => `<tr><td style="padding:6px 0;color:#475569">${esc(k)}</td><td style="padding:6px 0;text-align:right;${bold ? 'font-weight:bold' : ''}">${esc(v)}</td></tr>`;
  const period = plan?.lifetime ? 'Lifetime (one-time)' : `Valid till ${fmtDate(order.period_end)}`;
  const gstRows = gst > 0
    ? (row(`CGST @ ${gstPct / 2}%`, formatPlanPrice(Math.floor(gst / 2))) + row(`SGST @ ${gstPct / 2}%`, formatPlanPrice(gst - Math.floor(gst / 2))))
    : row('GST', gstin ? formatPlanPrice(0) : 'Not charged');
  const html = layout({ title, appUrl, body: `${hello(customer?.name)}
<p>Thank you! We have received your payment. Your receipt is below.</p>
<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px">
<div style="font-size:18px;font-weight:bold;margin-bottom:8px">${esc(title)}</div>
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">
${row('Receipt no.', order.receipt_number || order.order_id)}
${row('Date', fmtDate(order.paid_at))}
${row('Seller', `${COMPANY.owner} (${COMPANY.product})`)}
${row('Seller address', `${COMPANY.city}, ${sellerState}, ${COMPANY.country}`)}
${row('Seller GSTIN', gstin || 'Not registered under GST')}
${row('Billed to', customer?.email || '')}
${customer?.gstin ? row('Buyer GSTIN', customer.gstin) : ''}
</table>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0">
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">
${row(`${COMPANY.product} — ${label}${sac ? ` (SAC ${sac})` : ''}`, formatPlanPrice(base))}
${row('Period', period)}
${discount ? row(`Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}`, `− ${formatPlanPrice(discount)}`) : ''}
${row('Taxable value', formatPlanPrice(taxable))}
${gstRows}
${row('Total paid', formatPlanPrice(total), true)}
${row('Payment ID', order.razorpay_payment_id || '')}
</table></div>
<p style="color:#64748b;font-size:12px">Place of supply: ${esc(sellerState)}. This is a computer-generated ${esc(title.toLowerCase())} and does not need a signature.</p>` });
  return {
    subject: `${title} ${order.receipt_number || ''} — ${COMPANY.product} ${label}`.replace(/\s+/g, ' ').trim(),
    html,
    text: `${title} ${order.receipt_number || order.order_id}\nSeller: ${COMPANY.owner} (${COMPANY.product}), GSTIN: ${gstin || 'not registered'}\nPlan: ${label}\nTaxable: ${formatPlanPrice(taxable)}  GST: ${formatPlanPrice(gst)}  Total paid: ${formatPlanPrice(total)}\nPayment ID: ${order.razorpay_payment_id || ''}\n`,
  };
}
