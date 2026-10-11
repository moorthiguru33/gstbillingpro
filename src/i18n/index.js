// ============================================================
// App UI translations (react-i18next).
//
// - English is bundled; the other 8 languages are lazy-loaded JSON chunks.
// - Detection order: ?lang=xx → saved choice (localStorage gbp_lang) →
//   browser language → English. The choice is saved when the user picks.
// - This is ONLY the app UI language. The invoice PRINT language is a
//   separate, existing setting (printSettings.labelLanguage) and is never
//   changed from here.
// - GST terms (GSTIN, HSN, SAC, CGST/SGST/IGST, GSTR-1/3B) stay in English
//   in every language on purpose: that is how they appear on GST portal
//   documents and how shop owners search for them.
// ============================================================
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';

export const LANGUAGES = Object.freeze([
  { code: 'en', native: 'English', english: 'English', script: 'latin' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', script: 'devanagari' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', script: 'tamil' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', script: 'telugu' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', script: 'kannada' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', script: 'malayalam' },
  { code: 'mr', native: 'मराठी', english: 'Marathi', script: 'devanagari' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', script: 'bengali' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', script: 'gujarati' },
]);
export const LANGUAGE_CODES = LANGUAGES.map(l => l.code);
export const LANG_STORAGE_KEY = 'gbp_lang';
// Invoice print labels exist for these (utils/printSettings.js LABELS).
export const PRINT_LABEL_LANGUAGES = ['en', 'hi', 'ta', 'mr', 'bn'];

const loaders = import.meta.glob(['./locales/*.json', '!./locales/en.json']);

const lazyBackend = {
  type: 'backend',
  init() {},
  read(language, _ns, callback) {
    if (language === 'en') { callback(null, en); return; }
    const load = loaders[`./locales/${language}.json`];
    if (!load) { callback(null, {}); return; }
    load().then(m => callback(null, m.default || m)).catch(err => callback(err, null));
  },
};

function applyDocumentLanguage(lng) {
  if (typeof document === 'undefined') return;
  const meta = LANGUAGES.find(l => l.code === lng) || LANGUAGES[0];
  document.documentElement.lang = meta.code === 'en' ? 'en-IN' : `${meta.code}-IN`;
  document.documentElement.dataset.script = meta.script;
}

i18n
  .use(lazyBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: LANGUAGE_CODES,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: [], // only persist an explicit choice (setLanguage)
    },
    react: { useSuspense: false },
    returnNull: false,
  });

applyDocumentLanguage(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

/** Switch the UI language and remember the choice on this device. */
export function setLanguage(code) {
  if (!LANGUAGE_CODES.includes(code)) return Promise.resolve();
  try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch { /* private mode */ }
  return i18n.changeLanguage(code);
}
export const currentLanguage = () => (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
export const hasChosenLanguage = () => { try { return Boolean(localStorage.getItem(LANG_STORAGE_KEY)); } catch { return false; } };

/** Plain function for code outside React render (toasts, alerts, configs). */
export const t = (key, opts) => i18n.t(key, opts);
export default i18n;
