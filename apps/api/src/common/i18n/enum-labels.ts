import labels from './enum-labels.json';
import type { Locale } from './locale';

type Labels = Record<string, Record<string, { th: string; en: string }>>;

/**
 * Display label of an enum value for server-rendered text (emails, PDFs, exports).
 * Generated from docs/data/enum-labels.json by tools/gen-i18n-enums.mjs.
 */
export function enumLabel(
  enumName: string,
  value: string | null | undefined,
  locale: Locale,
): string {
  if (!value) return '';
  return (labels as Labels)[enumName]?.[value]?.[locale] ?? value;
}
