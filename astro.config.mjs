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
const buildLastmod = new Date().toISOString();

export default defineConfig({
  site: 'https://www.ms618.nl',
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'nl',
    locales: ['nl', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/voorwaarden') &&
        !page.includes('/privacy') &&
        !page.includes('/bedankt') &&
        !page.includes('/thank-you'),
      serialize(item) {
        const url = item.url;
        const lastmod = lastmodMap[url] ?? buildLastmod;
        if (url === 'https://www.ms618.nl/' || url === 'https://www.ms618.nl') {
          return { ...item, priority: 1.0, changefreq: 'weekly', lastmod };
        }
        if (url.includes('/contact')) {
          return { ...item, priority: 0.9, changefreq: 'monthly', lastmod };
        }
        if (url.includes('/services') || url.includes('/diensten')) {
          return { ...item, priority: 0.8, changefreq: 'monthly', lastmod };
        }
        if (url.includes('/about')) {
          return { ...item, priority: 0.8, changefreq: 'monthly', lastmod };
        }
        if (url.includes('/cases')) {
          return { ...item, priority: 0.7, changefreq: 'monthly', lastmod };
        }
        if (url.includes('/blog')) {
          return { ...item, priority: 0.6, changefreq: 'weekly', lastmod };
        }
        return { ...item, priority: 0.5, changefreq: 'monthly', lastmod };
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      cssMinify: true,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  },
});
