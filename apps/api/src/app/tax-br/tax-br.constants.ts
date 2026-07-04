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

// Lei 8.668/1993: rendimento mensal de FII e isento para PF somente se (i) as
// cotas negociam exclusivamente em bolsa/balcao, (ii) o fundo tem >=50
// cotistas, e (iii) nenhum cotista detem >=10% das cotas. O Ghostfolio nao
// tem como verificar essas 3 condicoes, entao elas sao sempre assumidas
// verdadeiras e declaradas ao usuario.
export const FII_INCOME_EXEMPTION_ASSUMPTION =
  'Rendimento de FII assumido isento (Lei 8.668/1993): pressupoe negociacao ' +
  'exclusiva em bolsa/balcao, fundo com 50 ou mais cotistas e nenhum ' +
  'cotista com 10% ou mais das cotas -- condicoes nao verificaveis pelos ' +
  'dados do Ghostfolio.';

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
