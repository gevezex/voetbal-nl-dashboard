import { build } from 'esbuild';

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

console.log('✅ extension/dashboard.js gegenereerd');
