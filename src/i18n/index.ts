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

/** Paths that differ between NL and EN (NL path → EN path) */
const pathMap: Record<string, string> = {
  '/voorwaarden/': '/en/terms/',
  '/contact/bedankt/': '/en/contact/thank-you/',
};
const reversePathMap: Record<string, string> = Object.fromEntries(
  Object.entries(pathMap).map(([nl, en]) => [en, nl]),
);

/**
 * Slug segments that differ between NL and EN within a shared section.
 * NL `/diensten/...` maps to EN `/en/services/...` (not `/en/diensten/...`).
 */
function translateSection(path: string, targetLang: Lang): string {
  if (targetLang === 'en') {
    if (path === '/diensten/' || path === '/diensten') return '/en/services/';
    if (path.startsWith('/diensten/')) return `/en/services/${path.slice('/diensten/'.length)}`;
  } else {
    if (path === '/en/services/' || path === '/en/services') return '/diensten/';
    if (path.startsWith('/en/services/')) return `/diensten/${path.slice('/en/services/'.length)}`;
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
