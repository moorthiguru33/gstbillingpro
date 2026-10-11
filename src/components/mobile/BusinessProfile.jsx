import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Download, PenLine, Upload, Eraser, Check, Pencil } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { getProfile, saveProfile, getAllProfiles, saveBusinessProfile, getInvoiceDisplayOptions, saveInvoiceDisplayOptions } from '../../store';
import { toast } from '../Toast';
import { openInNewTab } from '../../utils/share';
import { t as tr } from '../../i18n';
import { PROFILE_CHECKS, profileCompletion, drawCard } from './profileCard';

// Business profile on the phone: visiting card + share, completeness bar,
// quick edit of the key fields and a signature you can draw or upload
// (printed on invoices when "Signature" is on).
export default function BusinessProfile({ onSaved, onOpenFull }) {
  const [p, setP] = useState(null);
  const [edit, setEdit] = useState(false);
  const [sign, setSign] = useState(false);
  const canvasRef = useRef(null);
  useEffect(() => { getProfile().then(x => setP(x || {})).catch(() => setP({})); }, []);
  useEffect(() => { if (p && canvasRef.current) drawCard(canvasRef.current, p).catch(() => {}); }, [p]);
  const pct = useMemo(() => profileCompletion(p || {}), [p]);
  const missing = useMemo(() => PROFILE_CHECKS.filter(([, ok]) => !ok(p || {})).map(([k]) => k), [p]);

  const persist = useCallback(async (next) => {
    await saveProfile(next);
    try {
      const all = await getAllProfiles().catch(() => []);
      const same = (all || []).find(bp => String(bp.businessName || '').trim().toLowerCase() === String(next.businessName || '').trim().toLowerCase());
      if (same) await saveBusinessProfile({ ...next, id: same.id });
    } catch { /* list optional */ }
    if (next.signature) {
      try {
        const opts = JSON.parse(localStorage.getItem('freegstbill_invoiceOptions') || '{}');
        opts.showSignature = true; localStorage.setItem('freegstbill_invoiceOptions', JSON.stringify(opts));
        const server = await getInvoiceDisplayOptions().catch(() => null);
        saveInvoiceDisplayOptions({ ...(server || {}), showSignature: true }).catch(() => {});
      } catch { /* storage blocked */ }
    }
    setP(next); onSaved?.(next); toast(tr('bp.saved'), 'success');
  }, [onSaved]);

  const shareCard = async () => {
    const c = document.createElement('canvas');
    await drawCard(c, p);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const name = `${String(p.businessName || 'business').replace(/[^\w-]+/g, '_')}_card.png`;
    const text = [p.businessName, p.phone && `📞 ${p.phone}`, p.address].filter(Boolean).join('\n');
    try {
      const file = blob && new File([blob], name, { type: 'image/png' });
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: p.businessName || '', text }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    openInNewTab(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  if (!p) return <section className="ph"><div className="ph-empty"><p>{tr('mod.loading')}</p></div></section>;
  return (
    <section className="ph bp" data-testid="business-profile">
      <div className="bp-card"><canvas ref={canvasRef} aria-label={tr('bp.card')} /></div>
      <div className="bp-actions">
        <button type="button" className="btn btn-primary" onClick={shareCard} data-testid="bp-share"><Share2 size={18} /> {tr('bp.shareCard')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setEdit(true)}><Pencil size={18} /> {tr('bp.edit')}</button>
      </div>
      <div className="bp-progress" data-testid="bp-progress">
        <div className="bp-progress-head"><b>{tr('bp.complete', { pct })}</b>{pct < 100 && <small>{tr('bp.missing', { list: missing.map(k => tr(`bp.f_${k}`)).join(', ') })}</small>}</div>
        <div className="bp-bar"><span style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="bp-sign">
        <div className="bp-sign-head"><b>{tr('bp.signature')}</b><small>{tr('bp.signatureHint')}</small></div>
        {p.signature ? <img src={p.signature} alt={tr('bp.signature')} className="bp-sign-img" /> : <div className="bp-sign-empty"><PenLine size={28} /><span>{tr('bp.noSignature')}</span></div>}
        <div className="bp-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setSign(true)} data-testid="bp-draw"><PenLine size={16} /> {tr('bp.draw')}</button>
          <label className="btn btn-secondary"><Upload size={16} /> {tr('bp.upload')}
            <input type="file" accept="image/*" hidden onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              if (f.size > 400 * 1024) { toast(tr('bp.tooBig'), 'warning'); return; }
              const rd = new FileReader(); rd.onload = () => persist({ ...p, signature: String(rd.result) }); rd.readAsDataURL(f);
            }} />
          </label>
          {p.signature && <button type="button" className="btn btn-secondary" onClick={() => persist({ ...p, signature: '' })}><Eraser size={16} /> {tr('bp.remove')}</button>}
        </div>
      </div>
      <button type="button" className="ps-row ps-link" onClick={onOpenFull}><span className="ps-label">{tr('bp.allDetails')}</span><Download size={16} style={{ transform: 'rotate(-90deg)' }} /></button>
      {edit && <EditSheet p={p} onClose={() => setEdit(false)} onSave={async (next) => { await persist(next); setEdit(false); }} />}
      {sign && <SignPad onClose={() => setSign(false)} onSave={async (url) => { await persist({ ...p, signature: url }); setSign(false); }} />}
    </section>
  );
}

