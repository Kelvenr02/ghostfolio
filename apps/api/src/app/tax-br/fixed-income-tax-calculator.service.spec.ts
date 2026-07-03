import { DataSource, Type as ActivityType } from '@prisma/client';
import { Big } from 'big.js';

import { FixedIncomeTaxCalculatorService } from './fixed-income-tax-calculator.service';
import { ISymbolClassification, ITaxActivity } from './interfaces/interfaces';

function buildActivity(overrides: Partial<ITaxActivity>): ITaxActivity {
  return {
    dataSource: DataSource.MANUAL,
    dateBrt: '2026-01-01',
    feeBrl: new Big(0),
    grossValueBrl: new Big(0),
    id: 'activity-1',
    quantity: new Big(1),
    symbol: 'TESOURO-SELIC-2029',
    tagNames: [],
    type: ActivityType.BUY,
    yearMonth: '2026-01',
    ...overrides
  };
}

function buildClassifications(
  ...assetProfileIdentifiers: string[]
): Map<string, ISymbolClassification> {
  return new Map(
    assetProfileIdentifiers.map((assetProfileIdentifier) => [
      assetProfileIdentifier,
      {
        assetProfileIdentifier,
        conflictingTagNames: [],
        dataSource: DataSource.MANUAL,
        fiscalClass: 'RENDA_FIXA',
        isConflicted: false,
        symbol: assetProfileIdentifier.replace('MANUAL-', '')
      }
    ])
  );
}

describe('FixedIncomeTaxCalculatorService', () => {
  let service: FixedIncomeTaxCalculatorService;

  beforeEach(() => {
    service = new FixedIncomeTaxCalculatorService();
  });

  it('creates one lot per buy activity with its own acquisition date', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'buy-2',
        dateBrt: '2026-03-01',
        grossValueBrl: new Big(500),
        quantity: new Big(5)
      })
    ];

    const { openLots } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    expect(openLots).toHaveLength(2);
    expect(openLots[0].acquisitionDateBrt).toBe('2026-01-01');
    expect(openLots[1].acquisitionDateBrt).toBe('2026-03-01');
  });

  it('applies the 22.5 percent rate for a redemption at day 180', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-06-30', // exactly 180 days after 2026-01-01
        grossValueBrl: new Big(1100),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const { redemptionSlices } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    expect(redemptionSlices[0].daysHeld).toBe(180);
    expect(redemptionSlices[0].ratePercent).toBe(22.5);
  });

  it('applies the 20 percent rate for a redemption at day 181', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-07-01', // exactly 181 days after 2026-01-01
        grossValueBrl: new Big(1100),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const { redemptionSlices } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    expect(redemptionSlices[0].daysHeld).toBe(181);
    expect(redemptionSlices[0].ratePercent).toBe(20);
  });

  it('applies the 17.5 percent rate for a redemption in the 361-720 day range', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2027-01-01', // 365 days after 2026-01-01 (2026 is not a leap year)
        grossValueBrl: new Big(1100),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const { redemptionSlices } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    expect(redemptionSlices[0].daysHeld).toBe(365);
    expect(redemptionSlices[0].ratePercent).toBe(17.5);
  });

  it('applies the 15 percent rate for a redemption after day 720', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2028-06-01', // well over 720 days after 2026-01-01
        grossValueBrl: new Big(1100),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const { redemptionSlices } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    expect(redemptionSlices[0].daysHeld).toBeGreaterThan(720);
    expect(redemptionSlices[0].ratePercent).toBe(15);
  });

  it('computes two applications with different dates and different rates independently', () => {
    const activities = [
      buildActivity({
        id: 'buy-a',
        dataSource: DataSource.MANUAL,
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10),
        symbol: 'TESOURO-SELIC-2029'
      }),
      buildActivity({
        id: 'sell-a',
        dataSource: DataSource.MANUAL,
        dateBrt: '2026-06-30', // 180 days -> 22.5%
        grossValueBrl: new Big(1100),
        quantity: new Big(10),
        symbol: 'TESOURO-SELIC-2029',
        type: ActivityType.SELL
      }),
      buildActivity({
        id: 'buy-b',
        dataSource: DataSource.MANUAL,
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(2000),
        quantity: new Big(20),
        symbol: 'CDB-BANCO-X'
      }),
      buildActivity({
        id: 'sell-b',
        dataSource: DataSource.MANUAL,
        dateBrt: '2026-07-01', // 181 days -> 20%
        grossValueBrl: new Big(2200),
        quantity: new Big(20),
        symbol: 'CDB-BANCO-X',
        type: ActivityType.SELL
      })
    ];

    const { redemptionSlices } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029', 'MANUAL-CDB-BANCO-X')
    );

    const sliceA = redemptionSlices.find(
      (slice) => slice.symbol === 'TESOURO-SELIC-2029'
    );
    const sliceB = redemptionSlices.find(
      (slice) => slice.symbol === 'CDB-BANCO-X'
    );

    expect(sliceA.ratePercent).toBe(22.5);
    expect(sliceB.ratePercent).toBe(20);
  });

  it('consumes lots fifo and applies each lot own rate when a redemption spans two lots', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'buy-2',
        dateBrt: '2026-02-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-08-01',
        grossValueBrl: new Big(1650),
        quantity: new Big(15),
        type: ActivityType.SELL
      })
    ];

    const { redemptionSlices } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    expect(redemptionSlices).toHaveLength(2);

    const sliceFromFirstLot = redemptionSlices.find(
      (slice) => slice.lotId === 'buy-1'
    );
    const sliceFromSecondLot = redemptionSlices.find(
      (slice) => slice.lotId === 'buy-2'
    );

    // full 10 units of lot 1 at 110/unit: principal 1000, redeemed value 1100, yield 100
    expect(sliceFromFirstLot.principalRedeemedBrl.toString()).toBe('1000');
    expect(sliceFromFirstLot.yieldBrl.toString()).toBe('100');

    // 5 of 10 units of lot 2 at 110/unit: principal 500, redeemed value 550, yield 50
    expect(sliceFromSecondLot.principalRedeemedBrl.toString()).toBe('500');
    expect(sliceFromSecondLot.yieldBrl.toString()).toBe('50');
  });

  it("reduces a lot's remaining principal without closing it on a partial redemption", () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-06-30',
        grossValueBrl: new Big(440),
        quantity: new Big(4),
        type: ActivityType.SELL
      })
    ];

    const { openLots } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    expect(openLots).toHaveLength(1);
    expect(openLots[0].remainingQuantity.toString()).toBe('6');
    expect(openLots[0].remainingPrincipalBrl.toString()).toBe('600');
  });

  it('computes taxable yield as redemption value minus proportional principal', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-06-30',
        grossValueBrl: new Big(1100),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const { redemptionSlices } = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    expect(redemptionSlices[0].yieldBrl.toString()).toBe('100');
  });

  it('flags fixed income tax as withheld at source and excludes it from the DARF total', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-01-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-06-30', // 180 days -> 22.5%
        grossValueBrl: new Big(1100),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const result = service.compute(
      activities,
      buildClassifications('MANUAL-TESOURO-SELIC-2029')
    );

    // yield 100 x 22.5% = 22.5, withheld at source. No darf-related field
    // exists anywhere on this service's return type -- the aggregator (a
    // separate file) is the only place a DARF total is ever computed.
    expect(result.redemptionSlices[0].taxWithheldBrl.toString()).toBe('22.5');
    expect(Object.keys(result).sort()).toEqual([
      'openLots',
      'redemptionSlices'
    ]);
  });
});
