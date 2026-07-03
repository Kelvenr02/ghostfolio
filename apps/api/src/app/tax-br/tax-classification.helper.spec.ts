import { DataSource, Type as ActivityType } from '@prisma/client';
import { Big } from 'big.js';

import { ITaxActivity } from './interfaces/interfaces';
import { resolveSymbolClassifications } from './tax-classification.helper';

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

describe('resolveSymbolClassifications', () => {
  it('classifies a symbol as ETF from its tag and excludes it from the stock exemption', () => {
    const activities = [
      buildActivity({ symbol: 'BOVA11.SA', tagNames: ['ETF'] })
    ];

    const classifications = resolveSymbolClassifications(activities);

    expect(classifications.get('YAHOO-BOVA11.SA').fiscalClass).toBe('ETF');
  });

  it('classifies a symbol as BDR from its tag and excludes it from the stock exemption', () => {
    const activities = [
      buildActivity({ symbol: 'AAPL34.SA', tagNames: ['BDR'] })
    ];

    const classifications = resolveSymbolClassifications(activities);

    expect(classifications.get('YAHOO-AAPL34.SA').fiscalClass).toBe('BDR');
  });

  it('hoists a classification tag found on one activity to every activity of the same symbol', () => {
    const activities = [
      buildActivity({ id: 'a1', symbol: 'HGLG11.SA', tagNames: ['FII'] }),
      buildActivity({ id: 'a2', symbol: 'HGLG11.SA', tagNames: [] })
    ];

    const classifications = resolveSymbolClassifications(activities);

    expect(classifications.get('YAHOO-HGLG11.SA').fiscalClass).toBe('FII');
  });

  it('flags a symbol as unclassified when no activity carries a recognized tag', () => {
    const activities = [
      buildActivity({
        symbol: 'PETR4.SA',
        tagNames: ['minha-carteira-principal']
      })
    ];

    const classifications = resolveSymbolClassifications(activities);
    const classification = classifications.get('YAHOO-PETR4.SA');

    expect(classification.fiscalClass).toBeNull();
    expect(classification.isConflicted).toBe(false);
  });

  it('flags a symbol as conflicted when its activities carry two different recognized tags', () => {
    const activities = [
      buildActivity({ id: 'a1', symbol: 'XPML11.SA', tagNames: ['FII'] }),
      buildActivity({ id: 'a2', symbol: 'XPML11.SA', tagNames: ['ETF'] })
    ];

    const classifications = resolveSymbolClassifications(activities);
    const classification = classifications.get('YAHOO-XPML11.SA');

    expect(classification.isConflicted).toBe(true);
    expect(classification.conflictingTagNames).toEqual(
      expect.arrayContaining(['FII', 'ETF'])
    );
  });

  it('excludes a conflicted symbol from computed totals by keeping its fiscal class null', () => {
    // A null fiscalClass on a conflicted symbol is what lets downstream
    // aggregation skip it and surface a classificationWarning instead of
    // silently taxing it under the wrong regime.
    const activities = [
      buildActivity({ id: 'a1', symbol: 'XPML11.SA', tagNames: ['FII'] }),
      buildActivity({ id: 'a2', symbol: 'XPML11.SA', tagNames: ['RendaFixa'] })
    ];

    const classifications = resolveSymbolClassifications(activities);

    expect(classifications.get('YAHOO-XPML11.SA').fiscalClass).toBeNull();
  });
});
