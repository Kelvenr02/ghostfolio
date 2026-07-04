import { PurchaseMode } from '@prisma/client';
import { Big } from 'big.js';

import { roundToCents } from './contribution-plan.helper';
import {
  ContributionPlanEngineInput,
  ContributionPlanEngineResult
} from './interfaces/interfaces';

const PERCENT_DIVISOR = new Big('0.01');

interface WorkingAsset {
  gap: Big; // signed, NOT clamped while the loops run - eligibility (gap > 0) handles that
  minPurchaseValue?: Big;
  purchaseMode: PurchaseMode;
  purchasedAmount: Big;
  quantity: Big;
  symbol: string;
  unitPrice?: Big;
  valueBefore: Big;
}

function isAscendingSymbol(candidate: string, current: string): boolean {
  // deliberately a binary '<' string comparison, never localeCompare()
  return candidate < current;
}

function pickLargestGap(candidates: WorkingAsset[]): WorkingAsset {
  let chosen = candidates[0];

  for (let index = 1; index < candidates.length; index++) {
    const candidate = candidates[index];

    if (
      candidate.gap.gt(chosen.gap) ||
      (candidate.gap.eq(chosen.gap) &&
        isAscendingSymbol(candidate.symbol, chosen.symbol))
    ) {
      chosen = candidate;
    }
  }

  return chosen;
}

function clampNonNegative(value: Big): Big {
  return value.lt(0) ? new Big(0) : value;
}

export function buildContributionPlan(
  input: ContributionPlanEngineInput
): ContributionPlanEngineResult {
  const contributionAmount = roundToCents(input.contributionAmount);

  const workingAssets: WorkingAsset[] = input.assets.map((asset) => ({
    gap: new Big(0),
    minPurchaseValue: asset.minPurchaseValue
      ? roundToCents(asset.minPurchaseValue)
      : undefined,
    purchaseMode: asset.purchaseMode,
    purchasedAmount: new Big(0),
    quantity: new Big(0),
    symbol: asset.symbol,
    unitPrice: asset.unitPrice ? roundToCents(asset.unitPrice) : undefined,
    valueBefore: roundToCents(asset.currentValue)
  }));

  const totalValueBefore = workingAssets.reduce(
    (total, asset) => total.plus(asset.valueBefore),
    new Big(0)
  );

  // V' = sum(V_i) + B (§7.2)
  const totalValueAfter = totalValueBefore.plus(contributionAmount);

  input.assets.forEach((asset, index) => {
    // gap_i = t_i * V' - V_i, computed via multiplication only (no division)
    // to keep the money path exact: V'.times(t_i).times(0.01)
    const targetValue = totalValueAfter
      .times(asset.targetPercentage)
      .times(PERCENT_DIVISOR);

    workingAssets[index].gap = targetValue.minus(
      workingAssets[index].valueBefore
    );
  });

  let remainingBudget = contributionAmount;

  // Phase 1 (§7.3): greedy discrete loop
  for (;;) {
    const eligible = workingAssets.filter(
      (asset) =>
        asset.purchaseMode === PurchaseMode.DISCRETE &&
        asset.gap.gt(0) &&
        asset.unitPrice.lte(remainingBudget)
    );

    if (eligible.length === 0) {
      break;
    }

    const chosen = pickLargestGap(eligible);

    chosen.quantity = chosen.quantity.plus(1);
    chosen.purchasedAmount = chosen.purchasedAmount.plus(chosen.unitPrice);
    remainingBudget = remainingBudget.minus(chosen.unitPrice);
    chosen.gap = chosen.gap.minus(chosen.unitPrice);
  }

  // Phase 2 (§7.4): final continuous sweep
  if (remainingBudget.gt(0)) {
    const eligible = workingAssets.filter(
      (asset) =>
        asset.purchaseMode === PurchaseMode.CONTINUOUS &&
        asset.gap.gt(0) &&
        asset.minPurchaseValue.lte(remainingBudget)
    );

    if (eligible.length > 0) {
      const chosen = pickLargestGap(eligible);

      chosen.purchasedAmount = chosen.purchasedAmount.plus(remainingBudget);
      chosen.gap = chosen.gap.minus(remainingBudget);
      remainingBudget = new Big(0);
    }
  }

  const residualAmount = remainingBudget;

  const allocations = workingAssets.map((asset) => ({
    purchasedAmount: asset.purchasedAmount,
    remainingGap: clampNonNegative(asset.gap),
    symbol: asset.symbol,
    valueAfter: asset.valueBefore.plus(asset.purchasedAmount),
    valueBefore: asset.valueBefore
  }));

  const purchases = workingAssets
    .filter((asset) => asset.purchasedAmount.gt(0))
    .map((asset) => ({
      amount: asset.purchasedAmount,
      quantity:
        asset.purchaseMode === PurchaseMode.DISCRETE
          ? asset.quantity
          : undefined,
      symbol: asset.symbol
    }));

  return {
    allocations,
    purchases,
    residualAmount
  };
}
