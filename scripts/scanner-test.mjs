// Unit tests for live barcode scanning: decoder wrapper (native + ZXing),
// debounce, product lookup and cart/bill add logic.
import assert from 'node:assert/strict';
import {
  createDecoder, createScanDebouncer, findProductByCode, addScannedItem, codeVariants,
  rgbaToLuminance, cameraErrorKey, SCAN_FORMATS,
} from '../src/lib/scanner.js';
import { ean13Image, ean13Check } from './lib/ean13.mjs';

let n = 0;
const test = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };
const loadZxing = () => import('@zxing/library');

await test('debounce: same code once while held, again after a 1.5 s gap', () => {
  let t = 0;
  const d = createScanDebouncer(1500, () => t);
  assert.equal(d.accept('8901030123456'), true);
  t = 400; assert.equal(d.accept('8901030123456'), false);
  t = 1800; assert.equal(d.accept('8901030123456'), false, 'still in view (seen 1.4 s ago)');
  t = 1900; assert.equal(d.accept('4006381333931'), true, 'a different code is instant');
  t = 3400; assert.equal(d.accept('8901030123456'), true, 'gone for 1.6 s → counts again');
  assert.equal(d.accept('  '), false);
});

await test('product lookup by barcode / UPC-EAN equivalence / id / name', () => {
  const products = [
    { id: 'p1', name: 'Rice 5kg', barcode: '8901030123456' },
    { id: 'p2', name: 'Soap', barcode: '036000291452' }, // UPC-A
    { id: 'p3', name: 'Oil 1L' },
  ];
  assert.equal(findProductByCode(products, ' 8901030123456 ').id, 'p1');
  assert.equal(findProductByCode(products, '0036000291452').id, 'p2');
  assert.equal(findProductByCode(products, 'p3').id, 'p3');
  assert.equal(findProductByCode(products, 'oil 1l').id, 'p3');
  assert.equal(findProductByCode(products, '999'), null);
  assert.deepEqual(codeVariants('036000291452'), ['036000291452', '0036000291452']);
});

await test('cart add: +1 on existing line, replaces blank starter, else appends', () => {
  const p = { id: 'p1', name: 'Rice', sellingPrice: 450 };
  const build = (x) => ({ id: 'n', name: x.name, rate: x.sellingPrice, productId: x.id, quantity: 1 });
  let items = [{ id: 'blank', name: '', rate: 0, quantity: 1 }];
  items = addScannedItem(items, p, build);
  assert.equal(items.length, 1); assert.equal(items[0].name, 'Rice');
  items = addScannedItem(items, p, build);
  assert.equal(items.length, 1); assert.equal(items[0].quantity, 2);
  items = addScannedItem(items, { id: 'p2', name: 'Soap', sellingPrice: 40 }, build);
  assert.equal(items.length, 2); assert.equal(items[1].quantity, 1);
  const manual = [{ id: 'm', name: 'Typed item', rate: 10, quantity: 1 }];
  assert.equal(addScannedItem(manual, p, build).length, 2);
});

await test('native BarcodeDetector path', async () => {
  class FakeBD {
    static async getSupportedFormats() { return ['ean_13', 'qr_code']; }
    constructor(o) { FakeBD.formats = o.formats; }
    async detect(src) { return src === 'frame' ? [{ rawValue: ' 8901030123456 ' }] : []; }
  }
  const dec = await createDecoder({ BarcodeDetector: FakeBD, loadZxing });
  assert.equal(dec.kind, 'native');
  assert.deepEqual(FakeBD.formats, ['ean_13', 'qr_code']);
  assert.equal(await dec.detect('frame'), '8901030123456');
  assert.equal(await dec.detect('empty'), null);
});

await test('falls back to ZXing when native has none of our formats', async () => {
  class NoFormats { static async getSupportedFormats() { return ['aztec']; } }
  const dec = await createDecoder({ BarcodeDetector: NoFormats, loadZxing });
  assert.equal(dec.kind, 'zxing');
});

await test('ZXing decodes a rendered EAN-13, returns null on blank frames', async () => {
  const dec = await createDecoder({ loadZxing });
  const code12 = '890103012345';
  const img = ean13Image(code12, { mod: 3, height: 80 });
  assert.equal(await dec.detect(img), code12 + ean13Check(code12));
  const blank = { luminance: new Uint8ClampedArray(200 * 50).fill(255), width: 200, height: 50 };
  assert.equal(await dec.detect(blank), null);
  // RGBA path via grab()
  const rgba = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0; i < img.luminance.length; i++) rgba.set([img.luminance[i], img.luminance[i], img.luminance[i], 255], i * 4);
  assert.deepEqual(rgbaToLuminance(rgba, img.width, img.height), img.luminance);
  const dec2 = await createDecoder({ loadZxing, grab: () => ({ data: rgba, width: img.width, height: img.height }) });
  assert.equal(await dec2.detect('video'), code12 + ean13Check(code12));
});

await test('camera error messages', () => {
  assert.equal(cameraErrorKey({ name: 'NotAllowedError' }), 'scan.errDenied');
  assert.equal(cameraErrorKey({ name: 'NotFoundError' }), 'scan.errNoCamera');
  assert.equal(cameraErrorKey({ name: 'NotReadableError' }), 'scan.errBusy');
  assert.equal(cameraErrorKey(new Error('x')), 'scan.errGeneric');
  assert.ok(SCAN_FORMATS.includes('code_39') && SCAN_FORMATS.includes('upc_e'));
});

console.log(`scanner-test: ${n} groups passed`);
