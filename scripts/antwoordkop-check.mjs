#!/usr/bin/env node
// antwoordkop-check.mjs: stuurt de site de verplichte antwoordkoppen mee, en klopt de cache per soort bestand?
//
// Waarom (17-11-2026, meting over de 13 live sites): 6 sites misten X-Content-Type-Options en een verbod op
// inbedden, twee verplichte punten in specification.website (x-content-type-options, frame-ancestors). Bij
// twee sites hadden de bestanden onder /_astro/ geen vaste cache, bij 8 sites werden
// lettertypen of beelden uit public bij elk bezoek opnieuw gecontroleerd (cache-control, ook verplicht).
// De starter zette geen enkele kop: elke site kreeg ze met de hand, of niet.
//
// Wat het meet. Lokaal: wat vercel.json meestuurt, gerekend met Vercels eigen omzetting
// (getTransformedRoutes uit @vercel/routing-utils, dezelfde als bij de build), voor elk bestand in de build.
//   FOUT          X-Content-Type-Options: nosniff ontbreekt
//   FOUT          een pagina mag in een kader van een andere site: geen X-Frame-Options (DENY of SAMEORIGIN)
//                 en geen frame-ancestors in Content-Security-Policy
//   FOUT          X-XSS-Protection staat aan (verouderd en zelf een risico; alleen "0" mag)
//   FOUT          een regel die een bestand onder /_astro/ een te korte cache geeft (hoort: "max-age=31536000,
//                 immutable"; de naam bevat een vingerafdruk, het bestand verandert nooit)
//   WAARSCHUWING  vercel.json zet de cache op /_astro/ niet zelf. Bouwt Vercel de site als Astro-project, dan
//                 zet Vercel die kop; bij een andere manier van deployen niet. Live is het ontbreken een FOUT.
//   FOUT          een pagina met een cache langer dan een uur (een fout is dan niet meer te herstellen)
//   WAARSCHUWING  Referrer-Policy of Permissions-Policy ontbreekt
//   WAARSCHUWING  lettertypen of beelden buiten /_astro/ met een cache korter dan 30 dagen
// Live (--live): dezelfde regels op wat de server echt stuurt, voor de pagina en één bestand per soort, plus
//   FOUT          geen Strict-Transport-Security, of de pagina komt zonder compressie
//   WAARSCHUWING  een cookie van de server zonder Secure of SameSite
// Een regel in vercel.json met een voorwaarde (has, missing) telt lokaal niet mee; dat staat in de uitvoer.
// Strict-Transport-Security zet Vercel zelf op elk eigen domein: lokaal niet te meten, live wel.
//
// Gebruik:
//   node antwoordkop-check.mjs <app-map> [--dist <map>] [--json <pad>]
//   node antwoordkop-check.mjs --live https://www.domein.nl[,https://ander.nl] [--json <pad>]
//   node scripts/antwoordkop-check.mjs . --postbuild   als kopie in de app: een productiebuild
//     (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt op FOUT, een andere build meldt het.
// Zonder build: melding, exit 0. Exit 0 = goed, 1 = FOUT, 2 = verkeerd gebruik.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const JAAR = 31536000;
const MAAND = 2592000;
const UUR = 3600;

/** De koppen die vercel.json voor een pad meestuurt, gerekend zoals Vercel dat doet. */
export function koppenUit(cfg) {
  const ru = require('@vercel/routing-utils');
  const t = ru.getTransformedRoutes(cfg || {});
  if (t.error) throw new Error(`Vercel keurt vercel.json af: ${t.error.message}`);
  const metKop = (t.routes || []).filter((r) => r.headers && !r.status);
  const vast = metKop.filter((r) => !r.has && !r.missing).map((r) => ({ re: new RegExp(r.src), headers: r.headers }));
  return {
    voorwaardelijk: metKop.length - vast.length,
    voor(pad) {
      const h = {};
      for (const r of vast) if (r.re.test(pad)) for (const [k, v] of Object.entries(r.headers)) h[k.toLowerCase()] = String(v);
      return h;
    },
  };
}

