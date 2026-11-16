#!/usr/bin/env node
// menu-check.mjs: draagt elke pagina het menu en de footer van de site?
//
// Waarom (15-11-2026, moovsapp.com): de klant had een nieuwe pagina buiten de site gebouwd, met een
// zelf nagemaakt menu erin. Die pagina ging één op één live. Het menu "Solutions" was daar een kale
// lijst links in plaats van het echte uitklapmenu, en de footer van de site ontbrak. Niets merkte het
// op: de pagina was pixelgelijk aan het aangeleverde bestand, en dat was de enige toets. Jorrit:
// "dit zou zo niet mogen voorkomen, menu's zouden overal hetzelfde moeten zijn".
//
// Wat het meet, op elke pagina van de build:
//   menu     de links in de eerste <header>, <nav>, [role=banner] of [role=navigation] met links,
//            buiten de footer (dus niet de inhoudsopgave of kruimels verderop in de pagina)
//   footer   de links in de laatste <footer> of [role=contentinfo]
// Een menu is hier de verzameling linkdoelen. Taalknoppen tellen niet mee (die wijzen per pagina naar
// de eigen vertaling): een link met hreflang, een link naar een hreflang-alternate uit de head, of een
// link binnen een taalknop (zie TAALKNOP en TAALLINK: eigen bouw, TranslatePress, WPML, Polylang).
// Pagina's worden per taal (<html lang>) vergeleken. Redirect-stubs (meta refresh) tellen niet.
//
// Het slot: {app}/menu-slot.json legt vast welke menu's en footers de site heeft (het hoofdmenu, en
// bewuste varianten zoals een campagnepagina met alleen een logo, elk met reden). Een pagina met een
// menu of footer die daar niet in staat is een FOUT. Zo stopt een pagina met een eigen menu de deploy,
// en is een bewuste wijziging van het hoofdmenu één keer vastleggen.
//
// Gebruik:
//   node menu-check.mjs <app-map>                     controleren (exit 1 bij een afwijking)
//   node menu-check.mjs <app-map> --vastleggen        eerste keer: alles wat er nu is op slot
//   node menu-check.mjs <app-map> --vastleggen --akkoord "<wie, waarom>"
//                                                     een nieuw of gewijzigd menu bewust vastleggen
//   node scripts/menu-check.mjs . --postbuild         als kopie in de app (sites die via git deployen:
//     de deploy-gate ziet die niet). Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production)
//     stopt op FOUT, een test- of lokale build meldt het alleen.
//   Opties: --dist <map>   andere buildmap dan <app>/dist (ook gezocht: dist/client, .vercel/output/static)
//           --slot <pad>   ander slotbestand dan <app>/menu-slot.json
//           --json <pad>   uitkomst als JSON (bewijs)
// Zonder menu-slot.json: overzicht van de menu's, exit 0 (nog niets op slot; vastleggen bij Gate C).
// Zonder build: melding, exit 0.
// Exit 0 = goed, 1 = FOUT, 2 = verkeerd gebruik of niet te meten. Heeft cheerio nodig.
// De app-kopie en de kopie in _template/astro-website/scripts/ zijn byte-gelijk aan dit bestand (menu-check.test.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

// Taalknoppen: eigen bouw (ms618: .lang-toggle), TranslatePress (.trp-*, mega-translate-*), WPML, Polylang.
// Bewust geen losse [class*=translate]: Tailwind kent translate-x-1 en dat staat op gewone menu's.
const TAALKNOP = ['[data-taalwissel]', '[data-lang-switch]', '.taalwissel', '[class*="lang-switch"]', '[class*="lang-toggle"]', '[class*="lang-select"]',
  '[class*="language-switch"]', '[class*="language-toggle"]', '[class*="language-select"]', '[class*="taal-switch"]', '[class*="trp-"]', '[class*="trp_"]',
  '[class*="mega-translate"]', '[class*="wpml-ls"]', '.lang-item', '[class*="pll-"]',
  // een class die met lang-, language- of taal- begint of op -lang eindigt (ms618 mobiel: .lang-mobile)
  '[class^="lang-"]', '[class*=" lang-"]', '[class^="language-"]', '[class*=" language-"]', '[class^="taal-"]', '[class*=" taal-"]', '[class$="-lang"]', '[class*="-lang "]'].join(',');
