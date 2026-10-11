// Business profile helpers: completeness and the visiting-card canvas.
// What makes a profile "complete" (each counts equally).
export const PROFILE_CHECKS = [
  ['businessName', (p) => !!String(p.businessName || '').trim()],
  ['phone', (p) => String(p.phone || '').replace(/\D/g, '').length >= 10],
  ['email', (p) => /@/.test(p.email || '')],
  ['address', (p) => !!String(p.address || '').trim()],
  ['state', (p) => !!String(p.state || '').trim()],
  ['gstin', (p) => String(p.gstin || '').trim().length === 15],
  ['logo', (p) => !!p.logo],
  ['signature', (p) => !!p.signature],
  ['upiId', (p) => /@/.test(p.upiId || '') || (p.paymentAccounts || []).some(a => /@/.test(a.upiId || ''))],
  ['bank', (p) => !!(p.accountNumber || (p.paymentAccounts || []).some(a => a.accountNumber))],
];
export const profileCompletion = (p = {}) => Math.round((PROFILE_CHECKS.filter(([, ok]) => ok(p)).length / PROFILE_CHECKS.length) * 100);

const loadImg = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const img = new Image();
  if (!/^data:/.test(src)) img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src;
});
const wrap = (ctx, text, max) => {
  const words = String(text || '').split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
};

/** Draws the visiting card (1050×600) onto a canvas. */
export async function drawCard(canvas, p) {
  const W = 1050; const H = 600; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2563eb'); g.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 300, H);
  const logo = await loadImg(p.logo);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(150, 230, 95, 0, Math.PI * 2); ctx.fill();
  let drew = false;
  if (logo) {
    try { const s = Math.min(150 / logo.width, 150 / logo.height); ctx.drawImage(logo, 150 - (logo.width * s) / 2, 230 - (logo.height * s) / 2, logo.width * s, logo.height * s); ctx.getImageData(0, 0, 1, 1); drew = true; } catch { drew = false; }
    if (!drew) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(150, 230, 95, 0, Math.PI * 2); ctx.fill(); }
  }
  if (!drew) { ctx.fillStyle = '#1e40af'; ctx.font = 'bold 96px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.businessName || 'G').trim().charAt(0).toUpperCase(), 150, 236); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '600 22px system-ui, sans-serif';
  if (p.gstin) ctx.fillText(`GSTIN ${p.gstin}`, 150, 380);
  ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 52px system-ui, sans-serif';
  let y = 120;
  for (const l of wrap(ctx, p.businessName || 'Your Business', 680).slice(0, 2)) { ctx.fillText(l, 340, y); y += 60; }
  ctx.fillStyle = '#2563eb'; ctx.fillRect(340, y - 30, 90, 6); y += 30;
  ctx.font = '30px system-ui, sans-serif'; ctx.fillStyle = '#334155';
  const rows = [p.phone && `📞  ${p.phone}`, p.email && `✉️  ${p.email}`, (p.upiId || p.paymentAccounts?.find(a => a.upiId)?.upiId) && `💳  UPI: ${p.upiId || p.paymentAccounts.find(a => a.upiId).upiId}`].filter(Boolean);
  for (const r of rows) { ctx.fillText(r, 340, y); y += 52; }
  ctx.font = '26px system-ui, sans-serif'; ctx.fillStyle = '#475569';
  for (const l of wrap(ctx, [p.address, p.state].filter(Boolean).join(', '), 670).slice(0, 3)) { ctx.fillText(l, 340, y); y += 36; }
  ctx.font = '600 20px system-ui, sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
  ctx.fillText('Made with GST Billing Pro', W - 30, H - 26);
  return canvas;
}

