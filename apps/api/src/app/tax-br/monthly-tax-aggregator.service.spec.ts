import { DataSource } from '@prisma/client';
import { Big } from 'big.js';

import { IEquityRealizedEvent } from './interfaces/interfaces';
import { MonthlyTaxAggregatorService } from './monthly-tax-aggregator.service';

function buildEvent(
  overrides: Partial<IEquityRealizedEvent>
): IEquityRealizedEvent {
  return {
    assetProfileIdentifier: 'YAHOO-PETR4.SA',
    costOfSoldBrl: new Big(0),
    dataSource: DataSource.YAHOO,
    dateBrt: '2026-07-10',
    feeBrl: new Big(0),
    fiscalClass: 'ACAO',
    grossSaleValueBrl: new Big(0),
    isDayTrade: false,
    quantitySold: new Big(1),
    realizedGainBrl: new Big(0),
    symbol: 'PETR4.SA',
    yearMonth: '2026-07',
    ...overrides
  };
}

describe('MonthlyTaxAggregatorService', () => {
  let service: MonthlyTaxAggregatorService;

  beforeEach(() => {
    service = new MonthlyTaxAggregatorService();
  });

  it('aggregates gross sale value across multiple stock symbols in the same month for the R$20,000 test', () => {
    const events = [
      buildEvent({
        symbol: 'PETR4.SA',
        grossSaleValueBrl: new Big(15000),
        realizedGainBrl: new Big(1000)
      }),
      buildEvent({
        symbol: 'VALE3.SA',
        grossSaleValueBrl: new Big(4000),
        realizedGainBrl: new Big(500)
      })
    ];

    const months = service.aggregate(events);
    const acao = months
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'ACAO');

    expect(acao.totalGrossSalesBrl.toString()).toBe('19000');
    expect(acao.isExempt).toBe(true);
    expect(acao.taxDueBrl.toString()).toBe('0');
  });

  it('exempts stock gains when aggregated monthly sales equal exactly R$20,000.00', () => {
    const events = [
      buildEvent({
        grossSaleValueBrl: new Big(20000),
        realizedGainBrl: new Big(5000)
      })
    ];

    const acao = service
      .aggregate(events)
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'ACAO');

    expect(acao.isExempt).toBe(true);
    expect(acao.taxDueBrl.toString()).toBe('0');
  });

  it('taxes stock gains when aggregated monthly sales equal R$20,000.01', () => {
    const events = [
      buildEvent({
        grossSaleValueBrl: new Big('20000.01'),
        realizedGainBrl: new Big(5000)
      })
    ];

    const acao = service
      .aggregate(events)
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'ACAO');

    expect(acao.isExempt).toBe(false);
    expect(acao.taxDueBrl.toString()).toBe('750');
  });

  it('taxes a day-trade stock sale at 20 percent and ignores the R$20,000 exemption even below the threshold', () => {
    const events = [
      buildEvent({
        isDayTrade: true,
        grossSaleValueBrl: new Big(5000),
        realizedGainBrl: new Big(1000)
      })
    ];

    const acao = service
      .aggregate(events)
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'ACAO');

    expect(acao.isDayTrade).toBe(true);
    expect(acao.isExempt).toBe(false);
    expect(acao.exemptionReason).toBeUndefined();
    expect(acao.ratePercent).toBe(20);
    expect(acao.taxDueBrl.toString()).toBe('200');
  });

  it('keeps day-trade and swing-trade stock sales in the same month as separate, independently-taxed aggregates', () => {
    const events = [
      buildEvent({
        isDayTrade: true,
        grossSaleValueBrl: new Big(5000),
        realizedGainBrl: new Big(1000) // day-trade: 20% = 200
      }),
      buildEvent({
        isDayTrade: false,
        grossSaleValueBrl: new Big(8000),
        realizedGainBrl: new Big(500) // swing-trade: alone below R$20k -> exempt
      })
    ];

    const { equity, darf } = service.aggregate(events).get('2026-07');
    const acaoEntries = equity.filter((entry) => entry.fiscalClass === 'ACAO');

    expect(acaoEntries).toHaveLength(2);

    const dayTrade = acaoEntries.find((entry) => entry.isDayTrade);
    const swingTrade = acaoEntries.find((entry) => !entry.isDayTrade);

    // The day-trade sale does not count toward the swing-trade R$20,000
    // exemption total, and vice-versa.
    expect(dayTrade.totalGrossSalesBrl.toString()).toBe('5000');
    expect(dayTrade.taxDueBrl.toString()).toBe('200');
    expect(swingTrade.totalGrossSalesBrl.toString()).toBe('8000');
    expect(swingTrade.isExempt).toBe(true);
    expect(swingTrade.taxDueBrl.toString()).toBe('0');
    expect(darf.totalTaxDueBrl.toString()).toBe('200');
  });

  it('never exempts ETF gains regardless of monthly sale value', () => {
    const events = [
      buildEvent({
        assetProfileIdentifier: 'YAHOO-BOVA11.SA',
        fiscalClass: 'ETF',
        symbol: 'BOVA11.SA',
        grossSaleValueBrl: new Big(100),
        realizedGainBrl: new Big(10)
      })
    ];

    const etf = service
      .aggregate(events)
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'ETF');

    expect(etf.isExempt).toBe(false);
  });

  it('never exempts BDR gains regardless of monthly sale value', () => {
    const events = [
      buildEvent({
        assetProfileIdentifier: 'YAHOO-AAPL34.SA',
        fiscalClass: 'BDR',
        symbol: 'AAPL34.SA',
        grossSaleValueBrl: new Big(100),
        realizedGainBrl: new Big(10)
      })
    ];

    const bdr = service
      .aggregate(events)
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'BDR');

    expect(bdr.isExempt).toBe(false);
  });

  it('never exempts FII capital gains regardless of monthly sale value', () => {
    const events = [
      buildEvent({
        assetProfileIdentifier: 'YAHOO-HGLG11.SA',
        fiscalClass: 'FII',
        symbol: 'HGLG11.SA',
        grossSaleValueBrl: new Big(100),
        realizedGainBrl: new Big(10)
      })
    ];

    const fii = service
      .aggregate(events)
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'FII');

    expect(fii.isExempt).toBe(false);
  });

  it('taxes FII capital gains at 20 percent', () => {
    const events = [
      buildEvent({
        assetProfileIdentifier: 'YAHOO-HGLG11.SA',
        fiscalClass: 'FII',
        symbol: 'HGLG11.SA',
        grossSaleValueBrl: new Big(10000),
        realizedGainBrl: new Big(1000)
      })
    ];

    const fii = service
      .aggregate(events)
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'FII');

    expect(fii.ratePercent).toBe(20);
    expect(fii.taxDueBrl.toString()).toBe('200');
  });

  it('taxes stock, ETF and BDR gains at 15 percent', () => {
    const events = [
      buildEvent({
        grossSaleValueBrl: new Big('20000.01'),
        realizedGainBrl: new Big(1000)
      }),
      buildEvent({
        assetProfileIdentifier: 'YAHOO-BOVA11.SA',
        fiscalClass: 'ETF',
        symbol: 'BOVA11.SA',
        grossSaleValueBrl: new Big(1000),
        realizedGainBrl: new Big(1000)
      }),
      buildEvent({
        assetProfileIdentifier: 'YAHOO-AAPL34.SA',
        fiscalClass: 'BDR',
        symbol: 'AAPL34.SA',
        grossSaleValueBrl: new Big(1000),
        realizedGainBrl: new Big(1000)
      })
    ];

    const { equity } = service.aggregate(events).get('2026-07');

    for (const fiscalClass of ['ACAO', 'ETF', 'BDR']) {
      expect(
        equity.find((entry) => entry.fiscalClass === fiscalClass).ratePercent
      ).toBe(15);
    }
  });

  it('reports a loss month with zero tax due', () => {
    const events = [
      buildEvent({
        grossSaleValueBrl: new Big('20000.01'),
        realizedGainBrl: new Big(-500)
      })
    ];

    const acao = service
      .aggregate(events)
      .get('2026-07')
      .equity.find((entry) => entry.fiscalClass === 'ACAO');

    expect(acao.isLossMonth).toBe(true);
    expect(acao.taxDueBrl.toString()).toBe('0');
    expect(acao.totalRealizedGainBrl.toString()).toBe('-500');
  });

  it('does not net a loss in one fiscal class against a gain in another fiscal class in the same month', () => {
    const events = [
      buildEvent({
        grossSaleValueBrl: new Big('20000.01'),
        realizedGainBrl: new Big(-1000)
      }),
      buildEvent({
        assetProfileIdentifier: 'YAHOO-BOVA11.SA',
        fiscalClass: 'ETF',
        symbol: 'BOVA11.SA',
        grossSaleValueBrl: new Big(1000),
        realizedGainBrl: new Big(1000)
      })
    ];

    const { equity } = service.aggregate(events).get('2026-07');
    const etf = equity.find((entry) => entry.fiscalClass === 'ETF');

    // ETF's 150 tax is unaffected by ACAO's loss in the same month.
    expect(etf.taxDueBrl.toString()).toBe('150');
  });

  it('sums each class tax due into a single monthly DARF total', () => {
    const events = [
      buildEvent({
        grossSaleValueBrl: new Big('20000.01'),
        realizedGainBrl: new Big(1000) // 150 tax
      }),
      buildEvent({
        assetProfileIdentifier: 'YAHOO-HGLG11.SA',
        fiscalClass: 'FII',
        symbol: 'HGLG11.SA',
        grossSaleValueBrl: new Big(1000),
        realizedGainBrl: new Big(1000) // 200 tax
      })
    ];

    const { darf } = service.aggregate(events).get('2026-07');

    expect(darf.code).toBe('6015');
    expect(darf.totalTaxDueBrl.toString()).toBe('350');
    expect(darf.isPayable).toBe(true);
  });

  it('marks the DARF as not payable when the monthly total tax due is zero', () => {
    const events = [
      buildEvent({
        grossSaleValueBrl: new Big(15000), // exempt
        realizedGainBrl: new Big(1000)
      })
    ];

    const { darf } = service.aggregate(events).get('2026-07');

    expect(darf.totalTaxDueBrl.toString()).toBe('0');
    expect(darf.isPayable).toBe(false);
  });

  it('computes the DARF due date as the last weekday of the following month', () => {
    const events = [
      buildEvent({
        dateBrt: '2026-07-10',
        yearMonth: '2026-07',
        grossSaleValueBrl: new Big('20000.01'),
        realizedGainBrl: new Big(1000)
      })
    ];

    const { darf } = service.aggregate(events).get('2026-07');

    // August 31, 2026 is a Monday -> already a weekday
    expect(darf.dueDate).toBe('2026-08-31');
    expect(darf.isEstimate).toBe(true);
  });
});