/** Soort bestand: pagina, astro (vingerafdruk in de naam), lettertype, beeld of overig. rel = pad binnen de build. */
export function soortVan(rel) {
  if (/\.html?$/i.test(rel)) return 'pagina';
  if (/^_astro\//.test(rel)) return 'astro';
  // Iconen in de hoofdmap bewaart de browser zelf apart; daar zegt een cacheregel weinig.
  if (/^(favicon|apple-touch-icon|icon-)[^/]*\.(ico|png|svg)$/i.test(rel)) return 'overig';
  if (/\.(woff2?|ttf|otf|eot)$/i.test(rel)) return 'lettertype';
  if (/\.(avif|webp|jpe?g|png|gif|svg|ico)$/i.test(rel)) return 'beeld';
  return 'overig';
}

/** Het adres waarop Vercel een bestand uit de build serveert. */
export function adresVan(rel) {
  if (rel === 'index.html') return '/';
  if (/\/index\.html$/.test(rel)) return `/${rel.replace(/index\.html$/, '')}`;
  return `/${rel}`;
}

const cacheVan = (waarde = '') => ({
  maxAge: Number((/(?:^|[,\s])max-age\s*=\s*(\d+)/i.exec(waarde) || [])[1] ?? NaN),
  immutable: /\bimmutable\b/i.test(waarde),
  nietBewaren: /\bno-store\b/i.test(waarde),
});

/**
 * Oordeel over één antwoord. h = koppen in kleine letters. live = echt antwoord van de server
 * (dan tellen ook Strict-Transport-Security en compressie).
 * @returns {{ regel: string, status: 'FOUT' | 'WAARSCHUWING', melding: string }[]}
 */
export function beoordeel(soort, h, { live = false } = {}) {
  const uit = [];
  const fout = (regel, melding) => uit.push({ regel, status: 'FOUT', melding });
  const let_op = (regel, melding) => uit.push({ regel, status: 'WAARSCHUWING', melding });
  if (!/\bnosniff\b/i.test(h['x-content-type-options'] || '')) fout('nosniff', 'X-Content-Type-Options: nosniff ontbreekt');
  const xxss = (h['x-xss-protection'] || '').trim();
  if (xxss && xxss !== '0') fout('x-xss-protection', `X-XSS-Protection: ${xxss} staat aan (verouderd; haal de kop weg of zet hem op 0)`);
  const cache = cacheVan(h['cache-control']);
  if (soort === 'pagina') {
    const xfo = /^(deny|sameorigin)$/i.test((h['x-frame-options'] || '').trim());
    const csp = /frame-ancestors/i.test(h['content-security-policy'] || '');
    if (!xfo && !csp) fout('inbedden', 'de pagina mag in een kader van een andere site: zet X-Frame-Options: SAMEORIGIN en frame-ancestors in Content-Security-Policy');
    if (cache.maxAge > UUR) fout('cache-pagina', `de pagina blijft ${cache.maxAge} seconden in de cache van de bezoeker (Cache-Control: ${h['cache-control']}); een pagina hoort kort of niet`);
    if (!h['referrer-policy']) let_op('referrer-policy', 'Referrer-Policy ontbreekt');
    if (!h['permissions-policy']) let_op('permissions-policy', 'Permissions-Policy ontbreekt');
    if (live) {
      if (!h['strict-transport-security']) fout('hsts', 'Strict-Transport-Security ontbreekt');
      if (!/\b(br|gzip|zstd|deflate)\b/i.test(h['content-encoding'] || '')) fout('compressie', 'de pagina komt zonder compressie (geen Content-Encoding)');
    }
  } else if (soort === 'astro') {
    if (!(cache.maxAge >= JAAR && cache.immutable)) {
      // Lokaal en niet gezet is geen fout: bouwt Vercel de site zelf als Astro-project, dan zet Vercel deze kop.
      // Tien live sites hadden hem zo zonder regel in vercel.json; twee sites die anders gedeployd worden niet
      // (17-11-2026). Wel een fout: live zonder de kop, of een regel die hem te kort zet.
      if (live || h['cache-control']) fout('cache-astro', `bestand onder /_astro/ zonder vaste cache (Cache-Control: ${h['cache-control'] || 'niet gezet'}); zet "public, max-age=31536000, immutable"`);
      else let_op('cache-astro', 'vercel.json geeft /_astro/ geen vaste cache. Bouwt Vercel de site zelf als Astro-project, dan zet Vercel die kop; bij een andere manier van deployen niet. Zet "public, max-age=31536000, immutable" op /_astro/(.*), dan hangt het nergens van af. Zeker weten: --live');
    }
  } else if (soort === 'lettertype' || soort === 'beeld') {
    if (!(cache.maxAge >= MAAND)) let_op(`cache-${soort}`, `${soort} buiten /_astro/ met een cache korter dan 30 dagen (Cache-Control: ${h['cache-control'] || 'niet gezet'}): de browser vraagt het bij elk bezoek opnieuw na`);
  }
  return uit;
}

const bestanden = (dir, basis = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? bestanden(path.join(dir, e.name), basis) : [path.relative(basis, path.join(dir, e.name)).replace(/\\/g, '/')]));

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

