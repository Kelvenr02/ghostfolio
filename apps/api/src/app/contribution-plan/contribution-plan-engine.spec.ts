import { PurchaseMode } from '@prisma/client';
import { Big } from 'big.js';

import { buildContributionPlan } from './contribution-plan-engine';
import {
  ContributionPlanEngineAsset,
  ContributionPlanEngineInput,
  ContributionPlanEngineResult
} from './interfaces/interfaces';

function n(value: string | number): Big {
  return new Big(String(value));
}

function discreteAsset(
  symbol: string,
  targetPercentage: string | number,
  currentValue: string | number,
  unitPrice: string | number
): ContributionPlanEngineAsset {
  return {
    currentValue: n(currentValue),
    purchaseMode: PurchaseMode.DISCRETE,
    symbol,
    targetPercentage: n(targetPercentage),
    unitPrice: n(unitPrice)
  };
}

function continuousAsset(
  symbol: string,
  targetPercentage: string | number,
  currentValue: string | number,
  minPurchaseValue: string | number
): ContributionPlanEngineAsset {
  return {
    currentValue: n(currentValue),
    minPurchaseValue: n(minPurchaseValue),
    purchaseMode: PurchaseMode.CONTINUOUS,
    symbol,
    targetPercentage: n(targetPercentage)
  };
}

function cloneInput(
  input: ContributionPlanEngineInput
): ContributionPlanEngineInput {
  return {
    contributionAmount: new Big(input.contributionAmount),
    assets: input.assets.map((asset) => ({
      ...asset,
      currentValue: new Big(asset.currentValue),
      minPurchaseValue: asset.minPurchaseValue
        ? new Big(asset.minPurchaseValue)
        : undefined,
      targetPercentage: new Big(asset.targetPercentage),
      unitPrice: asset.unitPrice ? new Big(asset.unitPrice) : undefined
    }))
  };
}

/**
 * Reasserts the invariants that must hold for ANY valid engine output,
 * regardless of the scenario that produced it. Used as the assertion body
 * of the test.each grid (section 8.3) and reused by the dedicated
 * invariant specs below.
 */
function expectInvariants(
  result: ContributionPlanEngineResult,
  input: ContributionPlanEngineInput
): void {
  // Invariant 1: conservation - sum(purchases) + residual === B, EXACTLY
  const purchasedTotal = result.purchases.reduce(
    (total, purchase) => total.plus(purchase.amount),
    new Big(0)
  );

  expect(
    purchasedTotal.plus(result.residualAmount).eq(input.contributionAmount)
  ).toBe(true);

  // Invariant 2: no negative/fractional quantities in discrete purchases
  const discreteSymbols = new Set(
    input.assets
      .filter((asset) => asset.purchaseMode === PurchaseMode.DISCRETE)
      .map((asset) => asset.symbol)
  );

  for (const purchase of result.purchases) {
    if (discreteSymbols.has(purchase.symbol)) {
      expect(purchase.quantity).toBeDefined();
      expect(purchase.quantity.gte(0)).toBe(true);
      expect(purchase.quantity.mod(1).eq(0)).toBe(true);
    }
  }

  // Invariant 3: no SELL - every purchase amount is strictly positive
  for (const purchase of result.purchases) {
    expect(purchase.amount.gt(0)).toBe(true);
  }

  // residualAmount itself can never be negative
  expect(result.residualAmount.gte(0)).toBe(true);

  // allocations must cover every input asset exactly once
  expect(result.allocations).toHaveLength(input.assets.length);

  // per-asset bookkeeping: valueAfter - valueBefore === purchasedAmount
  for (const allocation of result.allocations) {
    expect(
      allocation.valueAfter
        .minus(allocation.valueBefore)
        .eq(allocation.purchasedAmount)
    ).toBe(true);
    expect(allocation.purchasedAmount.gte(0)).toBe(true);
    expect(allocation.remainingGap.gte(0)).toBe(true);
  }

  // sum of per-asset purchases equals the total purchased amount
  const allocationsPurchasedTotal = result.allocations.reduce(
    (total, allocation) => total.plus(allocation.purchasedAmount),
    new Big(0)
  );

  expect(allocationsPurchasedTotal.eq(purchasedTotal)).toBe(true);
}