// De link zelf: een vlaggetje of het TranslatePress-kenmerk erin (De Oorsprong: geen class op het menu-item).
const TAALLINK = 'img[class*="flag"],[data-no-translation]';

const hash = (links) => crypto.createHash('sha1').update(links.join('\n')).digest('hex').slice(0, 8);

/** Linkdoel in één vorm: eigen pagina's als pad, de rest als host + pad. '' = telt niet mee. */
export function doel(href, eigenHosts) {
  const h = (href || '').trim();
  if (!h || h.startsWith('#') || /^javascript:/i.test(h)) return '';
  if (/^(mailto|tel|sms|whatsapp):/i.test(h)) return h.toLowerCase().replace(/\s+/g, '');
  let u;
  try { u = new URL(h, 'https://eigen.invalid'); } catch { return ''; }
  const eigen = u.hostname === 'eigen.invalid' || eigenHosts.has(u.hostname.replace(/^www\./, ''));
  let p = u.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  if (eigen) return p;
  return `${u.hostname.replace(/^www\./, '')}${p === '/' ? '' : p}`;
}

/** Menu en footer van één pagina. */
export function menuVan(html) {
  const $ = cheerio.load(html);
  const stub = $('meta[http-equiv]').filter((_, el) => /refresh/i.test($(el).attr('http-equiv') || '')).length > 0;
  const taal = ($('html').attr('lang') || '').toLowerCase();
  const eigenHosts = new Set();
  for (const sel of ['link[rel="canonical"]', 'meta[property="og:url"]']) {
    const v = $(sel).attr('href') || $(sel).attr('content');
    try { if (v) eigenHosts.add(new URL(v).hostname.replace(/^www\./, '')); } catch { /* geen geldige URL */ }
  }
  const alternates = new Set($('link[rel="alternate"][hreflang]').map((_, el) => doel($(el).attr('href'), eigenHosts)).get().filter(Boolean));
  // De pagina noemt zichzelf ook als taalversie. Die link is geen taalknop: zonder deze regel verdween op
  // elke pagina de menulink naar de pagina zelf, en leek elk menu uniek (ronde over 43 builds, 15-11-2026).
  const zelf = doel($('link[rel="canonical"]').attr('href'), eigenHosts);
  if (zelf) alternates.delete(zelf);
  const links = (el) => {
    const set = new Set();
    $(el).find('a[href]').each((_, a) => {
      if ($(a).attr('hreflang') || $(a).attr('lang') || $(a).closest(TAALKNOP).length || $(a).find(TAALLINK).length) return;
      const d = doel($(a).attr('href'), eigenHosts);
      if (d && !alternates.has(d)) set.add(d);
    });
    return [...set].sort();
  };
  const buitenFooter = (el) => $(el).closest('footer,[role="contentinfo"]').length === 0;
  let menu = [];
  $('header,nav,[role="banner"],[role="navigation"]').each((_, el) => {
    if (!buitenFooter(el)) return undefined;
    const l = links(el);
    if (!l.length) return undefined;
    menu = l;
    return false; // de eerste met links is het menu
  });
  const footerEl = $('footer,[role="contentinfo"]').last();
  const footer = footerEl.length ? links(footerEl) : [];
  return { stub, taal, menu, footer };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.html') ? [p] : [];
  });
}

/** Alle pagina's van een build met hun menu en footer. */
export function meet(dist) {
  const paginas = [];
  for (const f of walk(dist)) {
    const m = menuVan(fs.readFileSync(f, 'utf8'));
    if (m.stub) continue;
    let pad = `/${path.relative(dist, f).replace(/\\/g, '/')}`.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    if (pad !== '/') pad = pad.replace(/\/$/, '');
    paginas.push({ pad, taal: m.taal, menu: m.menu, menuId: hash(m.menu), footer: m.footer, footerId: hash(m.footer) });
  }
  return paginas.sort((a, b) => a.pad.localeCompare(b.pad));
}