/** Lokaal: elk bestand in de build tegen wat vercel.json meestuurt. Bevindingen per regel en soort samengenomen. */
export function meetBuild(dist, cfg) {
  const koppen = koppenUit(cfg);
  const groepen = new Map();
  let aantal = 0;
  for (const rel of bestanden(dist)) {
    const soort = soortVan(rel);
    if (soort === 'overig' || rel === '404.html') continue;
    aantal++;
    for (const b of beoordeel(soort, koppen.voor(adresVan(rel)))) {
      const sleutel = `${b.status}|${b.regel}|${soort}`;
      const g = groepen.get(sleutel) || { ...b, soort, aantal: 0, voorbeelden: [] };
      g.aantal++;
      if (g.voorbeelden.length < 3) g.voorbeelden.push(adresVan(rel));
      groepen.set(sleutel, g);
    }
  }
  return { bestanden: aantal, voorwaardelijk: koppen.voorwaardelijk, bevindingen: [...groepen.values()] };
}

const UA = 'Mozilla/5.0 (compatible; MS618 antwoordkop-check)';
async function haal(url, methode = 'GET') {
  const r = await fetch(url, { method: methode, redirect: 'follow', headers: { 'user-agent': UA, 'accept-encoding': 'br, gzip' }, signal: AbortSignal.timeout(20000) });
  const h = {};
  r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
  return { status: r.status, url: r.url, h, cookies: typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [], tekst: methode === 'GET' ? await r.text() : '' };
}