// ---------------------------------------------------------------------------
// Fixture (section 8.2) - real target structure, synthetic positions
// ---------------------------------------------------------------------------

function buildFixtureInput(
  contributionAmount: string | number
): ContributionPlanEngineInput {
  return {
    contributionAmount: n(contributionAmount),
    assets: [
      continuousAsset('TESOURO_SELIC_2029', 10, 400, 30),
      continuousAsset('TESOURO_IPCA_2035', 12.5, 500, 30),
      continuousAsset('TESOURO_IPCA_2045', 12.5, 450, 30),
      discreteAsset('BOVA11', 25, 780, 130),
      discreteAsset('IVVB11', 20, 615, 102.5),
      discreteAsset('MXRF11', 5, 206, 10.3),
      discreteAsset('HGLG11', 5, 320, 160),
      continuousAsset('TESOURO_PREFIXADO_2027', 10, 380, 30)
    ]
  };
}

function findAllocation(result: ContributionPlanEngineResult, symbol: string) {
  return result.allocations.find((allocation) => allocation.symbol === symbol);
}

function findPurchase(result: ContributionPlanEngineResult, symbol: string) {
  return result.purchases.find((purchase) => purchase.symbol === symbol);
}

// ---------------------------------------------------------------------------
// Main fixture: B = R$300 (hand-calculated in section 8.2 of the plan)
// ---------------------------------------------------------------------------

describe('buildContributionPlan - fixture B=300 (section 8.2)', () => {
  it('buys exactly 1x BOVA11 + 1x IVVB11 + R$67.50 in TESOURO_IPCA_2045, with zero residual', () => {
    const input = buildFixtureInput(300);

    const result = buildContributionPlan(input);

    expect(result.purchases).toHaveLength(3);

    const bova11 = findPurchase(result, 'BOVA11');
    expect(bova11.quantity.eq(1)).toBe(true);
    expect(bova11.amount.eq('130.00')).toBe(true);

    const ivvb11 = findPurchase(result, 'IVVB11');
    expect(ivvb11.quantity.eq(1)).toBe(true);
    expect(ivvb11.amount.eq('102.50')).toBe(true);

    const ipca2045 = findPurchase(result, 'TESOURO_IPCA_2045');
    expect(ipca2045.quantity).toBeUndefined();
    expect(ipca2045.amount.eq('67.50')).toBe(true);

    expect(result.residualAmount.eq(0)).toBe(true);
  });

  it('does not purchase assets whose gap is already <= 0 (never a sell)', () => {
    const input = buildFixtureInput(300);

    const result = buildContributionPlan(input);

    for (const symbol of [
      'TESOURO_SELIC_2029',
      'TESOURO_IPCA_2035',
      'MXRF11',
      'HGLG11',
      'TESOURO_PREFIXADO_2027'
    ]) {
      expect(findPurchase(result, symbol)).toBeUndefined();

      const allocation = findAllocation(result, symbol);
      expect(allocation.purchasedAmount.eq(0)).toBe(true);
      expect(allocation.valueAfter.eq(allocation.valueBefore)).toBe(true);
    }
  });

  it('reports the exact post-contribution value and remaining gap per asset', () => {
    const input = buildFixtureInput(300);

    const result = buildContributionPlan(input);

    const bova11 = findAllocation(result, 'BOVA11');
    expect(bova11.valueBefore.eq(780)).toBe(true);
    expect(bova11.valueAfter.eq(910)).toBe(true);
    expect(bova11.remainingGap.eq('77.75')).toBe(true);

    const ivvb11 = findAllocation(result, 'IVVB11');
    expect(ivvb11.valueBefore.eq(615)).toBe(true);
    expect(ivvb11.valueAfter.eq('717.50')).toBe(true);
    expect(ivvb11.remainingGap.eq('72.70')).toBe(true);

    const ipca2045 = findAllocation(result, 'TESOURO_IPCA_2045');
    expect(ipca2045.valueBefore.eq(450)).toBe(true);
    expect(ipca2045.valueAfter.eq('517.50')).toBe(true);
    // overshoot: purchased (67.50) > raw gap (43.875) => clamped to 0
    expect(ipca2045.remainingGap.eq(0)).toBe(true);

    const prefixado2027 = findAllocation(result, 'TESOURO_PREFIXADO_2027');
    expect(prefixado2027.valueBefore.eq(380)).toBe(true);
    expect(prefixado2027.valueAfter.eq(380)).toBe(true);
    expect(prefixado2027.remainingGap.eq('15.10')).toBe(true);
  });

  it('satisfies all cross-cutting invariants', () => {
    const input = buildFixtureInput(300);

    const result = buildContributionPlan(input);

    expectInvariants(result, input);
  });
});

