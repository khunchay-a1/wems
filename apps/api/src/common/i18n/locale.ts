import en from './errors.en.json';
import th from './errors.th.json';
import type { ErrorCode } from '../errors/error-codes';

export type Locale = 'th' | 'en';

const catalogs: Record<Locale, Record<string, { title: string; detail: string }>> = { th, en };

/** Picks th/en from an Accept-Language header (default th — docs/04-api-conventions.md §1). */
export function resolveLocale(acceptLanguage: string | undefined | null): Locale {
  if (!acceptLanguage) return 'th';
  const first = acceptLanguage.split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('en') ? 'en' : 'th';
}

export function errorMessage(code: ErrorCode, locale: Locale): { title: string; detail: string } {
  return catalogs[locale][code] ?? catalogs.th[code] ?? { title: code, detail: code };
}

export function catalogKeys(locale: Locale): string[] {
  return Object.keys(catalogs[locale]);
}
