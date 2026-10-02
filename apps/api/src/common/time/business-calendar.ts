/**
 * Business calendar for Asia/Bangkok (UTC+7, no DST) — BR-PLT-040, BR-DOC-036.
 * Pure functions: callers pass `now` from ClockService and holidays from setting `calendar.holidays`.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of an instant in Asia/Bangkok. */
export function bangkokDate(instant: Date): string {
  return new Date(instant.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Day of week (0 = Sunday) of a "YYYY-MM-DD" date. */
function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function isWorkingDay(date: string, holidays: readonly string[]): boolean {
  const dow = dayOfWeek(date);
  return dow !== 0 && dow !== 6 && !holidays.includes(date);
}

/** BR-PLT-040: the n-th working day after `date` (Mon–Fri minus holidays). */
export function addWorkingDays(date: string, n: number, holidays: readonly string[]): string {
  let current = date;
  let remaining = n;
  while (remaining > 0) {
    current = addDays(current, 1);
    if (isWorkingDay(current, holidays)) remaining -= 1;
  }
  return current;
}

/** Number of working days strictly after `from` up to and including `to` (0 when to ≤ from). */
export function workingDaysBetween(from: string, to: string, holidays: readonly string[]): number {
  let count = 0;
  let current = from;
  while (current < to) {
    current = addDays(current, 1);
    if (isWorkingDay(current, holidays)) count += 1;
  }
  return count;
}

/** Instant of a Bangkok wall-clock time ("HH:MM") on a "YYYY-MM-DD" date. */
export function bangkokInstant(date: string, hhmm: string): Date {
  return new Date(new Date(`${date}T${hhmm}:00.000Z`).getTime() - BANGKOK_OFFSET_MS);
}

/**
 * BR-DOC-036: dueAt = activatedAt + dueDays working days at `workdayEnd` (17:00) Asia/Bangkok.
 */
export function computeDueAt(
  activatedAt: Date,
  dueDays: number,
  holidays: readonly string[],
  workdayEnd = '17:00',
): Date {
  return bangkokInstant(addWorkingDays(bangkokDate(activatedAt), dueDays, holidays), workdayEnd);
}

/** Thai Buddhist-era year for a Gregorian year. */
export function buddhistYear(gregorianYear: number): number {
  return gregorianYear + 543;
}
