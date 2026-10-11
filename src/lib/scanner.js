// Live barcode scanning helpers — pure logic, unit tested in
// scripts/scanner-test.mjs. The camera UI lives in
// components/BarcodeScannerModal.jsx.

// Formats we ask the decoder for (BarcodeDetector names).
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

export const normalizeCode = (code) => String(code ?? '').trim().replace(/\s+/g, '');

// UPC-A (12 digits) and EAN-13 with a leading 0 are the same product code;
// some decoders report one, some the other.
export function codeVariants(code) {
  const c = normalizeCode(code).toLowerCase();
  if (!c) return [];
  const out = new Set([c]);
  if (/^\d{12}$/.test(c)) out.add(`0${c}`);
  if (/^0\d{12}$/.test(c)) out.add(c.slice(1));
  return [...out];
}

// Product lookup: barcode first (with UPC/EAN equivalence), then id, then exact name.
export function findProductByCode(products, code) {
  const variants = codeVariants(code);
  if (!variants.length || !Array.isArray(products)) return null;
  const vs = new Set(variants);
  return products.find(p => p && p.barcode && vs.has(normalizeCode(p.barcode).toLowerCase()))
    || products.find(p => p && p.id != null && vs.has(String(p.id).toLowerCase()))
    || products.find(p => p && p.name && p.name.trim().toLowerCase() === String(code).trim().toLowerCase())
    || null;
}

// Same code is ignored while it keeps being seen; it is accepted again once
// it has been out of view for `ms` (so holding a barcode steady adds it once,
// and taking the item away and scanning it again adds it again).
export function createScanDebouncer(ms = 1500, now = () => Date.now()) {
  const lastSeen = new Map();
  return {
    accept(code) {
      const c = normalizeCode(code);
      if (!c) return false;
      const t = now();
      const prev = lastSeen.get(c);
      lastSeen.set(c, t);
      if (lastSeen.size > 200) lastSeen.delete(lastSeen.keys().next().value);
      return prev === undefined || t - prev >= ms;
    },
    reset() { lastSeen.clear(); },
  };
}

// Add a scanned product to an invoice item list: +1 qty on an existing line
// for the same product, replace the single blank starter line, else append.
export function addScannedItem(items, product, buildItem, qty = 1) {
  const list = Array.isArray(items) ? items : [];
  const idx = list.findIndex(it => it && product && it.productId != null && String(it.productId) === String(product.id));
  if (idx >= 0) {
    return list.map((it, i) => (i === idx ? { ...it, quantity: (Number(it.quantity) || 0) + qty } : it));
  }
  const fresh = { ...buildItem(product), quantity: qty };
  const blankStarter = list.length === 1 && !list[0]?.name && !(Number(list[0]?.rate) > 0);
  return blankStarter ? [fresh] : [...list, fresh];
}

// Converts RGBA pixels to 8-bit luminance (what the JS decoder wants).
export function rgbaToLuminance(rgba, width, height) {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return out;
}

const ZXING_FORMAT_NAMES = {
  ean_13: 'EAN_13', ean_8: 'EAN_8', upc_a: 'UPC_A', upc_e: 'UPC_E',
  code_128: 'CODE_128', code_39: 'CODE_39', qr_code: 'QR_CODE',
};

/**
 * Decoder wrapper: native BarcodeDetector when it supports our formats,
 * otherwise ZXing (lazy loaded). `detect(source)` resolves to the first code
 * string or null — never throws for "nothing found".
 *   deps.BarcodeDetector  the global constructor (or undefined)
 *   deps.loadZxing        () => import('@zxing/library')
 *   deps.grab             (source) => { data, width, height } | null  (pixels for ZXing)
 */
export async function createDecoder({ BarcodeDetector, loadZxing, grab, formats = SCAN_FORMATS } = {}) {
  if (BarcodeDetector) {
    try {
      const supported = typeof BarcodeDetector.getSupportedFormats === 'function'
        ? await BarcodeDetector.getSupportedFormats() : formats;
      const use = formats.filter(f => supported.includes(f));
      if (use.length) {
        const det = new BarcodeDetector({ formats: use });
        return {
          kind: 'native',
          async detect(source) {
            try {
              const found = await det.detect(source);
              const v = found && found[0] && normalizeCode(found[0].rawValue);
              return v || null;
            } catch { return null; }
          },
        };
      }
    } catch { /* fall through to ZXing */ }
  }
  if (!loadZxing) throw new Error('no-decoder');
  const Z = await loadZxing();
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, formats.map(f => Z.BarcodeFormat[ZXING_FORMAT_NAMES[f]]).filter(v => v !== undefined));
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  return {
    kind: 'zxing',
    async detect(source) {
      const px = grab ? grab(source) : source;
      if (!px || !px.width || !px.height) return null;
      const lum = px.luminance || rgbaToLuminance(px.data, px.width, px.height);
      try {
        const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum, px.width, px.height)));
        const res = reader.decodeWithState(bitmap);
        return normalizeCode(res.getText()) || null;
      } catch {
        return null; // NotFound / checksum / format — just try the next frame
      } finally {
        reader.reset();
      }
    },
  };
}

// Human message for getUserMedia failures (keys under scan.*).
export function cameraErrorKey(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'scan.errDenied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'scan.errNoCamera';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'scan.errBusy';
  if (name === 'NoMediaDevices') return 'scan.errUnsupported';
  return 'scan.errGeneric';
}
