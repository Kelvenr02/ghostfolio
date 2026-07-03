import { TaxFiscalClass } from '@ghostfolio/common/types/tax-fiscal-class.type';

import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';

import { IEquityRealizedEvent } from './interfaces/interfaces';

export interface IEquityClassMonthAggregate {
  exemptionReason?: string;
  fiscalClass: Exclude<TaxFiscalClass, 'RENDA_FIXA'>;
  isExempt: boolean;
  isLossMonth: boolean;
  ratePercent: 15 | 20;
  sales: IEquityRealizedEvent[];
  taxableGainBrl: Big;
  taxDueBrl: Big;
  totalGrossSalesBrl: Big;
  totalRealizedGainBrl: Big;
}

export interface IMonthlyDarfEstimate {
  code: '6015';
  dueDate: string;
  isEstimate: true;
  isPayable: boolean;
  totalTaxDueBrl: Big;
}

export interface IMonthlyTaxSummary {
  darf: IMonthlyDarfEstimate;
  equity: IEquityClassMonthAggregate[];
  yearMonth: string;
}

@Injectable()
export class MonthlyTaxAggregatorService {
  public aggregate(
    realizedEvents: IEquityRealizedEvent[]
  ): Map<string, IMonthlyTaxSummary> {
    void realizedEvents;
    throw new Error('Method not implemented.');
  }
}
