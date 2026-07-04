import { DataSource, PurchaseMode } from '@prisma/client';

export interface ContributionPlanOrder {
  amount: number;
  dataSource: DataSource;
  name?: string;
  purchaseMode: PurchaseMode;
  quantity?: number;
  symbol: string;
  unitPrice?: number;
  unitPriceAsOf?: string;
}

export interface ContributionPlanAllocation {
  allocationAfterInPercentage: number;
  allocationBeforeInPercentage: number;
  deviationAfterInPercentage: number;
  purchasedAmount: number;
  remainingGapAmount: number;
  symbol: string;
  targetPercentage: number;
}

export interface ContributionPlanWarning {
  code: 'HOLDING_NOT_IN_PLAN' | 'RESIDUAL_NOT_ALLOCATED' | 'STALE_PRICE';
  message: string;
  symbol?: string;
}

export interface ContributionPlanResponse {
  allocations: ContributionPlanAllocation[];
  contributionAmount: number;
  orders: ContributionPlanOrder[];
  residualAmount: number;
  totalValueAfter: number;
  totalValueBefore: number;
  warnings: ContributionPlanWarning[];
}
