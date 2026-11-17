#!/usr/bin/env node
// pagina-check.mjs: klopt de opbouw van elke gebouwde pagina met de verplichte punten van specification.website?
//
// Waarom (17-11-2026, meting over de 13 live sites): 6 sites hadden geen skiplink, en de starter zelf ook
// niet. Twee live sites sloegen een kopniveau over (een footer met <h4> na een <h2>). Dubbele titels stonden
// bij vijf sites in de build (scan van 12-11-2026) en geen controle ving ze. Bij Joost de Valk draaien deze
// controles in de build zelf; bij ons stonden ze alleen als regel in de opleverlijst (T06, T09).
// Dit script staat als kopie in elke site: geen klantnamen in de toelichting. De namen staan in de website-skill.
//
// Wat het meet, op elke pagina van de build (redirect-stubs en de 404-pagina tellen niet mee):
//   FOUT          geen <!doctype html> als eerste regel; geen taal op <html>; tekenset niet in de eerste
//                 1024 bytes; geen viewport, of een viewport die zoomen uitzet
//   FOUT          geen of een lege <title>
//   FOUT          niet precies één <h1>
//   FOUT          een kopniveau overgeslagen (h2 gevolgd door h4)
//   FOUT          niet precies één <main> (of role="main")
//   FOUT          geen skiplink: het eerste element dat focus kan krijgen is geen link naar een plek op
//                 de pagina. Alleen op pagina's met drie of meer zulke elementen vóór de inhoud
//   FOUT          een <img> zonder alt (alt="" bij een sierbeeld mag)
//   FOUT          dezelfde titel of omschrijving op twee indexeerbare pagina's in dezelfde taal
//   FOUT          de site beweegt (@keyframes, video die vanzelf start, zacht scrollen) en houdt nergens
//                 rekening met prefers-reduced-motion (één keer voor de hele site)
//   WAARSCHUWING  een interne link die via een redirect loopt (ander adres, of alleen de slash aan het eind)
//   WAARSCHUWING  titel korter dan 10 of langer dan 70 tekens; omschrijving ontbreekt, of korter dan 50 of
//                 langer dan 200 tekens
//   WAARSCHUWING  dezelfde titel op pagina's in twee talen (een vertaalde pagina met een onvertaalde titel)
// Koppen en beelden in <template>, <noscript>, een gesloten <dialog> of een verborgen blok tellen niet mee.
// Paginering (/blog/2/) en pagina's met noindex of een canonical naar elders tellen niet mee voor dubbel.
// Een stagingbuild (elke pagina noindex) wordt beoordeeld alsof hij productie is, anders meet de controle niets.
//
// Grenzen: contrast, zichtbare focus en tikdoelen meet axe (verify --axe, browser-audit). Dode links meet
// check-links.mjs. Beweging is een ondergrens: één regel ergens in de site is genoeg om te slagen.
//
// Bewust toegestaan: {app}/pagina-check-akkoord.json, een lijst
//   [{ "regel": "kopvolgorde", "pad": "/oude-pagina/", "reden": "<waarom, en wie het besloot>" }]
// "pad" mag eindigen op * (alles wat zo begint). Regels: basis, titel, h1, kopvolgorde, main, skiplink,
// alt, dubbele-titel, dubbele-omschrijving, beweging.
//
// Gebruik:
//   node pagina-check.mjs <app-map> [--dist <map>] [--json <pad>] [--alles]
//   node scripts/pagina-check.mjs . --postbuild   als kopie in de app: een productiebuild
//     (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt op FOUT, een andere build meldt het.
// Zonder build: melding, exit 0. Exit 0 = goed, 1 = FOUT, 2 = verkeerd gebruik.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const require = createRequire(import.meta.url);
const VERBORGEN = 'template, noscript, [hidden], [aria-hidden="true"], [inert], dialog:not([open])';
const FOCUS = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
const plat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** De feiten van één pagina. pad = adres binnen de site. */
export function analyseer(html, pad = '/') {
  const $ = cheerio.load(html);
  // De inhoud van een <template> hangt los in de boom (closest ziet het sjabloon niet): haal haar eerst weg.
  $('template').remove();
  // Verborgen blokken één keer opzoeken en daarna alleen de ouders aflopen: closest() per element is op een
  // grote pagina (replica van 350 kB) de helft van de rekentijd.
  const binnen = (wortels) => (wortels.size === 0 ? () => false : (el) => { for (let n = el; n; n = n.parent) if (wortels.has(n)) return true; return false; });
  const inVerborgen = binnen(new Set($(VERBORGEN).toArray()));
  const inNoscript = binnen(new Set($('noscript').toArray()));
  const zichtbaar = (el) => !inVerborgen(el);
  const robots = plat($('meta[name="robots" i]').attr('content')).toLowerCase();
  const viewport = plat($('meta[name="viewport" i]').attr('content')).toLowerCase();
  const koppen = $('h1, h2, h3, h4, h5, h6').toArray().filter(zichtbaar).map((el) => ({ niveau: Number(el.tagName[1]), tekst: plat($(el).text()).slice(0, 60) }));
  const sprongen = [];
  for (let i = 1; i < koppen.length; i++) if (koppen[i].niveau - koppen[i - 1].niveau > 1) sprongen.push({ van: koppen[i - 1].niveau, naar: koppen[i].niveau, tekst: koppen[i].tekst });

  // Skiplink: het eerste element dat focus kan krijgen, en hoeveel er vóór de inhoud staan.
  const mains = $('main, [role="main"]').toArray().filter(zichtbaar);
  const grens = mains[0] || $('h1').toArray().filter(zichtbaar)[0] || null;
  // Eén doorloop voor de volgorde in het document, één selectie voor wat focus kan krijgen.
  const plek = new Map($('body').find('*').toArray().map((el, i) => [el, i]));
  const totHier = grens ? plek.get(grens) ?? Infinity : Infinity;
  const metFocus = $('body').find(FOCUS).toArray().filter((el) => (plek.get(el) ?? Infinity) < totHier && zichtbaar(el));
  const voorInhoud = metFocus.length;
  const eerste = metFocus[0] || null;
  const doel = eerste && eerste.tagName === 'a' ? String($(eerste).attr('href') || '') : '';
  const doelBestaat = /^#.+/.test(doel) && $(`[id="${doel.slice(1).replace(/"/g, '\\"')}"]`).length > 0;

  const canonical = $('link[rel="canonical" i]').attr('href') || '';
  let eigenHost = '';
  try { eigenHost = canonical ? new URL(canonical).host.replace(/^www\./, '') : ''; } catch { /* geen geldige canonical */ }
  const links = [];
  for (const a of $('a[href]').toArray()) {
    const href = String($(a).attr('href') || '').trim();
    if (!href || /^(#|mailto:|tel:|javascript:|data:|sms:|whatsapp:)/i.test(href)) continue;
    let p = null;
    if (href.startsWith('/') && !href.startsWith('//')) p = href;
    else if (/^https?:\/\//i.test(href) && eigenHost) { try { const u = new URL(href); if (u.host.replace(/^www\./, '') === eigenHost) p = u.pathname; } catch { /* geen geldig adres */ } }
    if (p) links.push(p.split('#')[0].split('?')[0]);
  }
  return {
    pad,
    stub: /<meta[^>]+http-equiv=["']?refresh/i.test(html.slice(0, 3000)),
    doctype: /^﻿?\s*<!doctype html\s*>/i.test(html),
    lang: plat($('html').attr('lang')),
    tekensetVroeg: (() => { const i = html.search(/<meta[^>]+charset\s*=/i); return i >= 0 && Buffer.byteLength(html.slice(0, i)) < 1024; })(),
    viewport,
    zoomUit: /user-scalable\s*=\s*(no|0)\b/.test(viewport) || /maximum-scale\s*=\s*1(\.0+)?(?![\d.])/.test(viewport),
    titel: plat($('head > title, title').first().text()),
    omschrijving: plat($('meta[name="description" i]').attr('content')),
    noindex: /\b(noindex|none)\b/.test(robots),
    canonical,
    h1: koppen.filter((k) => k.niveau === 1).length,
    sprongen,
    mains: mains.length,
    skiplink: { nodig: voorInhoud >= 3, goed: doelBestaat, eerste: eerste ? plat($(eerste).text()).slice(0, 40) || eerste.tagName : '' },
    zonderAlt: $('img').toArray().filter((el) => el.attribs.alt === undefined && !inNoscript(el)).map((el) => String(el.attribs.src || '').slice(0, 80)),
    links,
    beweging: [/@keyframes/i.test(html) ? '@keyframes' : '', /<video\b[^>]*\bautoplay\b/i.test(html) ? 'video die vanzelf start' : '', /scroll-behavior\s*:\s*smooth/i.test(html) ? 'zacht scrollen' : ''].filter(Boolean),
    rekening: /prefers-reduced-motion/i.test(html),
  };
}

const PAGINERING = /\/(?:page|pagina)\/\d+\/?$|\/\d{1,3}\/?$/i;
const zonderSlash = (p) => (p.length > 1 ? p.replace(/\/$/, '') : p);

/**
 * Oordeel over de hele build.
 * paginas: uitkomsten van analyseer(). redirect(pad) zegt of vercel.json dat adres doorstuurt.
 * stijl: { beweging: string[], rekening: boolean } uit de losse css- en js-bestanden.
 */
export function beoordeel({ paginas, redirect = () => false, stijl = { beweging: [], rekening: false }, akkoord = [] }) {
  const regels = [];
  const toegestaan = (regel, pad) => akkoord.some((a) => a.regel === regel && (a.pad === pad || (String(a.pad).endsWith('*') && pad.startsWith(String(a.pad).slice(0, -1)))));
  const zet = (status, regel, pad, melding) => { if (!toegestaan(regel, pad)) regels.push({ status, regel, pad, melding }); };
  const echte = paginas.filter((p) => !p.stub && !/^\/404(\.html)?\/?$/.test(p.pad));
  const staging = echte.length > 0 && echte.every((p) => p.noindex);
  const gebouwd = new Set(echte.map((p) => p.pad));

  for (const p of echte) {
    const basis = [!p.doctype && 'geen <!doctype html> als eerste regel', !p.lang && 'geen taal op <html>', !p.tekensetVroeg && 'tekenset niet in de eerste 1024 bytes', !p.viewport && 'geen viewport', p.zoomUit && 'de viewport zet zoomen uit'].filter(Boolean);
    if (basis.length) zet('FOUT', 'basis', p.pad, basis.join('; '));
    if (!p.titel) zet('FOUT', 'titel', p.pad, 'geen of een lege <title>');
    if (p.h1 !== 1) zet('FOUT', 'h1', p.pad, p.h1 === 0 ? 'geen <h1>' : `${p.h1} keer een <h1>; een pagina heeft er één`);
    if (p.sprongen.length) zet('FOUT', 'kopvolgorde', p.pad, `kopniveau overgeslagen: h${p.sprongen[0].van} gevolgd door h${p.sprongen[0].naar} ("${p.sprongen[0].tekst}")${p.sprongen.length > 1 ? `, en nog ${p.sprongen.length - 1} keer` : ''}`);
    if (p.mains !== 1) zet('FOUT', 'main', p.pad, p.mains === 0 ? 'geen <main>: de inhoud heeft geen eigen gebied' : `${p.mains} keer een <main>; een pagina heeft er één`);
    if (p.skiplink.nodig && !p.skiplink.goed) zet('FOUT', 'skiplink', p.pad, `geen skiplink: het eerste element met focus is "${p.skiplink.eerste}", geen link naar de inhoud`);
    if (p.zonderAlt.length) zet('FOUT', 'alt', p.pad, `${p.zonderAlt.length} beeld(en) zonder alt, bijvoorbeeld ${p.zonderAlt[0] || '(geen src)'}`);

    const viaRedirect = new Map();
    for (const l of p.links) {
      if (gebouwd.has(l) || /\.[a-z0-9]{2,5}$/i.test(l)) continue;
      const slash = gebouwd.has(`${l}/`) || gebouwd.has(zonderSlash(l));
      if (slash || redirect(l)) viaRedirect.set(l, slash ? 'alleen de slash aan het eind verschilt' : 'vercel.json stuurt dit adres door');
    }
    if (viaRedirect.size) {
      const [adres, waarom] = [...viaRedirect][0];
      zet('WAARSCHUWING', 'link-via-redirect', p.pad, `${viaRedirect.size} interne link(s) via een redirect, bijvoorbeeld ${adres} (${waarom})`);
    }
    const index = staging || (!p.noindex && (!p.canonical || zonderSlash(safePad(p.canonical)) === zonderSlash(p.pad)));
    if (index) {
      if (p.titel && (p.titel.length < 10 || p.titel.length > 70)) zet('WAARSCHUWING', 'lengte-titel', p.pad, `titel van ${p.titel.length} tekens`);
      if (!p.omschrijving) zet('WAARSCHUWING', 'omschrijving', p.pad, 'geen meta-omschrijving');
      else if (p.omschrijving.length < 50 || p.omschrijving.length > 200) zet('WAARSCHUWING', 'lengte-omschrijving', p.pad, `omschrijving van ${p.omschrijving.length} tekens`);
    }
  }

  // Dubbel: per taal, alleen pagina's die Google als eigen pagina ziet.
  const kandidaat = echte.filter((p) => (staging || !p.noindex) && !PAGINERING.test(p.pad) && (!p.canonical || zonderSlash(safePad(p.canonical)) === zonderSlash(p.pad)));
  for (const [veld, regel, naam] of [['titel', 'dubbele-titel', 'titel'], ['omschrijving', 'dubbele-omschrijving', 'omschrijving']]) {
    const groepen = new Map();
    for (const p of kandidaat) {
      if (!p[veld]) continue;
      const sleutel = `${(p.lang || '?').slice(0, 2).toLowerCase()}|${p[veld].toLowerCase()}`;
      groepen.set(sleutel, [...(groepen.get(sleutel) || []), p]);
    }
    for (const groep of groepen.values()) {
      const over = groep.filter((p) => !toegestaan(regel, p.pad));
      if (over.length < 2) continue;
      regels.push({ status: 'FOUT', regel, pad: over[0].pad, melding: `dezelfde ${naam} op ${over.length} pagina's (${over.slice(0, 4).map((p) => p.pad).join(', ')}${over.length > 4 ? ', ...' : ''}): "${over[0][veld].slice(0, 70)}"` });
    }
  }

  // Dezelfde titel in twee talen: vaak een vertaalde pagina met een onvertaalde titel. Een melding, geen fout:
  // een merk- of productnaam mag in beide talen gelijk zijn.
  const perTitel = new Map();
  for (const p of kandidaat) if (p.titel) perTitel.set(p.titel.toLowerCase(), [...(perTitel.get(p.titel.toLowerCase()) || []), p]);
  for (const groep of perTitel.values()) {
    const talen = new Set(groep.map((p) => (p.lang || '?').slice(0, 2).toLowerCase()));
    if (talen.size > 1) zet('WAARSCHUWING', 'titel-andere-taal', groep[0].pad, `dezelfde titel in ${talen.size} talen (${groep.slice(0, 3).map((p) => p.pad).join(', ')}): "${groep[0].titel.slice(0, 70)}"`);
  }

  // Beweging: één keer voor de hele site.
  const beweging = [...new Set([...stijl.beweging, ...echte.flatMap((p) => p.beweging)])];
  const rekening = stijl.rekening || echte.some((p) => p.rekening);
  if (beweging.length && !rekening) zet('FOUT', 'beweging', '*', `de site beweegt (${beweging.join(', ')}) maar houdt nergens rekening met prefers-reduced-motion`);

  return { regels, staging, paginas: echte.length };
}

function safePad(url) {
  try { return new URL(url, 'https://x.invalid').pathname; } catch { return ''; }
}

const bestanden = (dir, test) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? bestanden(path.join(dir, e.name), test) : test(e.name) ? [path.join(dir, e.name)] : []));

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

const padVan = (dist, f) => `/${path.relative(dist, f).replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')}`;

/**
 * Zegt per adres of vercel.json het doorstuurt, gerekend met Vercels eigen omzetting. Hoofdletters tellen:
 * met redirects in vercel.json matcht Vercel hoofdlettergevoelig, dus `/Contact/` vangt `/contact/` niet
 * (zie redirect-check.mjs; live gemeten op 11-11-2026).
 */
export function redirectsUit(cfg) {
  if (!cfg || !Array.isArray(cfg.redirects) || !cfg.redirects.length) return () => false;
  let routes = [];
  try {
    const t = require('@vercel/routing-utils').getTransformedRoutes({ redirects: cfg.redirects });
    routes = (t.routes || []).filter((r) => r.headers?.Location && r.status && !r.has && !r.missing).map((r) => new RegExp(r.src));
  } catch { return () => false; }
  return (pad) => routes.some((re) => re.test(pad));
}

export function meet(dist, { cfg = {}, akkoord = [] } = {}) {
  const paginas = bestanden(dist, (n) => n.endsWith('.html')).map((f) => analyseer(fs.readFileSync(f, 'utf8'), padVan(dist, f)));
  const stijl = { beweging: new Set(), rekening: false };
  for (const f of bestanden(dist, (n) => /\.(css|js|mjs)$/i.test(n))) {
    const t = fs.readFileSync(f, 'utf8');
    if (/prefers-reduced-motion/i.test(t)) stijl.rekening = true;
    if (!f.endsWith('.css')) continue;
    if (/@keyframes/i.test(t)) stijl.beweging.add('@keyframes');
    if (/scroll-behavior\s*:\s*smooth/i.test(t)) stijl.beweging.add('zacht scrollen');
  }
  return beoordeel({ paginas, redirect: redirectsUit(cfg), stijl: { beweging: [...stijl.beweging], rekening: stijl.rekening }, akkoord });
}

export function eindcode(fouten, { postbuild = false, env = {} } = {}) {
  if (!fouten) return 0;
  const productie = env.VERCEL_ENV === 'production' || env.PUBLIC_SITE_ENV === 'production';
  if (postbuild && !productie) {
    console.log('\nGeen productiebuild: de build gaat door. Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt hier.');
    return 0;
  }
  if (postbuild) console.log('\nProductiebuild gestopt: de opbouw van een pagina klopt niet (zie FOUT hierboven). Los het op in de pagina.\nIs het een bewuste keuze: zet de regel met reden in pagina-check-akkoord.json.');
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  const optie = (naam) => { const i = args.indexOf(`--${naam}`); return i >= 0 ? args[i + 1] : undefined; };
  const app = args.find((a, i) => !a.startsWith('--') && !['--dist', '--json'].includes(args[i - 1]));
  if (!app) {
    console.error('Gebruik: node pagina-check.mjs <app-map> [--dist <map>] [--json <pad>] [--alles] [--postbuild]');
    process.exit(2);
  }
  const appDir = path.resolve(app);
  const dist = vindBuild(appDir, optie('dist'));
  if (!fs.existsSync(dist)) {
    console.log(`Pagina-opbouw: geen build in ${dist} (niet gemeten; bouw eerst).`);
    process.exit(0);
  }
  const lees = (naam) => { const f = path.join(appDir, naam); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : null; };
  let cfg = {};
  let akkoord = [];
  try { cfg = lees('vercel.json') || {}; akkoord = lees('pagina-check-akkoord.json') || []; } catch (e) {
    console.error(`vercel.json of pagina-check-akkoord.json is geen geldige JSON: ${e.message}`);
    process.exit(2);
  }
  if (akkoord.some((a) => !a.regel || !a.pad || !String(a.reden || '').trim())) {
    console.error('pagina-check-akkoord.json: elke regel heeft "regel", "pad" en "reden" nodig.');
    process.exit(2);
  }
  const uitkomst = meet(dist, { cfg, akkoord });
  console.log(`Pagina-opbouw: ${dist}`);
  console.log(`Omgeving: VERCEL_ENV=${process.env.VERCEL_ENV || '-'} PUBLIC_SITE_ENV=${process.env.PUBLIC_SITE_ENV || '-'}`);
  console.log(`Pagina's: ${uitkomst.paginas}${uitkomst.staging ? ' (stagingbuild: elke pagina noindex, beoordeeld als productie)' : ''}`);
  if (akkoord.length) console.log(`Toegestaan met reden: ${akkoord.map((a) => `${a.regel} ${a.pad}`).join(', ')}`);
  const perRegel = new Map();
  for (const r of uitkomst.regels) perRegel.set(`${r.status}|${r.regel}`, [...(perRegel.get(`${r.status}|${r.regel}`) || []), r]);
  const max = args.includes('--alles') ? Infinity : 4;
  for (const [sleutel, lijst] of [...perRegel].sort(([a], [b]) => (a.startsWith('FOUT') === b.startsWith('FOUT') ? a.localeCompare(b) : a.startsWith('FOUT') ? -1 : 1))) {
    const [status, regel] = sleutel.split('|');
    console.log(`  ${status}  ${regel}: ${lijst.length} keer`);
    for (const r of lijst.slice(0, max)) console.log(`      ${r.pad}: ${r.melding}`);
    if (lijst.length > max) console.log(`      ... en nog ${lijst.length - max} (toon alles met --alles)`);
  }
  const fout = uitkomst.regels.filter((r) => r.status === 'FOUT').length;
  const waarschuwing = uitkomst.regels.length - fout;
  console.log(`\nSamen: ${uitkomst.paginas} pagina's, ${fout} fout, ${waarschuwing} ${waarschuwing === 1 ? 'waarschuwing' : 'waarschuwingen'}.`);
  const json = optie('json');
  if (json) fs.writeFileSync(json, JSON.stringify({ dist, ...uitkomst }, null, 1));
  process.exit(eindcode(fout, { postbuild: args.includes('--postbuild'), env: process.env }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
