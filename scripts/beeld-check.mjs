#!/usr/bin/env node
// beeld-check.mjs: heeft elk beeld vaste maten, een modern formaat en een redelijk gewicht?
//
// Waarom (17-11-2026, meting over de 13 live sites): de home van één site woog 3,3 MB, met een
// partnerlogo van 778 kB als PNG en stapfoto's van 400 kB als JPG; het eerste grote beeld kwam na 9,6 s.
// Bij een andere na 10,9 s. Bij 7 sites had minder dan de helft van de beelden vaste maten, 4 sites hadden
// geen enkel beeld in meerdere breedtes en geen site leverde AVIF. In specification.website is beeld een
// verplicht punt (image-optimization). Bij ons stond het alleen als handmatige regel in de opleverlijst (T10).
// Dit script staat als kopie in elke site: geen klantnamen in de toelichting. De namen staan in de website-skill.
//
// Wat het meet, op elk <img> van elke pagina in de build:
//   FOUT          een foto of ander rasterbeeld zonder width en height (de pagina verspringt bij het laden)
//   FOUT          een JPG of PNG van 30 kB of meer zonder modern formaat ernaast (geen <picture> met AVIF of
//                 WebP, geen WebP of AVIF in srcset)
//   FOUT          een beeld van meer dan 500 kB zonder kleinere breedtes, of een bestand van meer dan 1 MB
//   FOUT          fetchpriority="high" samen met loading="lazy" (voorrang en uitstel tegelijk)
//   WAARSCHUWING  een beeld in meerdere breedtes waarvan het kleinste bestand meer dan 200 kB weegt
//   WAARSCHUWING  een beeld van 100 kB of meer in maar één breedte
//   WAARSCHUWING  meer dan twee beelden met fetchpriority="high" op één pagina (voorrang voor alles is
//                 voorrang voor niets)
//   WAARSCHUWING  een SVG zonder width en height
//   WAARSCHUWING  een video die vanzelf start en meteen laadt (zet eerst een stilstaand beeld neer en laad
//                 de video na het eerste beeld), of een video die vanzelf start zonder poster
//   WAARSCHUWING  de site heeft vijf of meer rasterbeelden en geen enkel AVIF (één keer voor de hele site)
// Niet meegeteld: beelden in <noscript> en <template>, data-adressen, beelden van een andere host en
// bestanden die niet in de build staan (die meet check-links.mjs).
//
// Gewogen wordt wat een browser van nu kan kiezen. Staat in <picture> een <source> zonder media in een
// formaat dat elke browser kent (AVIF, WebP), dan haalt geen browser het reservebeeld in <img> nog op:
// dat telt dus niet mee (17-11-2026: een JPG-reservebeeld van 1,5 MB achter AVIF en WebP). Heeft
// een <img> een srcset met breedtes, dan kiest de browser daaruit en telt src zelf niet mee.
//
// Grens: een beeld dat als achtergrond in de stijl staat ziet deze controle niet. Of het bovenste beeld
// vindbaar is en voorrang krijgt, meet Lighthouse (verify --lighthouse).
//
// Bewust toegestaan: {app}/beeld-check-akkoord.json, een lijst
//   [{ "src": "<begin van het adres van het beeld>", "reden": "<waarom, en wie het besloot>" }]
//
// Gebruik:
//   node beeld-check.mjs <app-map> [--dist <map>] [--json <pad>] [--alles]
//   node scripts/beeld-check.mjs . --postbuild   als kopie in de app: een productiebuild
//     (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt op FOUT, een andere build meldt het.
// Zonder build: melding, exit 0. Exit 0 = goed, 1 = FOUT, 2 = verkeerd gebruik.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const KB = 1024;
const soortBestand = (adres) => (/\.([a-z0-9]+)$/i.exec(String(adres).split(/[?#]/)[0]) || [])[1]?.toLowerCase() || '';
const MODERN = new Set(['avif', 'webp']);
const OUD = new Set(['jpg', 'jpeg', 'png']);

const KENT_ELKE_BROWSER = /^image\/(avif|webp|jpeg|png|gif)$/;

/** De regels van een srcset: het adres, en of er een breedte (480w) achter staat. */
export const regelsUitSrcset = (srcset) => String(srcset || '').split(/,\s+|,(?=\S+\s+\d)/).map((s) => s.trim()).filter(Boolean).map((s) => {
  const [adres, maat = ''] = s.split(/\s+/);
  return { adres, breedte: /^\d+w$/.test(maat) };
});

/** De adressen uit een srcset, zonder de breedte of dichtheid erachter. */
export const uitSrcset = (srcset) => regelsUitSrcset(srcset).map((r) => r.adres);

/**
 * De beelden en video's van één pagina.
 * @returns {{ beelden: object[], hoog: number, videos: { autoplay: boolean, poster: boolean, direct: boolean }[] }}
 */
export function analyseer(html) {
  const $ = cheerio.load(html);
  $('template, noscript').remove();
  const beelden = [];
  for (const el of $('img').toArray()) {
    const a = el.attribs;
    const src = String(a.src || '').trim();
    if (!src || src.startsWith('data:')) continue;
    const ouder = el.parent && el.parent.tagName === 'picture' ? el.parent : null;
    const bronnen = ouder ? $(ouder).children('source').toArray().map((s) => ({ type: String(s.attribs.type || '').toLowerCase().trim(), media: String(s.attribs.media || '').trim(), adressen: uitSrcset(s.attribs.srcset) })) : [];
    const eigen = regelsUitSrcset(a.srcset);
    const kandidaten = [...eigen.map((r) => r.adres), ...bronnen.flatMap((b) => b.adressen)];
    // Wat een browser van nu kan kiezen. Een <source> zonder media in een formaat dat elke browser kent
    // wint altijd: wat daarna komt, ook het reservebeeld in <img>, haalt geen browser meer op.
    const gekozen = [];
    let dicht = false;
    for (const b of bronnen) {
      gekozen.push(...b.adressen);
      if (!b.media && (!b.type || KENT_ELKE_BROWSER.test(b.type))) { dicht = true; break; }
    }
    if (!dicht) gekozen.push(...(eigen.some((r) => r.breedte) ? [] : [src]), ...eigen.map((r) => r.adres));
    beelden.push({
      src,
      soort: soortBestand(src),
      maten: Boolean(String(a.width || '').trim() && String(a.height || '').trim()),
      kandidaten,
      gekozen: [...new Set(gekozen)],
      modern: MODERN.has(soortBestand(src)) || kandidaten.some((k) => MODERN.has(soortBestand(k))) || bronnen.some((b) => /image\/(avif|webp)/.test(b.type)),
      avif: soortBestand(src) === 'avif' || kandidaten.some((k) => soortBestand(k) === 'avif') || bronnen.some((b) => b.type === 'image/avif'),
      hoog: String(a.fetchpriority || '').toLowerCase() === 'high',
      lui: String(a.loading || '').toLowerCase() === 'lazy',
    });
  }
  const videos = $('video').toArray().map((v) => ({
    autoplay: v.attribs.autoplay !== undefined,
    poster: Boolean(String(v.attribs.poster || '').trim()),
    direct: Boolean(String(v.attribs.src || '').trim()) || $(v).children('source[src]').length > 0,
  }));
  return { beelden, hoog: beelden.filter((b) => b.hoog).length, videos };
}

/**
 * Oordeel over één pagina. grootte(adres) geeft het aantal bytes van een bestand in de build, of null als
 * het daar niet staat (andere host, of ontbreekt).
 */
export function beoordeelPagina(pad, a, { grootte = () => null, akkoord = [] } = {}) {
  const regels = [];
  const toegestaan = (src) => akkoord.some((x) => x.src && src.startsWith(x.src));
  const zet = (status, regel, src, melding) => regels.push({ status, regel, pad, src, melding });
  const kb = (n) => `${Math.round(n / KB)} kB`;
  let svgZonderMaten = 0;
  for (const b of a.beelden) {
    if (toegestaan(b.src)) continue;
    if (b.hoog && b.lui) zet('FOUT', 'voorrang-en-lui', b.src, 'fetchpriority="high" samen met loading="lazy": het beeld krijgt voorrang en uitstel tegelijk');
    if (b.soort === 'svg') { if (!b.maten) svgZonderMaten++; continue; }
    if (!b.maten) zet('FOUT', 'maten', b.src, 'zonder width en height: de browser houdt geen ruimte vrij en de pagina kan verspringen');
    // Alleen wat in de build staat is te wegen; een beeld van een andere host blijft buiten het gewicht.
    const gewogen = b.gekozen.map((adres) => ({ adres, n: grootte(adres) })).filter((x) => x.n !== null);
    if (!gewogen.length) continue;
    const oud = gewogen.filter((x) => OUD.has(soortBestand(x.adres))).sort((x, y) => y.n - x.n)[0];
    if (oud && oud.n >= 30 * KB && !b.modern) zet('FOUT', 'oud-formaat', b.src, `${soortBestand(oud.adres).toUpperCase()} van ${kb(oud.n)} zonder AVIF of WebP ernaast`);
    const zwaarste = Math.max(...gewogen.map((x) => x.n));
    const lichtste = Math.min(...gewogen.map((x) => x.n));
    const enkel = b.gekozen.length <= 1;
    if (zwaarste > KB * KB) zet('FOUT', 'te-zwaar', b.src, `een bestand van ${kb(zwaarste)}; geen beeld hoort boven 1 MB`);
    else if (enkel && zwaarste > 500 * KB) zet('FOUT', 'te-zwaar', b.src, `${kb(zwaarste)} en geen kleinere breedtes: een telefoon haalt het hele bestand op`);
    else if (enkel && zwaarste >= 100 * KB) zet('WAARSCHUWING', 'een-breedte', b.src, `${kb(zwaarste)} in maar één breedte; geef het srcset en sizes, dan krijgt een telefoon een kleiner bestand`);
    if (!enkel && lichtste > 200 * KB) zet('WAARSCHUWING', 'zwaar', b.src, `het kleinste bestand weegt ${kb(lichtste)}`);
  }
  if (svgZonderMaten) zet('WAARSCHUWING', 'maten-svg', '', `${svgZonderMaten} SVG-beeld(en) zonder width en height`);
  if (a.hoog > 2) zet('WAARSCHUWING', 'te-veel-voorrang', '', `${a.hoog} beelden met fetchpriority="high"; geef het alleen aan het bovenste beeld`);
  for (const v of a.videos) {
    if (!v.autoplay) continue;
    if (!v.poster) zet('WAARSCHUWING', 'video-zonder-poster', '', 'een video die vanzelf start zonder poster: tot hij binnen is staat er een leeg vlak');
    else if (v.direct) zet('WAARSCHUWING', 'video-laadt-direct', '', 'een video die vanzelf start laadt meteen mee; laad hem pas na het eerste beeld en toon tot dan de poster');
  }
  return regels;
}

const paginas = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? paginas(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []));

/** De map met de gebouwde pagina's: dist, dist/client (server-adapter) of .vercel/output/static. */
export function vindBuild(app, opgegeven) {
  if (opgegeven) return path.resolve(opgegeven);
  const dist = path.join(app, 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) return dist;
  if (fs.existsSync(path.join(dist, 'client'))) return path.join(dist, 'client');
  if (fs.existsSync(dist)) return dist;
  const vercel = path.join(app, '.vercel', 'output', 'static');
  return fs.existsSync(vercel) ? vercel : dist;
}

export function meet(dist, akkoord = []) {
  const gezien = new Map();
  const regels = [];
  let aantal = 0;
  let raster = 0;
  let avif = 0;
  const lijst = paginas(dist);
  for (const f of lijst) {
    const html = fs.readFileSync(f, 'utf8');
    if (/<meta[^>]+http-equiv=["']?refresh/i.test(html.slice(0, 3000))) continue;
    const pad = `/${path.relative(dist, f).replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')}`;
    const eigenHost = ((html.match(/<link[^>]+rel=["']?canonical["']?[^>]*href=["']https?:\/\/([^/"']+)/i) || [])[1] || '').replace(/^www\./, '');
    // Grootte van een bestand in de build; null bij een andere host of een bestand dat er niet staat.
    const grootte = (adres) => {
      let p = String(adres).split(/[?#]/)[0];
      const m = /^(?:https?:)?\/\/([^/]+)(\/.*)?$/i.exec(p);
      if (m) { if (!eigenHost || m[1].replace(/^www\./, '') !== eigenHost) return null; p = m[2] || '/'; }
      if (!p.startsWith('/')) p = path.posix.join(path.posix.dirname(pad.endsWith('/') ? `${pad}x` : pad), p);
      let lokaal = p;
      try { lokaal = decodeURIComponent(p); } catch { /* laat staan */ }
      const bestand = path.join(dist, lokaal);
      if (!gezien.has(bestand)) gezien.set(bestand, fs.existsSync(bestand) && fs.statSync(bestand).isFile() ? fs.statSync(bestand).size : null);
      return gezien.get(bestand);
    };
    const a = analyseer(html);
    aantal += a.beelden.length;
    for (const b of a.beelden) if (b.soort !== 'svg') { raster++; if (b.avif) avif++; }
    regels.push(...beoordeelPagina(pad, a, { grootte, akkoord }));
  }
  if (raster >= 5 && avif === 0) regels.push({ status: 'WAARSCHUWING', regel: 'geen-avif', pad: '*', src: '', melding: `${raster} rasterbeelden en geen enkel AVIF; AVIF is het kleinste formaat dat elke browser kent` });
  return { paginas: lijst.length, beelden: aantal, regels };
}

export function eindcode(fouten, { postbuild = false, env = {} } = {}) {
  if (!fouten) return 0;
  const productie = env.VERCEL_ENV === 'production' || env.PUBLIC_SITE_ENV === 'production';
  if (postbuild && !productie) {
    console.log('\nGeen productiebuild: de build gaat door. Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt hier.');
    return 0;
  }
  if (postbuild) console.log('\nProductiebuild gestopt: een beeld mist vaste maten, heeft een oud formaat of is te zwaar (zie FOUT hierboven).\nGebruik het beeldcomponent van de site (Beeld.astro) en zet het bestand in src/assets/.\nNog te zwaar? Verklein het bronbestand: een foto hoeft niet breder dan 2560 pixels, in lopende tekst 1600.\nIs het een bewuste keuze: zet het adres met reden in beeld-check-akkoord.json.');
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  const optie = (naam) => { const i = args.indexOf(`--${naam}`); return i >= 0 ? args[i + 1] : undefined; };
  const app = args.find((a, i) => !a.startsWith('--') && !['--dist', '--json'].includes(args[i - 1]));
  if (!app) {
    console.error('Gebruik: node beeld-check.mjs <app-map> [--dist <map>] [--json <pad>] [--alles] [--postbuild]');
    process.exit(2);
  }
  const appDir = path.resolve(app);
  const dist = vindBuild(appDir, optie('dist'));
  if (!fs.existsSync(dist)) {
    console.log(`Beelden: geen build in ${dist} (niet gemeten; bouw eerst).`);
    process.exit(0);
  }
  const akkoordPad = path.join(appDir, 'beeld-check-akkoord.json');
  let akkoord = [];
  if (fs.existsSync(akkoordPad)) {
    try { akkoord = JSON.parse(fs.readFileSync(akkoordPad, 'utf8').replace(/^﻿/, '')); } catch (e) {
      console.error(`beeld-check-akkoord.json is geen geldige JSON: ${e.message}`);
      process.exit(2);
    }
    if (akkoord.some((x) => !x.src || !String(x.reden || '').trim())) {
      console.error('beeld-check-akkoord.json: elke regel heeft "src" en "reden" nodig.');
      process.exit(2);
    }
  }
  const uitkomst = meet(dist, akkoord);
  console.log(`Beelden: ${dist}`);
  console.log(`Omgeving: VERCEL_ENV=${process.env.VERCEL_ENV || '-'} PUBLIC_SITE_ENV=${process.env.PUBLIC_SITE_ENV || '-'}`);
  console.log(`Pagina's: ${uitkomst.paginas}, beelden: ${uitkomst.beelden}`);
  if (akkoord.length) console.log(`Toegestaan met reden: ${akkoord.map((x) => x.src).join(', ')}`);
  const perRegel = new Map();
  for (const r of uitkomst.regels) perRegel.set(`${r.status}|${r.regel}`, [...(perRegel.get(`${r.status}|${r.regel}`) || []), r]);
  const max = args.includes('--alles') ? Infinity : 4;
  for (const [sleutel, lijst] of [...perRegel].sort(([a], [b]) => (a.startsWith('FOUT') === b.startsWith('FOUT') ? a.localeCompare(b) : a.startsWith('FOUT') ? -1 : 1))) {
    const [status, regel] = sleutel.split('|');
    const uniek = new Set(lijst.map((r) => r.src).filter(Boolean)).size;
    console.log(`  ${status}  ${regel}: ${lijst.length} keer${uniek ? `, ${uniek} verschillende beelden` : ''}`);
    const getoond = new Set();
    for (const r of lijst) {
      if (getoond.size >= max) break;
      if (r.src && getoond.has(r.src)) continue;
      getoond.add(r.src || r.pad);
      console.log(`      ${r.pad}${r.src ? `  ${r.src.slice(0, 90)}` : ''}: ${r.melding}`);
    }
    if (lijst.length > max) console.log('      ... (toon alles met --alles)');
  }
  const fout = uitkomst.regels.filter((r) => r.status === 'FOUT').length;
  const waarschuwing = uitkomst.regels.length - fout;
  console.log(`\nSamen: ${uitkomst.paginas} pagina's, ${fout} fout, ${waarschuwing} ${waarschuwing === 1 ? 'waarschuwing' : 'waarschuwingen'}.`);
  const json = optie('json');
  if (json) fs.writeFileSync(json, JSON.stringify({ dist, ...uitkomst }, null, 1));
  process.exit(eindcode(fout, { postbuild: args.includes('--postbuild'), env: process.env }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
