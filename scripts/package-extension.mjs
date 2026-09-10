/**
 * Pakt de map extension/ in als uploadbare ZIP voor de Chrome Web Store.
 * De ZIP heeft manifest.json in de root (vereiste van de Web Store).
 *
 * Draaien:  pnpm package
 * Resultaat: store/dist/voetbal-poule-dashboard-<versie>.zip
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'extension/manifest.json'), 'utf8'));
const version = manifest.version;

const dist = resolve(ROOT, 'store/dist');
mkdirSync(dist, { recursive: true });

const out = resolve(dist, `voetbal-poule-dashboard-${version}.zip`);
rmSync(out, { force: true });

execFileSync('zip', ['-r', '-X', out, '.', '-x', '*.DS_Store', '-x', '__MACOSX/*'], {
  cwd: resolve(ROOT, 'extension'),
  stdio: 'inherit',
});

console.log(`\n✅ Pakket klaar: ${out}`);
console.log(`   Versie ${version} — upload dit bestand in het Chrome Web Store-dashboard.`);
