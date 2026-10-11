import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, AlertCircle, Flashlight, FlashlightOff, SwitchCamera, Check, PackagePlus, ScanBarcode } from 'lucide-react';
import { createDecoder, createScanDebouncer, cameraErrorKey, normalizeCode } from '../lib/scanner';
import { saveProduct } from '../store';
import { formatCurrency } from '../utils';
import { t as tr } from '../i18n';

// Live, continuous barcode scanner (rear camera, full screen).
//
//  mode="continuous" (default): every new code goes to onScan(code) and the
//    camera keeps running until Done. onScan may return
//      { ok: true, name, price }  → beep + "added" toast
//      { ok: false }              → "not found" + "Add new product with this barcode"
//  mode="single": the first code is passed to onScan and the scanner closes
//    (product barcode field, stock-in lookup).
//
// It renders as a .modal-overlay so the Back button (lib/appRouter) closes it,
// and every exit path stops the camera tracks.

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1850, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.11);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.11);
  } catch { /* audio blocked */ }
  try { navigator.vibrate?.(70); } catch { /* no vibration */ }
}
function buzz() { try { navigator.vibrate?.([40, 60, 40]); } catch { /* ignore */ } }

export default function BarcodeScannerModal({ isOpen = true, onClose, onScan, onDetected, mode = 'continuous', onProductCreated }) {
  const handler = onScan || onDetected;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const decoderRef = useRef(null);
  const loopFnRef = useRef(null);
  const loopRef = useRef(null);
  const busyRef = useRef(false);
  const aliveRef = useRef(false);
  const debouncer = useRef(createScanDebouncer(1500));
  const handlerRef = useRef(handler);
  const pausedRef = useRef(false);
  const [phase, setPhase] = useState('starting'); // starting | live | error
  const [errKey, setErrKey] = useState('');
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [cams, setCams] = useState([]);
  const [camIdx, setCamIdx] = useState(-1);
  const [flash, setFlash] = useState(null); // { ok, text }
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState([]);
  const [unknown, setUnknown] = useState(null); // code
  const [newProd, setNewProd] = useState(null); // form state
  const [manual, setManual] = useState('');
  const flashTimer = useRef(null);

  useEffect(() => { handlerRef.current = handler; }, [handler]);

  const showFlash = (ok, text) => {
    setFlash({ ok, text });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  };

  const stopCamera = useCallback(() => {
    aliveRef.current = false;
    clearTimeout(loopRef.current);
    const s = streamRef.current;
    if (s) s.getTracks().forEach(t => { try { t.stop(); } catch { /* ignore */ } });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const close = useCallback(() => { stopCamera(); onClose?.(); }, [stopCamera, onClose]);

  // A code came in (camera or typed).
  const handleCode = useCallback(async (raw, product) => {
    const code = normalizeCode(raw);
    if (!code || !handlerRef.current) return;
    if (mode === 'single') {
      beep();
      stopCamera();
      handlerRef.current(code, product);
      onClose?.();
      return;
    }
    let res;
    try { res = await handlerRef.current(code, product, { fromScanner: true }); } catch { res = { ok: false }; }
    if (res && res.ok === false) {
      buzz();
      setUnknown(code);
      showFlash(false, tr('scan.notFound', { code }));
      return;
    }
    beep();
    setUnknown(null);
    setCount(c => c + 1);
    const name = res?.name || code;
    const price = res && res.price != null ? formatCurrency(res.price) : '';
    setRecent(r => [{ key: `${code}-${Date.now()}`, name, price }, ...r].slice(0, 4));
    showFlash(true, price ? `${name} · ${price}` : name);
  }, [mode, stopCamera, onClose]);

  const grab = useCallback((video) => {
    const vw = video.videoWidth; const vh = video.videoHeight;
    if (!vw || !vh) return null;
    // decode the centre band (where the scan frame is), max 960 px wide
    const cw = Math.round(vw * 0.86); const ch = Math.round(vh * 0.5);
    const scale = Math.min(1, 960 / cw);
    const w = Math.max(1, Math.round(cw * scale)); const h = Math.max(1, Math.round(ch * scale));
    const c = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return { data, width: w, height: h };
  }, []);

  const loop = useCallback(async () => {
    if (!aliveRef.current) return;
    const v = videoRef.current;
    const dec = decoderRef.current;
    if (v && dec && v.readyState >= 2 && !busyRef.current && !pausedRef.current) {
      busyRef.current = true;
      try {
        const code = await dec.detect(v);
        if (code && aliveRef.current && debouncer.current.accept(code)) await handleCode(code);
      } finally { busyRef.current = false; }
    }
    if (aliveRef.current) loopRef.current = setTimeout(() => loopFnRef.current?.(), decoderRef.current?.kind === 'native' ? 90 : 140);
  }, [handleCode]);
  useEffect(() => { loopFnRef.current = loop; }, [loop]);

  const startCamera = useCallback(async (deviceId) => {
    stopCamera();
    setPhase('starting'); setErrKey('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no media'), { name: 'NoMediaDevices' });
      const video = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) { stream.getTracks().forEach(t => t.stop()); return; }
      v.srcObject = stream;
      v.setAttribute('playsinline', ''); v.muted = true;
      await v.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() || {};
      setTorch({ supported: !!caps.torch, on: false });
      try {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        setCams(devs);
        const cur = track?.getSettings?.().deviceId;
        setCamIdx(Math.max(0, devs.findIndex(d => d.deviceId === cur)));
      } catch { /* ignore */ }
      if (!decoderRef.current) {
        decoderRef.current = await createDecoder({
          BarcodeDetector: window.BarcodeDetector,
          loadZxing: () => import('@zxing/library'),
          grab,
        });
      }
      aliveRef.current = true;
      setPhase('live');
      loop();
    } catch (err) {
      console.warn('Camera start failed:', err?.name || err);
      stopCamera();
      setErrKey(cameraErrorKey(err));
      setPhase('error');
    }
  }, [stopCamera, grab, loop]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const boot = setTimeout(() => startCamera(), 0);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const onHide = () => { if (document.hidden) stopCamera(); else if (!aliveRef.current) startCamera(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(boot);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      stopCamera();
      clearTimeout(flashTimer.current);
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch.on }] });
      setTorch(t => ({ ...t, on: !t.on }));
    } catch { setTorch({ supported: false, on: false }); }
  };
  const switchCamera = () => {
    if (cams.length < 2) return;
    const next = (camIdx + 1) % cams.length;
    setCamIdx(next);
    startCamera(cams[next].deviceId);
  };

  const openNewProduct = () => {
    pausedRef.current = true;
    setNewProd({ code: unknown, name: '', price: '', gst: '' });
  };
  const saveNewProduct = async (e) => {
    e.preventDefault();
    if (!newProd?.name.trim()) return;
    const price = parseFloat(newProd.price) || 0;
    const p = {
      name: newProd.name.trim(), barcode: newProd.code, sellingPrice: price, rate: price,
      taxPercent: newProd.gst === '' ? 0 : parseFloat(newProd.gst) || 0, unit: 'Nos', hsn: '',
    };
    try {
      const saved = await saveProduct(p);
      const full = { ...p, ...(saved || {}) };
      onProductCreated?.(full);
      setNewProd(null); setUnknown(null);
      pausedRef.current = false;
      await handleCode(newProd.code, full);
    } catch {
      showFlash(false, tr('scan.saveFailed'));
    }
  };

  const submitManual = (e) => {
    e.preventDefault();
    const c = manual.trim();
    if (!c) return;
    setManual('');
    handleCode(c);
  };

  if (!isOpen) return null;

  const btn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 48, minHeight: 48, borderRadius: 14, border: 0, cursor: 'pointer', fontWeight: 700, fontSize: 15 };
  return createPortal(
    <div className="modal-overlay scanner-overlay" role="dialog" aria-modal="true" aria-label={tr('scan.title')}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: '#000', display: 'flex', flexDirection: 'column', padding: 0, alignItems: 'stretch', justifyContent: 'stretch' }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', color: '#fff', minHeight: 0 }}>
        {/* top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px', background: 'linear-gradient(rgba(0,0,0,.65), rgba(0,0,0,0))' }}>
          <button type="button" onClick={close} aria-label={tr('common.close')} style={{ ...btn, background: 'rgba(255,255,255,.14)', color: '#fff' }}><X size={22} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{tr('scan.title')}</div>
            <div style={{ fontSize: 13, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mode === 'single' ? tr('scan.hintSingle') : tr('scan.hint')}</div>
          </div>
          {torch.supported && (
            <button type="button" onClick={toggleTorch} aria-pressed={torch.on} aria-label={tr('scan.torch')} title={tr('scan.torch')}
              style={{ ...btn, background: torch.on ? '#facc15' : 'rgba(255,255,255,.14)', color: torch.on ? '#111' : '#fff' }}>
              {torch.on ? <Flashlight size={22} /> : <FlashlightOff size={22} />}
            </button>
          )}
          {cams.length > 1 && (
            <button type="button" onClick={switchCamera} aria-label={tr('scan.switchCamera')} title={tr('scan.switchCamera')} style={{ ...btn, background: 'rgba(255,255,255,.14)', color: '#fff' }}>
              <SwitchCamera size={22} />
            </button>
          )}
        </div>

        {/* camera */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', background: '#000' }}>
          <video ref={videoRef} className="scanner-video" autoPlay playsInline muted
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          {phase !== 'error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ width: '86%', maxWidth: 520, height: '34%', maxHeight: 260, borderRadius: 18, border: `3px solid ${flash ? (flash.ok ? '#22c55e' : '#f87171') : 'rgba(255,255,255,.9)'}`, boxShadow: '0 0 0 9999px rgba(0,0,0,.45)', position: 'relative', transition: 'border-color .15s' }}>
                <div className="scanner-laser" />
              </div>
            </div>
          )}
          {phase === 'starting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{tr('scan.starting')}</div>
          )}
          {phase === 'error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', gap: 14 }}>
              <AlertCircle size={44} color="#f87171" />
              <p className="scanner-error" style={{ margin: 0, fontSize: 16, lineHeight: 1.45, maxWidth: 420 }}>{tr(errKey || 'scan.errGeneric')}</p>
              <button type="button" onClick={() => startCamera()} style={{ ...btn, padding: '0 1.2rem', background: '#2563eb', color: '#fff' }}><RefreshCw size={18} /> {tr('scan.retry')}</button>
            </div>
          )}
          {flash && (
            <div className="scanner-toast" role="status" style={{ position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top, 0px) + 84px)', transform: 'translateX(-50%)', maxWidth: '92%', zIndex: 4, padding: '10px 16px', borderRadius: 999, background: flash.ok ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 6px 20px rgba(0,0,0,.35)' }}>
              {flash.ok ? <Check size={18} /> : <AlertCircle size={18} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flash.text}</span>
            </div>
          )}
        </div>

        {/* bottom panel */}
        <div style={{ background: '#0f172a', padding: '12px 12px calc(12px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unknown && !newProd && mode !== 'single' && (
            <button type="button" className="scanner-addnew" onClick={openNewProduct} style={{ ...btn, width: '100%', background: '#f59e0b', color: '#111' }}>
              <PackagePlus size={20} /> {tr('scan.addNew')}
            </button>
          )}
          {newProd && (
            <form onSubmit={saveNewProduct} style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 13, opacity: 0.85 }}>{tr('scan.barcode')}: <b>{newProd.code}</b></div>
              <input autoFocus required placeholder={tr('scan.productName')} value={newProd.name} onChange={e => setNewProd(p => ({ ...p, name: e.target.value }))}
                style={{ minHeight: 46, fontSize: 16, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '0 12px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input inputMode="decimal" placeholder={tr('scan.price')} value={newProd.price} onChange={e => setNewProd(p => ({ ...p, price: e.target.value }))}
                  style={{ minHeight: 46, fontSize: 16, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '0 12px', minWidth: 0 }} />
                <input inputMode="decimal" placeholder={tr('scan.gst')} value={newProd.gst} onChange={e => setNewProd(p => ({ ...p, gst: e.target.value }))}
                  style={{ minHeight: 46, fontSize: 16, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '0 12px', minWidth: 0 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                <button type="button" onClick={() => { setNewProd(null); setUnknown(null); pausedRef.current = false; }} style={{ ...btn, background: '#334155', color: '#fff' }}>{tr('scan.cancel')}</button>
                <button type="submit" style={{ ...btn, background: '#16a34a', color: '#fff' }}><Check size={18} /> {tr('scan.saveAdd')}</button>
              </div>
            </form>
          )}
          {!newProd && recent.length > 0 && (
            <div className="scanner-recent" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
              {recent.map(r => (
                <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, opacity: 0.9 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {r.name}</span><b style={{ flex: 'none' }}>{r.price}</b>
                </div>
              ))}
            </div>
          )}
          {!newProd && (
            <form onSubmit={submitManual} style={{ display: 'flex', gap: 8 }}>
              <input value={manual} onChange={e => setManual(e.target.value)} inputMode="numeric" placeholder={tr('scan.typeCode')} aria-label={tr('scan.typeCode')}
                style={{ flex: 1, minWidth: 0, minHeight: 48, fontSize: 16, borderRadius: 12, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '0 12px' }} />
              <button type="submit" style={{ ...btn, padding: '0 14px', background: '#334155', color: '#fff' }}>{tr('scan.add')}</button>
              {mode !== 'single' && (
                <button type="button" className="scanner-done" onClick={close} style={{ ...btn, padding: '0 18px', background: '#2563eb', color: '#fff' }}>
                  <ScanBarcode size={18} /> {tr('scan.done')}{count ? ` (${count})` : ''}
                </button>
              )}
            </form>
          )}
          <div style={{ fontSize: 12.5, opacity: 0.65, textAlign: 'center' }}>{tr('scan.formats')}</div>
        </div>
      </div>
      <style>{`
        .scanner-laser { position: absolute; left: 6%; right: 6%; height: 2px; background: #ef4444; box-shadow: 0 0 10px #ef4444; top: 50%; animation: scannerLaser 1.8s ease-in-out infinite; }
        @keyframes scannerLaser { 0%, 100% { top: 18%; } 50% { top: 82%; } }
      `}</style>
    </div>,
    document.body,
  );
}
