/**
 * Genereert de beeldmerken voor de Chrome Web Store:
 *  - het extensie-icoon in de formaten die Chrome vereist (16/32/48/128)
 *  - het 128x128 winkel-icoon
 *  - de kleine promotietegel (440x280)
 *  - de marquee (1400x560)
 *
 * Draaien:  pnpm assets:generate
 * Vereist:  rsvg-convert (brew install librsvg). De PNG's worden gecommit,
 *           dus dit script hoeft alleen na een ontwerpwijziging te draaien.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const GREEN_LIGHT = '#22c55e';
const GREEN_DARK = '#15803d';
const INK = '#0f172a';

/** Punten van een regelmatige vijfhoek. */
function pentagon(cx, cy, r, rotationDeg) {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a = ((rotationDeg + i * 72) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/** Voetbal (wit met zwarte panelen) gecentreerd in een 512x512-vlak. */
function ballSvg() {
  const C = 256;
  const R = 176;
  const central = pentagon(C, C, 72, -90);

  const seams = [-90, -18, 54, 126, 198]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const x1 = C + 72 * Math.cos(a);
      const y1 = C + 72 * Math.sin(a);
      const x2 = C + R * Math.cos(a);
      const y2 = C + R * Math.sin(a);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`;
    })
    .join('');

  const outer = [-54, 18, 90, 162, 234]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const cx = C + 150 * Math.cos(a);
      const cy = C + 150 * Math.sin(a);
      return `<polygon points="${pentagon(cx, cy, 30, -90)}" />`;
    })
    .join('');

  return `
    <circle cx="${C}" cy="${C}" r="${R}" fill="#ffffff" />
    <g stroke="${INK}" stroke-width="11" stroke-linecap="round" opacity="0.92">${seams}</g>
    <polygon points="${central}" fill="${INK}" />
    <g fill="${INK}">${outer}</g>`;
}

/** Het extensie-/winkel-icoon als SVG-string. */
function iconSvg() {
  return readFileSync(resolve(ROOT, 'store/assets/icon.svg'), 'utf8');
}

/** Bewerkbare promotieconcepten als bronvectoren. */
function promoBustileSvg() {
  return readFileSync(resolve(ROOT, 'store/assets/promo-tile-440x280.svg'), 'utf8');
}

function marqueeSvg() {
  return readFileSync(resolve(ROOT, 'store/assets/marquee-1400x560.svg'), 'utf8');
}

function render(svg, out, width, height) {
  const tmp = resolve(ROOT, 'store/assets/.tmp.svg');
  writeFileSync(tmp, svg);
  execFileSync('rsvg-convert', ['-w', String(width), '-h', String(height), tmp, '-o', out]);
}

function main() {
  try {
    execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
  } catch {
    console.error('❌ rsvg-convert niet gevonden. Installeer met: brew install librsvg');
    process.exit(1);
  }

  mkdirSync(resolve(ROOT, 'extension/icons'), { recursive: true });
  mkdirSync(resolve(ROOT, 'store/assets'), { recursive: true });

  const icon = iconSvg();
  writeFileSync(resolve(ROOT, 'extension/icons/icon.svg'), icon);
  writeFileSync(resolve(ROOT, 'docs/icon.svg'), icon);

  // Chrome-extensie-iconen.
  for (const size of [16, 32, 48, 128]) {
    render(icon, resolve(ROOT, `extension/icons/icon${size}.png`), size, size);
  }

  // Bewaar de bronvector + winkel- en promotiebeelden.
  writeFileSync(resolve(ROOT, 'store/assets/icon.svg'), icon);
  render(icon, resolve(ROOT, 'store/assets/store-icon-128.png'), 128, 128);
  render(icon, resolve(ROOT, 'store/assets/icon-512.png'), 512, 512);
  copyFileSync(resolve(ROOT, 'store/assets/icon-512.png'), resolve(ROOT, 'docs/icon-512.png'));
  render(promoBustileSvg(), resolve(ROOT, 'store/assets/promo-tile-440x280.png'), 440, 280);
  render(marqueeSvg(), resolve(ROOT, 'store/assets/marquee-1400x560.png'), 1400, 560);

  // Opruimen
  try {
    execFileSync('rm', [resolve(ROOT, 'store/assets/.tmp.svg')]);
  } catch {}

  console.log('✅ iconen en store-assets gegenereerd');
}

main();
