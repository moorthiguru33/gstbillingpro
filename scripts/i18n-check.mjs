#!/usr/bin/env node
// i18n key coverage check (part of `npm run test:unit`). Fails when:
//   * a locale is missing a key that en.json has, has an extra key, or an empty value
//   * a {{placeholder}} from English is missing in a translation
//   * the code calls t('some.key') / tr('some.key') that en.json does not define
// `--prune` rewrites en.json without keys that nothing uses (dev helper).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'src/i18n/locales');
// Sections whose keys are also built at runtime (t(`plans.${tier}`) …): never pruned.
const DYNAMIC_PREFIXES = ['landing.', 'biz.', 'plans.', 'lang.'];
const PLURAL = /_(zero|one|two|few|many|other)$/;

const flat = (obj, pre = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flat(v, `${pre}${k}.`, out); else out[pre + k] = v;
  }
  return out;
};
const placeholders = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]).sort();

function walk(dir, files = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'locales' && f !== 'node_modules') walk(p, files); } else if (/\.(jsx?|mjs)$/.test(f)) files.push(p);
  }
  return files;
}

const enRaw = JSON.parse(readFileSync(path.join(DIR, 'en.json'), 'utf8'));
const en = flat(enRaw);
const enBase = new Set(Object.keys(en).map(k => k.replace(PLURAL, '')));
const used = new Set();
const CALL = /\b(?:t|tr|i18nT|i18n\.t)\(\s*['"]([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)['"]/g;
for (const f of walk(path.join(ROOT, 'src'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(CALL)) used.add(m[1]);
}

const errors = [];
for (const k of used) if (!enBase.has(k)) errors.push(`en.json: missing key used in code: ${k}`);

if (process.argv.includes('--prune')) {
  const keep = (k) => used.has(k.replace(PLURAL, '')) || DYNAMIC_PREFIXES.some(p => k.startsWith(p));
  const out = {};
  let removed = 0;
  for (const [sec, obj] of Object.entries(enRaw)) {
    for (const [k, v] of Object.entries(obj)) {
      if (keep(`${sec}.${k}`)) (out[sec] ||= {})[k] = v; else removed++;
    }
  }
  writeFileSync(path.join(DIR, 'en.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`pruned ${removed} unused keys; ${Object.keys(flat(out)).length} remain`);
  process.exit(0);
}

const locales = readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'en.json');
for (const file of locales) {
  const loc = flat(JSON.parse(readFileSync(path.join(DIR, file), 'utf8')));
  for (const [k, v] of Object.entries(en)) {
    if (!(k in loc)) { errors.push(`${file}: missing ${k}`); continue; }
    if (typeof loc[k] !== 'string' || !loc[k].trim()) errors.push(`${file}: empty ${k}`);
    else if (placeholders(v).join() !== placeholders(loc[k]).join()) errors.push(`${file}: placeholders differ in ${k}`);
  }
  for (const k of Object.keys(loc)) if (!(k in en)) errors.push(`${file}: extra key ${k}`);
}
const EXPECTED = ['hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu'];
for (const l of EXPECTED) if (!locales.includes(`${l}.json`)) errors.push(`missing locale file ${l}.json`);

if (errors.length) {
  console.error(errors.slice(0, 60).join('\n'));
  console.error(`i18n-check: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`i18n-check: ${Object.keys(en).length} keys × ${locales.length + 1} locales OK, ${used.size} keys used in code`);
