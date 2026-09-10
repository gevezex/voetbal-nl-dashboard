/**
 * Interactieve release-helper voor de Chrome Web Store.
 *
 * Vraagt het oude en het nieuwe versienummer, werkt `extension/manifest.json`
 * en `package.json` bij, draait de typecheck + build en maakt de uploadbare
 * ZIP in `store/dist/`. Je hoeft daarna alleen nog die ZIP te uploaden.
 *
 * Gebruik:
 *   pnpm bump             → vraagt om oud + nieuw versienummer
 *   pnpm bump 0.9.1       → nieuw versienummer als argument (vraagt alleen om bevestiging)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'extension/manifest.json');
const PKG = resolve(ROOT, 'package.json');
const DIST = resolve(ROOT, 'store/dist');

const color = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const green = (s) => color(32, s);
const yellow = (s) => color(33, s);
const red = (s) => color(31, s);
const bold = (s) => color(1, s);

/** Alleen eenvoudige semver major.minor.patch toestaan (vereist voor Chrome + npm). */
function parseVersion(value) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim());
  return m ? m.slice(1).map(Number) : null;
}

/** -1 / 0 / 1 voor a < b / a == b / a > b. */
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] < vb[i] ? -1 : 1;
  }
  return 0;
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * Vervangt alleen het eerste `"version": "..."`-veld. Zo blijft de bestaande
 * opmaak (inline arrays, volgorde, inspringing) van het bestand intact.
 */
function writeVersion(path, version) {
  const text = readFileSync(path, 'utf8');
  const re = /("version"\s*:\s*")[^"]*(")/;
  if (!re.test(text)) throw new Error(`Geen "version"-veld gevonden in ${path}`);
  writeFileSync(path, text.replace(re, `$1${version}$2`));
}

/** Zip-bestanden van eerdere releases opruimen, behalve de nieuwste. */
function cleanOldZips(keepName) {
  if (!existsSync(DIST)) return [];
  const zips = readdirSync(DIST).filter((f) => /^voetbal-poule-dashboard-.*\.zip$/.test(f));
  const removed = [];
  for (const f of zips) {
    if (f === keepName) continue;
    rmSync(resolve(DIST, f), { force: true });
    removed.push(f);
  }
  return removed;
}

async function main() {
  const manifest = readJson(MANIFEST);
  const pkg = readJson(PKG);
  const localVersion = String(manifest.version);
  const pkgVersion = String(pkg.version);
  const argVersion = process.argv[2]?.trim() || '';

  console.log('\n' + bold('⚽ Voetbal Poule Dashboard — nieuwe versie releasen'));
  console.log(`   Lokaal bekend: manifest.json = ${localVersion}, package.json = ${pkg.version}\n`);

  const rl = createInterface({ input, output });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (question, fallback = '') => {
    rl.setPrompt(question);
    rl.prompt();
    const { value, done } = await lines.next();
    if (done) {
      // Invoer afgebroken (bijv. Ctrl+D): stop in plaats van door te gaan.
      const err = new Error('invoer afgebroken');
      err.cancelled = true;
      throw err;
    }
    return String(value).trim() || fallback;
  };

  // 1) Oude versie (die nu in de store staat).
  let oldVersion = '';
  while (!parseVersion(oldVersion)) {
    oldVersion = await ask(`Oude versie (nu in de Chrome Web Store) [${localVersion}]: `, localVersion);
    if (!parseVersion(oldVersion)) console.log(red('  Ongeldig. Gebruik het formaat 0.9.0'));
  }

  // 2) Nieuwe versie.
  let newVersion = argVersion;
  const baseline = compareVersions(oldVersion, localVersion) >= 0 ? oldVersion : localVersion;
  for (;;) {
    if (!newVersion) newVersion = await ask(`Nieuwe versie (moet hoger zijn dan ${baseline}): `);
    newVersion = newVersion.trim();
    if (!parseVersion(newVersion)) {
      console.log(red('  Ongeldig. Gebruik het formaat 0.9.0'));
      newVersion = '';
      continue;
    }
    if (compareVersions(newVersion, baseline) <= 0) {
      console.log(red(`  De nieuwe versie moet hoger zijn dan ${baseline}.`));
      newVersion = '';
      continue;
    }
    break;
  }

  // 3) Bevestiging.
  const zipName = `voetbal-poule-dashboard-${newVersion}.zip`;
  console.log('\n  Wat er gaat gebeuren:');
  console.log(`   • manifest.json + package.json → ${green(newVersion)}`);
  console.log('   • typecheck + build uitvoeren');
  console.log(`   • ZIP maken: store/dist/${zipName}`);
  const confirm = await ask(`\n  Doorgaan? [Y/n] `, 'y');
  rl.close();

  if (!/^y(es)?$/i.test(confirm)) {
    console.log(yellow('\n  Geannuleerd — er is niets gewijzigd.\n'));
    return;
  }

  // 4) Versies wegschrijven.
  writeVersion(MANIFEST, newVersion);
  writeVersion(PKG, newVersion);
  console.log(green(`\n✔ Versie bijgewerkt naar ${newVersion}`));

  // 5) Typecheck + build + ZIP (bestaande scripts hergebruiken).
  console.log('\n' + bold('▶ pnpm release (typecheck + build + zip)'));
  try {
    execFileSync('pnpm', ['release'], { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    // Build/typecheck mislukt: versies terugzetten zodat de repo consistent blijft.
    writeVersion(MANIFEST, localVersion);
    writeVersion(PKG, pkgVersion);
    console.log(red(`\n✖ Release mislukt — versie teruggezet naar ${localVersion}.`));
    throw err;
  }

  // 6) Oude ZIP's opruimen zodat alleen de nieuwste overblijft.
  const removed = cleanOldZips(zipName);
  if (removed.length) console.log(`\n🧹 Oude ZIP('s) verwijderd: ${removed.join(', ')}`);

  // 7) Klaar.
  const zipPath = resolve(DIST, zipName);
  if (!existsSync(zipPath)) {
    console.log(red(`\n✖ Kon de ZIP niet vinden: ${zipPath}`));
    process.exitCode = 1;
    return;
  }
  console.log('\n' + green(bold('✅ Klaar! Upload dit bestand:')));
  console.log(`   ${zipPath}\n`);
  console.log('   Chrome Web Store → bestaand item → Nieuw pakket uploaden → deze ZIP → Submit for review.');
  console.log(yellow('   Vergeet niet extension/manifest.json + package.json te committen.\n'));
}

main().catch((err) => {
  if (err && err.cancelled) {
    console.log(yellow('\n  Geannuleerd (invoer afgebroken) — er is niets gewijzigd.\n'));
    process.exit(0);
  }
  console.error(red('\n✖ Afgebroken: ') + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
