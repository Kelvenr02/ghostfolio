import { DATE_FORMAT, parseDate } from '@ghostfolio/common/helper';

import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';
import { addDays, addMonths, format, lastDayOfMonth } from 'date-fns';

import {
  SGS_INDEX_BASE_VALUE,
  SGS_INDEX_DECIMAL_PLACES
} from './bcb.constants';
import {
  IIndexAnchor,
  IIndexPoint,
  ISgsObservation,
  ISgsSeriesConfig
} from './interfaces/interfaces';

@Injectable()
export class SgsIndexBuilderService {
  public buildDailyIndex({
    anchor,
    config,
    observations,
    to
  }: {
    anchor?: IIndexAnchor;
    config: ISgsSeriesConfig;
    from: Date;
    observations: ISgsObservation[];
    to: Date;
  }): IIndexPoint[] {
    const factorRateByDate = this.getFactorRatesByDate({
      anchor,
      config,
      observations
    });
    const factorDates = Object.keys(factorRateByDate).sort();

    let startDateString: string;
    let value: Big;

    if (anchor) {
      startDateString = format(addDays(parseDate(anchor.date), 1), DATE_FORMAT);
      value = anchor.value;
    } else {
      if (factorDates.length === 0) {
        return [];
      }

      // The first known observation is the base of the synthetic index
      startDateString = factorDates[0];
      value = new Big(SGS_INDEX_BASE_VALUE);
      delete factorRateByDate[startDateString];
    }

    const points: IIndexPoint[] = [];
    const toDateString = format(to, DATE_FORMAT);

    let currentDate = parseDate(startDateString);
    let currentDateString = startDateString;

    while (currentDateString <= toDateString) {
      const rate = factorRateByDate[currentDateString];

      if (rate) {
        value = value
          .times(rate.div(100).plus(1))
          .round(SGS_INDEX_DECIMAL_PLACES);
      }

      points.push({ date: currentDateString, value });

      currentDate = addDays(currentDate, 1);
      currentDateString = format(currentDate, DATE_FORMAT);
    }

    return points;
  }

  private getFactorRatesByDate({
    anchor,
    config,
    observations
  }: {
    anchor?: IIndexAnchor;
    config: ISgsSeriesConfig;
    observations: ISgsObservation[];
  }): { [date: string]: Big } {
    const sortedObservations = [...observations].sort((a, b) => {
      return a.date.localeCompare(b.date);
    });

    const factorRateByDate: { [date: string]: Big } = {};

    if (config.frequency === 'MONTHLY') {
      // A gap would silently drop inflation from the accumulated index
      let previousMonth = anchor?.date.substring(0, 7);

      for (const { date, rate } of sortedObservations) {
        const month = date.substring(0, 7);

        if (previousMonth) {
          const expectedMonth = format(
            addMonths(parseDate(`${previousMonth}-01`), 1),
            'yyyy-MM'
          );

          if (month !== expectedMonth) {
            throw new Error(
              `Missing monthly observation between ${previousMonth} and ${month} for SGS series ${config.seriesId}`
            );
          }
        }

        // The index number of month M is the price level at the end of M
        factorRateByDate[format(lastDayOfMonth(parseDate(date)), DATE_FORMAT)] =
          rate;

        previousMonth = month;
      }
    } else {
      for (const { date, rate } of sortedObservations) {
        factorRateByDate[date] = rate;
      }
    }

    return factorRateByDate;
  }
}
