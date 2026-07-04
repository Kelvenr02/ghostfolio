import { PurchaseMode } from '@prisma/client';
import { Big } from 'big.js';

export interface ContributionPlanEngineAsset {
  currentValue: Big; // BRL, quantized to cents at the boundary
  minPurchaseValue?: Big; // continuous assets only
  purchaseMode: PurchaseMode;
  symbol: string;
  targetPercentage: Big; // 0-100
  unitPrice?: Big; // discrete assets only; precondition > 0
}

export interface ContributionPlanEngineInput {
  assets: ContributionPlanEngineAsset[];
  contributionAmount: Big;
}

export interface ContributionPlanEnginePurchase {
  amount: Big; // > 0 always - no SELL by construction
  quantity?: Big; // integer, discrete assets only
  symbol: string;
}

export interface ContributionPlanEngineResult {
  allocations: {
    symbol: string;
    valueBefore: Big;
    valueAfter: Big;
    purchasedAmount: Big;
    remainingGap: Big;
  }[];
  purchases: ContributionPlanEnginePurchase[];
  residualAmount: Big;
}
