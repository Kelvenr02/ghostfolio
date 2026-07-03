import { Injectable } from '@nestjs/common';

import {
  IEquityRealizedEvent,
  IEquitySymbolState,
  ISameDayEquityWarning,
  ISymbolClassification,
  ITaxActivity
} from './interfaces/interfaces';

@Injectable()
export class EquityTaxCalculatorService {
  public compute(
    activities: ITaxActivity[],
    classifications: Map<string, ISymbolClassification>
  ): {
    realizedEvents: IEquityRealizedEvent[];
    sameDayWarnings: ISameDayEquityWarning[];
    symbolStates: Map<string, IEquitySymbolState>;
  } {
    void activities;
    void classifications;
    throw new Error('Method not implemented.');
  }
}
