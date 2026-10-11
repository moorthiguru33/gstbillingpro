import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square, Camera, Loader, X, Sparkles, Trash2, ReceiptText } from 'lucide-react';
import { toast } from '../Toast';
import { aiVoiceBill, aiPhotoBill, withMatches } from '../../lib/ai';
import { currentLanguage } from '../../i18n';

// "Speak the bill" / "Photo of bill" → review list → onApply({ items, customer }).
// items: [{ name, qty, unit, rate, hsn, gst, product }] (product = matched catalogue item or null)
export default function AiBillButton({ mode = 'voice', products = [], onApply, compact = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle'); // idle | recording | working | review
  const [rows, setRows] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [transcript, setTranscript] = useState('');
  const [secs, setSecs] = useState(0);
  const rec = useRef(null);
  const timer = useRef(null);
  const fileRef = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => () => { clearInterval(timer.current); rec.current?.stream?.getTracks().forEach(tr => tr.stop()); }, []);

  const reset = () => { setRows([]); setCustomer({ name: '', phone: '' }); setTranscript(''); setSecs(0); setState('idle'); };
  const close = () => { cancelled.current = true; try { rec.current?.stop(); } catch { /* idle */ } setOpen(false); reset(); };

  const showResult = (res) => {
    const list = withMatches(res.items, products);
    setRows(list);
    setCustomer({ name: res.customer?.name || res.customer || '', phone: res.customer?.phone || '' });
    setTranscript(res.transcript || '');
    setState('review');
    if (!list.length) toast(t('ai.nothingFound'), 'info');
  };
  const fail = (e) => { toast(e.message || t('ai.err_ai_failed'), 'error', 7000); setState('idle'); };

  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast(t('ai.noMic'), 'error'); return; }
    cancelled.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      mr.onstop = async () => {
        clearInterval(timer.current);
        stream.getTracks().forEach(tr => tr.stop());
        if (cancelled.current) return;
        const blob = new Blob(chunks, { type: (mr.mimeType || 'audio/webm').split(';')[0] });
        if (blob.size < 1000) { setState('idle'); return; }
        setState('working');
        try { showResult(await aiVoiceBill(blob, currentLanguage())); } catch (e) { fail(e); }
      };
      mr.start(250);
      rec.current = mr;
      setSecs(0);
      timer.current = setInterval(() => setSecs(s => { if (s >= 89) { try { mr.stop(); } catch { /* */ } } return s + 1; }), 1000);
      setState('recording');
    } catch {
      toast(t('ai.noMic'), 'error');
    }
  };
  const stopRec = () => { try { rec.current?.stop(); } catch { /* */ } };

  const pickPhoto = async (f) => {
    if (!f) return;
    setState('working');
    try { showResult(await aiPhotoBill(f, 'sales')); } catch (e) { fail(e); }
  };

  const upd = (i, patch) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const apply = () => {
    const items = rows.filter(r => r.name && Number(r.qty) > 0).map(r => ({ ...r, qty: Number(r.qty), rate: Number(r.rate) || 0 }));
    onApply({ items, customer });
    close();
  };

  const Icon = mode === 'voice' ? Mic : ReceiptText; // bill photo (AI) — not the barcode scanner
  return (
    <>
      <button type="button" className="btn btn-secondary ai-bill-btn" title={t(mode === 'voice' ? 'ai.voiceHint' : 'ai.photoHint')}
        onClick={() => { setOpen(true); if (mode === 'voice') startRec(); }}>
        <Icon size={16} /> {!compact && t(mode === 'voice' ? 'ai.voiceButton' : 'ai.photoButton')}
      </button>
      {open && (
        <div className="modal-overlay" style={{ zIndex: 9990 }} onClick={close}>
          <div className="modal-content ai-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={18} /> {t(mode === 'voice' ? 'ai.voiceTitle' : 'ai.photoTitle')}</h3>
              <button type="button" className="btn btn-secondary" onClick={close} aria-label={t('common.close')}><X size={16} /></button>
            </div>

            {state === 'idle' && mode === 'voice' && (
              <div className="ai-center">
                <p className="settings-help">{t('ai.voiceHelp')}</p>
                <button type="button" className="ai-mic" onClick={startRec}><Mic size={34} /></button>
              </div>
            )}
            {state === 'recording' && (
              <div className="ai-center">
                <p className="settings-help">{t('ai.listening')}</p>
                <button type="button" className="ai-mic rec" onClick={stopRec} aria-label={t('ai.stop')}><Square size={30} /></button>
                <div>{`0:${String(secs).padStart(2, '0')}`} · {t('ai.tapToStop')}</div>
              </div>
            )}
            {state === 'idle' && mode === 'photo' && (
              <div className="ai-center">
                <p className="settings-help">{t('ai.photoHelp')}</p>
                <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}><Camera size={16} /> {t('ai.takePhoto')}</button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => pickPhoto(e.target.files?.[0])} />
              </div>
            )}
            {state === 'working' && <div className="ai-center"><Loader size={28} className="spin" /><p>{t('ai.reading')}</p></div>}
            {state === 'review' && (
              <>
                {transcript && <p className="ai-transcript">“{transcript}”</p>}
                {(customer.name || customer.phone) && (
                  <p className="settings-help">{t('ai.customer')}: <strong>{[customer.name, customer.phone].filter(Boolean).join(' · ')}</strong></p>
                )}
                <div className="ai-rows">
                  {rows.map((r, i) => (
                    <div key={r.key} className="ai-row">
                      <div className="ai-name">
                        <input className="form-input" value={r.name} onChange={e => upd(i, { name: e.target.value, product: null })} />
                        <small className={r.product ? 'ok' : 'new'}>{r.product ? t('ai.matched') : t('ai.newItem')}</small>
                      </div>
                      <input className="form-input ai-num" type="number" min="0" step="any" value={r.qty} onChange={e => upd(i, { qty: e.target.value })} aria-label={t('ai.qty')} />
                      <input className="form-input ai-num" type="number" min="0" step="any" value={r.rate} onChange={e => upd(i, { rate: e.target.value })} aria-label={t('ai.rate')} />
                      <button type="button" className="btn btn-secondary" onClick={() => setRows(x => x.filter((_, j) => j !== i))} aria-label={t('ai.remove')}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <p className="settings-help">{t('ai.checkNote')}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" disabled={!rows.length} onClick={apply}>{t('ai.addToBill', { count: rows.length })}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => { reset(); if (mode === 'voice') startRec(); }}>{t('ai.tryAgain')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
