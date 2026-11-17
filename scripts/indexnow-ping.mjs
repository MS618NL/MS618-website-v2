/**
 * IndexNow ping — runs as a postbuild step.
 * Submits the built sitemap URLs to IndexNow (Bing, Yandex, et al.) so new/changed
 * pages get picked up fast. Non-fatal: any failure logs a warning and exits 0 so it
 * never breaks a deploy. Key file lives at public/<KEY>.txt (served at /<KEY>.txt).
 */
import { readFileSync, existsSync } from 'node:fs';

// Nieuwe sleutel 13-11-2026: Bing gaf op de oude (dac209c8...) altijd 403 UserForbiddedToAccessSite,
// ook al stond het sleutelbestand goed live. Het oude bestand blijft staan, het kan geen kwaad.
const KEY = '3c56e421d0e07a7923f7dfa3f124638a';
const HOST = 'www.ms618.nl';
const SITEMAP = './dist/sitemap-0.xml';

async function main() {
  // Alleen productie pingt: een preview of lokale build mag de live adressen niet aanmelden.
  if (process.env.VERCEL_ENV !== 'production') {
    console.log(`[indexnow] overgeslagen (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'niet gezet'})`);
    return;
  }
  if (!existsSync(SITEMAP)) {
    console.warn(`[indexnow] ${SITEMAP} not found, skipping ping`);
    return;
  }
  const xml = readFileSync(SITEMAP, 'utf8');
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urlList.length === 0) {
    console.warn('[indexnow] no URLs in sitemap, skipping ping');
    return;
  }

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList,
  };

  // Bing's own endpoint: api.indexnow.org 403s intermittently, bing.com/indexnow is
  // the engine we actually need (ChatGPT searches via Bing) and shares to the rest.
  const res = await fetch('https://www.bing.com/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const detail = res.ok ? '' : ` ${(await res.text()).slice(0, 200)}`;
  console.log(`[indexnow] submitted ${urlList.length} URLs -> HTTP ${res.status}${detail}`);
}

main().catch((err) => {
  console.warn('[indexnow] ping failed (non-fatal):', err?.message ?? err);
});
