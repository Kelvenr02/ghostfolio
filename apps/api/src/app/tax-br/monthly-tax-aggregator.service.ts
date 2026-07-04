import { TaxFiscalClass } from '@ghostfolio/common/types/tax-fiscal-class.type';

import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';

import { IEquityRealizedEvent } from './interfaces/interfaces';
import {
  EQUITY_TAX_RATE_PERCENT,
  STOCK_MONTHLY_EXEMPTION_THRESHOLD_BRL
} from './tax-br.constants';
import { lastWeekdayOfMonth } from './tax-br.helper';

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
    const eventsByMonth = new Map<string, IEquityRealizedEvent[]>();

    for (const event of realizedEvents) {
      const events = eventsByMonth.get(event.yearMonth) ?? [];
      events.push(event);
      eventsByMonth.set(event.yearMonth, events);
    }

    const summaries = new Map<string, IMonthlyTaxSummary>();

    for (const [yearMonth, events] of eventsByMonth) {
      const equity = this.aggregateEquityByClass(events);
      const totalTaxDueBrl = equity.reduce(
        (total, entry) => total.plus(entry.taxDueBrl),
        new Big(0)
      );

      summaries.set(yearMonth, {
        equity,
        yearMonth,
        darf: {
          totalTaxDueBrl,
          code: '6015',
          dueDate: this.getDarfDueDate(yearMonth),
          isEstimate: true,
          isPayable: totalTaxDueBrl.gt(0)
        }
      });
    }

    return summaries;
  }

  private aggregateEquityByClass(
    events: IEquityRealizedEvent[]
  ): IEquityClassMonthAggregate[] {
    const eventsByClass = new Map<
      Exclude<TaxFiscalClass, 'RENDA_FIXA'>,
      IEquityRealizedEvent[]
    >();

    for (const event of events) {
      const classEvents = eventsByClass.get(event.fiscalClass) ?? [];
      classEvents.push(event);
      eventsByClass.set(event.fiscalClass, classEvents);
    }

    const aggregates: IEquityClassMonthAggregate[] = [];

    for (const [fiscalClass, classEvents] of eventsByClass) {
      const totalGrossSalesBrl = classEvents.reduce(
        (total, event) => total.plus(event.grossSaleValueBrl),
        new Big(0)
      );
      const totalRealizedGainBrl = classEvents.reduce(
        (total, event) => total.plus(event.realizedGainBrl),
        new Big(0)
      );

      const isExempt =
        fiscalClass === 'ACAO' &&
        totalGrossSalesBrl.lte(STOCK_MONTHLY_EXEMPTION_THRESHOLD_BRL);
      const isLossMonth = totalRealizedGainBrl.lt(0);
      const taxableGainBrl = isExempt
        ? new Big(0)
        : totalRealizedGainBrl.gt(0)
          ? totalRealizedGainBrl
          : new Big(0);
      const ratePercent = EQUITY_TAX_RATE_PERCENT[fiscalClass];
      const taxDueBrl = taxableGainBrl.mul(ratePercent).div(100);

      aggregates.push({
        fiscalClass,
        isExempt,
        isLossMonth,
        ratePercent,
        taxableGainBrl,
        taxDueBrl,
        totalGrossSalesBrl,
        totalRealizedGainBrl,
        exemptionReason: isExempt
          ? 'Soma das vendas de ações no mês igual ou abaixo de R$20.000,00 (Lei 9.250/1995).'
          : undefined,
        sales: classEvents
      });
    }

    return aggregates;
  }

  private getDarfDueDate(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return lastWeekdayOfMonth(nextYear, nextMonth);
  }
}
