import { Big } from 'big.js';

import {
  lastWeekdayOfMonth,
  roundToCents,
  toBrtCalendarDate
} from './tax-br.helper';

describe('toBrtCalendarDate', () => {
  it('buckets a sale at 23:59 BRT on the 31st into that month even though its UTC instant is the next day', () => {
    // 2026-07-31T23:59:00-03:00 === 2026-08-01T02:59:00Z
    const date = new Date('2026-08-01T02:59:00.000Z');

    expect(toBrtCalendarDate(date)).toBe('2026-07-31');
  });

  it('does not bucket a sale at 00:30 BRT on the 1st into the previous month', () => {
    // 2026-07-01T00:30:00-03:00 === 2026-07-01T03:30:00Z
    const date = new Date('2026-07-01T03:30:00.000Z');

    expect(toBrtCalendarDate(date)).toBe('2026-07-01');
  });
});

describe('roundToCents', () => {
  it('rounds a Big value to two decimals using half-up', () => {
    const value = new Big('10.125');

    expect(roundToCents(value).toString()).toBe('10.13');
  });

  it('does not mutate the original Big value passed in', () => {
    const value = new Big('10.125');

    roundToCents(value);

    expect(value.toString()).toBe('10.125');
  });
});

describe('lastWeekdayOfMonth', () => {
  it('returns the same date when the last day of the month is already a weekday', () => {
    // July 31, 2026 is a Friday
    expect(lastWeekdayOfMonth(2026, 7)).toBe('2026-07-31');
  });

  it('rolls back to Friday when the last day of the month is a Saturday', () => {
    // January 31, 2026 is a Saturday
    expect(lastWeekdayOfMonth(2026, 1)).toBe('2026-01-30');
  });

  it('rolls back to Friday when the last day of the month is a Sunday', () => {
    // May 31, 2026 is a Sunday
    expect(lastWeekdayOfMonth(2026, 5)).toBe('2026-05-29');
  });
});