/** Per soort (menu, footer) en taal: de groepen pagina's met hetzelfde menu, grootste eerst. */
export function groepen(paginas, soort) {
  const map = new Map();
  for (const p of paginas) {
    const key = `${p.taal}|${p[`${soort}Id`]}`;
    if (!map.has(key)) map.set(key, { taal: p.taal, id: p[`${soort}Id`], links: p[soort], paginas: [] });
    map.get(key).paginas.push(p.pad);
  }
  return [...map.values()].sort((a, b) => a.taal.localeCompare(b.taal) || b.paginas.length - a.paginas.length);
}

const verschil = (a, b) => ({ mist: a.filter((x) => !b.includes(x)), extra: b.filter((x) => !a.includes(x)) });
const kort = (lijst, n = 6) => lijst.slice(0, n).join(', ') + (lijst.length > n ? `, en ${lijst.length - n} meer` : '');

/** Vergelijk de build met het slot. Zonder slot: alleen het overzicht. */
export function beoordeel(paginas, slot) {
  const fouten = [];
  const overzicht = [];
  for (const soort of ['menu', 'footer']) {
    const gr = groepen(paginas, soort);
    const vast = slot ? new Map((slot[`${soort}s`] || []).map((v) => [`${v.taal}|${v.id}`, v])) : null;
    for (const taal of [...new Set(gr.map((g) => g.taal))]) {
      const vanTaal = gr.filter((g) => g.taal === taal);
      const hoofdNu = vanTaal[0];
      const hoofdVast = vast ? [...vast.values()].find((v) => v.taal === taal && v.hoofd) : null;
      // Een pagina in een taal die het slot niet kent (de losse pagina van 15-11 had lang="en" op een
      // en-US-site): vergelijk dan met het grootste hoofdmenu, zodat de melding zegt wat er ontbreekt.
      const grootsteVast = vast ? [...vast.values()].filter((v) => v.hoofd).sort((a, b) => b.paginas - a.paginas)[0] : null;
      for (const g of vanTaal) {
        const bekend = vast?.get(`${taal}|${g.id}`);
        overzicht.push({ soort, taal, id: g.id, paginas: g.paginas.length, links: g.links.length, voorbeeld: g.paginas[0], hoofd: g === hoofdNu, vastgelegd: !!bekend, waarom: bekend?.waarom || '' });
        if (!vast || bekend) continue;
        const basis = hoofdVast ? hoofdVast.links : grootsteVast ? grootsteVast.links : hoofdNu.links;
        const d = verschil(basis, g.links);
        const hoofdGewijzigd = hoofdVast && !vanTaal.some((x) => x.id === hoofdVast.id) && g === hoofdNu;
        fouten.push({
          soort, taal, id: g.id, paginas: g.paginas, hoofdGewijzigd,
          tekst: hoofdGewijzigd
            ? `${soort === 'menu' ? 'het hoofdmenu' : 'de footer'}${taal ? ` (${taal})` : ''} is gewijzigd op ${g.paginas.length} pagina's${d.extra.length ? `; erbij: ${kort(d.extra)}` : ''}${d.mist.length ? `; eraf: ${kort(d.mist)}` : ''}. Bewust? Leg vast met --vastleggen --akkoord "<wie, waarom>".`
            : `${g.paginas.length === 1 ? g.paginas[0] : `${g.paginas.length} pagina's (${kort(g.paginas, 4)})`}: ${soort === 'menu' ? 'menu' : 'footer'} staat niet in het slot${g.links.length ? '' : ` (de pagina heeft geen ${soort})`}.${d.mist.length ? ` Mist tegenover het hoofd${soort === 'menu' ? 'menu' : 'footer'}: ${kort(d.mist)}.` : ''}${d.extra.length ? ` Extra: ${kort(d.extra)}.` : ''}`,
        });
      }
    }
  }
  return { fouten, overzicht };
}

