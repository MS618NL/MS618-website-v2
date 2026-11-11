#!/usr/bin/env node
// zoekresultaat-check.mjs: toont Google bij het merkresultaat een eigen beeld, en blijven bijzaak-
// pagina's (colofon, bedankt) uit de sitelinks?
//
// Waarom (10-11-2026, ms618.nl): bij de zoekopdracht "ms618" toonde Google het logo van klant Hout Met
// Historie als beeld bij de homepage, en de colofon als sitelink. De homepage had alleen een algemeen
// tekstbeeld als og:image, op elke pagina hetzelfde. Google slaat zo'n beeld over ("avoid using a
// generic image (for example, your site logo) or an image with text") en kiest dan zelf een beeld van
// de pagina; daar stond een raster met 15 klantlogo's. Sitelinks kiest Google zelf; om er een pagina
// uit te houden noemt Google alleen noindex of de pagina weghalen.
// Bron: developers.google.com/search/docs/appearance/google-images (preferred image),
// .../crawling-indexing/prevent-images-on-your-page (X-Robots-Tag) en .../appearance/sitelinks.
//
// Controles, op de build (dist + vercel.json, met Vercels eigen omzetting) of live (--live):
//   1. FOUT  de homepage en elke taal-home hebben een eigen voorkeursbeeld: primaryImageOfPage in de
//            JSON-LD, of een og:image die niet het algemene beeld van de hele site is. Dat beeld is geen
//            SVG of logo, bestaat, en heeft zelf geen X-Robots-Tag: noindex.
//   2. FOUT  logo's van anderen (klantlogo's, partnerlogo's) in de inhoud van een indexeerbare pagina
//            krijgen X-Robots-Tag: noindex. Herkend aan de map (/clients/, /klanten/, /logos/,
//            /partners/, /merken/, /brands/, /referenties/) of aan een blok met logo, client, klant of
//            partner in class of id en minstens 3 beelden. Beelden in header, footer en nav, het eigen
//            logo (logo in de JSON-LD) en bestanden met de eigen naam (og:site_name) tellen niet mee.
//   3. WAARSCHUWING  indexeerbare bijzaak-pagina's (disclaimer, cookies, privacy, voorwaarden,
//            bedankt): die kan Google als sitelink onder het merkresultaat zetten. De colofon telt
//            niet mee: die hoort bij klantsites met de MS618-credit in de sitemap.
//
// Gebruik:
//   node zoekresultaat-check.mjs <app-map> [--dist <map>] [--json <pad>]
//   node zoekresultaat-check.mjs --live https://www.domein.nl [--json <pad>]
//   node scripts/zoekresultaat-check.mjs . --postbuild     als kopie in de app (starter @11, ms618.nl):
//     draait na elke build, ook op Vercel. Alleen een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV =
//     production) stopt op FOUT; een test- of lokale build meldt het en gaat door. Zo vangt ook een
//     site die via git deployt (een merge naar main) het, buiten vercel-deploy-veilig om.
//   Zonder build: melding, exit 0 (niets te meten; bouw eerst).
// Exit 0 = goed (waarschuwingen tellen niet mee), 1 = FOUT, 2 = verkeerd gebruik of niet te meten.
// De app-kopie moet gelijk blijven aan dit script (zoekresultaat-check.test.mjs) en heeft cheerio en
// @vercel/routing-utils als devDependencies nodig.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

