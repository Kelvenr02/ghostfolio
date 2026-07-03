import { Big } from 'big.js';

import { ISymbolClassification, ITaxActivity } from './interfaces/interfaces';
import { FII_INCOME_EXEMPTION_ASSUMPTION } from './tax-br.constants';

export interface IFiiIncomeMonthSummary {
  bySymbol: { amountBrl: Big; symbol: string }[];
  exemptionAssumption: string;
  totalExemptIncomeBrl: Big;
}

export function summarizeFiiIncomeByMonth(
  activities: ITaxActivity[],
  classifications: Map<string, ISymbolClassification>
): Map<string, IFiiIncomeMonthSummary> {
  const fiiIncomeActivities = activities.filter((activity) => {
    if (activity.type !== 'DIVIDEND') {
      return false;
    }

    const classification = classifications.get(
      `${activity.dataSource}-${activity.symbol}`
    );

    return (
      classification != null &&
      !classification.isConflicted &&
      classification.fiscalClass === 'FII'
    );
  });

  const summariesByMonth = new Map<string, IFiiIncomeMonthSummary>();

  for (const activity of fiiIncomeActivities) {
    const summary = summariesByMonth.get(activity.yearMonth) ?? {
      bySymbol: [],
      exemptionAssumption: FII_INCOME_EXEMPTION_ASSUMPTION,
      totalExemptIncomeBrl: new Big(0)
    };

    summary.totalExemptIncomeBrl = summary.totalExemptIncomeBrl.plus(
      activity.grossValueBrl
    );

    const bySymbolEntry = summary.bySymbol.find(
      (entry) => entry.symbol === activity.symbol
    );

    if (bySymbolEntry) {
      bySymbolEntry.amountBrl = bySymbolEntry.amountBrl.plus(
        activity.grossValueBrl
      );
    } else {
      summary.bySymbol.push({
        amountBrl: activity.grossValueBrl,
        symbol: activity.symbol
      });
    }

    summariesByMonth.set(activity.yearMonth, summary);
  }

  return summariesByMonth;
}
