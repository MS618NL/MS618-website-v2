#!/usr/bin/env node
// taallek-check.mjs: staat er op een pagina inhoud of een link in de verkeerde taal?
//
// Waarom (11-11-2026, ms618.nl): de Engelse home toonde drie Nederlandse blogposts ("Lees:", links naar
// /blog/), en Engelse pagina's hadden Nederlandse datums ("1 februari 2026") omdat formatDate zonder taal
// werd aangeroepen. 9 van de 23 Engelse pagina's lekten. Google toonde bij "ms618" met Engelse instellingen
// de Engelse home met Nederlandse en Engelse sitelinks door elkaar. hreflang zelf was in orde, dus
// verify-i18n (die op koppelingen en de taal van het pad let) zag de inhoud niet.
//
// Controles op elke pagina van de build (of live), alleen binnen <main>; de taal komt uit <html lang>:
//   1. FOUT  een datum met een maandnaam uit een andere taal ("1 februari 2026" op een Engelse pagina),
//            in <time> of een element met date/datum in de class (bronnen in lopende tekst tellen niet).
//            Maandnamen die in beide talen bestaan (april, september, juni in nl en de) tellen niet.
//   2. FOUT  een link naar een eigen pagina in een andere taal (de taal van de doelpagina uit de build).
//            Toegestaan: een link naar de eigen vertaling (hreflang in de head), een link met een
//            hreflang-attribuut, of binnen een taalknop ([data-taalwissel], [data-lang-switch],
//            .lang-switch, .language-switch, .taalwissel). Redirect-stubs (meta refresh) tellen niet.
//
// Gebruik:
//   node taallek-check.mjs <app-map> [--dist <map>] [--json <pad>]
//   node taallek-check.mjs --live https://www.domein.nl [--max 80] [--json <pad>]
//   node scripts/taallek-check.mjs . --postbuild      als kopie in de app: een productiebuild
//     (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt op FOUT, een test- of lokale build meldt het.
//   Zonder build: melding, exit 0. Eén taal op de hele site: niets te controleren, exit 0.
// Exit 0 = goed, 1 = FOUT, 2 = verkeerd gebruik of niet te meten.
// De app-kopie moet gelijk blijven aan dit script (taallek-check.test.mjs) en heeft cheerio nodig.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

