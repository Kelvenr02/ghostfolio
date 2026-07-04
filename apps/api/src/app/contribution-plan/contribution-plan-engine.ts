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

// FIX 2 (precondição explícita no engine): o service já garante essas
// invariantes antes de chamar o engine, mas o engine em si (funções puras,
// sem acesso ao DB/HTTP) não pode assumir silenciosamente um input
// bem-formado - um non-null assertion implícito (asset.unitPrice.lte(...))
// em código morto de defesa é pior do que falhar alto e cedo. Nenhum
// cenário de teste hoje viola essas regras, então esta validação não muda
// nenhum resultado verde existente; ela só documenta e reforça, em tempo de
// execução, o que os tipos de ContributionPlanEngineAsset já prometem.
function assertValidPreconditions(input: ContributionPlanEngineInput): void {
  input.assets.forEach((asset, index) => {
    if (asset.purchaseMode === PurchaseMode.DISCRETE) {
      if (asset.unitPrice === undefined || asset.unitPrice === null) {
        throw new Error(
          `buildContributionPlan: asset at index ${index} (${asset.symbol}) is DISCRETE but has no unitPrice defined`
        );
      }

      if (!asset.unitPrice.gt(0)) {
        throw new Error(
          `buildContributionPlan: asset at index ${index} (${asset.symbol}) is DISCRETE but its unitPrice is not > 0`
        );
      }
    }

    if (asset.purchaseMode === PurchaseMode.CONTINUOUS) {
      if (
        asset.minPurchaseValue === undefined ||
        asset.minPurchaseValue === null
      ) {
        throw new Error(
          `buildContributionPlan: asset at index ${index} (${asset.symbol}) is CONTINUOUS but has no minPurchaseValue defined`
        );
      }

      if (asset.minPurchaseValue.lt(0)) {
        throw new Error(
          `buildContributionPlan: asset at index ${index} (${asset.symbol}) is CONTINUOUS but its minPurchaseValue is not >= 0`
        );
      }
    }
  });
}

export function buildContributionPlan(
  input: ContributionPlanEngineInput
): ContributionPlanEngineResult {
  assertValidPreconditions(input);

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

  // FIX 1 (HIGH - guard de terminação do loop guloso da Fase 1): cada
  // iteração consome de remainingBudget pelo menos a menor unitPrice > 0
  // entre os DISCRETE, então o loop termina matematicamente em, no máximo,
  // contributionAmount / menorUnitPrice iterações. Esse limite é calculado
  // ANTES do loop e imposto como cota explícita - isso NUNCA deve disparar
  // se a matemática estiver correta; é um guard de invariante de
  // terminação (fail-loud), não uma regra de negócio. Se não houver
  // DISCRETE elegível, maxIterations fica em 0 e a Fase 1 nem chega a
  // rodar (eligible.length === 0 na primeira checagem).
  const ABSOLUTE_MAX_ITERATIONS = 1_000_000;

  const discreteUnitPrices = workingAssets
    .filter(
      (asset) =>
        asset.purchaseMode === PurchaseMode.DISCRETE && asset.unitPrice.gt(0)
    )
    .map((asset) => asset.unitPrice);

  let maxIterations = 0;

  if (discreteUnitPrices.length > 0) {
    const smallestUnitPrice = discreteUnitPrices.reduce((smallest, price) =>
      price.lt(smallest) ? price : smallest
    );

    maxIterations = Math.min(
      contributionAmount
        .div(smallestUnitPrice)
        .round(0, Big.roundUp)
        .toNumber(),
      ABSOLUTE_MAX_ITERATIONS
    );
  }

  let iterationCount = 0;

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

    iterationCount++;

    // istanbul ignore next -- guard de invariante de terminação inalcançável
    // por construção via a API pública de buildContributionPlan sem antes
    // quebrar a própria invariante que ele protege (ver FIX 1 no spec);
    // coberto indiretamente pelo teste de 100.000 iterações legítimas, que
    // prova que o guard não dispara falsamente.
    if (iterationCount > maxIterations) {
      throw new Error(
        `buildContributionPlan: Phase 1 greedy loop exceeded its iteration cap (${maxIterations}) - this should be mathematically impossible and indicates a broken termination invariant, not a valid large plan`
      );
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
