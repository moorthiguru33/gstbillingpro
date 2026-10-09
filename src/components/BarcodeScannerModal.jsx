import { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, AlertCircle, Volume2 } from 'lucide-react';

export default function BarcodeScannerModal({ isOpen, onClose, onScan }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const detectorRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastScannedRef = useRef('');
  const scanCooldownRef = useRef(0);

  // Play crisp scanner beep
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // High pitch supermarket beep
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      if (navigator.vibrate) navigator.vibrate(80);
    } catch { /* audio blocked */ }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setError('');
    setScanning(true);
    try {
      // Check BarcodeDetector support
      if ('BarcodeDetector' in window) {
        try {
          detectorRef.current = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
          });
        } catch {
          detectorRef.current = null;
        }
      }

      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        scanLoop();
      }
    } catch (err) {
      console.warn('Camera access failed:', err);
      setError('Camera access denied or unavailable. You can enter the barcode manually below.');
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const scanLoop = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const now = Date.now();
    if (detectorRef.current && now - scanCooldownRef.current > 800) {
      try {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        if (barcodes && barcodes.length > 0) {
          const rawValue = barcodes[0].rawValue?.trim();
          if (rawValue && rawValue !== lastScannedRef.current) {
            lastScannedRef.current = rawValue;
            scanCooldownRef.current = now;
            playBeep();
            onScan(rawValue);
          }
        }
      } catch { /* frame detect skip */ }
    }

    animFrameRef.current = requestAnimationFrame(scanLoop);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    playBeep();
    onScan(manualCode.trim());
    setManualCode('');
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1rem',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: '#0f172a', borderRadius: 20, width: '100%', maxWidth: 460,
        overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        border: '1px solid #334155', color: '#fff', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: '1px solid #1e293b',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Camera size={20} color="#38bdf8" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Barcode Scanner</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#94a3b8',
              cursor: 'pointer', padding: '0.25rem', display: 'flex',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Viewport Area */}
        <div style={{ position: 'relative', width: '100%', height: 280, background: '#000', overflow: 'hidden' }}>
          {error ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
            }}>
              <AlertCircle size={40} color="#f87171" style={{ marginBottom: '0.75rem' }} />
              <p style={{ fontSize: '0.9rem', color: '#cbd5e1', margin: 0 }}>{error}</p>
              <button
                onClick={startCamera}
                style={{
                  marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', border: 'none',
                  borderRadius: 8, fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} /> Try Again
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {/* Scan Overlay Frame */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
              }}>
                <div style={{
                  width: '75%', height: '60%', border: '2px solid #38bdf8',
                  borderRadius: 12, position: 'relative',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                }}>
                  {/* Laser aiming line */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, height: 2,
                    background: '#ef4444', top: '50%', boxShadow: '0 0 8px #ef4444',
                    animation: 'laserScan 2s infinite ease-in-out',
                  }} />
                </div>
              </div>
              <style>{`
                @keyframes laserScan {
                  0%, 100% { top: 15%; opacity: 0.8; }
                  50% { top: 85%; opacity: 1; }
                }
              `}</style>
            </>
          )}
        </div>

        {/* Footer with Manual Input */}
        <div style={{ padding: '1.25rem', background: '#1e293b' }}>
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Or type / scan barcode here..."
              autoFocus
              style={{
                flex: 1, padding: '0.65rem 0.85rem', borderRadius: 8,
                background: '#0f172a', border: '1px solid #334155',
                color: '#fff', fontSize: '0.9rem', outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '0.65rem 1.25rem', background: '#2563eb',
                color: '#fff', border: 'none', borderRadius: 8,
                fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
              }}
            >
              Add
            </button>
          </form>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: '0.75rem', fontSize: '0.75rem', color: '#94a3b8',
          }}>
            <span>Supports EAN-13, Code-128, UPC, QR codes</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Volume2 size={12} color="#38bdf8" /> Beep on scan
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