// In de skill-map bewaakt msys-guard de argumenten tegen Git Bash; een app-kopie heeft geen lib/.
try { await import('./lib/msys-guard.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

const require = createRequire(import.meta.url);

// Enkelvoud /logo/ en /brand/ ontbreken bewust: daar staat meestal het eigen merkmateriaal (ronde 10-11:
// Distinkt /images/brand/cta-golven.webp, Finez /images/brand/finez-logo-light.svg).
const LOGO_MAP = /\/(clients?|klanten|klant|logos|partners?|merken|brands|referenties)\//i;
const LOGO_BLOK = /logo|client|klant|partner/i;
// De colofon staat er bewust niet in: bij klantsites hoort hij met de MS618-credit in footer én sitemap
// (updateability.md, opleverchecklist). Alleen op ms618.nl zelf staat hij op noindex (Jorrit, 10-11-2026).
const BIJZAAK = /^\/(?:.*\/)?(disclaimer|cookies?|cookie-?(?:beleid|verklaring|policy|statement)|privacy(?:-?(?:beleid|verklaring|statement|policy))?|(?:algemene-)?voorwaarden|terms(?:-(?:and-|of-)?(?:conditions|service))?|bedankt|thank-?you|impressum)(?:\/|\.html)?$/i;
const TAAL_HOME = /^\/[a-z]{2}(?:-[a-z]{2})?\/?$/i;

const kort = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
const typen = (n) => [].concat(n['@type'] ?? []).map(String);

// Alle JSON-LD-knopen, ook genest en in @graph.
export function jsonLdKnopen($) {
  const knopen = [];
  const loop = (v) => {
    if (Array.isArray(v)) return v.forEach(loop);
    if (v && typeof v === 'object') {
      knopen.push(v);
      for (const [k, w] of Object.entries(v)) if (k !== '@context') loop(w);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { loop(JSON.parse($(el).text())); } catch { /* kapotte JSON-LD: daar is een ander script voor */ }
  });
  return knopen;
}

function beeldUrl(v, perId, diepte = 0) {
  if (!v || diepte > 3) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return beeldUrl(v[0], perId, diepte + 1);
  if (typeof v === 'object') {
    if (v.url || v.contentUrl) return v.url || v.contentUrl;
    if (v['@id'] && perId.has(v['@id'])) return beeldUrl(perId.get(v['@id']), perId, diepte + 1);
  }
  return null;
}

// Eén pagina: indexeerbaar, og:image, voorkeursbeeld uit de JSON-LD en de logo's van anderen.
export function analyseer(html, paginaUrl, { robotsHeader = '' } = {}) {
  const $ = cheerio.load(html);
  const abs = (u) => { if (!u || u.startsWith('data:')) return null; try { return new URL(u, paginaUrl).href; } catch { return null; } };
  const robots = `${$('meta[name="robots"]').attr('content') || ''} ${$('meta[name="googlebot"]').attr('content') || ''} ${robotsHeader}`.toLowerCase();
  const knopen = jsonLdKnopen($);
  const perId = new Map(knopen.filter((n) => n['@id'] && Object.keys(n).length > 1).map((n) => [n['@id'], n]));
  const primair = abs(knopen.map((n) => beeldUrl(n.primaryImageOfPage, perId)).find(Boolean));
  const srcVan = ($img) => $img.attr('src') || $img.attr('data-src') || ($img.attr('srcset') || '').trim().split(/[\s,]+/)[0];
  // Eigen logo: het logo uit de JSON-LD en elk beeld dat ook in header, footer of nav staat.
  const eigenLogos = new Set([
    ...knopen.map((n) => abs(beeldUrl(n.logo, perId))),
    ...$('header img, footer img, nav img').map((_, el) => abs(srcVan($(el)))).get(),
  ].filter(Boolean));
  // Eigen naam: og:site_name en de domeinnaam, zonder leestekens (werkenbij.kisgroup.nl -> werkenbij,
  // kisgroup). Alleen voor beelden in een logomap; in een logostrook telt de naam niet (Moovs noemt de
  // klantlogo's moovs_companylogo_1 ... _14).
  const host = new URL(paginaUrl).hostname.toLowerCase().split('.').filter((d) => d !== 'www');
  const eigenNamen = [...new Set([$('meta[property="og:site_name"]').attr('content') || '', ...host.slice(0, -1)]
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')))].filter((w) => w.length >= 4);

  const logos = new Map();
  $('img').each((_, el) => {
    const $img = $(el);
    if ($img.closest('header, footer, nav').length) return;
    const u = abs(srcVan($img));
    if (!u || eigenLogos.has(u) || logos.has(u)) return;
    const pad = new URL(u).pathname;
    const naam = pad.split('/').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
    let reden = null;
    const blok = $img.parents().slice(0, 6)
      .filter((__, a) => !['body', 'html', 'main'].includes(a.tagName) && LOGO_BLOK.test(`${$(a).attr('class') || ''} ${$(a).attr('id') || ''}`))
      .filter((__, a) => $(a).find('img').length >= 3)
      .first();
    const map = pad.match(LOGO_MAP);
    if (blok.length) {
      const woord = `${blok.attr('class') || ''} ${blok.attr('id') || ''}`.trim().split(/\s+/).find((w) => LOGO_BLOK.test(w));
      reden = `blok "${woord}" met ${blok.find('img').length} beelden`;
    } else if (map && !eigenNamen.some((w) => naam.includes(w))) {
      reden = `map ${map[0]}`;
    }
    if (reden) logos.set(u, reden);
  });

  return {
    indexeerbaar: !/\b(noindex|none)\b/.test(robots),
    og: abs($('meta[property="og:image"]').attr('content')),
    primair,
    logos: [...logos].map(([url, reden]) => ({ url, reden })),
    taalHomes: $('link[rel="alternate"][hreflang]').map((_, el) => abs($(el).attr('href'))).get().filter(Boolean),
    links: $('a[href]').map((_, el) => abs($(el).attr('href'))).get().filter(Boolean),
  };
}

// Oordeel over alle pagina's. paginas: [{ pad, a }] met a = analyseer(...); headers(url) geeft de
// X-Robots-Tag van een beeld (string, '' als die er niet is) of null als dat niet te zeggen is
// (beeld op een ander domein); bestaat(url) geeft true, false of null (onbekend).
export function beoordeel({ paginas, origin, headers, bestaat = () => null }) {
  const regels = [];
  // Staging-build (spiegelmodus: elke pagina noindex): beoordeel alsof het productie is, anders meet
  // de gate niets en zegt hij goed. Welke pagina's in productie noindex zijn is dan onbekend, dus de
  // sitelinkcontrole slaat over.
  const staging = paginas.length > 0 && paginas.every((p) => !p.a.indexeerbaar);
  const indexeerbaar = staging ? paginas : paginas.filter((p) => p.a.indexeerbaar);

  // 1. Voorkeursbeeld van de homepages
  const telling = new Map();
  for (const p of indexeerbaar) if (p.a.og) telling.set(p.a.og, (telling.get(p.a.og) || 0) + 1);
  const [algemeen, aantal] = [...telling].sort((x, y) => y[1] - x[1])[0] || [null, 0];
  // Algemeen = het og-beeld dat op minstens twee pagina's en de helft van de site staat.
  const isAlgemeen = (u) => Boolean(u) && u === algemeen && aantal >= 2 && aantal / indexeerbaar.length >= 0.5;
  const homes = indexeerbaar.filter((p) => p.pad === '/' || TAAL_HOME.test(p.pad));
  if (!homes.length) regels.push({ status: 'WAARSCHUWING', check: 'voorkeursbeeld', pad: '/', melding: 'geen indexeerbare homepage gevonden; voorkeursbeeld niet gecontroleerd' });
  for (const h of homes) {
    const { og, primair } = h.a;
    const keuze = primair || og;
    if (!keuze) {
      regels.push({ status: 'FOUT', check: 'voorkeursbeeld', pad: h.pad, melding: 'geen og:image en geen primaryImageOfPage: Google kiest zelf een beeld van de pagina. Geef de home een eigen foto als og:image én primaryImageOfPage' });
      continue;
    }
    // Ook via primaryImageOfPage telt het algemene beeld niet als eigen beeld (homeImage gelijk aan
    // defaultOgImage zou de controle anders stil laten slagen).
    if (isAlgemeen(keuze)) {
      regels.push({ status: 'FOUT', check: 'voorkeursbeeld', pad: h.pad, melding: primair
        ? `primaryImageOfPage ${kort(keuze)} is het algemene og-beeld van de hele site (op ${aantal} van ${indexeerbaar.length} pagina's) en telt niet als eigen beeld. Geef de home een eigen foto als og:image én primaryImageOfPage`
        : `alleen het algemene og:image ${kort(og)} (op ${aantal} van ${indexeerbaar.length} pagina's) en geen primaryImageOfPage. Google slaat zo'n beeld over en kiest zelf een beeld van de pagina (ms618.nl: een klantlogo). Geef de home een eigen foto als og:image én primaryImageOfPage` });
      continue;
    }
    const bestand = new URL(keuze).pathname.toLowerCase().split('/').pop();
    const x = headers(keuze);
    if (/\.svg$/.test(bestand) || bestand.includes('logo')) {
      regels.push({ status: 'FOUT', check: 'voorkeursbeeld', pad: h.pad, melding: `voorkeursbeeld ${kort(keuze)} is een logo of SVG; Google raadt een logo of beeld met tekst af. Kies een eigen foto` });
    } else if (bestaat(keuze) === false) {
      regels.push({ status: 'FOUT', check: 'voorkeursbeeld', pad: h.pad, melding: `voorkeursbeeld ${kort(keuze)} bestaat niet` });
    } else if (x && /noindex|none/i.test(x)) {
      regels.push({ status: 'FOUT', check: 'voorkeursbeeld', pad: h.pad, melding: `voorkeursbeeld ${kort(keuze)} heeft zelf X-Robots-Tag: ${x}` });
    } else {
      regels.push({ status: 'GOED', check: 'voorkeursbeeld', pad: h.pad, melding: `voorkeursbeeld ${kort(keuze)} (${primair ? 'primaryImageOfPage' : 'og:image'})` });
    }
    if (primair && og && primair !== og) regels.push({ status: 'WAARSCHUWING', check: 'voorkeursbeeld', pad: h.pad, melding: `og:image (${kort(og)}) en primaryImageOfPage (${kort(primair)}) verschillen; Google krijgt twee voorkeuren` });
  }

  // 2. Logo's van anderen
  const perLogo = new Map();
  for (const p of indexeerbaar) for (const l of p.a.logos) {
    if (!perLogo.has(l.url)) perLogo.set(l.url, { reden: l.reden, paden: [] });
    perLogo.get(l.url).paden.push(p.pad);
  }
  for (const [url, { reden, paden }] of perLogo) {
    const op = paden.length > 3 ? `${paden.slice(0, 3).join(', ')} en ${paden.length - 3} meer` : paden.join(', ');
    const x = new URL(url).origin === origin ? headers(url) : null;
    if (x === null) regels.push({ status: 'WAARSCHUWING', check: 'logo', pad: url, melding: `logo op een ander domein (${reden}; op ${op}): X-Robots-Tag niet te regelen via vercel.json` });
    else if (/noindex|none/i.test(x)) regels.push({ status: 'GOED', check: 'logo', pad: kort(url), melding: `noindex (${reden})` });
    else regels.push({ status: 'FOUT', check: 'logo', pad: kort(url), melding: `zonder X-Robots-Tag: noindex (${reden}; op ${op}). Google kan dit logo als beeld bij het eigen zoekresultaat tonen` });
  }

  // 3. Bijzaak-pagina's die als sitelink kunnen verschijnen
  for (const p of staging ? [] : paginas) {
    if (BIJZAAK.test(p.pad) && p.a.indexeerbaar) regels.push({ status: 'WAARSCHUWING', check: 'sitelink', pad: p.pad, melding: 'indexeerbaar: kan als sitelink onder het merkresultaat verschijnen. Geen zoekwaarde? noindex en uit de sitemap' });
  }
  return { regels, staging, algemeenOg: algemeen, paginas: paginas.length, indexeerbaar: staging ? 0 : indexeerbaar.length };
}

// Headers van Vercel voor een pad, met de eigen omzetting van vercel.json (zoals de build).
export function vercelHeaders(cfg) {
  const ru = require('@vercel/routing-utils');
  const t = ru.getTransformedRoutes(cfg || {});
  if (t.error) throw new Error(`vercel.json: ${t.error.message || JSON.stringify(t.error)}`);
  const routes = (t.routes || []).filter((r) => r.headers && !r.status && !r.has && !r.missing);
  return (pad) => {
    const h = {};
    for (const r of routes) if (new RegExp(r.src).test(pad)) for (const [k, v] of Object.entries(r.headers)) h[k.toLowerCase()] = v;
    return h;
  };
}

function htmlBestanden(map, basis = map) {
  const uit = [];
  for (const e of fs.readdirSync(map, { withFileTypes: true })) {
    const vol = path.join(map, e.name);
    if (e.isDirectory()) { if (e.name !== '_astro') uit.push(...htmlBestanden(vol, basis)); }
    else if (e.name.endsWith('.html') && !/^(404|500)\.html$/.test(e.name)) uit.push(path.relative(basis, vol).split(path.sep).join('/'));
  }
  return uit;
}

export function controleerDist(appDir, distArg) {
  let dist = path.resolve(distArg || path.join(appDir, 'dist'));
  if (!fs.existsSync(path.join(dist, 'index.html')) && fs.existsSync(path.join(dist, 'client', 'index.html'))) dist = path.join(dist, 'client');
  if (!fs.existsSync(dist)) return null;
  const home = fs.existsSync(path.join(dist, 'index.html')) ? fs.readFileSync(path.join(dist, 'index.html'), 'utf8') : '';
  const $ = cheerio.load(home);
  let origin = 'https://site.invalid';
  for (const u of [$('link[rel="canonical"]').attr('href'), $('meta[property="og:url"]').attr('content')]) {
    try { if (u) { origin = new URL(u).origin; break; } } catch { /* volgende */ }
  }
  const cfgPad = path.join(appDir, 'vercel.json');
  const hdr = vercelHeaders(fs.existsSync(cfgPad) ? JSON.parse(fs.readFileSync(cfgPad, 'utf8')) : {});
  const paginas = htmlBestanden(dist).map((rel) => {
    const pad = rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel.slice(0, -'.html'.length)}`;
    return { pad, a: analyseer(fs.readFileSync(path.join(dist, rel), 'utf8'), origin + pad) };
  });
  const resultaat = beoordeel({
    paginas,
    origin,
    headers: (u) => (new URL(u).origin === origin ? hdr(new URL(u).pathname)['x-robots-tag'] || '' : null),
    bestaat: (u) => (new URL(u).origin === origin ? fs.existsSync(path.join(dist, decodeURIComponent(new URL(u).pathname))) : null),
  });
  return { bron: dist, origin, ...resultaat };
}

async function haal(url, methode = 'GET') {
  const r = await fetch(url, { method: methode, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; MS618 zoekresultaat-check)' } });
  return { status: r.status, url: r.url, headers: r.headers, tekst: methode === 'GET' ? await r.text() : '' };
}

export async function controleerLive(basis) {
  const start = await haal(new URL('/', basis).href);
  if (start.status !== 200) throw new Error(`${basis} gaf ${start.status}`);
  const origin = new URL(start.url).origin;
  const eigen = (u) => { try { const x = new URL(u); return x.origin === origin && !/\.(jpe?g|png|webp|avif|gif|svg|pdf|xml|txt|ico)$/i.test(x.pathname) ? x.origin + x.pathname : null; } catch { return null; } };
  const gezien = new Map([[origin + new URL(start.url).pathname, start]]);
  const homeA = analyseer(start.tekst, start.url, { robotsHeader: start.headers.get('x-robots-tag') || '' });
  // Taal-homes, bijzaak-pagina's en een handvol gewone pagina's (voor het algemene og:image).
  const kandidaten = [...new Set([...homeA.taalHomes, ...homeA.links].map(eigen).filter(Boolean))];
  const taal = kandidaten.filter((u) => TAAL_HOME.test(new URL(u).pathname));
  const bijzaak = kandidaten.filter((u) => BIJZAAK.test(new URL(u).pathname));
  const gewoon = kandidaten.filter((u) => !taal.includes(u) && !bijzaak.includes(u) && new URL(u).pathname !== '/').slice(0, 8);
  for (const u of [...taal, ...bijzaak, ...gewoon]) {
    if (gezien.has(u)) continue;
    try { gezien.set(u, await haal(u)); } catch { /* pagina niet te laden: overslaan */ }
  }
  const paginas = [...gezien.values()].filter((r) => r.status === 200 && /<html/i.test(r.tekst)).map((r) => ({
    pad: new URL(r.url).pathname,
    a: analyseer(r.tekst, r.url, { robotsHeader: r.headers.get('x-robots-tag') || '' }),
  }));
  // Headers en bestaan van alle beelden die ertoe doen, vooraf ophalen.
  const beelden = new Set();
  for (const p of paginas) {
    for (const l of p.a.logos) beelden.add(l.url);
    if (p.pad === '/' || TAAL_HOME.test(p.pad)) for (const u of [p.a.og, p.a.primair]) if (u) beelden.add(u);
  }
  const info = new Map();
  for (const u of beelden) {
    try {
      let r = await haal(u, 'HEAD');
      if (r.status === 405) r = await haal(u);
      info.set(u, { status: r.status, x: r.headers.get('x-robots-tag') || '' });
    } catch { info.set(u, null); }
  }
  const resultaat = beoordeel({
    paginas,
    origin,
    headers: (u) => (new URL(u).origin === origin && info.get(u) ? info.get(u).x : null),
    bestaat: (u) => (info.get(u) ? info.get(u).status === 200 : null),
  });
  return { bron: start.url, origin, ...resultaat };
}

export function drukAf(r) {
  console.log(`Zoekresultaat: ${r.bron}`);
  console.log(`Pagina's: ${r.paginas} (${r.indexeerbaar} indexeerbaar)${r.algemeenOg ? `, algemeen og:image ${kort(r.algemeenOg)}` : ''}`);
  if (r.staging) console.log('Staging-build (elke pagina noindex): beoordeeld alsof het productie is; sitelinkcontrole overgeslagen.');
  console.log('');
  for (const check of ['voorkeursbeeld', 'logo', 'sitelink']) {
    const eigen = r.regels.filter((x) => x.check === check);
    const goed = eigen.filter((x) => x.status === 'GOED');
    const rest = eigen.filter((x) => x.status !== 'GOED');
    if (check === 'logo' && goed.length) console.log(`  GOED  ${goed.length} logo's van anderen met X-Robots-Tag: noindex`);
    else for (const x of goed) console.log(`  GOED  ${x.pad}: ${x.melding}`);
    for (const x of rest.slice(0, 12)) console.log(`  ${x.status}  ${x.pad}: ${x.melding}`);
    if (rest.length > 12) console.log(`  ... en ${rest.length - 12} meer (zie --json)`);
  }
  const n = (s) => r.regels.filter((x) => x.status === s).length;
  console.log(`\nSamen: ${n('GOED')} goed, ${n('FOUT')} fout, ${n('WAARSCHUWING')} waarschuwing${n('WAARSCHUWING') === 1 ? '' : 'en'}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (naam) => { const i = args.indexOf(naam); return i >= 0 ? args[i + 1] : undefined; };
  const live = opt('--live');
  const appArg = args.find((a, i) => !a.startsWith('--') && !['--dist', '--json', '--live'].includes(args[i - 1]));
  if (!live && !appArg) {
    console.error('Gebruik: node zoekresultaat-check.mjs <app-map> [--dist <map>] [--json <pad>]\n       node zoekresultaat-check.mjs --live https://www.domein.nl [--json <pad>]');
    process.exit(2);
  }
  let r;
  try {
    r = live ? await controleerLive(live) : controleerDist(path.resolve(appArg), opt('--dist'));
  } catch (e) {
    console.error(`Zoekresultaat: niet te meten: ${e.message}`);
    process.exit(2);
  }
  if (!r) {
    console.log(`Zoekresultaat: geen build in ${path.resolve(opt('--dist') || path.join(appArg, 'dist'))}; niets gemeten (bouw eerst).`);
    process.exit(0);
  }
  drukAf(r);
  // In het buildlog zichtbaar: ziet de build VERCEL_ENV? Zonder die variabele stopt een productiebuild
  // niet (Vercel: "Automatically expose System Environment Variables" moet aan staan).
  if (args.includes('--postbuild')) console.log(`Omgeving: ${process.env.VERCEL_ENV ? `VERCEL_ENV=${process.env.VERCEL_ENV}` : 'VERCEL_ENV niet gezet'}${process.env.PUBLIC_SITE_ENV ? `, PUBLIC_SITE_ENV=${process.env.PUBLIC_SITE_ENV}` : ''}`);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(r, null, 2));
  process.exit(eindcode(r, { postbuild: args.includes('--postbuild'), env: process.env }));
}

// Exitcode. Als postbuild stopt alleen een productiebuild op FOUT; anders gaat de build door.
export function eindcode(r, { postbuild = false, env = {} } = {}) {
  if (!r.regels.some((x) => x.status === 'FOUT')) return 0;
  const productie = env.VERCEL_ENV === 'production' || env.PUBLIC_SITE_ENV === 'production';
  if (postbuild && !productie) {
    console.log('\nGeen productiebuild: de build gaat door. Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt hier.');
    return 0;
  }
  if (postbuild) console.log('\nProductiebuild gestopt: los de FOUT hierboven op (regels onder "Beeld in Google" in AGENTS.md of MAINTENANCE.md).');
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
