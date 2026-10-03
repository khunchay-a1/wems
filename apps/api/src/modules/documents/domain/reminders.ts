import {
  addWorkingDays,
  isWorkingDay,
  workingDaysBetween,
} from '../../../common/time/business-calendar';

export type Reminder =
  | { kind: 'none' }
  | { kind: 'due_soon' }
  | { kind: 'overdue'; workingDaysLate: number; notifyPm: boolean };

/**
 * BR-DOC-038: on working days at 08:30 — "due soon" one working day before the due date, then
 * "overdue" every working day after it; from 2 working days late the PM is told as well.
 * At most one reminder per step per day.
 */
export function reminderFor(input: {
  today: string;
  dueDate: string;
  now: Date;
  dueAt: Date;
  lastRemindedDate: string | null;
  holidays: readonly string[];
}): Reminder {
  const { today, dueDate, holidays } = input;
  if (!isWorkingDay(today, holidays) || input.lastRemindedDate === today) return { kind: 'none' };
  if (input.dueAt.getTime() < input.now.getTime()) {
    const late = workingDaysBetween(dueDate, today, holidays);
    if (late < 1) return { kind: 'none' };
    return { kind: 'overdue', workingDaysLate: late, notifyPm: late >= 2 };
  }
  if (addWorkingDays(today, 1, holidays) === dueDate) return { kind: 'due_soon' };
  return { kind: 'none' };
}
