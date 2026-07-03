import { DataSource, Type as ActivityType } from '@prisma/client';
import { Big } from 'big.js';

import { EquityTaxCalculatorService } from './equity-tax-calculator.service';
import { ISymbolClassification, ITaxActivity } from './interfaces/interfaces';

function buildActivity(overrides: Partial<ITaxActivity>): ITaxActivity {
  return {
    dataSource: DataSource.YAHOO,
    dateBrt: '2026-07-01',
    feeBrl: new Big(0),
    grossValueBrl: new Big(0),
    id: 'activity-1',
    quantity: new Big(1),
    symbol: 'BOVA11.SA',
    tagNames: [],
    type: ActivityType.BUY,
    yearMonth: '2026-07',
    ...overrides
  };
}

function buildClassifications(
  assetProfileIdentifier: string,
  fiscalClass: ISymbolClassification['fiscalClass'] = 'ETF'
): Map<string, ISymbolClassification> {
  return new Map([
    [
      assetProfileIdentifier,
      {
        assetProfileIdentifier,
        fiscalClass,
        conflictingTagNames: [],
        dataSource: DataSource.YAHOO,
        isConflicted: false,
        symbol: assetProfileIdentifier.replace('YAHOO-', '')
      }
    ]
  ]);
}

describe('EquityTaxCalculatorService', () => {
  let service: EquityTaxCalculatorService;

  beforeEach(() => {
    service = new EquityTaxCalculatorService();
  });

  it('computes the weighted average price after a single buy', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        feeBrl: new Big(5),
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      })
    ];

    const { symbolStates } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );
    const state = symbolStates.get('YAHOO-BOVA11.SA');

    expect(state.quantity.toString()).toBe('10');
    expect(state.costBasisBrl.toString()).toBe('1005');
    expect(state.averagePriceBrl.toString()).toBe('100.5');
  });

  it('computes the weighted average price after multiple buys at different prices', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'buy-2',
        dateBrt: '2026-07-05',
        grossValueBrl: new Big(2000),
        quantity: new Big(10)
      })
    ];

    const { symbolStates } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );
    const state = symbolStates.get('YAHOO-BOVA11.SA');

    expect(state.quantity.toString()).toBe('20');
    expect(state.averagePriceBrl.toString()).toBe('150');
  });

  it('does not reweight the average price on a partial sell', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-07-10',
        grossValueBrl: new Big(800),
        quantity: new Big(4),
        type: ActivityType.SELL
      })
    ];

    const { symbolStates } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );
    const state = symbolStates.get('YAHOO-BOVA11.SA');

    expect(state.quantity.toString()).toBe('6');
    expect(state.averagePriceBrl.toString()).toBe('100');
  });

  it('zeroes quantity and cost basis on a full sell', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-07-10',
        grossValueBrl: new Big(1500),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const { symbolStates } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );
    const state = symbolStates.get('YAHOO-BOVA11.SA');

    expect(state.quantity.toString()).toBe('0');
    expect(state.costBasisBrl.toString()).toBe('0');
  });

  it('restarts averaging from scratch after a repurchase following a full sell', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-07-10',
        grossValueBrl: new Big(1500),
        quantity: new Big(10),
        type: ActivityType.SELL
      }),
      buildActivity({
        id: 'buy-2',
        dateBrt: '2026-07-20',
        grossValueBrl: new Big(1000),
        quantity: new Big(5)
      })
    ];

    const { symbolStates } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );
    const state = symbolStates.get('YAHOO-BOVA11.SA');

    expect(state.quantity.toString()).toBe('5');
    expect(state.averagePriceBrl.toString()).toBe('200');
  });

  it('adds the buy fee to the cost basis', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        feeBrl: new Big(10),
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      })
    ];

    const { symbolStates } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );

    expect(symbolStates.get('YAHOO-BOVA11.SA').costBasisBrl.toString()).toBe(
      '1010'
    );
  });

  it('subtracts the sell fee from the net sale proceeds', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-07-10',
        feeBrl: new Big(20),
        grossValueBrl: new Big(1500),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const { realizedEvents } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );

    // net sale = 1500 - 20 = 1480; cost of sold = 1000; gain = 480
    expect(realizedEvents[0].realizedGainBrl.toString()).toBe('480');
  });

  it('produces a negative realized gain when the sale price is below the average cost', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-07-10',
        grossValueBrl: new Big(600),
        quantity: new Big(10),
        type: ActivityType.SELL
      })
    ];

    const { realizedEvents } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );

    expect(realizedEvents[0].realizedGainBrl.toString()).toBe('-400');
  });

  it('zeroes a residual quantity smaller than Number.EPSILON after a sell', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(100),
        quantity: new Big(1)
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-07-10',
        grossValueBrl: new Big(100),
        quantity: new Big('0.99999999999999999'),
        type: ActivityType.SELL
      })
    ];

    const { symbolStates } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );
    const state = symbolStates.get('YAHOO-BOVA11.SA');

    expect(state.quantity.toString()).toBe('0');
    expect(state.costBasisBrl.toString()).toBe('0');
  });

  it('flags a possible day-trade when there is a buy and a sell of the same symbol on the same BRT day', () => {
    const activities = [
      buildActivity({
        id: 'buy-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(1000),
        quantity: new Big(10),
        type: ActivityType.BUY
      }),
      buildActivity({
        id: 'sell-1',
        dateBrt: '2026-07-01',
        grossValueBrl: new Big(600),
        quantity: new Big(5),
        type: ActivityType.SELL
      })
    ];

    const { sameDayWarnings } = service.compute(
      activities,
      buildClassifications('YAHOO-BOVA11.SA')
    );

    expect(sameDayWarnings).toEqual([
      {
        assetProfileIdentifier: 'YAHOO-BOVA11.SA',
        dateBrt: '2026-07-01',
        symbol: 'BOVA11.SA'
      }
    ]);
  });
});
