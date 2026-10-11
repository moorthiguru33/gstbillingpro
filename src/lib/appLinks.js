// Download links for the native wrappers (GitHub Release assets).
const REL = 'https://github.com/moorthiguru33/gstbillingpro/releases';
export const WINDOWS_DOWNLOAD_URL = `${REL}/download/desktop-v1.0.0/GST-Billing-Pro-Setup-1.0.0.exe`;
export const WINDOWS_PORTABLE_URL = `${REL}/download/desktop-v1.0.0/GST-Billing-Pro-Portable-1.0.0.exe`;
export const ANDROID_DOWNLOAD_URL = `${REL}/download/android-v1.0.0/gst-billing-pro-1.0.0.apk`;
export const RELEASES_URL = REL;
// Public web origin (shop links, QR posters). The desktop build runs from a
// local origin, so links always point at the live site.
export const PUBLIC_ORIGIN = (typeof window !== 'undefined' && /^https:\/\//.test(window.location.origin) && !/localhost|127\.0\.0\.1/.test(window.location.origin))
  ? window.location.origin : 'https://gst-billing-pro.pages.dev';
