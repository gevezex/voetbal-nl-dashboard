import { build } from 'esbuild';
import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../store/assets/icon.svg', import.meta.url), new URL('../extension/icons/icon.svg', import.meta.url));

await build({
  entryPoints: ['extension-src/dashboard.ts'],
  bundle: true,
  outfile: 'extension/dashboard.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
});

// Het content script is bewust plain JS (geen bundel), maar moet wel dezelfde
// scrape-parsers gebruiken als het dashboard. Daarom bundelen we lib/scrape.ts hier
// naar een globale `PouleScrape` die content.js via het manifest binnenkrijgt.
await build({
  entryPoints: ['lib/scrape.ts'],
  bundle: true,
  outfile: 'extension/poule-scrape.js',
  format: 'iife',
  globalName: 'PouleScrape',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
});

console.log('✅ extension/dashboard.js en extension/poule-scrape.js gegenereerd');
