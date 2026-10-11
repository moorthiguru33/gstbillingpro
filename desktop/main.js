// GST Billing Pro — Windows desktop wrapper.
// Loads the live web app in its own window (no browser chrome), keeps one
// instance, opens outside links in the default browser and shows a friendly
// offline page when the site can't be reached.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const APP_URL = 'https://gst-billing-pro.pages.dev/';
const APP_HOST = new URL(APP_URL).host;
const ICON = path.join(__dirname, 'icon.png');

app.setAppUserModelId('dev.pages.gstbillingpro.desktop');
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function isInternal(url) {
  try {
    const u = new URL(url);
    // Supabase / Google sign-in and Razorpay checkout must stay inside the
    // window so the login and payment flows can return to the app.
    return u.host === APP_HOST || u.host.endsWith('.supabase.co') || u.host === 'accounts.google.com' || u.host.endsWith('razorpay.com');
  } catch { return false; }
}

function showOffline() {
  if (!win) return;
  win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: APP_URL } });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    title: 'GST Billing Pro',
    icon: ICON,
    backgroundColor: '#F8FAFC',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' };
    if (/^(https?|mailto|tel|whatsapp):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:')) return;
    if (!isInternal(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    // -3 = aborted (normal during redirects)
    if (isMainFrame && code !== -3 && !String(url).startsWith('file:')) showOffline();
  });
  win.webContents.on('render-process-gone', () => showOffline());
  win.on('closed', () => { win = null; });

  win.loadURL(APP_URL);
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'App', submenu: [
      { label: 'Reload', accelerator: 'F5', click: () => win && win.loadURL(APP_URL) },
      { role: 'togglefullscreen' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ]));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