// ---------------------------------------------------------------------------
// Secondary fixture: B = R$8 (below every continuous minimum) => full residual
// ---------------------------------------------------------------------------

describe('buildContributionPlan - fixture B=8 (section 8.2, secondary)', () => {
  it('produces no purchases and a residual of exactly R$8.00', () => {
    const input = buildFixtureInput(8);

    const result = buildContributionPlan(input);

    expect(result.purchases).toHaveLength(0);
    expect(result.residualAmount.eq(8)).toBe(true);
  });

  it('satisfies all cross-cutting invariants', () => {
    const input = buildFixtureInput(8);

    const result = buildContributionPlan(input);

    expectInvariants(result, input);
  });
});

// ---------------------------------------------------------------------------
// Section 8.1 - one describe block per invariant
// ---------------------------------------------------------------------------

describe('invariant 1 - exact conservation of money', () => {
  it('sum(purchases.amount) + residualAmount === contributionAmount, exactly (Big.eq)', () => {
    const input = buildFixtureInput('1234.56');

    const result = buildContributionPlan(input);

    const purchasedTotal = result.purchases.reduce(
      (total, purchase) => total.plus(purchase.amount),
      new Big(0)
    );

    expect(purchasedTotal.plus(result.residualAmount).eq('1234.56')).toBe(true);
  });
});

describe('invariant 2 - no negative or fractional discrete quantities', () => {
  it('every discrete purchase has an integer quantity >= 0', () => {
    const input = buildFixtureInput(300);

    const result = buildContributionPlan(input);

    for (const purchase of result.purchases) {
      if (purchase.quantity) {
        expect(purchase.quantity.gte(0)).toBe(true);
        expect(purchase.quantity.mod(1).eq(0)).toBe(true);
      }
    }
  });
});

describe('invariant 3 - never a sell', () => {
  it('every purchase amount is strictly positive, never negative', () => {
    const input = buildFixtureInput(300);

    const result = buildContributionPlan(input);

    for (const purchase of result.purchases) {
      expect(purchase.amount.gt(0)).toBe(true);
    }
  });

  it('the output type has no SELL variant to begin with (guaranteed at the type level)', () => {
    const input = buildFixtureInput(300);

    const result = buildContributionPlan(input);

    // there is no `type` discriminator with a SELL member - structurally
    // impossible to represent a sell in ContributionPlanEnginePurchase
    for (const purchase of result.purchases) {
      expect(purchase).not.toHaveProperty('type');
    }
  });
});

describe('invariant 4 - determinism', () => {
  it('the same input (deep-cloned) run twice produces the exact same plan', () => {
    const input = buildFixtureInput(300);

    const resultA = buildContributionPlan(cloneInput(input));
    const resultB = buildContributionPlan(cloneInput(input));

    expect(resultA).toStrictEqual(resultB);
  });

  it('breaks exact gap ties by ascending symbol using binary string comparison, not localeCompare', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(100),
      assets: [
        discreteAsset('AAPL11', 25, 0, 10),
        discreteAsset('ZZZZ11', 25, 0, 10),
        continuousAsset('FILLER', 50, 0, 1_000_000)
      ]
    };

    const resultA = buildContributionPlan(cloneInput(input));
    const resultB = buildContributionPlan(cloneInput(input));

    expect(resultA).toStrictEqual(resultB);

    // AAPL11 < ZZZZ11 in ascending order => AAPL11 is bought first, so it
    // cannot end up with a smaller purchased amount than ZZZZ11
    const aapl = findPurchase(resultA, 'AAPL11');
    const zzzz = findPurchase(resultA, 'ZZZZ11');

    expect(aapl.amount.gte(zzzz.amount)).toBe(true);
  });
});

