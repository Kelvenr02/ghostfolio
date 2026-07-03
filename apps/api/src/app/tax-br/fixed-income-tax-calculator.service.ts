import { Injectable } from '@nestjs/common';

import {
  IFixedIncomeLot,
  IFixedIncomeRedemptionSlice,
  ISymbolClassification,
  ITaxActivity
} from './interfaces/interfaces';

@Injectable()
export class FixedIncomeTaxCalculatorService {
  public compute(
    activities: ITaxActivity[],
    classifications: Map<string, ISymbolClassification>
  ): {
    openLots: IFixedIncomeLot[];
    redemptionSlices: IFixedIncomeRedemptionSlice[];
  } {
    void activities;
    void classifications;
    throw new Error('Method not implemented.');
  }
}
