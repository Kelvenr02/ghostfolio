import { TaxFiscalClass } from '@ghostfolio/common/types/tax-fiscal-class.type';

import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';

import { IEquityRealizedEvent } from './interfaces/interfaces';
import {
  DAY_TRADE_TAX_RATE_PERCENT,
  EQUITY_TAX_RATE_PERCENT,
  STOCK_MONTHLY_EXEMPTION_THRESHOLD_BRL
} from './tax-br.constants';
import { lastWeekdayOfMonth } from './tax-br.helper';

export interface IEquityClassMonthAggregate {
  exemptionReason?: string;
  fiscalClass: Exclude<TaxFiscalClass, 'RENDA_FIXA'>;
  isDayTrade: boolean;
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
      // Day-trade is aggregated separately from swing-trade (regular)
      // sales: it never gets the R$20,000 monthly exemption and it is
      // always taxed at 20%, regardless of fiscal class or amount sold.
      const dayTradeEvents = classEvents.filter((event) => event.isDayTrade);
      const swingTradeEvents = classEvents.filter((event) => !event.isDayTrade);

      if (swingTradeEvents.length > 0) {
        aggregates.push(
          this.buildClassAggregate({
            fiscalClass,
            events: swingTradeEvents,
            isDayTrade: false,
            ratePercent: EQUITY_TAX_RATE_PERCENT[fiscalClass]
          })
        );
      }

      if (dayTradeEvents.length > 0) {
        aggregates.push(
          this.buildClassAggregate({
            fiscalClass,
            events: dayTradeEvents,
            isDayTrade: true,
            ratePercent: DAY_TRADE_TAX_RATE_PERCENT
          })
        );
      }
    }

    return aggregates;
  }

  private buildClassAggregate({
    events,
    fiscalClass,
    isDayTrade,
    ratePercent
  }: {
    events: IEquityRealizedEvent[];
    fiscalClass: Exclude<TaxFiscalClass, 'RENDA_FIXA'>;
    isDayTrade: boolean;
    ratePercent: 15 | 20;
  }): IEquityClassMonthAggregate {
    const totalGrossSalesBrl = events.reduce(
      (total, event) => total.plus(event.grossSaleValueBrl),
      new Big(0)
    );
    const totalRealizedGainBrl = events.reduce(
      (total, event) => total.plus(event.realizedGainBrl),
      new Big(0)
    );

    const isExempt =
      !isDayTrade &&
      fiscalClass === 'ACAO' &&
      totalGrossSalesBrl.lte(STOCK_MONTHLY_EXEMPTION_THRESHOLD_BRL);
    const isLossMonth = totalRealizedGainBrl.lt(0);
    const taxableGainBrl = isExempt
      ? new Big(0)
      : totalRealizedGainBrl.gt(0)
        ? totalRealizedGainBrl
        : new Big(0);
    const taxDueBrl = taxableGainBrl.mul(ratePercent).div(100);

    return {
      fiscalClass,
      isDayTrade,
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
      sales: events
    };
  }

  private getDarfDueDate(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return lastWeekdayOfMonth(nextYear, nextMonth);
  }
}