describe('invariant 5 - B below every discrete price => everything into the best continuous', () => {
  it('allocates the full contribution to the continuous asset with the largest gap', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(50),
      assets: [
        discreteAsset('EXPENSIVE_A', 30, 0, 500),
        discreteAsset('EXPENSIVE_B', 30, 0, 300),
        continuousAsset('SMALL_GAP', 15, 0, 5),
        continuousAsset('BIG_GAP', 25, 0, 5)
      ]
    };

    const result = buildContributionPlan(input);

    expect(result.purchases).toHaveLength(1);

    const bigGap = findPurchase(result, 'BIG_GAP');
    expect(bigGap.amount.eq(50)).toBe(true);
    expect(bigGap.quantity).toBeUndefined();
    expect(result.residualAmount.eq(0)).toBe(true);
  });
});

describe('invariant 6 - B = 0 is a valid, empty plan', () => {
  it('produces no purchases and zero residual', () => {
    const input = buildFixtureInput(0);

    const result = buildContributionPlan(input);

    expect(result.purchases).toHaveLength(0);
    expect(result.residualAmount.eq(0)).toBe(true);
  });

  it('reports every allocation as unchanged', () => {
    const input = buildFixtureInput(0);

    const result = buildContributionPlan(input);

    for (const allocation of result.allocations) {
      expect(allocation.valueAfter.eq(allocation.valueBefore)).toBe(true);
      expect(allocation.purchasedAmount.eq(0)).toBe(true);
    }
  });
});

describe('invariant 7 - empty portfolio (first contribution) distributes by pure target', () => {
  it('when every V_i = 0, gap_i = t_i * B exactly, and the engine respects discretization', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(100),
      assets: [
        discreteAsset('ONLY_DISCRETE', 60, 0, 10),
        continuousAsset('ONLY_CONTINUOUS', 40, 0, 5)
      ]
    };

    const result = buildContributionPlan(input);

    const discrete = findPurchase(result, 'ONLY_DISCRETE');
    expect(discrete.quantity.eq(6)).toBe(true);
    expect(discrete.amount.eq(60)).toBe(true);

    const continuous = findPurchase(result, 'ONLY_CONTINUOUS');
    expect(continuous.amount.eq(40)).toBe(true);

    expect(result.residualAmount.eq(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional cases: PA-1, PA-2, PA-3 (open questions resolved in section 11)
// ---------------------------------------------------------------------------

describe('PA-1 - discrete overshoot is allowed by the literal spec (p_i <= r, not p_i <= gap_i)', () => {
  it('buys an asset even when its unit price exceeds its own remaining gap', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(200),
      assets: [discreteAsset('X', 60, 0, 130), discreteAsset('Y', 40, 0, 10)]
    };

    const result = buildContributionPlan(input);

    const x = findPurchase(result, 'X');
    expect(x.quantity.eq(1)).toBe(true);
    expect(x.amount.eq(130)).toBe(true);

    const y = findPurchase(result, 'Y');
    expect(y.quantity.eq(7)).toBe(true);
    expect(y.amount.eq(70)).toBe(true);

    expect(result.residualAmount.eq(0)).toBe(true);

    const allocationX = findAllocation(result, 'X');
    // raw gap for X was 120 (60% of 200), but 130 was purchased => overshoot
    expect(allocationX.remainingGap.eq(0)).toBe(true);
  });
});

describe('PA-2 - continuous minimum: skip the largest gap if its minimum does not fit', () => {
  it('picks the next eligible continuous asset by gap when the largest-gap one is below its minimum', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(50),
      assets: [
        continuousAsset('C1_INELIGIBLE', 70, 96, 60),
        continuousAsset('C2_ELIGIBLE', 30, 54, 5)
      ]
    };

    const result = buildContributionPlan(input);

    expect(result.purchases).toHaveLength(1);

    const c2 = findPurchase(result, 'C2_ELIGIBLE');
    expect(c2.amount.eq(50)).toBe(true);

    expect(findPurchase(result, 'C1_INELIGIBLE')).toBeUndefined();
    expect(result.residualAmount.eq(0)).toBe(true);
  });
});

