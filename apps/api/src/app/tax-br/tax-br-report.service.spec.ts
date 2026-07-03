import { Activity } from '@ghostfolio/common/interfaces';

import { DataSource, Type as ActivityType } from '@prisma/client';

import { EquityTaxCalculatorService } from './equity-tax-calculator.service';
import { FixedIncomeTaxCalculatorService } from './fixed-income-tax-calculator.service';
import { MonthlyTaxAggregatorService } from './monthly-tax-aggregator.service';
import { TaxBrReportService } from './tax-br-report.service';

function buildRawActivity(overrides: Record<string, unknown>): Activity {
  return {
    id: 'activity-1',
    date: new Date('2026-07-10T15:00:00.000Z'),
    feeInBaseCurrency: 0,
    isDraft: false,
    quantity: 10,
    tags: [],
    type: ActivityType.BUY,
    unitPrice: 100,
    valueInBaseCurrency: 1000,
    SymbolProfile: {
      dataSource: DataSource.YAHOO,
      symbol: 'PETR4.SA'
    },
    ...overrides
  } as unknown as Activity;
}

describe('TaxBrReportService', () => {
  let activitiesServiceMock: { getActivities: jest.Mock };
  let service: TaxBrReportService;

  beforeEach(() => {
    activitiesServiceMock = {
      getActivities: jest.fn().mockResolvedValue({ activities: [], count: 0 })
    };

    service = new TaxBrReportService(
      activitiesServiceMock as never,
      new EquityTaxCalculatorService(),
      new FixedIncomeTaxCalculatorService(),
      new MonthlyTaxAggregatorService()
    );
  });

  it('always converts activity values to BRL regardless of the user dashboard base currency', async () => {
    await service.getReport({ userId: 'user-1', year: 2026, month: 7 });

    expect(activitiesServiceMock.getActivities).toHaveBeenCalledWith(
      expect.objectContaining({ userCurrency: 'BRL' })
    );
  });

  it('includes activities from accounts tagged exclude-from-analysis, unlike the performance calculator', async () => {
    await service.getReport({ userId: 'user-1', year: 2026, month: 7 });

    expect(activitiesServiceMock.getActivities).toHaveBeenCalledWith(
      expect.objectContaining({ withExcludedAccountsAndActivities: true })
    );
  });

  it('excludes draft activities from the report by relying on the default includeDrafts=false', async () => {
    await service.getReport({ userId: 'user-1', year: 2026, month: 7 });

    const callArgs = activitiesServiceMock.getActivities.mock.calls[0][0];

    expect(callArgs.includeDrafts).not.toBe(true);
  });

  it('replays the full activity history even when only one month is requested', async () => {
    await service.getReport({ userId: 'user-1', year: 2026, month: 7 });

    const callArgs = activitiesServiceMock.getActivities.mock.calls[0][0];

    expect(callArgs.startDate).toBeUndefined();
    expect(callArgs.endDate).toBeUndefined();
  });

  it('returns classification warnings alongside a partial report instead of failing the whole request', async () => {
    activitiesServiceMock.getActivities.mockResolvedValue({
      activities: [buildRawActivity({ tags: [] })],
      count: 1
    });

    const report = await service.getReport({
      userId: 'user-1',
      year: 2026,
      month: 7
    });

    expect(report.classificationWarnings).toEqual([
      expect.objectContaining({ reason: 'UNCLASSIFIED', symbol: 'PETR4.SA' })
    ]);
    expect(report.months).toBeInstanceOf(Array);
  });

  it('reports equity holdings as of now, decoupled from the requested period', async () => {
    activitiesServiceMock.getActivities.mockResolvedValue({
      activities: [
        buildRawActivity({
          id: 'buy-1',
          date: new Date('2026-06-01T12:00:00.000Z'),
          quantity: 10,
          tags: [{ name: 'Ação' }],
          valueInBaseCurrency: 1000
        }),
        buildRawActivity({
          id: 'buy-2',
          date: new Date('2026-07-15T12:00:00.000Z'),
          quantity: 5,
          tags: [{ name: 'Ação' }],
          valueInBaseCurrency: 1000
        })
      ],
      count: 2
    });

    const report = await service.getReport({
      userId: 'user-1',
      year: 2026,
      month: 6 // request only June, but the July buy must still show in holdings
    });

    const holding = report.equityHoldings.find(
      (entry) => entry.symbol === 'PETR4.SA'
    );

    expect(holding.quantity).toBe(15);
  });
});