function EditSheet({ p, onClose, onSave }) {
  const [f, setF] = useState(p);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const fields = [['businessName', 'text'], ['phone', 'tel'], ['email', 'email'], ['address', 'text'], ['state', 'text'], ['gstin', 'text'], ['upiId', 'text']];
  return (
    <BottomSheet title={tr('bp.edit')} onClose={onClose}>
      <div className="mod-form">
        {fields.map(([k, type]) => <label key={k}>{tr(`bp.f_${k}`)}<input className="form-input" type={type} value={f[k] || ''} onChange={set(k)} maxLength={k === 'address' ? 300 : 120} /></label>)}
      </div>
      <div className="mod-actions"><button type="button" className="btn btn-primary" onClick={() => { if (!String(f.businessName || '').trim()) { toast(tr('bp.needName'), 'warning'); return; } onSave({ ...f, gstin: String(f.gstin || '').trim().toUpperCase() }); }}><Check size={16} /> {tr('txn.save')}</button></div>
    </BottomSheet>
  );
}

function SignPad({ onClose, onSave }) {
  const ref = useRef(null); const drawing = useRef(false); const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const c = ref.current; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a';
  }, []);
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.preventDefault(); ref.current.setPointerCapture?.(e.pointerId); drawing.current = true; const ctx = ref.current.getContext('2d'); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); setDirty(true); };
  const move = (e) => { if (!drawing.current) return; const ctx = ref.current.getContext('2d'); const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setDirty(false); };
  const save = () => {
    // Crop to the ink so the invoice doesn't print a big empty box.
    const c = ref.current; const ctx = c.getContext('2d'); const { width: w, height: h } = c; const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0) { onClose(); return; }
    const pad = 8; const out = document.createElement('canvas'); out.width = x1 - x0 + pad * 2; out.height = y1 - y0 + pad * 2;
    out.getContext('2d').drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    onSave(out.toDataURL('image/png'));
  };
  return (
    <BottomSheet title={tr('bp.drawTitle')} onClose={onClose}>
      <p className="mod-muted" style={{ marginTop: 0 }}>{tr('bp.drawHint')}</p>
      <canvas ref={ref} className="bp-pad" data-testid="bp-pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      <div className="mod-actions">
        <button type="button" className="btn btn-primary" disabled={!dirty} onClick={save} data-testid="bp-sign-save"><Check size={16} /> {tr('bp.useSignature')}</button>
        <button type="button" className="btn btn-secondary" onClick={clear}><Eraser size={16} /> {tr('bp.clear')}</button>
      </div>
    </BottomSheet>
  );
}
