import { Big } from 'big.js';

import { FixedIncomeRateBracket } from './interfaces/interfaces';
import { FIXED_INCOME_RATE_BRACKETS } from './tax-br.constants';

const BRT_OFFSET_IN_MILLISECONDS = 3 * 60 * 60 * 1000;

export function toBrtCalendarDate(date: Date): string {
  const brtInstant = new Date(date.getTime() - BRT_OFFSET_IN_MILLISECONDS);

  const year = brtInstant.getUTCFullYear();
  const month = String(brtInstant.getUTCMonth() + 1).padStart(2, '0');
  const day = String(brtInstant.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function roundToCents(value: Big): Big {
  return new Big(value).round(2, Big.roundHalfUp);
}

export function lastWeekdayOfMonth(year: number, month: number): string {
  // month is 1-based; day 0 of the next month is the last day of this month
  const lastDay = new Date(Date.UTC(year, month, 0));

  const dayOfWeek = lastDay.getUTCDay();

  if (dayOfWeek === 0) {
    // Sunday -> roll back to Friday
    lastDay.setUTCDate(lastDay.getUTCDate() - 2);
  } else if (dayOfWeek === 6) {
    // Saturday -> roll back to Friday
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  }

  const resultYear = lastDay.getUTCFullYear();
  const resultMonth = String(lastDay.getUTCMonth() + 1).padStart(2, '0');
  const resultDay = String(lastDay.getUTCDate()).padStart(2, '0');

  return `${resultYear}-${resultMonth}-${resultDay}`;
}

export function getFixedIncomeRateBracket(daysHeld: number): {
  bracket: FixedIncomeRateBracket;
  ratePercent: 22.5 | 20 | 17.5 | 15;
} {
  const match = FIXED_INCOME_RATE_BRACKETS.find(
    ({ maxDays }) => maxDays === null || daysHeld <= maxDays
  );

  return { bracket: match.bracket, ratePercent: match.ratePercent };
}
