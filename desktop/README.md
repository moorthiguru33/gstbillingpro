# GST Billing Pro — Windows desktop app

A small Electron wrapper that opens https://gst-billing-pro.pages.dev in its own
window: app name/icon, single instance, outside links open in the browser and a
friendly offline page with auto-retry. No auto-update (the web app updates itself).

Build (works on Linux, no Wine needed — the exe icon/version info is written by
`build/afterPack.js` with `resedit`):

```bash
cd desktop
cp ../public/icons/icon-512.png icon.png
python3 -c "from PIL import Image; Image.open('icon.png').save('icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])"
npm install
npm run dist:win     # dist/GST-Billing-Pro-Setup-1.0.0.exe + GST-Billing-Pro-Portable-1.0.0.exe
```

Upload both exe files to the GitHub release `desktop-v1.0.0`; the landing page and
Settings → Help link to them (`src/lib/appLinks.js`). Binaries are never committed.
