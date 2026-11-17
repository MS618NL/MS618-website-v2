#!/usr/bin/env node
// lettertype-check.mjs: komen de lettertypen van het eigen domein, en laden ze zonder de tekst op te houden?
//
// Waarom (17-11-2026, meting over de 13 live sites): drie sites laadden hun lettertypen van een andere
// partij: via Typekit, via Google Fonts en via rsms.me. Dat is een stijlbestand van een andere
// partij in de <head>: de browser tekent niets tot het binnen is, er komt een extra verbinding bij, en het
// IP-adres van de bezoeker gaat naar die partij. De starter zelf laadde zes losse gewichten van Inter.
// Dit script staat als kopie in elke site: geen klantnamen in de toelichting. De namen staan in de website-skill.
// In specification.website (font-loading): eigen domein, alleen WOFF2, font-display swap of optional, alleen
// het lettertype van het eerste scherm vooraf laden (met crossorigin), en vanaf drie gewichten één
// variabel bestand.
//
// Wat het meet, op de pagina's en de stijlbestanden van de build:
//   FOUT          andere-host       een stijlbestand, script of vooraf geladen bestand van een lettertypedienst
//                                   (Google Fonts, Typekit, Bunny, rsms.me, ...), of een @font-face of @import
//                                   die een lettertype van een andere host haalt
//   FOUT          preload-crossorigin  een lettertype vooraf laden zonder crossorigin: het wordt twee keer opgehaald
//   WAARSCHUWING  stijl-andere-host een ander stijlbestand van een andere host in de pagina (houdt het eerste beeld op)
//   WAARSCHUWING  veel-preloads     meer dan twee lettertypen vooraf geladen op één pagina
//   WAARSCHUWING  geen-woff2        een @font-face zonder WOFF2
//   WAARSCHUWING  font-display      een @font-face zonder font-display, of met block of auto (tekst blijft onzichtbaar)
//   WAARSCHUWING  veel-gewichten    vier of meer losse gewichten van één lettertype (één variabel bestand is lichter)
//   WAARSCHUWING  veel-families     meer dan drie lettertypefamilies
// Niet meegeteld: wat in commentaar, <noscript> of <template> staat, en redirect-stubs (meta refresh).
// Een icoonlettertype (dashicons, Font Awesome, ...) telt niet mee bij font-display, gewichten en families:
// daar is font-display: block juist goed.
//
// Bewust toegestaan: {app}/lettertype-check-akkoord.json, een lijst
//   [{ "host": "use.typekit.net", "reden": "<waarom, en wie het besloot>" }]
//
// Gebruik:
//   node lettertype-check.mjs <app-map> [--dist <map>] [--json <pad>] [--alles]
//   node scripts/lettertype-check.mjs . --postbuild   als kopie in de app: een productiebuild
//     (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt op FOUT, een andere build meldt het.
// Zonder build: melding, exit 0. Exit 0 = goed, 1 = FOUT, 2 = verkeerd gebruik.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hosts die lettertypen leveren. Een stijlbestand of script daarvan is altijd een lettertype van een andere partij. */
export const LETTERTYPEDIENSTEN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit.net', 'p.typekit.net', 'fonts.adobe.com', 'fonts.bunny.net', 'rsms.me', 'fast.fonts.net', 'cloud.typography.com', 'use.fontawesome.com', 'kit.fontawesome.com', 'api.fontshare.com', 'cdn.fontshare.com'];
const LETTERTYPEBESTAND = /\.(woff2?|ttf|otf|eot)(?:[?#]|$)/i;
const ICOON = /icon|dashicons|awesome|glyph|symbol|genericons|swiper|slick/i;

const leeg = (html, re) => html.replace(re, '');
const zichtbaar = (html) => leeg(leeg(leeg(html, /<!--[\s\S]*?-->/g), /<noscript\b[\s\S]*?<\/noscript>/gi), /<template\b[\s\S]*?<\/template>/gi);
const attr = (tag, naam) => (new RegExp(`\\s${naam}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag) || []).slice(1).find((v) => v !== undefined);
const heeft = (tag, naam) => new RegExp(`\\s${naam}(?:\\s|=|>|/|$)`, 'i').test(tag);
const hostVan = (url) => (String(url).trim().match(/^(?:https?:)?\/\/([^/?#]+)/i) || [])[1]?.toLowerCase() || '';
const kaal = (host) => host.replace(/^www\./, '');
const isDienst = (host) => LETTERTYPEDIENSTEN.includes(host);
const zonderAanhaling = (s) => String(s).trim().replace(/^["']|["']$/g, '');

/**
 * De @font-face-regels en de @import-regels uit een stuk CSS.
 * @returns {{ lettertypen: { familie: string, gewicht: string, stijl: string, display: string, urls: string[] }[], imports: string[] }}
 */
export function uitCss(css) {
  const schoon = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const lettertypen = [];
  for (const m of schoon.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const blok = m[1];
    const waarde = (naam) => zonderAanhaling((new RegExp(`(?:^|;)\\s*${naam}\\s*:\\s*([^;]+)`, 'i').exec(blok) || [])[1] || '');
    const src = (/(?:^|;)\s*src\s*:\s*([^;]+(?:;\s*src\s*:\s*[^;]+)*)/i.exec(blok) || [])[1] || '';
    lettertypen.push({
      familie: waarde('font-family'),
      // Een icoonlettertype: daar is font-display: block juist goed (swap toont eerst losse letters).
      icoon: ICOON.test(waarde('font-family')),
      gewicht: waarde('font-weight') || '400',
      stijl: waarde('font-style') || 'normal',
      display: waarde('font-display').toLowerCase(),
      urls: [...src.matchAll(/url\(\s*([^)]+?)\s*\)/gi)].map((u) => zonderAanhaling(u[1])).filter((u) => !u.startsWith('data:')),
      lokaal: /local\(/i.test(src) && !/url\(/i.test(src),
    });
  }
  const imports = [...schoon.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)].map((m) => m[1]);
  return { lettertypen, imports };
}

/**
 * Wat één pagina aan lettertypen en stijl van buiten haalt.
 * @returns {{ eigenHost: string, stijlbestanden: string[], scripts: string[], preloads: { href: string, crossorigin: boolean }[], css: string }}
 */
export function analyseer(htmlRuw) {
  if (/<meta[^>]+http-equiv=["']?refresh/i.test(htmlRuw.slice(0, 3000))) return null;
  const html = zichtbaar(htmlRuw);
  const eigenHost = kaal(hostVan((html.match(/<link[^>]+rel=["']?canonical["']?[^>]*href=["']([^"']+)/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']?canonical/i) || [])[1] || ''));
  const stijlbestanden = [];
  const preloads = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, 'rel') || '').toLowerCase().split(/\s+/);
    const href = attr(tag, 'href') || '';
    if (!href) continue;
    if (rel.includes('stylesheet')) stijlbestanden.push(href);
    if (rel.includes('preload') && ((attr(tag, 'as') || '').toLowerCase() === 'font' || LETTERTYPEBESTAND.test(href))) preloads.push({ href, crossorigin: heeft(tag, 'crossorigin') });
  }
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => attr(m[0], 'src') || '').filter(Boolean);
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  return { eigenHost, stijlbestanden, scripts, preloads, css };
}

const andereHost = (url, eigenHost) => { const h = hostVan(url); return h && kaal(h) !== eigenHost ? h : ''; };

/** Oordeel over het stuk CSS van één plek (een stijlbestand, of de <style>-blokken van een pagina). */
export function beoordeelCss(pad, css, { eigenHost = '', akkoord = [] } = {}) {
  const regels = [];
  const toegestaan = (host) => akkoord.some((a) => a.host === host);
  const zet = (status, regel, melding, extra = {}) => regels.push({ status, regel, pad, melding, ...extra });
  const { lettertypen, imports } = uitCss(css);
  for (const u of imports) {
    const h = hostVan(u);
    if (h && isDienst(h) && !toegestaan(h)) zet('FOUT', 'andere-host', `@import van ${h}: het lettertype komt van een andere partij en houdt de tekst op. Zet de bestanden op het eigen domein`, { host: h });
  }
  for (const f of lettertypen) {
    if (f.lokaal) continue; // een terugvallettertype op basis van een lettertype van het apparaat
    const vreemd = [...new Set(f.urls.map((u) => andereHost(u, eigenHost)).filter(Boolean))].filter((h) => !toegestaan(h));
    if (vreemd.length) zet('FOUT', 'andere-host', `@font-face "${f.familie}" haalt zijn bestand van ${vreemd.join(', ')}. Zet het op het eigen domein`, { host: vreemd[0] });
    if (f.urls.length && !f.urls.some((u) => /\.woff2(?:[?#]|$)/i.test(u))) zet('WAARSCHUWING', 'geen-woff2', `@font-face "${f.familie}" ${f.gewicht} zonder WOFF2 (${f.urls.map((u) => (u.match(/\.([a-z0-9]+)(?:[?#]|$)/i) || [])[1] || '?').join(', ')}): WOFF2 is het kleinst en elke browser kent het`);
    if (f.urls.length && !f.icoon && (!f.display || f.display === 'block' || f.display === 'auto')) zet('WAARSCHUWING', 'font-display', `@font-face "${f.familie}" ${f.gewicht} ${f.display ? `met font-display: ${f.display}` : 'zonder font-display'}: de tekst blijft onzichtbaar tot het lettertype binnen is. Zet swap of optional`);
  }
  return { regels, lettertypen: lettertypen.filter((f) => !f.lokaal && f.urls.length) };
}

/** Oordeel over de links en scripts van één pagina. */
export function beoordeelPagina(pad, a, { akkoord = [] } = {}) {
  const regels = [];
  const toegestaan = (host) => akkoord.some((x) => x.host === host);
  const zet = (status, regel, melding, extra = {}) => regels.push({ status, regel, pad, melding, ...extra });
  for (const href of a.stijlbestanden) {
    const h = andereHost(href, a.eigenHost);
    if (!h || toegestaan(h)) continue;
    if (isDienst(h)) zet('FOUT', 'andere-host', `stijlbestand van ${h}: het lettertype komt van een andere partij en de browser tekent niets tot het binnen is. Zet de bestanden op het eigen domein`, { host: h });
    else zet('WAARSCHUWING', 'stijl-andere-host', `stijlbestand van ${h} in de pagina: de browser tekent niets tot het binnen is. Zet het op het eigen domein of laad het later`, { host: h });
  }
  for (const src of a.scripts) {
    const h = hostVan(src);
    if (h && isDienst(h) && !toegestaan(h)) zet('FOUT', 'andere-host', `script van ${h}: het lettertype komt van een andere partij. Zet de bestanden op het eigen domein`, { host: h });
  }
  for (const p of a.preloads) {
    const h = andereHost(p.href, a.eigenHost);
    if (h && !toegestaan(h)) zet('FOUT', 'andere-host', `lettertype vooraf geladen van ${h}. Zet het bestand op het eigen domein`, { host: h });
    if (!p.crossorigin) zet('FOUT', 'preload-crossorigin', `${p.href.split('/').pop()} wordt vooraf geladen zonder crossorigin: de browser haalt het daarna nog een keer op. Zet crossorigin op de <link>`);
  }
  if (a.preloads.length > 2) zet('WAARSCHUWING', 'veel-preloads', `${a.preloads.length} lettertypen vooraf geladen; laad alleen vooraf wat in het eerste scherm staat (één, hooguit twee)`);
  return regels;
}

/** Oordeel over alle lettertypen van de site samen: te veel losse gewichten, te veel families. */
export function beoordeelSamen(lettertypen) {
  const regels = [];
  const perFamilie = new Map();
  for (const f of lettertypen) {
    if (!f.familie || f.icoon) continue;
    if (!perFamilie.has(f.familie)) perFamilie.set(f.familie, new Set());
    // Een variabel lettertype geeft een bereik (100 900): dat is één bestand voor alle gewichten.
    if (!/\s/.test(f.gewicht.trim())) perFamilie.get(f.familie).add(`${f.gewicht} ${f.stijl}`);
  }
  for (const [familie, gewichten] of perFamilie) {
    const los = new Set([...gewichten].map((g) => g.split(' ')[0]));
    if (los.size >= 4) regels.push({ status: 'WAARSCHUWING', regel: 'veel-gewichten', pad: '*', melding: `"${familie}" wordt in ${los.size} losse gewichten aangeboden (${[...los].sort().join(', ')}). Gebruikt de site er drie of meer, dan is één variabel bestand lichter` });
  }
  if (perFamilie.size > 3) regels.push({ status: 'WAARSCHUWING', regel: 'veel-families', pad: '*', melding: `${perFamilie.size} lettertypefamilies (${[...perFamilie.keys()].slice(0, 6).join(', ')}): elk kost een download` });
  return regels;
}

const bestanden = (dir, test) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? bestanden(path.join(dir, e.name), test) : test(e.name) ? [path.join(dir, e.name)] : []));
const padVan = (dist, f) => `/${path.relative(dist, f).replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')}`;

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
  const regels = [];
  const lettertypen = [];
  const hosts = new Map();
  const htmls = bestanden(dist, (n) => n.endsWith('.html'));
  // Dezelfde <style>-blokken staan op elke pagina: één keer beoordelen is genoeg.
  const gezienCss = new Map();
  for (const f of htmls) {
    const a = analyseer(fs.readFileSync(f, 'utf8'));
    if (!a) continue;
    const pad = padVan(dist, f);
    if (a.eigenHost) hosts.set(a.eigenHost, (hosts.get(a.eigenHost) || 0) + 1);
    regels.push(...beoordeelPagina(pad, a, { akkoord }));
    if (a.css.trim() && /@font-face|@import/i.test(a.css)) {
      const sleutel = `${a.eigenHost}|${a.css}`;
      if (!gezienCss.has(sleutel)) {
        const uit = beoordeelCss(pad, a.css, { eigenHost: a.eigenHost, akkoord });
        gezienCss.set(sleutel, uit.regels);
        lettertypen.push(...uit.lettertypen);
      }
      regels.push(...gezienCss.get(sleutel).map((r) => ({ ...r, pad })));
    }
  }
  const eigenHost = [...hosts].sort((x, y) => y[1] - x[1])[0]?.[0] || '';
  for (const f of bestanden(dist, (n) => n.endsWith('.css'))) {
    const css = fs.readFileSync(f, 'utf8');
    if (!/@font-face|@import/i.test(css)) continue;
    const uit = beoordeelCss(`/${path.relative(dist, f).replace(/\\/g, '/')}`, css, { eigenHost, akkoord });
    regels.push(...uit.regels);
    lettertypen.push(...uit.lettertypen);
  }
  regels.push(...beoordeelSamen(lettertypen));
  const families = [...new Set(lettertypen.map((f) => f.familie).filter(Boolean))];
  return { paginas: htmls.length, families, regels };
}

export function eindcode(fouten, { postbuild = false, env = {} } = {}) {
  if (!fouten) return 0;
  const productie = env.VERCEL_ENV === 'production' || env.PUBLIC_SITE_ENV === 'production';
  if (postbuild && !productie) {
    console.log('\nGeen productiebuild: de build gaat door. Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt hier.');
    return 0;
  }
  if (postbuild) console.log('\nProductiebuild gestopt: een lettertype komt van een andere partij of wordt verkeerd vooraf geladen (zie FOUT hierboven).\nZet de bestanden op het eigen domein (in de starter: fonts in astro.config.mjs).\nIs het een bewuste keuze: zet de host met reden in lettertype-check-akkoord.json.');
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  const optie = (naam) => { const i = args.indexOf(`--${naam}`); return i >= 0 ? args[i + 1] : undefined; };
  const app = args.find((a, i) => !a.startsWith('--') && !['--dist', '--json'].includes(args[i - 1]));
  if (!app) {
    console.error('Gebruik: node lettertype-check.mjs <app-map> [--dist <map>] [--json <pad>] [--alles] [--postbuild]');
    process.exit(2);
  }
  const appDir = path.resolve(app);
  const dist = vindBuild(appDir, optie('dist'));
  if (!fs.existsSync(dist)) {
    console.log(`Lettertypen: geen build in ${dist} (niet gemeten; bouw eerst).`);
    process.exit(0);
  }
  const akkoordPad = path.join(appDir, 'lettertype-check-akkoord.json');
  let akkoord = [];
  if (fs.existsSync(akkoordPad)) {
    try { akkoord = JSON.parse(fs.readFileSync(akkoordPad, 'utf8').replace(/^﻿/, '')); } catch (e) {
      console.error(`lettertype-check-akkoord.json is geen geldige JSON: ${e.message}`);
      process.exit(2);
    }
    if (akkoord.some((x) => !x.host || !String(x.reden || '').trim())) {
      console.error('lettertype-check-akkoord.json: elke regel heeft "host" en "reden" nodig.');
      process.exit(2);
    }
  }
  const uitkomst = meet(dist, akkoord);
  console.log(`Lettertypen: ${dist}`);
  console.log(`Omgeving: VERCEL_ENV=${process.env.VERCEL_ENV || '-'} PUBLIC_SITE_ENV=${process.env.PUBLIC_SITE_ENV || '-'}`);
  console.log(`Pagina's: ${uitkomst.paginas}; families: ${uitkomst.families.join(', ') || 'geen eigen lettertype gevonden'}`);
  if (akkoord.length) console.log(`Toegestaan met reden: ${akkoord.map((x) => x.host).join(', ')}`);
  // Dezelfde melding op elke pagina: één regel met het aantal pagina's.
  const groepen = new Map();
  for (const r of uitkomst.regels) {
    const k = `${r.status}|${r.regel}|${r.melding}`;
    if (!groepen.has(k)) groepen.set(k, { ...r, paden: [] });
    groepen.get(k).paden.push(r.pad);
  }
  const max = args.includes('--alles') ? Infinity : 3;
  for (const g of [...groepen.values()].sort((a, b) => (a.status === b.status ? a.regel.localeCompare(b.regel) : a.status === 'FOUT' ? -1 : 1))) {
    console.log(`  ${g.status}  ${g.regel}: ${g.melding}`);
    console.log(`      ${g.paden.length} keer, bv. ${g.paden.slice(0, max).join(', ')}${g.paden.length > max ? ', ...' : ''}`);
  }
  const fout = uitkomst.regels.filter((r) => r.status === 'FOUT').length;
  const waarschuwing = uitkomst.regels.length - fout;
  console.log(`\nSamen: ${uitkomst.paginas} pagina's, ${fout} fout, ${waarschuwing} ${waarschuwing === 1 ? 'waarschuwing' : 'waarschuwingen'}.`);
  const json = optie('json');
  if (json) fs.writeFileSync(json, JSON.stringify({ dist, ...uitkomst }, null, 1));
  process.exit(eindcode(fout, { postbuild: args.includes('--postbuild'), env: process.env }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
