import { TaxFiscalClass } from '@ghostfolio/common/types/tax-fiscal-class.type';

import { FixedIncomeRateBracket } from './interfaces/interfaces';

// Canonical tag names the user assigns via the existing Tag UI to classify a
// symbol for tax purposes. Matched case-sensitively by name (not a fixed
// UUID) because there is no provisioning mechanism for well-known tags per
// user in this codebase.
export const CANONICAL_TAG_NAME_TO_FISCAL_CLASS: Record<
  string,
  TaxFiscalClass
> = {
  Ação: 'ACAO',
  BDR: 'BDR',
  ETF: 'ETF',
  FII: 'FII',
  RendaFixa: 'RENDA_FIXA'
};

// Lei 11.033/2004, Art. 1º, incisos I-IV.
export const STOCK_MONTHLY_EXEMPTION_THRESHOLD_BRL = 20000;

export const EQUITY_TAX_RATE_PERCENT: Record<
  Exclude<TaxFiscalClass, 'RENDA_FIXA'>,
  15 | 20
> = {
  ACAO: 15,
  BDR: 15,
  ETF: 15,
  FII: 20
};

export const DARF_CODE = '6015';

export const FIXED_INCOME_RATE_BRACKETS: {
  bracket: FixedIncomeRateBracket;
  maxDays: number | null;
  ratePercent: 22.5 | 20 | 17.5 | 15;
}[] = [
  { bracket: 'UP_TO_180', maxDays: 180, ratePercent: 22.5 },
  { bracket: '181_TO_360', maxDays: 360, ratePercent: 20 },
  { bracket: '361_TO_720', maxDays: 720, ratePercent: 17.5 },
  { bracket: 'OVER_720', maxDays: null, ratePercent: 15 }
];