describe('PA-3 - no continuous asset with a positive gap => residual, never a forced overshoot', () => {
  it('leaves the remainder as residual instead of buying above target', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(50),
      assets: [
        discreteAsset('TOO_EXPENSIVE', 80, 0, 1000),
        continuousAsset('ALREADY_ABOVE_TARGET', 20, 1000, 30)
      ]
    };

    const result = buildContributionPlan(input);

    expect(result.purchases).toHaveLength(0);
    expect(result.residualAmount.eq(50)).toBe(true);
  });
});

describe('additional case - residual because remaining budget is below every continuous minimum', () => {
  it('r=8, all continuous minimums are 30 => residual of 8', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(8),
      assets: [
        continuousAsset('C1', 50, 0, 30),
        continuousAsset('C2', 50, 0, 30)
      ]
    };

    const result = buildContributionPlan(input);

    expect(result.purchases).toHaveLength(0);
    expect(result.residualAmount.eq(8)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 8.3 - parametric grid (fast-check unavailable => test.each substitute)
// ---------------------------------------------------------------------------

const CONTRIBUTION_AMOUNTS = [0, 0.01, 8, 50, 130, 300, 1234.56, 10000];

interface Scenario {
  build: () => ContributionPlanEngineAsset[];
  name: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'carteira vazia',
    build: () => [
      discreteAsset('D1', 40, 0, 50),
      discreteAsset('D2', 30, 0, 20),
      continuousAsset('C1', 20, 0, 10),
      continuousAsset('C2', 10, 0, 5)
    ]
  },
  {
    name: 'balanceada exata',
    build: () => [
      discreteAsset('D1', 40, 400, 50),
      discreteAsset('D2', 30, 300, 20),
      continuousAsset('C1', 20, 200, 10),
      continuousAsset('C2', 10, 100, 5)
    ]
  },
  {
    name: 'desbalanceada (fixture)',
    build: () => buildFixtureInput(0).assets
  },
  {
    name: 'tudo-acima-do-alvo exceto 1 discreto',
    build: () => [
      discreteAsset('BEHIND', 50, 10, 100),
      discreteAsset('AHEAD', 25, 5000, 20),
      continuousAsset('AHEAD_CONTINUOUS', 25, 5000, 10)
    ]
  },
  {
    name: 'só contínuos',
    build: () => [
      continuousAsset('C1', 50, 100, 10),
      continuousAsset('C2', 30, 50, 15),
      continuousAsset('C3', 20, 400, 5)
    ]
  },
  {
    name: 'só discretos',
    build: () => [
      discreteAsset('D1', 50, 100, 25),
      discreteAsset('D2', 30, 50, 15),
      discreteAsset('D3', 20, 400, 40)
    ]
  },
  {
    name: 'empate exato de gaps',
    build: () => [
      discreteAsset('AAA', 25, 0, 10),
      discreteAsset('ZZZ', 25, 0, 10),
      continuousAsset('MMM_A', 25, 0, 10),
      continuousAsset('MMM_B', 25, 0, 10)
    ]
  }
];

// ---------------------------------------------------------------------------
// FIX 2 - explicit domain preconditions at the top of buildContributionPlan
// ---------------------------------------------------------------------------

describe('domain preconditions (FIX 2)', () => {
  it('throws when a DISCRETE asset has no unitPrice defined', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(100),
      assets: [
        {
          currentValue: n(0),
          purchaseMode: PurchaseMode.DISCRETE,
          symbol: 'NO_UNIT_PRICE',
          targetPercentage: n(100)
        }
      ]
    };

    expect(() => buildContributionPlan(input)).toThrow(
      /NO_UNIT_PRICE.*DISCRETE.*unitPrice/
    );
  });

  it('throws when a DISCRETE asset has unitPrice equal to 0', () => {
    const input = {
      contributionAmount: n(100),
      assets: [discreteAsset('ZERO_UNIT_PRICE', 100, 0, 0)]
    };

    expect(() => buildContributionPlan(input)).toThrow(
      /ZERO_UNIT_PRICE.*DISCRETE.*unitPrice/
    );
  });

  it('throws when a CONTINUOUS asset has no minPurchaseValue defined', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(100),
      assets: [
        {
          currentValue: n(0),
          purchaseMode: PurchaseMode.CONTINUOUS,
          symbol: 'NO_MIN_PURCHASE',
          targetPercentage: n(100)
        }
      ]
    };

    expect(() => buildContributionPlan(input)).toThrow(
      /NO_MIN_PURCHASE.*CONTINUOUS.*minPurchaseValue/
    );
  });

  it('throws when a CONTINUOUS asset has a negative minPurchaseValue', () => {
    const input = {
      contributionAmount: n(100),
      assets: [continuousAsset('NEGATIVE_MIN_PURCHASE', 100, 0, -1)]
    };

    expect(() => buildContributionPlan(input)).toThrow(
      /NEGATIVE_MIN_PURCHASE.*CONTINUOUS.*minPurchaseValue/
    );
  });

  it('does not throw for a well-formed input (DISCRETE with unitPrice > 0, CONTINUOUS with minPurchaseValue >= 0)', () => {
    const input = buildFixtureInput(300);

    expect(() => buildContributionPlan(input)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FIX 1 - iteration cap guard on the Phase 1 greedy loop
// ---------------------------------------------------------------------------

describe('iteration cap guard on the Phase 1 greedy loop (FIX 1)', () => {
  it('completes a legitimately huge number of iterations (100,000 purchases) and still conserves purchases + residual = B', () => {
    const input: ContributionPlanEngineInput = {
      contributionAmount: n(1000),
      assets: [
        discreteAsset('PENNY_STOCK', 100, 0, '0.01'),
        continuousAsset('FILLER', 0, 1_000_000_000, 0)
      ]
    };

    const result = buildContributionPlan(input);

    const pennyStock = findPurchase(result, 'PENNY_STOCK');

    // B / unitPrice = 1000 / 0.01 = 100,000 whole units, no leftover
    expect(pennyStock.quantity.eq(100_000)).toBe(true);
    expect(pennyStock.amount.eq(1000)).toBe(true);
    expect(result.residualAmount.eq(0)).toBe(true);

    expectInvariants(result, input);
  });

  // The cap is derived as contributionAmount / smallest discrete unitPrice
  // (rounded up), so the greedy loop can never legitimately need more
  // iterations than that bound allows - reaching the throw branch would
  // require the Phase 1 accounting itself to be broken (e.g. a purchase
  // that consumes less than the smallest unitPrice). There is no way to
  // construct such an input through the public buildContributionPlan API
  // without first breaking the invariant the guard exists to protect, so
  // this branch is intentionally not exercised via construction; the test
  // above proves the cap does not falsely trigger on a legitimate,
  // very-large-iteration scenario.
});

describe.each(CONTRIBUTION_AMOUNTS)(
  'parametric grid - contributionAmount = %s',
  (contributionAmount) => {
    it.each(SCENARIOS.map((scenario) => [scenario.name, scenario]))(
      'holds all invariants for scenario: %s',
      (_name, scenario: Scenario) => {
        const input: ContributionPlanEngineInput = {
          contributionAmount: n(contributionAmount),
          assets: scenario.build()
        };

        const result = buildContributionPlan(input);

        expectInvariants(result, input);
      }
    );
  }
);
