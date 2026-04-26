import { translations, type Lang } from './translations';

export { type Lang };

export const defaultLang: Lang = 'pt';

export const supportedLangs: Lang[] = ['pt'];

/** Translate a dot-notation key for the given locale. */
export function t(lang: Lang, section: keyof typeof translations['en'], key: string): string {
  const sec = (translations[lang] as any)?.[section];
  const fallback = (translations[defaultLang] as any)?.[section];
  return sec?.[key] ?? fallback?.[key] ?? key;
}

/** Get locale from Astro URL path. */
export function getLangFromUrl(url: URL): Lang {
  const [, first] = url.pathname.split('/');
  if (supportedLangs.includes(first as Lang)) return first as Lang;
  return defaultLang;
}

/** Return the path for a given locale. */
export function getPathForLang(path: string, lang: Lang): string {
  // Strip existing locale prefix
  const clean = path.replace(/^\/(pt)(\/|$)/, '/');
  if (lang === defaultLang) return clean || '/';
  return `/${lang}${clean === '/' ? '' : clean}`;
}

/** Return the hreflang map for a given canonical path. */
export function hreflangMap(canonicalPath: string): Record<string, string> {
  return {
    'pt': `https://tyer.com.br${getPathForLang(canonicalPath, 'pt')}`,
    'pt-BR': `https://tyer.com.br${getPathForLang(canonicalPath, 'pt')}`,
  };
}
