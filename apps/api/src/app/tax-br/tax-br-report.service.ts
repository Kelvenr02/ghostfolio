import {
  Activity,
  TaxBrClassificationWarning,
  TaxBrDarfEstimate,
  TaxBrEquityClassMonthSummary,
  TaxBrEquityHoldingSummary,
  TaxBrFiiIncomeMonthSummary,
  TaxBrFixedIncomeLotSummary,
  TaxBrFixedIncomeMonthSummary,
  TaxBrFixedIncomeRedemptionDetail,
  TaxBrMonthSummary,
  TaxBrReportResponse,
  TaxBrSaleDetail
} from '@ghostfolio/common/interfaces';
import { TaxFiscalClass } from '@ghostfolio/common/types/tax-fiscal-class.type';

import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';

import { ActivitiesService } from '../activities/activities.service';
import { EquityTaxCalculatorService } from './equity-tax-calculator.service';
import {
  IFiiIncomeMonthSummary,
  summarizeFiiIncomeByMonth
} from './fii-income.helper';
import { FixedIncomeTaxCalculatorService } from './fixed-income-tax-calculator.service';
import {
  IEquityDataWarning,
  IFixedIncomeDataWarning,
  IFixedIncomeLot,
  IFixedIncomeRedemptionSlice,
  ISymbolClassification,
  ITaxActivity
} from './interfaces/interfaces';
import { MonthlyTaxAggregatorService } from './monthly-tax-aggregator.service';
import { FII_INCOME_EXEMPTION_ASSUMPTION } from './tax-br.constants';
import {
  getFixedIncomeRateBracket,
  roundToCents,
  toBrtCalendarDate
} from './tax-br.helper';
import { resolveSymbolClassifications } from './tax-classification.helper';

const DARF_ESTIMATE_ASSUMPTION =
  'O vencimento do DARF considera apenas fins de semana, nao o calendario ' +
  'de feriados nacionais -- confira a data exata antes de pagar.';
const FIXED_INCOME_REDEMPTION_ASSUMPTION =
  'O calculo de renda fixa assume que o valor lancado no resgate (SELL) ' +
  'e o valor bruto efetivamente recebido, incluindo o rendimento.';

