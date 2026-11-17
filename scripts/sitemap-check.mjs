#!/usr/bin/env node
// sitemap-check.mjs: klopt de sitemap met wat er gebouwd is, en zegt de datum iets?
//
// Waarom (17-11-2026, meting over de 13 live sites): twee sites stuurden bij elk adres de datum van de
// build als <lastmod>. Google gebruikt die datum alleen als hij klopt; een datum die bij elke deploy
// verspringt leert Google hem te negeren. Eerder (26-10-2026) miste de sitemap van een site elke
// blokpagina. In specification.website (xml-sitemaps): alleen canonieke adressen die 200 geven, een eerlijke
// lastmod, changefreq en priority leest Google niet, en geen XSL-stijlblad meer (Chrome zet XSLT uit vanaf
// versie 158; de sitemap toont dan kale XML).
//
// Wat het meet, op de build. De sitemaps komen uit robots.txt (Sitemap:), anders sitemap.xml of
// sitemap-index.xml; een index wordt gevolgd.
//   FOUT          bestaat-niet        een adres in de sitemap zonder gebouwde pagina of bestand
//   FOUT          stuurt-door         een adres dat vercel.json doorstuurt, of een doorstuurpagina
//   FOUT          noindex             een adres dat op noindex staat
//   FOUT          canoniek-anders     de pagina wijst met haar canonical naar een ander adres dan de sitemap noemt
//   FOUT          andere-host         een adres op een andere host dan de canonical van de pagina's
//   FOUT          geen-volledig-adres een <loc> zonder https:// en host
//   FOUT          ontbreekt           een indexeerbare pagina die niet in de sitemap staat (paginering mag ontbreken)
//   FOUT          lastmod-builddatum  vijf of meer adressen, en meer dan de helft, dragen de datum van de build
//   FOUT          lastmod-ongeldig    een datum die geen W3C-datum is, of die in de toekomst ligt
//   FOUT          te-groot            meer dan 50.000 adressen of 50 MB in één bestand
//   WAARSCHUWING  lastmod-vandaag     drie of meer adressen dragen de datum van de build (klopt dat?)
//   WAARSCHUWING  lastmod-gelijk      vijf of meer adressen, allemaal dezelfde datum
//   WAARSCHUWING  changefreq-priority Google leest ze niet; laat ze weg
//   WAARSCHUWING  stijlblad           een <?xml-stylesheet?>: browsers halen XSLT weg
//   WAARSCHUWING  dubbel              hetzelfde adres staat meer dan één keer in de sitemap
//   WAARSCHUWING  niet-in-robots      robots.txt noemt de sitemap niet, of noemt er een die niet in de build staat
//   WAARSCHUWING  geen-sitemap        geen sitemap in de build (maakt de server hem, meet dan met --live)
// Een testbuild waarin elke pagina op noindex staat: de regels noindex en ontbreekt zijn dan niet te meten.
//
// Bewust toegestaan: {app}/sitemap-check-akkoord.json, een lijst
//   [{ "regel": "ontbreekt", "pad": "/bedankt/", "reden": "<waarom, en wie het besloot>" }]
// Een pad dat op * eindigt geldt voor alles wat zo begint.
//
// Gebruik:
//   node sitemap-check.mjs <app-map> [--dist <map>] [--json <pad>] [--alles]
//   node scripts/sitemap-check.mjs . --postbuild   als kopie in de app: een productiebuild
//     (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt op FOUT, een andere build meldt het.
//   node sitemap-check.mjs --live https://www.klant.nl [--max 40] [--pauze 500] [--json <pad>]
//     leest de sitemap van de live site en vraagt een steekproef van de adressen op (standaard 40, met
//     een halve seconde ertussen): geeft elk adres 200, is het indexeerbaar en wijst het naar zichzelf?
// Zonder build: melding, exit 0. Exit 0 = goed, 1 = FOUT, 2 = verkeerd gebruik.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const require = createRequire(import.meta.url);
const UA = 'ms618-sitemap-check/1.0';
const PAGINERING = /\/(?:page|pagina)\/\d+\/?$|\/\d{1,3}\/?$/i;
const FOUTPAGINA = /^\/(?:404|500)\/?$/;
const MAX_ADRESSEN = 50000;
const MAX_BYTES = 50 * 1024 * 1024;
const W3C = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;
const zonderSlash = (p) => (p.length > 1 ? p.replace(/\/$/, '') : p);
const ontcijfer = (p) => { try { return decodeURI(p); } catch { return p; } };
/** De sleutel waarop een adres en een gebouwde pagina elkaar vinden: het pad, zonder slash aan het eind. */
const sleutel = (pad) => zonderSlash(ontcijfer(pad));
const dag = (d) => d.toISOString().slice(0, 10);
const lokaleDag = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** De datum uit een <lastmod>, of null als het geen W3C-datum is (2026, 2026-11, 2026-11-17, 2026-11-17T10:00:00+01:00). */
export function datumVan(lastmod) {
  const s = String(lastmod || '').trim();
  if (!W3C.test(s)) return null;
  const d = new Date(s.length === 4 ? `${s}-01-01` : s.length === 7 ? `${s}-01` : s);
  if (Number.isNaN(d.getTime())) return null;
  // new Date('2026-02-31') schuift door naar maart: dat is geen bestaande datum.
  if (s.length >= 10 && dag(new Date(`${s.slice(0, 10)}T00:00:00Z`)) !== s.slice(0, 10)) return null;
  return d;
}

