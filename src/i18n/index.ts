import { translations, type Lang } from './translations';

export type { Lang };
export { languages } from './translations';

export function getLangFromUrl(url: URL): Lang {
  const [, first] = url.pathname.split('/');
  if (first === 'en') return 'en';
  return 'nl';
}

export function useTranslations(lang: Lang) {
  return function t(key: keyof (typeof translations)[Lang]): string {
    return (translations[lang] as Record<string, string>)[key] ?? (translations['nl'] as Record<string, string>)[key] ?? key;
  };
}

/**
 * Slug leaves that differ between NL and EN within a shared section.
 * The section word is swapped by translateSection (diensten <-> services)
 * or via pathMap (blog); these maps translate the *leaf* so an EN page never
 * keeps a Dutch slug. Keyed NL -> EN; the reverse is derived.
 */
export const serviceSlugNlToEn: Record<string, string> = {
  'seo-strategie': 'seo-strategy',
  'ai-strategie': 'ai-strategy',
  'geo-optimalisatie': 'geo-optimization',
  'website-laten-maken': 'website-development',
  'website-optimalisatie': 'website-optimization',
};
export const blogSlugNlToEn: Record<string, string> = {
  'zoekintentie-begrijpen': 'understanding-search-intent',
  'ai-en-seo-2026': 'ai-and-seo-2026',
  'content-strategie-b2b': 'b2b-content-strategy',
};
const serviceSlugEnToNl = Object.fromEntries(
  Object.entries(serviceSlugNlToEn).map(([nl, en]) => [en, nl]),
);

/** Paths that differ between NL and EN (NL path → EN path) */
const pathMap: Record<string, string> = {
  '/voorwaarden/': '/en/terms/',
  '/contact/bedankt/': '/en/contact/thank-you/',
  '/over-ons/': '/en/about/',
  // Blog posts whose EN translation has a different (English) slug.
  ...Object.fromEntries(
    Object.entries(blogSlugNlToEn).map(([nl, en]) => [`/blog/${nl}/`, `/en/blog/${en}/`]),
  ),
};
const reversePathMap: Record<string, string> = Object.fromEntries(
  Object.entries(pathMap).map(([nl, en]) => [en, nl]),
);

/** Translate a single-segment leaf via a slug map, preserving a trailing slash. */
function mapLeaf(rest: string, map: Record<string, string>): string {
  if (!rest) return rest;
  const hasTrailingSlash = rest.endsWith('/');
  const slug = hasTrailingSlash ? rest.slice(0, -1) : rest;
  return (map[slug] ?? slug) + (hasTrailingSlash ? '/' : '');
}

/**
 * Slug segments that differ between NL and EN within a shared section.
 * NL `/diensten/...` maps to EN `/en/services/...` (not `/en/diensten/...`),
 * and the leaf slug itself is translated so EN URLs stay English.
 */
function translateSection(path: string, targetLang: Lang): string {
  if (targetLang === 'en') {
    if (path === '/diensten/' || path === '/diensten') return '/en/services/';
    if (path.startsWith('/diensten/'))
      return `/en/services/${mapLeaf(path.slice('/diensten/'.length), serviceSlugNlToEn)}`;
  } else {
    if (path === '/en/services/' || path === '/en/services') return '/diensten/';
    if (path.startsWith('/en/services/'))
      return `/diensten/${mapLeaf(path.slice('/en/services/'.length), serviceSlugEnToNl)}`;
  }
  return '';
}

/** Given the current path, return the equivalent path in the other language */
export function getAlternatePath(url: URL, targetLang: Lang): string {
  const path = url.pathname;

  // Section slug differences (e.g. diensten <-> services) take precedence
  const sectionMapped = translateSection(path, targetLang);
  if (sectionMapped) return sectionMapped;

  if (targetLang === 'en') {
    // Check for known path mappings first
    if (pathMap[path]) return pathMap[path];
    // NL → EN: add /en prefix (skip if already on EN page)
    if (path.startsWith('/en')) return path;
    if (path === '/') return '/en/';
    return `/en${path}`;
  } else {
    // Check for known path mappings first
    if (reversePathMap[path]) return reversePathMap[path];
    // EN → NL: strip /en prefix
    if (path === '/en' || path === '/en/') return '/';
    return path.replace(/^\/en/, '');
  }
}