@Injectable()
export class TaxBrReportService {
  public constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly equityTaxCalculatorService: EquityTaxCalculatorService,
    private readonly fixedIncomeTaxCalculatorService: FixedIncomeTaxCalculatorService,
    private readonly monthlyTaxAggregatorService: MonthlyTaxAggregatorService
  ) {}

  public async getReport({
    month,
    userId,
    year
  }: {
    month?: number;
    userId: string;
    year: number;
  }): Promise<TaxBrReportResponse> {
    const { activities } = await this.activitiesService.getActivities({
      userId,
      userCurrency: 'BRL',
      withExcludedAccountsAndActivities: true
    });

    const taxActivities = this.mapToTaxActivities(activities);
    const classifications = resolveSymbolClassifications(taxActivities);

    const {
      dataWarnings: equityDataWarnings,
      realizedEvents,
      symbolStates
    } = this.equityTaxCalculatorService.compute(taxActivities, classifications);
    const {
      dataWarnings: fixedIncomeDataWarnings,
      openLots,
      redemptionSlices
    } = this.fixedIncomeTaxCalculatorService.compute(
      taxActivities,
      classifications
    );
    const fiiIncomeByMonth = summarizeFiiIncomeByMonth(
      taxActivities,
      classifications
    );
    const monthlyEquitySummaries =
      this.monthlyTaxAggregatorService.aggregate(realizedEvents);
    const redemptionSlicesByMonth =
      this.groupRedemptionsByMonth(redemptionSlices);

    const yearMonths = this.resolveRequestedYearMonths(year, month);

    const months = yearMonths.map((yearMonth) =>
      this.buildMonthSummary(
        yearMonth,
        monthlyEquitySummaries,
        fiiIncomeByMonth,
        redemptionSlicesByMonth
      )
    );

    return {
      months,
      assumptions: [
        FII_INCOME_EXEMPTION_ASSUMPTION,
        DARF_ESTIMATE_ASSUMPTION,
        FIXED_INCOME_REDEMPTION_ASSUMPTION
      ],
      baseCurrency: 'BRL',
      classificationWarnings: this.buildClassificationWarnings(
        classifications,
        equityDataWarnings,
        fixedIncomeDataWarnings
      ),
      equityHoldings: this.buildEquityHoldings(symbolStates, classifications),
      generatedAt: new Date().toISOString(),
      openFixedIncomeLots: this.buildOpenFixedIncomeLots(openLots),
      requestedRange: { month, year }
    };
  }

  private mapToTaxActivities(activities: Activity[]): ITaxActivity[] {
    return activities.map((activity) => {
      const dateBrt = toBrtCalendarDate(new Date(activity.date));

      return {
        dateBrt,
        dataSource: activity.SymbolProfile.dataSource,
        feeBrl: new Big(activity.feeInBaseCurrency ?? 0),
        grossValueBrl: new Big(activity.valueInBaseCurrency ?? 0),
        id: activity.id,
        quantity: new Big(activity.quantity),
        symbol: activity.SymbolProfile.symbol,
        tagNames: (activity.tags ?? []).map((tag) => tag.name),
        type: activity.type,
        yearMonth: dateBrt.slice(0, 7)
      };
    });
  }

  private buildClassificationWarnings(
    classifications: Map<string, ISymbolClassification>,
    equityDataWarnings: IEquityDataWarning[],
    fixedIncomeDataWarnings: IFixedIncomeDataWarning[]
  ): TaxBrClassificationWarning[] {
    const warnings: TaxBrClassificationWarning[] = [];

    for (const classification of classifications.values()) {
      if (classification.isConflicted) {
        warnings.push({
          dataSource: classification.dataSource,
          reason: 'CONFLICTING_TAGS',
          symbol: classification.symbol,
          conflictingTagNames: classification.conflictingTagNames
        });
      } else if (classification.fiscalClass == null) {
        warnings.push({
          dataSource: classification.dataSource,
          reason: 'UNCLASSIFIED',
          symbol: classification.symbol
        });
      }
    }

    for (const warning of equityDataWarnings) {
      warnings.push({
        dataSource: warning.dataSource,
        date: warning.dateBrt,
        reason: warning.reason,
        symbol: warning.symbol
      });
    }

    for (const warning of fixedIncomeDataWarnings) {
      warnings.push({
        dataSource: warning.dataSource,
        date: warning.dateBrt,
        reason: warning.reason,
        symbol: warning.symbol
      });
    }

    return warnings;
  }

  private buildEquityHoldings(
    symbolStates: Map<
      string,
      {
        averagePriceBrl: Big;
        costBasisBrl: Big;
        dateOfFirstActivity: string;
        quantity: Big;
      }
    >,
    classifications: Map<string, ISymbolClassification>
  ): TaxBrEquityHoldingSummary[] {
    const holdings: TaxBrEquityHoldingSummary[] = [];

    for (const [assetProfileIdentifier, state] of symbolStates) {
      if (state.quantity.eq(0)) {
        continue;
      }

      const classification = classifications.get(assetProfileIdentifier);

      holdings.push({
        dataSource: classification.dataSource,
        symbol: classification.symbol,
        averagePriceBrl: roundToCents(state.averagePriceBrl).toNumber(),
        costBasisBrl: roundToCents(state.costBasisBrl).toNumber(),
        dateOfFirstActivity: state.dateOfFirstActivity,
        fiscalClass: classification.fiscalClass as Exclude<
          TaxFiscalClass,
          'RENDA_FIXA'
        >,
        quantity: state.quantity.toNumber()
      });
    }

    return holdings;
  }

  private buildOpenFixedIncomeLots(
    lots: IFixedIncomeLot[]
  ): TaxBrFixedIncomeLotSummary[] {
    const today = new Date();

    return lots.map((lot) => {
      const daysHeldAsOfToday = Math.round(
        (today.getTime() - new Date(lot.acquisitionDateBrt).getTime()) /
          (24 * 60 * 60 * 1000)
      );

      const { ratePercent } = getFixedIncomeRateBracket(daysHeldAsOfToday);

      return {
        daysHeldAsOfToday,
        acquisitionDate: lot.acquisitionDateBrt,
        dataSource: lot.dataSource,
        rateBracketIfRedeemedToday: ratePercent,
        remainingPrincipalBrl: roundToCents(
          lot.remainingPrincipalBrl
        ).toNumber(),
        symbol: lot.symbol
      };
    });
  }

  private groupRedemptionsByMonth(
    slices: IFixedIncomeRedemptionSlice[]
  ): Map<string, IFixedIncomeRedemptionSlice[]> {
    const byMonth = new Map<string, IFixedIncomeRedemptionSlice[]>();

    for (const slice of slices) {
      const group = byMonth.get(slice.yearMonth) ?? [];
      group.push(slice);
      byMonth.set(slice.yearMonth, group);
    }

    return byMonth;
  }

  private resolveRequestedYearMonths(year: number, month?: number): string[] {
    if (month != null) {
      return [`${year}-${String(month).padStart(2, '0')}`];
    }

    return Array.from(
      { length: 12 },
      (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`
    );
  }

  private buildMonthSummary(
    yearMonth: string,
    monthlyEquitySummaries: ReturnType<
      MonthlyTaxAggregatorService['aggregate']
    >,
    fiiIncomeByMonth: Map<string, IFiiIncomeMonthSummary>,
    redemptionSlicesByMonth: Map<string, IFixedIncomeRedemptionSlice[]>
  ): TaxBrMonthSummary {
    const equitySummary = monthlyEquitySummaries.get(yearMonth);
    const fiiSummary = fiiIncomeByMonth.get(yearMonth);
    const redemptionSlices = redemptionSlicesByMonth.get(yearMonth);

    const equity: TaxBrEquityClassMonthSummary[] = (
      equitySummary?.equity ?? []
    ).map((entry) => ({
      exemptionReason: entry.exemptionReason,
      fiscalClass: entry.fiscalClass,
      isExempt: entry.isExempt,
      isLossMonth: entry.isLossMonth,
      ratePercent: entry.ratePercent,
      taxableGainBrl: roundToCents(entry.taxableGainBrl).toNumber(),
      taxDueBrl: roundToCents(entry.taxDueBrl).toNumber(),
      totalGrossSalesBrl: roundToCents(entry.totalGrossSalesBrl).toNumber(),
      totalRealizedGainBrl: roundToCents(entry.totalRealizedGainBrl).toNumber(),
      sales: entry.sales.map(
        (sale): TaxBrSaleDetail => ({
          date: sale.dateBrt,
          symbol: sale.symbol,
          costOfSoldBrl: roundToCents(sale.costOfSoldBrl).toNumber(),
          dataSource: sale.dataSource,
          feeBrl: roundToCents(sale.feeBrl).toNumber(),
          grossSaleValueBrl: roundToCents(sale.grossSaleValueBrl).toNumber(),
          quantity: sale.quantitySold.toNumber(),
          realizedGainBrl: roundToCents(sale.realizedGainBrl).toNumber()
        })
      )
    }));

    const darf: TaxBrDarfEstimate | null = equitySummary
      ? {
          code: '6015',
          dueDate: equitySummary.darf.dueDate,
          isEstimate: true,
          isPayable: equitySummary.darf.isPayable,
          totalTaxDueBrl: roundToCents(
            equitySummary.darf.totalTaxDueBrl
          ).toNumber()
        }
      : null;

    const fixedIncome: TaxBrFixedIncomeMonthSummary | null = redemptionSlices
      ? {
          redemptions: redemptionSlices.map(
            (slice): TaxBrFixedIncomeRedemptionDetail => ({
              acquisitionDate: slice.acquisitionDateBrt,
              date: slice.redemptionDateBrt,
              daysHeld: slice.daysHeld,
              principalRedeemedBrl: roundToCents(
                slice.principalRedeemedBrl
              ).toNumber(),
              ratePercent: slice.ratePercent,
              symbol: slice.symbol,
              taxWithheldBrl: roundToCents(slice.taxWithheldBrl).toNumber(),
              yieldBrl: roundToCents(slice.yieldBrl).toNumber()
            })
          ),
          totalTaxWithheldAtSourceBrl: roundToCents(
            redemptionSlices.reduce(
              (total, slice) => total.plus(slice.taxWithheldBrl),
              new Big(0)
            )
          ).toNumber(),
          totalYieldBrl: roundToCents(
            redemptionSlices.reduce(
              (total, slice) => total.plus(slice.yieldBrl),
              new Big(0)
            )
          ).toNumber()
        }
      : null;

    const fiiIncome: TaxBrFiiIncomeMonthSummary | null = fiiSummary
      ? {
          exemptionAssumption: fiiSummary.exemptionAssumption,
          totalExemptIncomeBrl: roundToCents(
            fiiSummary.totalExemptIncomeBrl
          ).toNumber(),
          bySymbol: fiiSummary.bySymbol.map((entry) => ({
            symbol: entry.symbol,
            amountBrl: roundToCents(entry.amountBrl).toNumber()
          }))
        }
      : null;

    return { darf, equity, fiiIncome, fixedIncome, yearMonth };
  }
}