/** Leest één sitemapbestand: de adressen, of bij een index de kind-sitemaps. */
export function leesSitemap(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const tekst = (el, naam) => { const k = $(el).children(naam).first(); return k.length ? k.text().trim() : null; };
  const index = $('sitemapindex').length > 0;
  return {
    index,
    geldig: index || $('urlset').length > 0,
    kinderen: index ? $('sitemapindex > sitemap').toArray().map((el) => tekst(el, 'loc')).filter(Boolean) : [],
    urls: index ? [] : $('urlset > url').toArray().map((el) => ({ loc: tekst(el, 'loc'), lastmod: tekst(el, 'lastmod'), extra: tekst(el, 'changefreq') !== null || tekst(el, 'priority') !== null })),
    stijlblad: /<\?xml-stylesheet\b/i.test(xml.slice(0, 2000)),
  };
}

const attr = (tag, naam) => (new RegExp(`\\s${naam}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag) || []).slice(1).find((v) => v !== undefined);

/** Uit de head van een pagina: de canonical, noindex en of het een doorstuurpagina is. */
export function paginaInfo(html) {
  const eind = html.search(/<\/head\s*>/i);
  const head = eind > 0 ? html.slice(0, eind) : html.slice(0, 30000);
  let canoniek = null;
  let noindex = false;
  let stub = false;
  for (const tag of head.match(/<(?:link|meta)\b[^>]*>/gi) || []) {
    if (/^<link/i.test(tag)) {
      if (/(^|\s)canonical(\s|$)/i.test(attr(tag, 'rel') || '')) canoniek = (attr(tag, 'href') || '').replace(/&amp;/g, '&') || null;
      continue;
    }
    const naam = (attr(tag, 'name') || '').toLowerCase();
    if ((naam === 'robots' || naam === 'googlebot') && /noindex/i.test(attr(tag, 'content') || '')) noindex = true;
    if ((attr(tag, 'http-equiv') || '').toLowerCase() === 'refresh') stub = true;
  }
  return { canoniek, noindex, stub };
}

const adres = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x : null; } catch { return null; } };
const zelfde = (a, b) => { const x = adres(a); const y = adres(b); return Boolean(x && y) && x.origin === y.origin && ontcijfer(x.pathname) === ontcijfer(y.pathname) && x.search === y.search; };

/** De regels die uit het bestand zelf volgen: datums, overbodige velden, stijlblad, omvang, dubbele adressen. */
export function beoordeelBestand(s, { bouwdagen = [], nu = new Date() } = {}) {
  const regels = [];
  const zet = (status, regel, pad, melding) => regels.push({ status, regel, pad, sitemap: s.pad, melding });
  const metDatum = [];
  for (const u of s.urls) {
    if (u.lastmod === null) continue;
    const d = datumVan(u.lastmod);
    if (!d) zet('FOUT', 'lastmod-ongeldig', u.loc || s.pad, `<lastmod>${u.lastmod}</lastmod> is geen W3C-datum (bv. 2026-11-17 of 2026-11-17T10:00:00+01:00)`);
    else if (d.getTime() > nu.getTime() + 24 * 3600 * 1000) zet('FOUT', 'lastmod-ongeldig', u.loc || s.pad, `<lastmod>${u.lastmod}</lastmod> ligt in de toekomst`);
    else metDatum.push(u.lastmod);
  }
  const opBouwdag = metDatum.filter((l) => bouwdagen.includes(l.slice(0, 10))).length;
  const allesGelijk = metDatum.length >= 5 && new Set(metDatum).size === 1;
  if (opBouwdag >= 5 && opBouwdag > metDatum.length / 2) zet('FOUT', 'lastmod-builddatum', s.pad, `${opBouwdag} van de ${metDatum.length} adressen dragen de datum van de build (${bouwdagen[0]}) als <lastmod>. Neem de datum uit de inhoud, of laat <lastmod> weg`);
  else if (allesGelijk) zet('WAARSCHUWING', 'lastmod-gelijk', s.pad, `alle ${metDatum.length} adressen dragen <lastmod>${metDatum[0]}</lastmod>: bijna altijd de datum van een build, niet van de inhoud`);
  else if (opBouwdag >= 3) zet('WAARSCHUWING', 'lastmod-vandaag', s.pad, `${opBouwdag} adressen dragen de datum van de build (${bouwdagen[0]}). Klopt dat, of krijgen vaste pagina's de builddatum mee?`);
  const extra = s.urls.filter((u) => u.extra).length;
  if (extra) zet('WAARSCHUWING', 'changefreq-priority', s.pad, `${extra} adressen met <changefreq> of <priority>: Google leest ze niet; laat ze weg`);
  if (s.stijlblad) zet('WAARSCHUWING', 'stijlblad', s.pad, 'een <?xml-stylesheet?> in de sitemap: browsers halen XSLT weg (Chrome vanaf versie 158) en tonen dan kale XML. Haal de regel weg');
  if (s.urls.length > MAX_ADRESSEN || (s.bytes || 0) > MAX_BYTES) zet('FOUT', 'te-groot', s.pad, `${s.urls.length} adressen, ${Math.round((s.bytes || 0) / 1024 / 1024)} MB: de grens is 50.000 adressen en 50 MB per bestand. Splits en gebruik een index`);
  const gezien = new Set();
  const dubbel = new Set();
  for (const u of s.urls) { if (u.loc && gezien.has(u.loc)) dubbel.add(u.loc); gezien.add(u.loc); }
  if (dubbel.size) zet('WAARSCHUWING', 'dubbel', [...dubbel][0], `${dubbel.size} ${dubbel.size === 1 ? 'adres staat' : 'adressen staan'} meer dan één keer in de sitemap`);
  return regels;
}

const echtePaginas = (paginas) => paginas.filter((p) => !p.stub && !FOUTPAGINA.test(p.pad));
/** Een testbuild: elke pagina staat op noindex. Wat indexeerbaar hoort te zijn is dan niet te zien. */
const isTestbuild = (paginas) => { const echte = echtePaginas(paginas); return echte.length > 0 && echte.every((p) => p.noindex); };

const toegestaan = (akkoord, regel, pad) => akkoord.some((a) => a.regel === regel && (String(a.pad).endsWith('*') ? pad.startsWith(String(a.pad).slice(0, -1)) : sleutel(String(a.pad)) === sleutel(pad)));

/**
 * Oordeel over de sitemaps van een build.
 * @param {{ sitemaps: { pad: string, urls: object[], stijlblad: boolean, bytes?: number }[],
 *           paginas: { pad: string, canoniek: string|null, noindex: boolean, stub: boolean }[],
 *           bestaat?: (pad: string) => boolean, redirect?: (pad: string) => boolean,
 *           bouwdagen?: string[], nu?: Date, akkoord?: object[] }} invoer
 */
export function beoordeel({ sitemaps, paginas, bestaat = () => false, redirect = () => false, bouwdagen = [], nu = new Date(), akkoord = [] }) {
  const regels = [];
  const zet = (status, regel, pad, melding, sitemap) => { if (!toegestaan(akkoord, regel, pad)) regels.push({ status, regel, pad, sitemap, melding }); };
  const echte = echtePaginas(paginas);
  const staging = isTestbuild(paginas);
  const perPad = new Map(paginas.map((p) => [sleutel(p.pad), p]));
  // De host van de site: die van de meeste canonicals.
  const hosts = new Map();
  for (const p of echte) { const c = p.canoniek && adres(p.canoniek); if (c) hosts.set(c.host, (hosts.get(c.host) || 0) + 1); }
  const host = [...hosts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const inSitemap = new Set();
  for (const s of sitemaps) {
    for (const r of beoordeelBestand(s, { bouwdagen, nu })) zet(r.status, r.regel, r.pad, r.melding, s.pad);
    for (const u of s.urls) {
      const url = u.loc && adres(u.loc);
      if (!url) { zet('FOUT', 'geen-volledig-adres', u.loc || s.pad, `<loc>${u.loc ?? ''}</loc> is geen volledig adres met https:// en host`, s.pad); continue; }
      const pad = url.pathname;
      inSitemap.add(sleutel(pad));
      if (host && url.host !== host) { zet('FOUT', 'andere-host', pad, `${u.loc} staat op ${url.host}; de pagina's wijzen naar ${host}`, s.pad); continue; }
      const p = perPad.get(sleutel(pad));
      if (redirect(pad)) zet('FOUT', 'stuurt-door', pad, 'vercel.json stuurt dit adres door: zet het doel in de sitemap, niet het oude adres', s.pad);
      else if (!p) { if (!bestaat(pad)) zet('FOUT', 'bestaat-niet', pad, 'staat in de sitemap, maar er is geen pagina voor gebouwd', s.pad); }
      else if (p.stub) zet('FOUT', 'stuurt-door', pad, 'een doorstuurpagina (meta refresh) hoort niet in de sitemap', s.pad);
      else {
        if (p.noindex && !staging) zet('FOUT', 'noindex', pad, 'staat op noindex en in de sitemap: kies één van de twee', s.pad);
        if (p.canoniek && !zelfde(p.canoniek, u.loc)) zet('FOUT', 'canoniek-anders', pad, `de sitemap noemt ${u.loc}, de pagina wijst naar ${p.canoniek}`, s.pad);
      }
    }
  }
  if (!staging && sitemaps.length) {
    for (const p of echte) {
      if (p.noindex || PAGINERING.test(p.pad) || inSitemap.has(sleutel(p.pad))) continue;
      const c = p.canoniek && adres(p.canoniek);
      if (c && sleutel(c.pathname) !== sleutel(p.pad)) continue; // wijst naar een ander adres: hoort er niet in
      zet('FOUT', 'ontbreekt', p.pad, 'indexeerbare pagina staat niet in de sitemap. Zet haar erin, of zet haar op noindex');
    }
  }
  return { staging, adressen: sitemaps.reduce((n, s) => n + s.urls.length, 0), regels };
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

const isBestand = (f) => fs.existsSync(f) && fs.statSync(f).isFile();
const padUitAdres = (u) => { try { return ontcijfer(new URL(u, 'https://x.invalid').pathname); } catch { return null; } };

/** De sitemapbestanden van een build: uit robots.txt, anders de vaste namen; een index wordt gevolgd. */
export function vindSitemaps(dist) {
  const regels = [];
  const robots = path.join(dist, 'robots.txt');
  const start = [];
  if (isBestand(robots)) {
    const genoemd = [...fs.readFileSync(robots, 'utf8').matchAll(/^[ \t]*sitemap[ \t]*:[ \t]*(\S+)/gim)].map((m) => m[1]);
    for (const u of genoemd) {
      const p = padUitAdres(u);
      if (p && isBestand(path.join(dist, p))) start.push(p);
      else regels.push({ status: 'WAARSCHUWING', regel: 'niet-in-robots', pad: '/robots.txt', melding: `robots.txt noemt ${u}, maar dat bestand staat niet in de build. Maakt de server het, meet dan met --live` });
    }
    if (!genoemd.length) regels.push({ status: 'WAARSCHUWING', regel: 'niet-in-robots', pad: '/robots.txt', melding: 'robots.txt noemt geen sitemap. Zet er een regel "Sitemap: https://.../sitemap.xml" in' });
  }
  if (!start.length) {
    const vast = ['/sitemap.xml', '/sitemap-index.xml', '/sitemap_index.xml'].find((n) => isBestand(path.join(dist, n)));
    if (vast) start.push(vast);
  }
  const sitemaps = [];
  const gezien = new Set();
  const wachtrij = [...start];
  while (wachtrij.length) {
    const p = wachtrij.shift();
    if (gezien.has(p)) continue;
    gezien.add(p);
    const f = path.join(dist, p);
    if (!isBestand(f)) continue;
    const xml = fs.readFileSync(f, 'utf8');
    const s = leesSitemap(xml);
    if (s.index) { for (const k of s.kinderen) { const kp = padUitAdres(k); if (kp) wachtrij.push(kp); } continue; }
    const m = fs.statSync(f).mtime;
    sitemaps.push({ pad: p, urls: s.urls, stijlblad: s.stijlblad, bytes: Buffer.byteLength(xml), bouwdagen: [...new Set([dag(m), lokaleDag(m)])] });
  }
  return { sitemaps, regels };
}

export function meet(dist, { cfg = {}, akkoord = [], nu = new Date() } = {}) {
  const paginas = bestanden(dist, (n) => n.endsWith('.html')).map((f) => ({ pad: padVan(dist, f), ...paginaInfo(fs.readFileSync(f, 'utf8')) }));
  const gevonden = vindSitemaps(dist);
  const { sitemaps } = gevonden;
  const testbuild = isTestbuild(paginas);
  // Op een testbuild sluit robots.txt alles af en noemt hij bewust geen sitemap.
  const vooraf = testbuild ? gevonden.regels.filter((r) => r.regel !== 'niet-in-robots') : gevonden.regels;
  if (!sitemaps.length) {
    return { paginas: paginas.length, sitemaps: [], adressen: 0, staging: testbuild, regels: [...vooraf, { status: 'WAARSCHUWING', regel: 'geen-sitemap', pad: '*', melding: 'geen sitemap in de build. Maakt de server hem, meet dan met --live' }] };
  }
  const bestaat = (pad) => isBestand(path.join(dist, ontcijfer(pad)));
  const uitkomst = beoordeel({ sitemaps, paginas, bestaat, redirect: redirectsUit(cfg), bouwdagen: [...new Set(sitemaps.flatMap((s) => s.bouwdagen))], nu, akkoord });
  return { paginas: paginas.length, sitemaps: sitemaps.map((s) => s.pad), adressen: uitkomst.adressen, staging: uitkomst.staging, regels: [...vooraf, ...uitkomst.regels] };
}

const wacht = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function haal(url) {
  const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  return { status: r.status, soort: r.headers.get('content-type') || '', robots: r.headers.get('x-robots-tag') || '', naar: r.headers.get('location') || '', tekst: r.status === 200 ? await r.text() : '' };
}

/** Een steekproef van n adressen, gelijk verdeeld over de lijst. */
export function steekproef(lijst, n) {
  if (lijst.length <= n) return [...lijst];
  const stap = lijst.length / n;
  return Array.from({ length: n }, (_, i) => lijst[Math.floor(i * stap)]);
}

/** Leest de sitemap van een live site en vraagt een steekproef van de adressen op. */
export async function meetLive(start, { max = 40, pauze = 500, nu = new Date() } = {}) {
  const origin = new URL(start).origin;
  const regels = [];
  const zet = (status, regel, pad, melding) => regels.push({ status, regel, pad, melding });
  const robots = await haal(`${origin}/robots.txt`);
  let wachtrij = robots.status === 200 ? [...robots.tekst.matchAll(/^[ \t]*sitemap[ \t]*:[ \t]*(\S+)/gim)].map((m) => m[1]) : [];
  if (!wachtrij.length) {
    zet('WAARSCHUWING', 'niet-in-robots', '/robots.txt', 'robots.txt noemt geen sitemap');
    wachtrij = [`${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`];
  }
  const sitemaps = [];
  const gezien = new Set();
  while (wachtrij.length && gezien.size < 60) {
    const u = wachtrij.shift();
    if (gezien.has(u)) continue;
    gezien.add(u);
    const r = await haal(u);
    await wacht(pauze);
    if (r.status !== 200) { if (robots.status === 200 && robots.tekst.includes(u)) zet('FOUT', 'bestaat-niet', u, `robots.txt noemt deze sitemap, maar hij geeft ${r.status}`); continue; }
    const s = leesSitemap(r.tekst);
    if (!s.geldig) continue;
    if (!/xml/i.test(r.soort)) zet('WAARSCHUWING', 'soort-antwoord', u, `de sitemap komt als ${r.soort || 'onbekend type'}, niet als application/xml`);
    if (s.index) { wachtrij.push(...s.kinderen); continue; }
    sitemaps.push({ pad: u, urls: s.urls, stijlblad: s.stijlblad, bytes: Buffer.byteLength(r.tekst) });
  }
  if (!sitemaps.length) return { origin, sitemaps: [], adressen: 0, gemeten: 0, regels: [...regels, { status: 'FOUT', regel: 'geen-sitemap', pad: '*', melding: 'geen sitemap gevonden via robots.txt, /sitemap.xml of /sitemap-index.xml' }] };
  for (const s of sitemaps) regels.push(...beoordeelBestand(s, { nu }));
  const alle = [...new Set(sitemaps.flatMap((s) => s.urls.map((u) => u.loc).filter(Boolean)))];
  const proef = steekproef(alle, max);
  for (const loc of proef) {
    const url = adres(loc);
    if (!url) { zet('FOUT', 'geen-volledig-adres', loc, `<loc>${loc}</loc> is geen volledig adres`); continue; }
    if (url.origin !== origin) { zet('FOUT', 'andere-host', loc, `staat op ${url.host}, de site op ${new URL(origin).host}`); continue; }
    let r;
    try { r = await haal(loc); } catch (e) { zet('FOUT', 'geen-200', loc, `niet op te vragen: ${e.message}`); await wacht(pauze); continue; }
    await wacht(pauze);
    if (r.status !== 200) { zet('FOUT', 'geen-200', loc, `geeft ${r.status}${r.naar ? ` naar ${r.naar}` : ''}; in de sitemap horen alleen adressen die 200 geven`); continue; }
    if (!/html/i.test(r.soort)) continue;
    const info = paginaInfo(r.tekst);
    if (info.noindex || /noindex/i.test(r.robots)) zet('FOUT', 'noindex', loc, 'staat op noindex en in de sitemap: kies één van de twee');
    if (info.canoniek && !zelfde(new URL(info.canoniek, loc).href, loc)) zet('FOUT', 'canoniek-anders', loc, `de pagina wijst naar ${info.canoniek}`);
  }
  return { origin, sitemaps: sitemaps.map((s) => s.pad), adressen: alle.length, gemeten: proef.length, regels };
}

export function eindcode(fouten, { postbuild = false, env = {} } = {}) {
  if (!fouten) return 0;
  const productie = env.VERCEL_ENV === 'production' || env.PUBLIC_SITE_ENV === 'production';
  if (postbuild && !productie) {
    console.log('\nGeen productiebuild: de build gaat door. Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt hier.');
    return 0;
  }
  if (postbuild) console.log('\nProductiebuild gestopt: de sitemap klopt niet met de gebouwde pagina\'s (zie FOUT hierboven). Los het op in src/pages/sitemap.xml.ts.\nIs het een bewuste keuze: zet de regel met reden in sitemap-check-akkoord.json.');
  return 1;
}

function toon(uitkomst, alles) {
  const perRegel = new Map();
  for (const r of uitkomst.regels) perRegel.set(`${r.status}|${r.regel}`, [...(perRegel.get(`${r.status}|${r.regel}`) || []), r]);
  const max = alles ? Infinity : 4;
  for (const [sleutelRegel, lijst] of [...perRegel].sort(([a], [b]) => (a.startsWith('FOUT') === b.startsWith('FOUT') ? a.localeCompare(b) : a.startsWith('FOUT') ? -1 : 1))) {
    const [status, regel] = sleutelRegel.split('|');
    console.log(`  ${status}  ${regel}: ${lijst.length} keer`);
    for (const r of lijst.slice(0, max)) console.log(`      ${r.pad}: ${r.melding}`);
    if (lijst.length > max) console.log(`      ... en nog ${lijst.length - max} (toon alles met --alles)`);
  }
  const fout = uitkomst.regels.filter((r) => r.status === 'FOUT').length;
  const waarschuwing = uitkomst.regels.length - fout;
  return { fout, waarschuwing };
}

async function main() {
  const args = process.argv.slice(2);
  const optie = (naam) => { const i = args.indexOf(`--${naam}`); return i >= 0 ? args[i + 1] : undefined; };
  const json = optie('json');
  if (args.includes('--live')) {
    const start = optie('live');
    if (!start || !/^https?:\/\//.test(start)) {
      console.error('Gebruik: node sitemap-check.mjs --live https://www.klant.nl [--max 40] [--pauze 500] [--json <pad>]');
      process.exit(2);
    }
    const uitkomst = await meetLive(start, { max: Number(optie('max') || 40), pauze: Number(optie('pauze') || 500) });
    console.log(`Sitemap live: ${uitkomst.origin}`);
    console.log(`Sitemaps: ${uitkomst.sitemaps.join(', ') || 'geen'}; adressen: ${uitkomst.adressen}, opgevraagd: ${uitkomst.gemeten}`);
    const { fout, waarschuwing } = toon(uitkomst, args.includes('--alles'));
    console.log(`\nSamen: ${uitkomst.adressen} adressen, ${fout} fout, ${waarschuwing} ${waarschuwing === 1 ? 'waarschuwing' : 'waarschuwingen'}.`);
    if (json) fs.writeFileSync(json, JSON.stringify(uitkomst, null, 1));
    process.exit(fout ? 1 : 0);
  }
  const app = args.find((a, i) => !a.startsWith('--') && !['--dist', '--json', '--max', '--pauze'].includes(args[i - 1]));
  if (!app) {
    console.error('Gebruik: node sitemap-check.mjs <app-map> [--dist <map>] [--json <pad>] [--alles] [--postbuild]\n     of: node sitemap-check.mjs --live https://www.klant.nl');
    process.exit(2);
  }
  const appDir = path.resolve(app);
  const dist = vindBuild(appDir, optie('dist'));
  if (!fs.existsSync(dist)) {
    console.log(`Sitemap: geen build in ${dist} (niet gemeten; bouw eerst).`);
    process.exit(0);
  }
  const lees = (naam) => { const f = path.join(appDir, naam); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : null; };
  let cfg = {};
  let akkoord = [];
  try { cfg = lees('vercel.json') || {}; akkoord = lees('sitemap-check-akkoord.json') || []; } catch (e) {
    console.error(`vercel.json of sitemap-check-akkoord.json is geen geldige JSON: ${e.message}`);
    process.exit(2);
  }
  if (akkoord.some((a) => !a.regel || !a.pad || !String(a.reden || '').trim())) {
    console.error('sitemap-check-akkoord.json: elke regel heeft "regel", "pad" en "reden" nodig.');
    process.exit(2);
  }
  const uitkomst = meet(dist, { cfg, akkoord });
  console.log(`Sitemap: ${dist}`);
  console.log(`Omgeving: VERCEL_ENV=${process.env.VERCEL_ENV || '-'} PUBLIC_SITE_ENV=${process.env.PUBLIC_SITE_ENV || '-'}`);
  console.log(`Pagina's: ${uitkomst.paginas}; sitemaps: ${uitkomst.sitemaps.join(', ') || 'geen'}; adressen: ${uitkomst.adressen}${uitkomst.staging ? ' (testbuild: elke pagina noindex; noindex en ontbreekt zijn niet gemeten)' : ''}`);
  if (akkoord.length) console.log(`Toegestaan met reden: ${akkoord.map((a) => `${a.regel} ${a.pad}`).join(', ')}`);
  const { fout, waarschuwing } = toon(uitkomst, args.includes('--alles'));
  console.log(`\nSamen: ${uitkomst.adressen} adressen, ${fout} fout, ${waarschuwing} ${waarschuwing === 1 ? 'waarschuwing' : 'waarschuwingen'}.`);
  if (json) fs.writeFileSync(json, JSON.stringify({ dist, ...uitkomst }, null, 1));
  process.exit(eindcode(fout, { postbuild: args.includes('--postbuild'), env: process.env }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
