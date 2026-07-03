import { Big } from 'big.js';
import { addDays, format } from 'date-fns';

import { SGS_SERIES } from './bcb.constants';
import { ISgsObservation } from './interfaces/interfaces';
import { SgsIndexBuilderService } from './sgs-index-builder.service';

const DATE_FORMAT = 'yyyy-MM-dd';

// Real observations of SGS series 12 (CDI) for June 2026, fetched on
// 2026-07-02. Corpus Christi (2026-06-04) and weekends are absent at the
// source itself.
const CDI_JUNE_2026: [string, string][] = [
  ['2026-06-01', '0.053400'],
  ['2026-06-02', '0.053400'],
  ['2026-06-03', '0.053400'],
  ['2026-06-05', '0.053400'],
  ['2026-06-08', '0.053400'],
  ['2026-06-09', '0.053400'],
  ['2026-06-10', '0.053400'],
  ['2026-06-11', '0.053400'],
  ['2026-06-12', '0.053400'],
  ['2026-06-15', '0.053400'],
  ['2026-06-16', '0.053400'],
  ['2026-06-17', '0.053400'],
  ['2026-06-18', '0.052531'],
  ['2026-06-19', '0.052531'],
  ['2026-06-22', '0.052531'],
  ['2026-06-23', '0.052531'],
  ['2026-06-24', '0.052531'],
  ['2026-06-25', '0.052531'],
  ['2026-06-26', '0.052531'],
  ['2026-06-29', '0.052531'],
  ['2026-06-30', '0.052531']
];

function toObservations(entries: [string, string][]): ISgsObservation[] {
  return entries.map(([date, valor]) => {
    return { date, rate: new Big(valor) };
  });
}

function toMap(points: { date: string; value: Big }[]) {
  const map: { [date: string]: Big } = {};

  for (const { date, value } of points) {
    map[date] = value;
  }

  return map;
}

