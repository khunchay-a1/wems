import {
  addWorkingDays,
  bangkokDate,
  bangkokInstant,
  buddhistYear,
  computeDueAt,
  workingDaysBetween,
} from './business-calendar';

describe('business calendar (BR-PLT-040)', () => {
  it('converts instants to Bangkok dates across midnight', () => {
    expect(bangkokDate(new Date('2026-09-30T16:59:59Z'))).toBe('2026-09-30');
    expect(bangkokDate(new Date('2026-09-30T17:00:00Z'))).toBe('2026-10-01');
  });

  it('BR-PLT-040 skips weekends', () => {
    // 2026-10-02 is a Friday
    expect(addWorkingDays('2026-10-02', 1, [])).toBe('2026-10-05');
    expect(addWorkingDays('2026-09-28', 3, [])).toBe('2026-10-01');
  });

  it('AT-PLT-07 Friday holiday: step opened Thursday with dueDays=1 is due Monday 17:00', () => {
    const thursday = bangkokInstant('2026-10-01', '10:00');
    const due = computeDueAt(thursday, 1, ['2026-10-02'], '17:00');
    expect(due.toISOString()).toBe('2026-10-05T10:00:00.000Z');
    expect(bangkokDate(due)).toBe('2026-10-05');
  });

  it('counts working days between dates for overdue reminders', () => {
    expect(workingDaysBetween('2026-10-02', '2026-10-06', [])).toBe(2);
    expect(workingDaysBetween('2026-10-06', '2026-10-02', [])).toBe(0);
  });

  it('Buddhist year', () => {
    expect(buddhistYear(2026)).toBe(2569);
  });
});
