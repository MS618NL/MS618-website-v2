import site from '@/data/site.json';

export function canonicalUrl(path: string): string {
  const base = site.url.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

export function ogImageUrl(image?: string): string {
  const base = site.url.replace(/\/$/, '');
  const img = image ?? site.defaultOgImage;
  return img.startsWith('http') ? img : `${base}${img}`;
}

export function formatDate(date: Date | string, locale = 'nl-NL'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateISO(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
