#!/usr/bin/env node
/**
 * Guardrail: no Dutch slugs on English (/en/) URLs.
 *
 * Why this exists: EN pages are created by copying NL files, and Astro derives
 * the slug from the filename. A Dutch filename therefore ships a Dutch /en/ URL
 * that renders fine and stays invisible until someone inspects the address bar.
 * This check makes that failure impossible to merge: it fails the build.
 *
 * It runs in postbuild (scanning the emitted dist/en tree, the ground truth) and
 * can also run standalone against source (content/*-en + pages/en) with no build.
 *
 * If a flagged slug is a genuine false positive, add it to ALLOW below.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Dutch words that, as a whole hyphen-delimited slug part, signal a Dutch slug.
const DENY_EXACT = new Set([
  'en', 'de', 'het', 'een', 'zoek', 'laten', 'maken', 'wat', 'hoe', 'waarom',
  'onze', 'jouw', 'uw', 'over', 'ons',
]);
// Dutch stems that, appearing anywhere in a slug segment, signal a Dutch slug.
const DENY_SUBSTR = [
  'strategie', 'optimalisatie', 'optimaliseren', 'vindbaar', 'zoekintentie',
  'begrijp', 'bedankt', 'voorwaarden', 'diensten', 'aanpak', 'ontwerp',
  'beheer', 'onderhoud', 'maatwerk', 'offerte', 'prijzen', 'nieuws',
];
// Escape hatch for real English slugs that happen to trip a rule.
const ALLOW = new Set([]);

function dutchHit(segment) {
  if (ALLOW.has(segment)) return null;
  for (const part of segment.split('-')) if (DENY_EXACT.has(part)) return `"${part}" (Dutch word)`;
  for (const sub of DENY_SUBSTR) if (segment.includes(sub)) return `"${sub}" (Dutch stem)`;
  return null;
}

function walkDirs(dir, onDir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { onDir(name); walkDirs(p, onDir); }
  }
}

/** Ground truth: directory segments under dist/en (each is a live URL segment). */
function segmentsFromDist(distEn) {
  const segs = new Set();
  walkDirs(distEn, (name) => segs.add(name));
  return segs;
}

/** Fallback: slugs Astro will emit, read from source before a build exists. */
function segmentsFromSource(src) {
  const segs = new Set();
  for (const coll of ['services-en', 'blog-en', 'cases-en']) {
    const dir = join(src, 'content', coll);
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.md')) segs.add(f.replace(/\.md$/, ''));
  }
  const pagesEn = join(src, 'pages', 'en');
  if (existsSync(pagesEn)) {
    (function walk(dir) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { segs.add(name); walk(p); }
        else if (name.endsWith('.astro') && !name.startsWith('[') && name !== 'index.astro') {
          segs.add(name.replace(/\.astro$/, ''));
        }
      }
    })(pagesEn);
  }
  return segs;
}

const distEn = join(ROOT, 'dist', 'en');
const usingDist = existsSync(distEn);
const segments = usingDist ? segmentsFromDist(distEn) : segmentsFromSource(join(ROOT, 'src'));

const offenders = [];
for (const seg of segments) {
  const hit = dutchHit(seg);
  if (hit) offenders.push({ seg, hit });
}

const source = usingDist ? 'dist/en' : 'src (services-en, blog-en, cases-en, pages/en)';
if (offenders.length) {
  console.error(`\n✗ Dutch slug on an English URL (scanned ${source}):\n`);
  for (const o of offenders) console.error(`    /en/.../${o.seg}/   ->  contains ${o.hit}`);
  console.error(`\n  English pages must have English slugs. Rename the file/route, add a 301`);
  console.error(`  in vercel.json, and map the slug in src/i18n/index.ts. Then rebuild.\n`);
  process.exit(1);
}
console.log(`✓ EN slugs clean (${segments.size} segments scanned from ${source}).`);