/** Het slot op basis van de build; bestaande redenen blijven staan. */
export function maakSlot(paginas, oud, akkoord, datum) {
  const slot = {
    _doc: 'Menu-slot (menu-check.mjs): de menu\'s en footers die deze site heeft. Een pagina met een menu of footer dat hier niet in staat stopt de deploy. Bewust gewijzigd of een variant erbij: node menu-check.mjs <app-map> --vastleggen --akkoord "<wie, waarom>".',
    vastgelegd: oud?.vastgelegd || datum,
    bijgewerkt: datum,
    menus: [], footers: [],
    logboek: [...(oud?.logboek || [])],
  };
  let nieuw = 0;
  for (const soort of ['menu', 'footer']) {
    const oudMap = new Map((oud?.[`${soort}s`] || []).map((v) => [`${v.taal}|${v.id}`, v]));
    const gr = groepen(paginas, soort);
    const hoofdPerTaal = new Map();
    for (const g of gr) if (!hoofdPerTaal.has(g.taal)) hoofdPerTaal.set(g.taal, g.id);
    for (const g of gr) {
      const was = oudMap.get(`${g.taal}|${g.id}`);
      if (!was && oud) nieuw++;
      slot[`${soort}s`].push({
        taal: g.taal, id: g.id, hoofd: hoofdPerTaal.get(g.taal) === g.id,
        paginas: g.paginas.length, voorbeeld: g.paginas[0],
        waarom: was?.waarom || (oud ? akkoord || '' : (hoofdPerTaal.get(g.taal) === g.id ? '' : 'aanwezig bij de eerste vastlegging')),
        links: g.links,
      });
    }
  }
  if (oud && nieuw) slot.logboek.push({ datum, akkoord: akkoord || '', nieuw });
  return { slot, nieuw };
}

// Exitcode. Als postbuild stopt alleen een productiebuild op FOUT; anders gaat de build door.
export function eindcode(fouten, { postbuild = false, env = {} } = {}) {
  if (!fouten) return 0;
  const productie = env.VERCEL_ENV === 'production' || env.PUBLIC_SITE_ENV === 'production';
  if (postbuild && !productie) {
    console.log('\nGeen productiebuild: de build gaat door. Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt hier.');
    return 0;
  }
  if (postbuild) console.log('\nProductiebuild gestopt: een pagina heeft een menu of footer dat niet in menu-slot.json staat (zie FOUT hierboven).\nNiet bedoeld: geef de pagina het menu en de footer van de site.\nWel bedoeld (menu bewust gewijzigd, of een bewuste variant): node scripts/menu-check.mjs . --vastleggen --akkoord "<wie, waarom>" en commit menu-slot.json.');
  return 1;
}

