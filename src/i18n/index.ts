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

/** Given the current path, return the equivalent path in the other language */
export function getAlternatePath(url: URL, targetLang: Lang): string {
  const path = url.pathname;

  if (targetLang === 'en') {
    // NL → EN: add /en prefix (skip if already on EN page)
    if (path.startsWith('/en')) return path;
    if (path === '/') return '/en/';
    return `/en${path}`;
  } else {
    // EN → NL: strip /en prefix
    if (path === '/en' || path === '/en/') return '/';
    return path.replace(/^\/en/, '');
  }
}
