import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from './config';

/** Locale sans préfixe d'URL (SPEC D-18) : cookie, sinon français. */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  const messages = (await import(`./messages/${locale}.json`)) as { default: Record<string, unknown> }; // as: import JSON dynamique, typé par AppConfig
  return { locale, messages: messages.default, timeZone: 'Europe/Paris' };
});
