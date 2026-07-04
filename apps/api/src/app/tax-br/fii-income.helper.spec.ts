import { DataSource, Type as ActivityType } from '@prisma/client';
import { Big } from 'big.js';

import { summarizeFiiIncomeByMonth } from './fii-income.helper';
import { ISymbolClassification, ITaxActivity } from './interfaces/interfaces';

function buildActivity(overrides: Partial<ITaxActivity>): ITaxActivity {
  return {
    dataSource: DataSource.YAHOO,
    dateBrt: '2026-07-15',
    feeBrl: new Big(0),
    grossValueBrl: new Big(0),
    id: 'activity-1',
    quantity: new Big(1),
    symbol: 'HGLG11.SA',
    tagNames: [],
    type: ActivityType.DIVIDEND,
    yearMonth: '2026-07',
    ...overrides
  };
}

function buildFiiClassifications(
  assetProfileIdentifier: string
): Map<string, ISymbolClassification> {
  return new Map([
    [
      assetProfileIdentifier,
      {
        assetProfileIdentifier,
        conflictingTagNames: [],
        dataSource: DataSource.YAHOO,
        fiscalClass: 'FII',
        isConflicted: false,
        symbol: assetProfileIdentifier.replace('YAHOO-', '')
      }
    ]
  ]);
}

describe('summarizeFiiIncomeByMonth', () => {
  it('separates FII monthly dividend activities as exempt income, not capital gain', () => {
    const activities = [
      buildActivity({
        id: 'div-1',
        grossValueBrl: new Big(150)
      })
    ];

    const summaries = summarizeFiiIncomeByMonth(
      activities,
      buildFiiClassifications('YAHOO-HGLG11.SA')
    );

    const july = summaries.get('2026-07');

    expect(july.totalExemptIncomeBrl.toString()).toBe('150');
    expect(july.bySymbol[0].symbol).toBe('HGLG11.SA');
    expect(july.bySymbol[0].amountBrl.toString()).toBe('150');
  });

  it('does not mix FII exempt income with FII capital gain from cota sales in the same month', () => {
    const activities = [
      buildActivity({
        id: 'div-1',
        grossValueBrl: new Big(150),
        type: ActivityType.DIVIDEND
      }),
      buildActivity({
        id: 'sell-1',
        grossValueBrl: new Big(5000),
        type: ActivityType.SELL
      })
    ];

    const summaries = summarizeFiiIncomeByMonth(
      activities,
      buildFiiClassifications('YAHOO-HGLG11.SA')
    );

    // The SELL's 5000 must never leak into the exempt-income total -- it is
    // capital gain, handled entirely by the equity calculator instead.
    expect(summaries.get('2026-07').totalExemptIncomeBrl.toString()).toBe(
      '150'
    );
  });

  it('attaches the fixed exemption-conditions disclaimer to every FII income month', () => {
    const activities = [
      buildActivity({
        id: 'div-1',
        dateBrt: '2026-07-15',
        grossValueBrl: new Big(150)
      }),
      buildActivity({
        id: 'div-2',
        dateBrt: '2026-08-15',
        grossValueBrl: new Big(160),
        yearMonth: '2026-08'
      })
    ];

    const summaries = summarizeFiiIncomeByMonth(
      activities,
      buildFiiClassifications('YAHOO-HGLG11.SA')
    );

    expect(summaries.get('2026-07').exemptionAssumption).toEqual(
      expect.any(String)
    );
    expect(summaries.get('2026-07').exemptionAssumption.length).toBeGreaterThan(
      0
    );
    expect(summaries.get('2026-08').exemptionAssumption).toBe(
      summaries.get('2026-07').exemptionAssumption
    );
  });
});
