import { TaxFiscalClass } from '@ghostfolio/common/types/tax-fiscal-class.type';

import { DataSource, Type as ActivityType } from '@prisma/client';
import { Big } from 'big.js';

export interface ITaxActivity {
  dataSource: DataSource;
  dateBrt: string; // yyyy-MM-dd, already converted from UTC
  feeBrl: Big;
  grossValueBrl: Big; // quantity x unitPrice, already converted to BRL, as a TOTAL (not a unit price)
  id: string;
  quantity: Big;
  symbol: string;
  tagNames: string[];
  type: ActivityType;
  yearMonth: string; // yyyy-MM
}

export interface ISymbolClassification {
  assetProfileIdentifier: string; // `${dataSource}-${symbol}`
  conflictingTagNames: string[];
  dataSource: DataSource;
  fiscalClass: TaxFiscalClass | null;
  isConflicted: boolean;
  symbol: string;
}

export interface IEquityRealizedEvent {
  assetProfileIdentifier: string;
  costOfSoldBrl: Big;
  dataSource: DataSource;
  dateBrt: string;
  feeBrl: Big;
  fiscalClass: Exclude<TaxFiscalClass, 'RENDA_FIXA'>;
  grossSaleValueBrl: Big;
  quantitySold: Big;
  realizedGainBrl: Big;
  symbol: string;
  yearMonth: string;
}

export interface IEquitySymbolState {
  assetProfileIdentifier: string;
  averagePriceBrl: Big;
  costBasisBrl: Big;
  dateOfFirstActivity: string;
  quantity: Big;
}

export type FixedIncomeRateBracket =
  | 'UP_TO_180'
  | '181_TO_360'
  | '361_TO_720'
  | 'OVER_720';

export interface IFixedIncomeLot {
  acquisitionDateBrt: string;
  assetProfileIdentifier: string;
  id: string; // id of the originating BUY activity
  principalBrl: Big; // includes the purchase fee
  quantity: Big; // original quantity bought, used to pro-rate principal per unit
  remainingPrincipalBrl: Big;
  remainingQuantity: Big;
  symbol: string;
}

export interface IFixedIncomeRedemptionSlice {
  acquisitionDateBrt: string;
  assetProfileIdentifier: string;
  daysHeld: number;
  lotId: string;
  principalRedeemedBrl: Big;
  rateBracket: FixedIncomeRateBracket;
  ratePercent: 22.5 | 20 | 17.5 | 15;
  redemptionDateBrt: string;
  symbol: string;
  taxWithheldBrl: Big;
  yearMonth: string;
  yieldBrl: Big;
}

export interface IFiiIncomeEvent {
  amountBrl: Big;
  assetProfileIdentifier: string;
  dateBrt: string;
  symbol: string;
  yearMonth: string;
}

export interface ISameDayEquityWarning {
  assetProfileIdentifier: string;
  dateBrt: string;
  symbol: string;
}