/** Uit de HTML van de home één bestand per soort van het eigen domein. */
export function bestandenUitHtml(html, origin) {
  const eigen = (u) => { try { const x = new URL(u, origin); return x.origin === origin ? x.pathname : null; } catch { return null; } };
  const alle = [...html.matchAll(/(?:href|src)\s*=\s*["']([^"'#?\s]+)/gi)].map((m) => eigen(m[1])).filter(Boolean);
  const eerste = (test) => alle.find(test);
  return {
    astro: eerste((p) => /^\/_astro\/.+\.(css|js)$/i.test(p)),
    lettertype: eerste((p) => !p.startsWith('/_astro/') && /\.(woff2?|ttf|otf)$/i.test(p)),
    beeld: eerste((p) => !p.startsWith('/_astro/') && /\.(avif|webp|jpe?g|png|gif)$/i.test(p)),
  };
}

export async function meetLive(start) {
  const home = await haal(start);
  const origin = new URL(home.url).origin;
  const bevindingen = beoordeel('pagina', home.h, { live: true }).map((b) => ({ ...b, soort: 'pagina', aantal: 1, voorbeelden: [new URL(home.url).pathname] }));
  for (const c of home.cookies) {
    const naam = c.split('=')[0];
    const mist = [/;\s*secure/i.test(c) ? '' : 'Secure', /;\s*samesite=/i.test(c) ? '' : 'SameSite'].filter(Boolean);
    if (mist.length) bevindingen.push({ regel: 'cookie', status: 'WAARSCHUWING', soort: 'pagina', aantal: 1, voorbeelden: [naam], melding: `cookie ${naam} zonder ${mist.join(' en ')}` });
  }
  const gemeten = { pagina: new URL(home.url).pathname };
  for (const [soort, pad] of Object.entries(bestandenUitHtml(home.tekst, origin))) {
    if (!pad) continue;
    let r = await haal(origin + pad, 'HEAD');
    if (r.status === 405 || r.status === 501) r = await haal(origin + pad, 'GET');
    if (r.status !== 200) { bevindingen.push({ regel: 'ophalen', status: 'WAARSCHUWING', soort, aantal: 1, voorbeelden: [pad], melding: `${pad} gaf ${r.status}; niet gemeten` }); continue; }
    gemeten[soort] = pad;
    for (const b of beoordeel(soort, r.h, { live: true })) bevindingen.push({ ...b, soort, aantal: 1, voorbeelden: [pad] });
  }
  return { origin, gemeten, bevindingen };
}

export function eindcode(fouten, { postbuild = false, env = {} } = {}) {
  if (!fouten) return 0;
  const productie = env.VERCEL_ENV === 'production' || env.PUBLIC_SITE_ENV === 'production';
  if (postbuild && !productie) {
    console.log('\nGeen productiebuild: de build gaat door. Een productiebuild (VERCEL_ENV of PUBLIC_SITE_ENV = production) stopt hier.');
    return 0;
  }
  if (postbuild) console.log('\nProductiebuild gestopt: een verplichte antwoordkop ontbreekt of de cache klopt niet (zie FOUT hierboven).\nZet de koppen in vercel.json; het voorbeeld staat in de starter (_template/astro-website/vercel.json).');
  return 1;
}

function drukAf(bevindingen) {
  for (const b of bevindingen.sort((a, z) => (a.status === z.status ? 0 : a.status === 'FOUT' ? -1 : 1))) {
    const waar = b.aantal > 1 ? `${b.aantal} keer (${b.soort}), bijvoorbeeld ${b.voorbeelden.join(', ')}` : b.voorbeelden[0];
    console.log(`  ${b.status}  ${waar}: ${b.melding}`);
  }
  const fout = bevindingen.filter((b) => b.status === 'FOUT').length;
  return { fout, waarschuwing: bevindingen.length - fout };
}

async function main() {
  const args = process.argv.slice(2);
  const optie = (naam) => { const i = args.indexOf(`--${naam}`); return i >= 0 ? args[i + 1] : undefined; };
  const json = optie('json');
  if (optie('live')) {
    let fouten = 0;
    const alles = [];
    for (const url of optie('live').split(',').map((s) => s.trim()).filter(Boolean)) {
      console.log(`Antwoordkoppen: ${url}`);
      let m;
      try { m = await meetLive(url); } catch (e) { console.log(`  FOUT  niet bereikbaar: ${e.cause?.code || e.message}`); fouten++; alles.push({ url, fout: String(e.message) }); continue; }
      console.log(`Gemeten: ${Object.entries(m.gemeten).map(([s, p]) => `${s} ${p}`).join(', ')}`);
      const t = drukAf(m.bevindingen);
      console.log(`Samen: ${t.fout} fout, ${t.waarschuwing} ${t.waarschuwing === 1 ? 'waarschuwing' : 'waarschuwingen'}.\n`);
      fouten += t.fout;
      alles.push({ url, ...m });
    }
    if (json) fs.writeFileSync(json, JSON.stringify(alles, null, 1));
    process.exit(fouten ? 1 : 0);
  }
  const app = args.find((a, i) => !a.startsWith('--') && !['--dist', '--json', '--live'].includes(args[i - 1]));
  if (!app) {
    console.error('Gebruik: node antwoordkop-check.mjs <app-map> [--dist <map>] [--json <pad>] [--postbuild]\n         node antwoordkop-check.mjs --live https://www.domein.nl [--json <pad>]');
    process.exit(2);
  }
  const appDir = path.resolve(app);
  const dist = vindBuild(appDir, optie('dist'));
  if (!fs.existsSync(dist)) {
    console.log(`Antwoordkoppen: geen build in ${dist} (niet gemeten; bouw eerst).`);
    process.exit(0);
  }
  const cfgPad = path.join(appDir, 'vercel.json');
  let cfg = {};
  if (fs.existsSync(cfgPad)) {
    try { cfg = JSON.parse(fs.readFileSync(cfgPad, 'utf8').replace(/^﻿/, '')); } catch (e) { console.error(`vercel.json is geen geldige JSON: ${e.message}`); process.exit(2); }
  }
  let m;
  try { m = meetBuild(dist, cfg); } catch (e) { console.error(e.message); process.exit(2); }
  console.log(`Antwoordkoppen: ${dist}`);
  console.log(`Omgeving: VERCEL_ENV=${process.env.VERCEL_ENV || '-'} PUBLIC_SITE_ENV=${process.env.PUBLIC_SITE_ENV || '-'}`);
  if (!fs.existsSync(cfgPad)) console.log('Let op: geen vercel.json in de app; er worden dus geen koppen gezet.');
  if (m.voorwaardelijk) console.log(`Let op: ${m.voorwaardelijk} regel(s) met een voorwaarde (has of missing) zijn niet meegerekend.`);
  const t = drukAf(m.bevindingen);
  console.log(`\nSamen: ${m.bestanden} bestanden, ${t.fout} fout, ${t.waarschuwing} ${t.waarschuwing === 1 ? 'waarschuwing' : 'waarschuwingen'}.`);
  if (json) fs.writeFileSync(json, JSON.stringify({ dist, ...m }, null, 1));
  process.exit(eindcode(t.fout, { postbuild: args.includes('--postbuild'), env: process.env }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
