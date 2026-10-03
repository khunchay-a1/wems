import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, type Locale } from './config';

/** Locale = user preference cookie (set from profile), Thai by default (docs/07-web-ui.md §1). */
export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = (LOCALES as readonly string[]).includes(fromCookie ?? '')
    ? (fromCookie as Locale)
    : DEFAULT_LOCALE;
  const [app, enums, errors] = await Promise.all([
    import(`../../messages/${locale}.json`).then(
      (m: { default: Record<string, unknown> }) => m.default,
    ),
    import(`../../messages/enums.${locale}.json`).then(
      (m: { default: Record<string, unknown> }) => m.default,
    ),
    import(`../../messages/errors.${locale}.json`).then(
      (m: { default: Record<string, unknown> }) => m.default,
    ),
  ]);
  return { locale, messages: { ...app, enums, errors }, timeZone: 'Asia/Bangkok' };
});
