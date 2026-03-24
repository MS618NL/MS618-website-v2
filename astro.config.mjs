import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://ms618.nl',
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
        !page.includes('/privacy'),
      serialize(item) {
        const url = item.url;
        const lastmod = new Date().toISOString();
        if (url === 'https://ms618.nl/' || url === 'https://ms618.nl') {
          return { ...item, priority: 1.0, changefreq: 'weekly', lastmod };
        }
        if (url.includes('/contact')) {
          return { ...item, priority: 0.9, changefreq: 'monthly', lastmod };
        }
        if (url.includes('/services')) {
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
  },
});
