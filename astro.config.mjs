import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const SITE = 'https://www.ms618.nl';

// Build a per-URL lastmod map from content-collection frontmatter so the sitemap
// reflects real updatedDate/publishDate instead of a single build timestamp.
function buildLastmodMap() {
  const sections = [
    ['blog', '/blog/'],
    ['blog-en', '/en/blog/'],
    ['services', '/diensten/'],
    ['services-en', '/en/services/'],
    ['cases', '/cases/'],
    ['cases-en', '/en/cases/'],
    // Regiopagina's (/seo-friesland/ e.d.) staan in de root. Zonder deze regel kregen ze bij
    // elke build de buildtijd als lastmod, ook als de inhoud niet was gewijzigd.
    ['local', '/'],
  ];
  const map = {};
  for (const [dir, prefix] of sections) {
    const full = `./src/content/${dir}`;
    if (!existsSync(full)) continue;
    for (const file of readdirSync(full)) {
      if (!/\.(md|mdx)$/.test(file)) continue;
      const slug = file.replace(/\.(md|mdx)$/, '');
      try {
        const fm = (readFileSync(`${full}/${file}`, 'utf8').split('---')[1]) || '';
        const raw = (fm.match(/updatedDate:\s*(.+)/) || fm.match(/publishDate:\s*(.+)/) || [])[1];
        if (!raw) continue;
        const d = new Date(raw.trim().replace(/['"]/g, ''));
        if (!isNaN(d.getTime())) map[`${SITE}${prefix}${slug}/`] = d.toISOString();
      } catch {
        // skip unreadable/invalid frontmatter
      }
    }
  }
  return map;
}

const lastmodMap = buildLastmodMap();
// Geen datum bekend uit de inhoud? Dan geen <lastmod>. De buildtijd als terugval verspringt bij elke
// deploy, en dan leert Google de datum te negeren (scripts/sitemap-check.mjs, regel lastmod-builddatum).

export default defineConfig({
  site: 'https://www.ms618.nl',
  output: 'static',
  trailingSlash: 'always',
  // Astro 7 changed the default to 'jsx' (JSX whitespace rules: a line break between two inline
  // elements no longer becomes a space). true keeps the whitespace handling of Astro 5 and 6.
  compressHTML: true,
  // All page CSS is ~12 KB compressed; inlining it removes every render-blocking
  // request from the critical path (PSI: 460 ms). The CSP feature hashes these
  // inline styles automatically.
  build: {
    inlineStylesheets: 'always',
  },
  i18n: {
    defaultLocale: 'nl',
    locales: ['nl', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  // Content-Security-Policy via per-page <meta>. Astro auto-hashes its own inline
  // scripts/styles (incl. the GTM bootstrap, which is no longer is:inline). 'strict-dynamic'
  // lets the trusted GTM bootstrap load gtm.js and any tags it injects, so script-src needs
  // no 'unsafe-inline'. NOTE: the static CSP header in vercel.json is removed to avoid
  // double enforcement. Verify GTM/GA4 still fire in Vercel Preview (GTM Preview mode).
  // Stable since Astro 6 as security.csp (was experimental.csp; same options).
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://*.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
        "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://formspree.io",
        "frame-src https://*.googletagmanager.com https://www.youtube-nocookie.com",
        "font-src 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://*.googletagmanager.com', 'https://*.google-analytics.com'],
        strictDynamic: true,
      },
      // No 'unsafe-inline' here any more. Up to Astro 6 the style hashes were emitted next to it, and
      // browsers ignore 'unsafe-inline' when a hash is present. Astro 7 drops the hashes when
      // 'unsafe-inline' is listed, which would allow every inline style. Without it the policy stays
      // what browsers enforced before: 'self' plus the hashes of Astro's own styles.
      styleDirective: {
        resources: ["'self'"],
      },
    },
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/voorwaarden') &&
        !page.includes('/en/terms') &&
        !page.includes('/privacy') &&
        // Colofon staat op noindex (10-11-2026): Google toonde hem als sitelink onder "ms618".
        !page.includes('/colofon') &&
        !page.includes('/bedankt') &&
        !page.includes('/thank-you'),
      // Alleen het adres, met de datum van de inhoud als die bekend is. <changefreq> en <priority> leest
      // Google niet: weggelaten.
      serialize(item) {
        const lastmod = lastmodMap[item.url];
        return lastmod ? { url: item.url, links: item.links, lastmod } : { url: item.url, links: item.links };
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      cssMinify: true,
      // No minify: 'esbuild' any more: it was the default up to Vite 7; Vite 8 minifies with Oxc
      // and only uses esbuild when it is installed separately.
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  },
});
