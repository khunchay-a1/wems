/** Date display in Asia/Bangkok with Buddhist (พ.ศ.) or Gregorian years (CLAUDE.md rule 7, docs/07-web-ui.md §3). */
export type CalendarPref = 'BUDDHIST' | 'GREGORIAN';

const TZ = 'Asia/Bangkok';

function localeTag(locale: string, calendar: CalendarPref): string {
  const base = locale === 'en' ? 'en-GB' : 'th-TH';
  return `${base}-u-ca-${calendar === 'BUDDHIST' ? 'buddhist' : 'gregory'}`;
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // date-only values are calendar dates, not instants — anchor at noon UTC to avoid TZ shifts
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

export function formatDate(
  value: string | Date | null | undefined,
  opts: { locale?: string; calendar?: CalendarPref; style?: 'short' | 'medium' | 'long' } = {},
): string {
  if (!value) return '–';
  const style = opts.style ?? 'medium';
  return new Intl.DateTimeFormat(localeTag(opts.locale ?? 'th', opts.calendar ?? 'BUDDHIST'), {
    timeZone: TZ,
    day: 'numeric',
    month: style === 'short' ? '2-digit' : style === 'medium' ? 'short' : 'long',
    year: style === 'short' ? '2-digit' : 'numeric',
  }).format(toDate(value));
}

export function formatDateTime(
  value: string | Date | null | undefined,
  opts: { locale?: string; calendar?: CalendarPref } = {},
): string {
  if (!value) return '–';
  return new Intl.DateTimeFormat(localeTag(opts.locale ?? 'th', opts.calendar ?? 'BUDDHIST'), {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate(value));
}

/** Today in Bangkok as YYYY-MM-DD. */
export function todayBangkok(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
