export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_COOKIE = 'greenu-locale';

export function isLocale(v: string | undefined): v is Locale {
  return v !== undefined && (LOCALES as readonly string[]).includes(v);
}
