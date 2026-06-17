/**
 * IndexNow ping — runs as a postbuild step.
 * Submits the built sitemap URLs to IndexNow (Bing, Yandex, et al.) so new/changed
 * pages get picked up fast. Non-fatal: any failure logs a warning and exits 0 so it
 * never breaks a deploy. Key file lives at public/<KEY>.txt (served at /<KEY>.txt).
 */
import { readFileSync, existsSync } from 'node:fs';

const KEY = 'dac209c86f4e4e6cbc8080e06bbb9d6c';
const HOST = 'www.ms618.nl';
const SITEMAP = './dist/sitemap-0.xml';

async function main() {
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

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  console.log(`[indexnow] submitted ${urlList.length} URLs -> HTTP ${res.status}`);
}

main().catch((err) => {
  console.warn('[indexnow] ping failed (non-fatal):', err?.message ?? err);
});