describe('SgsIndexBuilderService', () => {
  let builder: SgsIndexBuilderService;

  beforeEach(() => {
    builder = new SgsIndexBuilderService();
  });

  describe('DAILY (CDI)', () => {
    it('starts at base 100 on the first observation date when there is no anchor', () => {
      const points = builder.buildDailyIndex({
        config: SGS_SERIES.CDI,
        from: new Date('2026-06-01T00:00:00'),
        observations: toObservations(CDI_JUNE_2026),
        to: new Date('2026-06-30T00:00:00')
      });

      expect(points[0].date).toBe('2026-06-01');
      expect(points[0].value.toFixed(8)).toBe('100.00000000');
    });

    it('emits one point per calendar day up to "to", carrying over weekends and holidays', () => {
      const points = builder.buildDailyIndex({
        config: SGS_SERIES.CDI,
        from: new Date('2026-06-01T00:00:00'),
        observations: toObservations(CDI_JUNE_2026),
        to: new Date('2026-06-30T00:00:00')
      });

      expect(points).toHaveLength(30);

      const byDate = toMap(points);

      // Corpus Christi (2026-06-04): no accrual, carries 2026-06-03
      expect(byDate['2026-06-04'].eq(byDate['2026-06-03'])).toBe(true);

      // Weekend 2026-06-06/07 carries Friday 2026-06-05
      expect(byDate['2026-06-06'].eq(byDate['2026-06-05'])).toBe(true);
      expect(byDate['2026-06-07'].eq(byDate['2026-06-05'])).toBe(true);

      // Business days do accrue
      expect(byDate['2026-06-02'].gt(byDate['2026-06-01'])).toBe(true);
    });

    it('matches the closed-form product for the real June 2026 sample within 1e-6', () => {
      const points = builder.buildDailyIndex({
        config: SGS_SERIES.CDI,
        from: new Date('2026-06-01T00:00:00'),
        observations: toObservations(CDI_JUNE_2026),
        to: new Date('2026-06-30T00:00:00')
      });

      const byDate = toMap(points);

      // Base day is 2026-06-01 (= 100); 11 compounding days at 0.053400
      // and 9 at 0.052531 follow.
      const expected = new Big('1.000534')
        .pow(11)
        .times(new Big('1.00052531').pow(9))
        .times(100);

      const relativeError = byDate['2026-06-30']
        .minus(expected)
        .abs()
        .div(expected);

      expect(relativeError.lte(new Big('1e-6'))).toBe(true);
    });

    it('stays within 1e-6 of the closed form over a synthetic 30-year daily series', () => {
      const startDate = new Date('1996-01-01T00:00:00');
      const observations: ISgsObservation[] = [];

      for (let i = 0; i < 7560; i++) {
        observations.push({
          date: format(addDays(startDate, i), DATE_FORMAT),
          rate: new Big('0.05')
        });
      }

      const points = builder.buildDailyIndex({
        observations,
        config: SGS_SERIES.CDI,
        from: startDate,
        to: addDays(startDate, 7559)
      });

      const lastPoint = points[points.length - 1];

      // First observation day is the base: 7559 compounding steps remain
      const expected = new Big('1.0005').pow(7559).times(100);

      const relativeError = lastPoint.value.minus(expected).abs().div(expected);

      expect(relativeError.lte(new Big('1e-6'))).toBe(true);
    });

    it('reproduces the full series exactly when rebuilt incrementally from a persisted anchor', () => {
      const from = new Date('2026-06-01T00:00:00');
      const to = new Date('2026-06-30T00:00:00');

      const fullSeries = builder.buildDailyIndex({
        from,
        to,
        config: SGS_SERIES.CDI,
        observations: toObservations(CDI_JUNE_2026)
      });

      const fullByDate = toMap(fullSeries);

      // Simulate a 7-day regather anchored on the persisted value (round8)
      const anchorDate = '2026-06-17';
      const anchor = {
        date: anchorDate,
        value: new Big(fullByDate[anchorDate].toFixed(8))
      };

      const incremental = builder.buildDailyIndex({
        anchor,
        to,
        config: SGS_SERIES.CDI,
        from: new Date('2026-06-18T00:00:00'),
        observations: toObservations(
          CDI_JUNE_2026.filter(([date]) => date >= '2026-06-18')
        )
      });

      expect(incremental[0].date).toBe('2026-06-18');

      for (const point of incremental) {
        expect(point.value.eq(fullByDate[point.date])).toBe(true);
      }
    });

    it('carries the anchor value through a window without new observations', () => {
      const points = builder.buildDailyIndex({
        anchor: { date: '2026-06-30', value: new Big('101.23456789') },
        config: SGS_SERIES.CDI,
        from: new Date('2026-07-01T00:00:00'),
        observations: [],
        to: new Date('2026-07-05T00:00:00')
      });

      expect(points).toHaveLength(5);
      expect(points[0].date).toBe('2026-07-01');
      expect(points[4].date).toBe('2026-07-05');

      for (const point of points) {
        expect(point.value.toFixed(8)).toBe('101.23456789');
      }
    });

    it('handles a single observation by emitting the base and carrying it', () => {
      const points = builder.buildDailyIndex({
        config: SGS_SERIES.CDI,
        from: new Date('2026-06-01T00:00:00'),
        observations: toObservations([['2026-06-01', '0.053400']]),
        to: new Date('2026-06-03T00:00:00')
      });

      expect(points).toHaveLength(3);

      for (const point of points) {
        expect(point.value.toFixed(8)).toBe('100.00000000');
      }
    });

    it('returns an empty series when there is no anchor and no observation', () => {
      const points = builder.buildDailyIndex({
        config: SGS_SERIES.CDI,
        from: new Date('2026-06-01T00:00:00'),
        observations: [],
        to: new Date('2026-06-30T00:00:00')
      });

      expect(points).toEqual([]);
    });
  });

  describe('MONTHLY (IPCA)', () => {
    it('applies the monthly factor as a step on the last day of the reference month', () => {
      // Real IPCA observations (SGS 433): January and February 2026
      const points = builder.buildDailyIndex({
        config: SGS_SERIES.IPCA,
        from: new Date('2026-01-01T00:00:00'),
        observations: toObservations([
          ['2026-01-01', '0.33'],
          ['2026-02-01', '0.70']
        ]),
        to: new Date('2026-03-05T00:00:00')
      });

      const byDate = toMap(points);

      // Base 100 on the last day of the first reference month
      expect(points[0].date).toBe('2026-01-31');
      expect(byDate['2026-01-31'].toFixed(8)).toBe('100.00000000');

      // Constant within February until the step on its last day
      expect(byDate['2026-02-14'].toFixed(8)).toBe('100.00000000');
      expect(byDate['2026-02-27'].toFixed(8)).toBe('100.00000000');
      expect(byDate['2026-02-28'].toFixed(8)).toBe('100.70000000');

      // March carries February's level (March not published yet)
      expect(byDate['2026-03-01'].toFixed(8)).toBe('100.70000000');
      expect(byDate['2026-03-05'].toFixed(8)).toBe('100.70000000');
    });

    it('steps on February 29th in leap years', () => {
      const points = builder.buildDailyIndex({
        config: SGS_SERIES.IPCA,
        from: new Date('2024-01-01T00:00:00'),
        observations: toObservations([
          ['2024-01-01', '0.42'],
          ['2024-02-01', '0.83']
        ]),
        to: new Date('2024-03-01T00:00:00')
      });

      const byDate = toMap(points);

      expect(byDate['2024-02-28'].toFixed(8)).toBe('100.00000000');
      expect(byDate['2024-02-29'].toFixed(8)).toBe('100.83000000');
    });

    it('compounds consecutive months from a persisted anchor', () => {
      const points = builder.buildDailyIndex({
        anchor: { date: '2026-01-31', value: new Big('100') },
        config: SGS_SERIES.IPCA,
        from: new Date('2026-02-01T00:00:00'),
        observations: toObservations([
          ['2026-02-01', '0.70'],
          ['2026-03-01', '0.88']
        ]),
        to: new Date('2026-04-10T00:00:00')
      });

      const byDate = toMap(points);

      expect(byDate['2026-02-28'].toFixed(8)).toBe('100.70000000');

      const expectedMarch = new Big('100.7').times('1.0088').round(8);

      expect(byDate['2026-03-31'].eq(expectedMarch)).toBe(true);
      expect(byDate['2026-04-10'].eq(expectedMarch)).toBe(true);
    });

    it('throws an explicit error when a month is missing in the middle of the series', () => {
      expect(() => {
        return builder.buildDailyIndex({
          config: SGS_SERIES.IPCA,
          from: new Date('2026-01-01T00:00:00'),
          observations: toObservations([
            ['2026-01-01', '0.33'],
            ['2026-03-01', '0.88']
          ]),
          to: new Date('2026-04-01T00:00:00')
        });
      }).toThrow(/missing/i);
    });
  });
});
