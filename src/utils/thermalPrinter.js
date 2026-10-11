// Direct printing to ESC/POS thermal printers over Web Bluetooth or WebUSB
// (Chrome/Edge on Android, Windows, Mac, ChromeOS). Falls back to the
// browser print dialog when neither is available or the printer is gone.

const KEY = 'gbp_thermal_printer'; // { kind, name, paper, vendorId, productId }

// Service UUIDs used by most cheap BLE receipt printers.
const BT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

let btChar = null; // cached writable characteristic for this page session
let usbDev = null;

export const hasBluetooth = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
export const hasUsb = () => typeof navigator !== 'undefined' && !!navigator.usb;
export const directPrintSupported = () => hasBluetooth() || hasUsb();

export function savedPrinter() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function savePrinterSettings(patch) {
  const next = { paper: 80, ...(savedPrinter() || {}), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
export function forgetPrinter() {
  localStorage.removeItem(KEY);
  try { btChar?.service?.device?.gatt?.disconnect(); } catch { /* ignore */ }
  btChar = null; usbDev = null;
}

async function findWritable(server) {
  for (const uuid of BT_SERVICES) {
    try {
      const svc = await server.getPrimaryService(uuid);
      for (const ch of await svc.getCharacteristics()) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
      }
    } catch { /* try next */ }
  }
  throw new Error('No writable printer characteristic found');
}

async function connectBluetooth(device) {
  const server = await device.gatt.connect();
  btChar = await findWritable(server);
  return btChar;
}

export async function pairBluetooth(paper = 80) {
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
  await connectBluetooth(device);
  return savePrinterSettings({ kind: 'bluetooth', name: device.name || 'Bluetooth printer', id: device.id, paper });
}

async function openUsb(dev) {
  if (!dev.opened) await dev.open();
  if (dev.configuration === null) await dev.selectConfiguration(1);
  const iface = dev.configuration.interfaces.find(i => i.alternate.endpoints.some(e => e.direction === 'out'));
  if (!iface) throw new Error('Printer has no output endpoint');
  try { await dev.claimInterface(iface.interfaceNumber); } catch { /* already claimed */ }
  dev._gbpOut = iface.alternate.endpoints.find(e => e.direction === 'out').endpointNumber;
  usbDev = dev;
  return dev;
}

export async function pairUsb(paper = 80) {
  const dev = await navigator.usb.requestDevice({ filters: [] });
  await openUsb(dev);
  return savePrinterSettings({ kind: 'usb', name: dev.productName || 'USB printer', vendorId: dev.vendorId, productId: dev.productId, paper });
}

// Reconnect to the remembered printer without a chooser (permission persists).
async function reconnect(p) {
  if (p.kind === 'usb') {
    if (usbDev?.opened) return;
    const devs = await navigator.usb.getDevices();
    const dev = devs.find(d => d.vendorId === p.vendorId && d.productId === p.productId);
    if (!dev) throw new Error('Printer not connected');
    await openUsb(dev);
  } else {
    if (btChar?.service?.device?.gatt?.connected) return;
    if (!navigator.bluetooth.getDevices) throw new Error('Reconnect needs pairing again');
    const devs = await navigator.bluetooth.getDevices();
    const dev = devs.find(d => d.id === p.id) || devs[0];
    if (!dev) throw new Error('Printer not paired');
    await connectBluetooth(dev);
  }
}

export async function sendBytes(bytes) {
  const p = savedPrinter();
  if (!p?.kind) throw new Error('No printer paired');
  await reconnect(p);
  if (p.kind === 'usb') {
    await usbDev.transferOut(usbDev._gbpOut, bytes);
    return;
  }
  // BLE writes are limited (~20-512 bytes); 180 works on almost everything.
  for (let i = 0; i < bytes.length; i += 180) {
    const chunk = bytes.slice(i, i + 180);
    if (btChar.writeValueWithoutResponse && btChar.properties.writeWithoutResponse) await btChar.writeValueWithoutResponse(chunk);
    else await btChar.writeValue(chunk);
  }
}

/**
 * Try the paired thermal printer; resolve true when printed, false when the
 * caller should fall back to window.print().
 */
export async function printDirect(buildBytes) {
  const p = savedPrinter();
  if (!p?.kind || !directPrintSupported()) return false;
  try {
    await sendBytes(buildBytes(p.paper || 80));
    return true;
  } catch (err) {
    console.warn('[thermal] direct print failed, falling back', err);
    return false;
  }
}
