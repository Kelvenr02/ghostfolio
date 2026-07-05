import type { DataSource } from '@prisma/client';

import type { TaxFiscalClass } from '../../types/tax-fiscal-class.type';

export interface TaxBrEquityHoldingSummary {
  averagePriceBrl: number;
  costBasisBrl: number;
  dataSource: DataSource;
  dateOfFirstActivity: string;
  fiscalClass: Exclude<TaxFiscalClass, 'RENDA_FIXA'>;
  name?: string;
  quantity: number;
  symbol: string;
}

export interface TaxBrFixedIncomeLotSummary {
  acquisitionDate: string;
  dataSource: DataSource;
  daysHeldAsOfToday: number;
  name?: string;
  rateBracketIfRedeemedToday: 22.5 | 20 | 17.5 | 15;
  remainingPrincipalBrl: number;
  symbol: string;
}

export interface TaxBrSaleDetail {
  costOfSoldBrl: number;
  dataSource: DataSource;
  date: string;
  feeBrl: number;
  grossSaleValueBrl: number;
  quantity: number;
  realizedGainBrl: number;
  symbol: string;
}

export interface TaxBrEquityClassMonthSummary {
  exemptionReason?: string;
  fiscalClass: Exclude<TaxFiscalClass, 'RENDA_FIXA'>;
  isDayTrade: boolean;
  isExempt: boolean;
  isLossMonth: boolean;
  ratePercent: 15 | 20;
  sales: TaxBrSaleDetail[];
  taxableGainBrl: number;
  taxDueBrl: number;
  totalGrossSalesBrl: number;
  totalRealizedGainBrl: number;
}

export interface TaxBrFixedIncomeRedemptionDetail {
  acquisitionDate: string;
  date: string;
  daysHeld: number;
  principalRedeemedBrl: number;
  ratePercent: 22.5 | 20 | 17.5 | 15;
  symbol: string;
  taxWithheldBrl: number;
  yieldBrl: number;
}

export interface TaxBrFixedIncomeMonthSummary {
  redemptions: TaxBrFixedIncomeRedemptionDetail[];
  totalTaxWithheldAtSourceBrl: number;
  totalYieldBrl: number;
}

export interface TaxBrFiiIncomeMonthSummary {
  bySymbol: { amountBrl: number; symbol: string }[];
  exemptionAssumption: string;
  totalExemptIncomeBrl: number;
}

export interface TaxBrDarfEstimate {
  code: '6015';
  dueDate: string;
  isEstimate: true;
  isPayable: boolean;
  totalTaxDueBrl: number;
}

export interface TaxBrMonthSummary {
  darf: TaxBrDarfEstimate | null;
  equity: TaxBrEquityClassMonthSummary[];
  fiiIncome: TaxBrFiiIncomeMonthSummary | null;
  fixedIncome: TaxBrFixedIncomeMonthSummary | null;
  yearMonth: string;
}

export interface TaxBrClassificationWarning {
  conflictingTagNames?: string[];
  date?: string;
  dataSource: DataSource;
  reason:
    | 'UNCLASSIFIED'
    | 'CONFLICTING_TAGS'
    | 'SAME_DAY_ACTIVITY'
    | 'SOLD_WITHOUT_PRIOR_PURCHASE'
    | 'REDEEMED_WITHOUT_PRIOR_LOT';
  symbol: string;
}

export interface TaxBrReportResponse {
  assumptions: string[];
  baseCurrency: 'BRL';
  classificationWarnings: TaxBrClassificationWarning[];
  equityHoldings: TaxBrEquityHoldingSummary[];
  generatedAt: string;
  months: TaxBrMonthSummary[];
  openFixedIncomeLots: TaxBrFixedIncomeLotSummary[];
  requestedRange: { month?: number; year: number };
}
