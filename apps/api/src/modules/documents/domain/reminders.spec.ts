import { bangkokInstant } from '../../../common/time/business-calendar';
import { reminderFor } from './reminders';

// Thu 2026-10-01 due at 17:00; 2026-10-05 is a Monday
const base = {
  dueDate: '2026-10-01',
  dueAt: bangkokInstant('2026-10-01', '17:00'),
  lastRemindedDate: null,
  holidays: [] as string[],
};
const at = (today: string) => ({ ...base, today, now: bangkokInstant(today, '08:30') });

describe('BR-DOC-038 review reminders', () => {
  it('due soon one working day before', () => {
    expect(reminderFor(at('2026-09-30'))).toEqual({ kind: 'due_soon' });
    expect(reminderFor(at('2026-09-29'))).toEqual({ kind: 'none' });
  });

  it('nothing on the due day itself before 17:00', () => {
    expect(reminderFor(at('2026-10-01'))).toEqual({ kind: 'none' });
  });

  it('AT-DOC-13 overdue every working day, PM from the 2nd working day late', () => {
    expect(reminderFor(at('2026-10-02'))).toEqual({
      kind: 'overdue',
      workingDaysLate: 1,
      notifyPm: false,
    });
    // weekend: no reminders
    expect(reminderFor(at('2026-10-03'))).toEqual({ kind: 'none' });
    expect(reminderFor(at('2026-10-05'))).toEqual({
      kind: 'overdue',
      workingDaysLate: 2,
      notifyPm: true,
    });
  });

  it('holidays are skipped and a step is reminded once per day', () => {
    expect(reminderFor({ ...at('2026-10-02'), holidays: ['2026-10-02'] })).toEqual({
      kind: 'none',
    });
    expect(reminderFor({ ...at('2026-10-02'), lastRemindedDate: '2026-10-02' })).toEqual({
      kind: 'none',
    });
  });
});
