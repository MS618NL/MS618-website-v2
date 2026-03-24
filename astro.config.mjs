import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://ms618.nl',
  output: 'static',
  i18n: {
    defaultLocale: 'nl',
    locales: ['nl', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      serialize(item) {
        const url = item.url;
        if (url === 'https://ms618.nl/' || url === 'https://ms618.nl') {
          return { ...item, priority: 1.0, changefreq: 'weekly' };
        }
        if (url.includes('/services')) {
          return { ...item, priority: 0.8, changefreq: 'monthly' };
        }
        if (url.includes('/cases')) {
          return { ...item, priority: 0.7, changefreq: 'monthly' };
        }
        if (url.includes('/blog')) {
          return { ...item, priority: 0.6, changefreq: 'weekly' };
        }
        return { ...item, priority: 0.5, changefreq: 'monthly' };
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
