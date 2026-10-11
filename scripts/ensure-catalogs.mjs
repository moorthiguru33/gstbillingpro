// Generates the 1.25-lakh-item master catalogue (public/data/catalogs/*.json)
// if it is missing. The files are ~38 MB, so they are git-ignored and rebuilt
// deterministically (seeded PRNG) before every build instead of committed.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const index = path.resolve('public/data/catalogs/index.json');
if (fs.existsSync(index) && process.env.FORCE_CATALOG !== '1') {
  console.log('[catalogs] public/data/catalogs present - skipping generation');
} else {
  execFileSync(process.execPath, [path.resolve('scripts/generate-1lakh-catalog.mjs')], { stdio: 'inherit' });
}