// In de skill-map bewaakt msys-guard de argumenten tegen Git Bash; een app-kopie heeft geen lib/.
try { await import('./lib/msys-guard.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

const MAANDEN = {
  nl: 'januari februari maart april mei juni juli augustus september oktober november december',
  en: 'january february march april may june july august september october november december',
  de: 'januar februar märz april mai juni juli august september oktober november dezember',
  es: 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre',
  fr: 'janvier février mars avril mai juin juillet août septembre octobre novembre décembre',
};
const MAAND_SET = Object.fromEntries(Object.entries(MAANDEN).map(([t, s]) => [t, new Set(s.split(' '))]));
const TAALKNOP = '[data-taalwissel], [data-lang-switch], .lang-switch, .language-switch, .taalwissel';
const taalVan = (lang) => (lang || '').toLowerCase().split('-')[0] || null;

// Maandnamen van andere talen die niet ook in de taal van de pagina bestaan.
function vreemdeMaanden(taal) {
  const eigen = MAAND_SET[taal];
  if (!eigen) return null;
  const vreemd = new Set();
  for (const [t, set] of Object.entries(MAAND_SET)) if (t !== taal) for (const m of set) if (!eigen.has(m)) vreemd.add(m);
  return [...vreemd];
}

const normPad = (p) => { const z = p.split('#')[0].split('?')[0]; return z.endsWith('/') || /\.[a-z0-9]+$/i.test(z) ? z : `${z}/`; };

// Eén pagina: taal, datums in een andere taal, en de interne links in <main> met hun eigenschappen.
export function analyseer(html, paginaUrl) {
  const $ = cheerio.load(html);
  const taal = taalVan($('html').attr('lang'));
  const main = $('main').first();
  // Zonder <main> (sommige WordPress-replica's, Inspecto 11-11): de body zonder header, nav en footer.
  const scope = main.length ? main : $('body').clone().find('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]').remove().end();
  // Alleen datums die de site zelf opmaakt (<time>, of een class met date/datum): een bronvermelding in
  // lopende tekst ("Search Engine Land, March 2026") is geen lek.
  const tekst = scope.find('time, [class*="date"], [class*="datum"]').map((_, el) => $(el).text()).get().join(' | ').replace(/\s+/g, ' ');
  const datums = [];
  const vreemd = vreemdeMaanden(taal);
  if (vreemd && vreemd.length) {
    const m = vreemd.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`(?:\\b\\d{1,2}\\.?\\s+(?:${m})\\b(?:\\s+\\d{4})?|\\b(?:${m})\\s+(?:\\d{1,2},?\\s+)?\\d{4}\\b)`, 'giu');
    for (const x of tekst.matchAll(re)) datums.push(x[0].trim());
  }
  // Eigen domein: dat van de pagina plus dat uit de canonical (in een build leest de controle de pagina
  // onder een neppe origin, terwijl hreflang en links vaak de echte domeinnaam hebben).
  const eigen = new Set([new URL(paginaUrl).origin]);
  try { const c = $('link[rel="canonical"]').attr('href'); if (c) eigen.add(new URL(c, paginaUrl).origin); } catch { /* geen geldige canonical */ }
  // De eigen vertalingen (hreflang in de head): een link daarheen is per definitie de taalknop, ook
  // zonder hreflang op de link zelf (Inspecto-replica 11-11: WordPress-taalknop binnen <main>).
  const vertalingen = new Set($('link[rel="alternate"][hreflang]').map((_, el) => {
    try { const u = new URL($(el).attr('href'), paginaUrl); return eigen.has(u.origin) ? normPad(u.pathname) : null; } catch { return null; }
  }).get().filter(Boolean));
  const links = [];
  scope.find('a[href]').each((_, el) => {
    const $a = $(el);
    let u; try { u = new URL($a.attr('href'), paginaUrl); } catch { return; }
    if (!eigen.has(u.origin) || /\.[a-z0-9]{2,4}$/i.test(u.pathname)) return;
    const pad = normPad(u.pathname);
    links.push({ pad, toegestaan: Boolean($a.attr('hreflang')) || $a.closest(TAALKNOP).length > 0 || vertalingen.has(pad) });
  });
  // Een redirect-stub (meta refresh, zonder taal) is geen pagina om te controleren (BBR 11-11).
  const redirect = $('meta[http-equiv]').filter((_, el) => /refresh/i.test($(el).attr('http-equiv'))).length > 0;
  return { taal, datums: [...new Set(datums)], links, redirect };
}

// Oordeel over alle pagina's: paginas = [{ pad, a }], a = analyseer(...). De taal van een doelpagina komt
// uit dezelfde set; een link naar een pagina buiten de set telt niet.
export function beoordeel(alle) {
  const paginas = alle.filter((p) => !p.a.redirect);
  const taalPerPad = new Map(paginas.map((p) => [normPad(p.pad), p.a.taal]));
  const talen = new Set([...taalPerPad.values()].filter(Boolean));
  const regels = [];
  if (talen.size < 2) return { regels, talen: [...talen], paginas: paginas.length, eentalig: true };
  for (const p of paginas) {
    const { taal, datums, links } = p.a;
    if (!taal) { regels.push({ status: 'WAARSCHUWING', check: 'taal', pad: p.pad, melding: 'geen <html lang>: taal van de pagina onbekend' }); continue; }
    if (datums.length) regels.push({ status: 'FOUT', check: 'datum', pad: p.pad, melding: `datum in een andere taal op een ${taal}-pagina: ${datums.slice(0, 3).join(', ')}. Geef formatDate de taal van de pagina mee` });
    const fout = [...new Set(links.filter((l) => !l.toegestaan && taalPerPad.has(l.pad) && taalPerPad.get(l.pad) && taalPerPad.get(l.pad) !== taal).map((l) => `${l.pad} (${taalPerPad.get(l.pad)})`))];
    if (fout.length) regels.push({ status: 'FOUT', check: 'link', pad: p.pad, melding: `link naar een pagina in een andere taal: ${fout.slice(0, 4).join(', ')}${fout.length > 4 ? ` en ${fout.length - 4} meer` : ''}. Haal de inhoud uit de eigen taal, of markeer een bewuste taalknop met hreflang` });
  }
  return { regels, talen: [...talen], paginas: paginas.length, eentalig: false };
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
  const origin = 'https://site.invalid';
  const paginas = htmlBestanden(dist).map((rel) => {
    const pad = rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel.slice(0, -'.html'.length)}`;
    return { pad, a: analyseer(fs.readFileSync(path.join(dist, rel), 'utf8'), origin + pad) };
  });
  return { bron: dist, ...beoordeel(paginas) };
}

export async function controleerLive(basis, max = 80) {
  const haal = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MS618 taallek-check)' } }); return r.ok ? r.text() : ''; };
  const origin = new URL(basis).origin;
  let locs = [];
  for (const s of ['/sitemap-index.xml', '/sitemap.xml']) {
    const xml = await haal(origin + s);
    const l = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    if (!l.length) continue;
    if (l.some((x) => x.endsWith('.xml'))) { for (const sub of l.filter((x) => x.endsWith('.xml'))) locs.push(...[...(await haal(sub)).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())); }
    else locs = l;
    break;
  }
  if (!locs.length) throw new Error(`geen sitemap gevonden op ${origin}`);
  const paginas = [];
  for (const u of [...new Set(locs)].slice(0, max)) {
    const h = await haal(u);
    if (h) paginas.push({ pad: new URL(u).pathname, a: analyseer(h, u) });
  }
  return { bron: origin, ...beoordeel(paginas), max };
}

export function drukAf(r) {
  console.log(`Taallek: ${r.bron}`);
  if (r.eentalig) { console.log(`Eén taal (${r.talen.join(', ') || 'onbekend'}): niets te controleren.\n\nSamen: 0 goed, 0 fout, 0 waarschuwingen.`); return; }
  console.log(`Pagina's: ${r.paginas}, talen: ${r.talen.join(', ')}${r.max ? ` (live, maximaal ${r.max} uit de sitemap)` : ''}\n`);
  for (const x of r.regels) console.log(`  ${x.status}  ${x.pad}: ${x.melding}`);
  const n = (s) => r.regels.filter((x) => x.status === s).length;
  const goed = r.paginas - new Set(r.regels.map((x) => x.pad)).size;
  console.log(`\nSamen: ${goed} goed, ${n('FOUT')} fout, ${n('WAARSCHUWING')} waarschuwing${n('WAARSCHUWING') === 1 ? '' : 'en'}.`);
}

// Exitcode. Als postbuild stopt alleen een productiebuild op FOUT; anders gaat de build door.
export function eindcode(r, { postbuild = false, env = {} } = {}) {
  if (!r.regels.some((x) => x.status === 'FOUT')) return 0;
  const productie = env.VERCEL_ENV === 'production' || env.PUBLIC_SITE_ENV === 'production';
  if (postbuild && !productie) {
    console.log('\nGeen productiebuild: de build gaat door. Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt hier.');
    return 0;
  }
  if (postbuild) console.log('\nProductiebuild gestopt: los de FOUT hierboven op (regels onder "Taal" in AGENTS.md of MAINTENANCE.md).');
  return 1;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (naam) => { const i = args.indexOf(naam); return i >= 0 ? args[i + 1] : undefined; };
  const live = opt('--live');
  const appArg = args.find((a, i) => !a.startsWith('--') && !['--dist', '--json', '--live', '--max'].includes(args[i - 1]));
  if (!live && !appArg) {
    console.error('Gebruik: node taallek-check.mjs <app-map> [--dist <map>] [--json <pad>]\n       node taallek-check.mjs --live https://www.domein.nl [--max 80] [--json <pad>]');
    process.exit(2);
  }
  let r;
  try {
    r = live ? await controleerLive(live, Number(opt('--max') || 80)) : controleerDist(path.resolve(appArg), opt('--dist'));
  } catch (e) {
    console.error(`Taallek: niet te meten: ${e.message}`);
    process.exit(2);
  }
  if (!r) {
    console.log(`Taallek: geen build in ${path.resolve(opt('--dist') || path.join(appArg, 'dist'))}; niets gemeten (bouw eerst).`);
    process.exit(0);
  }
  drukAf(r);
  if (args.includes('--postbuild')) console.log(`Omgeving: ${process.env.VERCEL_ENV ? `VERCEL_ENV=${process.env.VERCEL_ENV}` : 'VERCEL_ENV niet gezet'}${process.env.PUBLIC_SITE_ENV ? `, PUBLIC_SITE_ENV=${process.env.PUBLIC_SITE_ENV}` : ''}`);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(r, null, 2));
  process.exit(eindcode(r, { postbuild: args.includes('--postbuild'), env: process.env }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