/** De map met de gebouwde pagina's: dist, dist/client (server-adapter) of .vercel/output/static. */
export function vindBuild(app, opgegeven) {
  if (opgegeven) return path.resolve(opgegeven);
  const dist = path.join(app, 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) return dist;
  // De home zelf kan in dist/client ontbreken (Distinkt rendert die op de server), dus de map is het kenmerk.
  if (fs.existsSync(path.join(dist, 'client'))) return path.join(dist, 'client');
  if (fs.existsSync(dist)) return dist;
  const vercel = path.join(app, '.vercel', 'output', 'static');
  return fs.existsSync(vercel) ? vercel : dist;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (naam) => { const i = args.indexOf(naam); return i >= 0 ? args[i + 1] : undefined; };
  const appArg = args.find((a, i) => !a.startsWith('--') && !['--dist', '--slot', '--json', '--akkoord'].includes(args[i - 1]));
  if (!appArg) { console.error('Gebruik: node menu-check.mjs <app-map> [--vastleggen [--akkoord "<wie, waarom>"]] [--dist <map>] [--slot <pad>] [--json <pad>]'); process.exit(2); }
  const app = path.resolve(appArg);
  const postbuild = args.includes('--postbuild');
  const dist = vindBuild(app, opt('--dist'));
  const slotPad = path.resolve(opt('--slot') || path.join(app, 'menu-slot.json'));
  if (!fs.existsSync(dist)) { console.log(`Menu: geen build in ${dist} (niet gemeten; bouw eerst).`); process.exit(0); }
  const paginas = meet(dist);
  if (!paginas.length) { console.error(`Menu: geen pagina's gevonden in ${dist}.`); process.exit(2); }
  let slot = null;
  if (fs.existsSync(slotPad)) {
    try { slot = JSON.parse(fs.readFileSync(slotPad, 'utf8').replace(/^﻿/, '')); } catch (e) { console.error(`Menu: ${slotPad} is niet te lezen (${e.message}).`); process.exit(2); }
  }
  const datum = new Date().toISOString().slice(0, 10);

  if (args.includes('--vastleggen')) {
    const akkoord = opt('--akkoord');
    const { slot: nieuwSlot, nieuw } = maakSlot(paginas, slot, akkoord, datum);
    if (slot && nieuw && !akkoord) {
      const r = beoordeel(paginas, slot);
      for (const f of r.fouten) console.log(`  NIEUW  ${f.tekst}`);
      console.error(`\nMenu: ${nieuw} menu('s) of footer(s) staan nog niet in het slot. Een nieuw menu vastleggen is een besluit: herhaal met --akkoord "<wie, waarom>".`);
      process.exit(1);
    }
    fs.writeFileSync(slotPad, `${JSON.stringify(nieuwSlot, null, 2)}\n`);
    console.log(`Menu: vastgelegd in ${slotPad}: ${nieuwSlot.menus.length} menu('s), ${nieuwSlot.footers.length} footer(s)${nieuw ? `, ${nieuw} nieuw (${akkoord})` : ''}.`);
    process.exit(0);
  }

  const r = beoordeel(paginas, slot);
  console.log(`Menu: ${dist}`);
  console.log(`Pagina's: ${paginas.length}, talen: ${[...new Set(paginas.map((p) => p.taal || '(geen lang)'))].join(', ')}`);
  for (const o of r.overzicht) {
    console.log(`  ${o.soort === 'menu' ? 'menu  ' : 'footer'} ${o.taal || '-'} ${o.id}: ${String(o.paginas).padStart(4)} pagina's, ${String(o.links).padStart(3)} links, bv. ${o.voorbeeld}${o.hoofd ? '  [hoofd]' : ''}${slot ? (o.vastgelegd ? (o.waarom ? `  (${o.waarom})` : '') : '  NIET IN HET SLOT') : ''}`);
  }
  for (const f of r.fouten) console.log(`  FOUT  ${f.tekst}`);
  if (postbuild) console.log(`Omgeving: ${process.env.VERCEL_ENV ? `VERCEL_ENV=${process.env.VERCEL_ENV}` : 'VERCEL_ENV niet gezet'}${process.env.PUBLIC_SITE_ENV ? `, PUBLIC_SITE_ENV=${process.env.PUBLIC_SITE_ENV}` : ''}`);
  if (opt('--json')) fs.writeFileSync(path.resolve(opt('--json')), JSON.stringify({ dist, slot: slot ? slotPad : null, ...r }, null, 1));
  const afwijkend = new Set(r.fouten.flatMap((f) => f.paginas)).size;
  if (!slot) {
    const varianten = r.overzicht.filter((o) => !o.hoofd).length;
    console.log(`\nSamen: geen menu-slot.json (nog niets op slot; vastleggen bij Gate C). ${varianten} variant(en) naast het hoofdmenu en de hoofdfooter.`);
    process.exit(0);
  }
  console.log(`\nSamen: ${paginas.length - afwijkend} goed, ${afwijkend} fout.`);
  process.exit(eindcode(r.fouten.length, { postbuild, env: process.env }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
