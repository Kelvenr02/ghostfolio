import { Big } from 'big.js';

import { ISymbolClassification, ITaxActivity } from './interfaces/interfaces';

export interface IFiiIncomeMonthSummary {
  bySymbol: { amountBrl: Big; symbol: string }[];
  exemptionAssumption: string;
  totalExemptIncomeBrl: Big;
}

export function summarizeFiiIncomeByMonth(
  activities: ITaxActivity[],
  classifications: Map<string, ISymbolClassification>
): Map<string, IFiiIncomeMonthSummary> {
  void activities;
  void classifications;
  throw new Error('Method not implemented.');
}
