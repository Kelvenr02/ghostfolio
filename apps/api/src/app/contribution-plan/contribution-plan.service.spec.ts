import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';

import { DataSource, PurchaseMode } from '@prisma/client';
import { Big } from 'big.js';

import { ContributionPlanService } from './contribution-plan.service';

function buildAllocationTargetItemDto(overrides: Record<string, unknown> = {}) {
  return {
    currency: 'BRL',
    dataSource: DataSource.YAHOO,
    minPurchaseValue: undefined,
    purchaseMode: PurchaseMode.DISCRETE,
    symbol: 'BOVA11.SA',
    targetPercentage: 100,
    ...overrides
  };
}

function buildTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    minPurchaseValue: null,
    purchaseMode: PurchaseMode.DISCRETE,
    symbolProfileId: 'profile-1',
    targetPercentage: 60,
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    userId: 'user-1',
    symbolProfile: {
      id: 'profile-1',
      currency: 'BRL',
      dataSource: DataSource.YAHOO,
      name: 'BOVA11',
      symbol: 'BOVA11.SA'
    },
    ...overrides
  };
}

function buildHolding(overrides: Record<string, unknown> = {}) {
  return {
    assetProfile: {
      currency: 'BRL',
      dataSource: DataSource.YAHOO,
      name: 'BOVA11',
      symbol: 'BOVA11.SA'
    },
    marketPrice: 130,
    valueInBaseCurrency: 780,
    ...overrides
  };
}

describe('ContributionPlanService', () => {
  let dataProviderServiceMock: { getQuotes: jest.Mock };
  let exchangeRateDataServiceMock: { toCurrency: jest.Mock };
  let marketDataServiceMock: { getLatest: jest.Mock };
  let portfolioServiceMock: { getDetails: jest.Mock };
  let transactionClientMock: {
    allocationTarget: {
      createMany: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    symbolProfile: { upsert: jest.Mock };
  };
  let prismaServiceMock: {
    $transaction: jest.Mock;
    allocationTarget: { findMany: jest.Mock };
  };
  let service: ContributionPlanService;

  beforeEach(() => {
    dataProviderServiceMock = {
      getQuotes: jest.fn().mockResolvedValue({})
    };
    exchangeRateDataServiceMock = {
      toCurrency: jest.fn((value: number, from: string, to: string) => {
        if (from === to) {
          return value;
        }

        return value * 5; // arbitrary deterministic conversion factor for tests
      })
    };
    marketDataServiceMock = {
      getLatest: jest.fn().mockResolvedValue(null)
    };
    portfolioServiceMock = {
      getDetails: jest.fn().mockResolvedValue({ holdings: {} })
    };
    transactionClientMock = {
      allocationTarget: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([])
      },
      symbolProfile: {
        upsert: jest.fn().mockImplementation(({ create }) =>
          Promise.resolve({
            id: `profile-${create.symbol}`,
            ...create
          })
        )
      }
    };
    prismaServiceMock = {
      $transaction: jest.fn((callback) => callback(transactionClientMock)),
      allocationTarget: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    service = new ContributionPlanService(
      dataProviderServiceMock as never,
      exchangeRateDataServiceMock as never,
      marketDataServiceMock as never,
      portfolioServiceMock as never,
      prismaServiceMock as never
    );
  });

  it('throws HttpException 422 TARGETS_NOT_CONFIGURED when the user has no allocation targets', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([]);

    await expect(
      service.createPlan({
        amount: 300,
        impersonationId: undefined,
        userId: 'user-1'
      })
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({ code: 'TARGETS_NOT_CONFIGURED' })
    });

    expect(portfolioServiceMock.getDetails).not.toHaveBeenCalled();
  });

  it('consumes portfolioService.getDetails with its default exclusion of isExcluded accounts, so the emergency fund never enters V', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget()
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({
      holdings: {
        'BOVA11.SA': buildHolding()
      }
    });

    await service.createPlan({
      amount: 300,
      impersonationId: 'impersonation-1',
      userId: 'user-1'
    });

    expect(portfolioServiceMock.getDetails).toHaveBeenCalledWith({
      impersonationId: 'impersonation-1',
      userId: 'user-1'
    });
  });

  it('maps a holding to the matching target by (dataSource, symbol) and feeds its valueInBaseCurrency as currentValue into the engine', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget({
        purchaseMode: PurchaseMode.DISCRETE,
        targetPercentage: 100
      })
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({
      holdings: {
        'BOVA11.SA': buildHolding({
          marketPrice: 130,
          valueInBaseCurrency: 780
        })
      }
    });

    const response = await service.createPlan({
      amount: 0,
      impersonationId: undefined,
      userId: 'user-1'
    });

    expect(response.totalValueBefore).toBe(780);
    expect(response.allocations[0]).toMatchObject({
      symbol: 'BOVA11.SA',
      allocationBeforeInPercentage: 100
    });
  });

  it('excludes a holding without a matching target from V and reports it via a HOLDING_NOT_IN_PLAN warning', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget({ symbolProfileId: 'profile-1', targetPercentage: 100 })
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({
      holdings: {
        'BOVA11.SA': buildHolding(),
        'RESERVA11.SA': buildHolding({
          assetProfile: {
            currency: 'BRL',
            dataSource: DataSource.YAHOO,
            name: 'Reserva',
            symbol: 'RESERVA11.SA'
          },
          marketPrice: 100,
          valueInBaseCurrency: 500
        })
      }
    });

    const response = await service.createPlan({
      amount: 0,
      impersonationId: undefined,
      userId: 'user-1'
    });

    expect(response.totalValueBefore).toBe(780);
    expect(response.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HOLDING_NOT_IN_PLAN',
          symbol: 'RESERVA11.SA'
        })
      ])
    );
  });

  it('resolves the unit price of a target-only asset (no current position) via dataProviderService.getQuotes', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget({ targetPercentage: 100 })
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({ holdings: {} });
    dataProviderServiceMock.getQuotes.mockResolvedValue({
      [getAssetProfileIdentifier({
        dataSource: DataSource.YAHOO,
        symbol: 'BOVA11.SA'
      })]: {
        currency: 'BRL',
        dataSource: DataSource.YAHOO,
        marketPrice: 130,
        marketState: 'open'
      }
    });

    const response = await service.createPlan({
      amount: 130,
      impersonationId: undefined,
      userId: 'user-1'
    });

    expect(dataProviderServiceMock.getQuotes).toHaveBeenCalledWith({
      items: [{ dataSource: DataSource.YAHOO, symbol: 'BOVA11.SA' }]
    });
    expect(response.orders).toEqual([
      expect.objectContaining({ symbol: 'BOVA11.SA', quantity: 1 })
    ]);
  });

  it('falls back to marketDataService.getLatest and emits a STALE_PRICE warning when no live quote is available', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget({ targetPercentage: 100 })
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({ holdings: {} });
    dataProviderServiceMock.getQuotes.mockResolvedValue({});
    marketDataServiceMock.getLatest.mockResolvedValue({
      date: new Date('2026-06-30T00:00:00.000Z'),
      marketPrice: 128
    });

    const response = await service.createPlan({
      amount: 128,
      impersonationId: undefined,
      userId: 'user-1'
    });

    expect(marketDataServiceMock.getLatest).toHaveBeenCalledWith({
      dataSource: DataSource.YAHOO,
      symbol: 'BOVA11.SA'
    });
    expect(response.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'STALE_PRICE', symbol: 'BOVA11.SA' })
      ])
    );
    expect(response.orders[0].unitPriceAsOf).toBe(
      new Date('2026-06-30T00:00:00.000Z').toISOString()
    );
  });

  it('throws HttpException 422 with the list of symbols without any price when no cascade step resolves one (PA-5, fail-loud)', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget({ targetPercentage: 100 })
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({ holdings: {} });
    dataProviderServiceMock.getQuotes.mockResolvedValue({});
    marketDataServiceMock.getLatest.mockResolvedValue(null);

    await expect(
      service.createPlan({
        amount: 300,
        impersonationId: undefined,
        userId: 'user-1'
      })
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'PRICE_UNAVAILABLE',
        symbols: ['BOVA11.SA']
      })
    });
  });

  it('converts a holding priced in a currency other than BRL via exchangeRateDataService.toCurrency', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget({
        targetPercentage: 100,
        symbolProfile: {
          id: 'profile-1',
          currency: 'USD',
          dataSource: DataSource.YAHOO,
          name: 'IVV',
          symbol: 'IVV'
        }
      })
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({
      holdings: {
        IVV: buildHolding({
          assetProfile: {
            currency: 'USD',
            dataSource: DataSource.YAHOO,
            name: 'IVV',
            symbol: 'IVV'
          },
          marketPrice: 20,
          valueInBaseCurrency: 100
        })
      }
    });

    await service.createPlan({
      amount: 100,
      impersonationId: undefined,
      userId: 'user-1'
    });

    expect(exchangeRateDataServiceMock.toCurrency).toHaveBeenCalledWith(
      20,
      'USD',
      'BRL'
    );
  });

  it('does not call exchangeRateDataService.toCurrency for an asset already priced in the base currency', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget({ targetPercentage: 100 })
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({
      holdings: { 'BOVA11.SA': buildHolding() }
    });

    await service.createPlan({
      amount: 0,
      impersonationId: undefined,
      userId: 'user-1'
    });

    expect(exchangeRateDataServiceMock.toCurrency).not.toHaveBeenCalled();
  });

  it('conserves amount exactly: sum(orders.amount) + residualAmount === contributionAmount, at the response level', async () => {
    prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
      buildTarget({
        purchaseMode: PurchaseMode.DISCRETE,
        targetPercentage: 70,
        symbolProfileId: 'profile-1',
        symbolProfile: {
          id: 'profile-1',
          currency: 'BRL',
          dataSource: DataSource.YAHOO,
          name: 'BOVA11',
          symbol: 'BOVA11.SA'
        }
      }),
      buildTarget({
        purchaseMode: PurchaseMode.CONTINUOUS,
        minPurchaseValue: 30,
        targetPercentage: 30,
        symbolProfileId: 'profile-2',
        symbolProfile: {
          id: 'profile-2',
          currency: 'BRL',
          dataSource: DataSource.MANUAL,
          name: 'Tesouro Selic 2029',
          symbol: 'TESOURO-SELIC-2029'
        }
      })
    ]);
    portfolioServiceMock.getDetails.mockResolvedValue({
      holdings: {
        'BOVA11.SA': buildHolding({ marketPrice: 130, valueInBaseCurrency: 0 })
      }
    });

    const response = await service.createPlan({
      amount: 300,
      impersonationId: undefined,
      userId: 'user-1'
    });

    const sumOrders = response.orders.reduce(
      (total, order) => total.plus(order.amount),
      new Big(0)
    );

    expect(sumOrders.plus(response.residualAmount).toNumber()).toBe(300);
  });

  describe('getTargets', () => {
    it('maps allocationTarget rows (with their included symbolProfile) to AllocationTarget', async () => {
      prismaServiceMock.allocationTarget.findMany.mockResolvedValue([
        buildTarget({
          id: 'target-1',
          minPurchaseValue: null,
          purchaseMode: PurchaseMode.DISCRETE,
          symbolProfileId: 'profile-1',
          targetPercentage: 60
        })
      ]);

      const response = await service.getTargets('user-1');

      expect(prismaServiceMock.allocationTarget.findMany).toHaveBeenCalledWith({
        include: { symbolProfile: true },
        where: { userId: 'user-1' }
      });
      expect(response).toEqual({
        targets: [
          {
            dataSource: DataSource.YAHOO,
            id: 'target-1',
            minPurchaseValue: undefined,
            name: 'BOVA11',
            purchaseMode: PurchaseMode.DISCRETE,
            symbol: 'BOVA11.SA',
            symbolProfileId: 'profile-1',
            targetPercentage: 60
          }
        ]
      });
    });

    it('returns an empty targets array when the user has no allocation targets', async () => {
      prismaServiceMock.allocationTarget.findMany.mockResolvedValue([]);

      const response = await service.getTargets('user-1');

      expect(response).toEqual({ targets: [] });
    });
  });

  describe('replaceTargets', () => {
    it('rejects with 422 when the sum of targetPercentage is not exactly 100', async () => {
      await expect(
        service.replaceTargets('user-1', {
          targets: [
            buildAllocationTargetItemDto({ targetPercentage: 60 }),
            buildAllocationTargetItemDto({
              symbol: 'IVVB11.SA',
              targetPercentage: 39.5
            })
          ]
        } as never)
      ).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({
          code: 'TARGET_PERCENTAGE_SUM_INVALID'
        })
      });

      expect(prismaServiceMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects with 422 when (dataSource, symbol) is duplicated across items', async () => {
      await expect(
        service.replaceTargets('user-1', {
          targets: [
            buildAllocationTargetItemDto({ targetPercentage: 60 }),
            buildAllocationTargetItemDto({ targetPercentage: 40 })
          ]
        } as never)
      ).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({ code: 'DUPLICATE_TARGET' })
      });

      expect(prismaServiceMock.$transaction).not.toHaveBeenCalled();
    });

    it('replaces the target set atomically inside a single $transaction: upserts SymbolProfile by dataSource_symbol, deletes the old targets, then recreates them', async () => {
      transactionClientMock.allocationTarget.findMany.mockResolvedValue([
        buildTarget({
          id: 'target-1',
          symbolProfileId: 'profile-BOVA11.SA',
          targetPercentage: 100,
          symbolProfile: {
            id: 'profile-BOVA11.SA',
            currency: 'BRL',
            dataSource: DataSource.YAHOO,
            name: undefined,
            symbol: 'BOVA11.SA'
          }
        })
      ]);

      const response = await service.replaceTargets('user-1', {
        targets: [buildAllocationTargetItemDto({ targetPercentage: 100 })]
      } as never);

      expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionClientMock.symbolProfile.upsert).toHaveBeenCalledWith({
        create: {
          currency: 'BRL',
          dataSource: DataSource.YAHOO,
          symbol: 'BOVA11.SA'
        },
        update: {},
        where: {
          dataSource_symbol: {
            dataSource: DataSource.YAHOO,
            symbol: 'BOVA11.SA'
          }
        }
      });
      expect(
        transactionClientMock.allocationTarget.deleteMany
      ).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(
        transactionClientMock.allocationTarget.createMany
      ).toHaveBeenCalledWith({
        data: [
          {
            minPurchaseValue: null,
            purchaseMode: PurchaseMode.DISCRETE,
            symbolProfileId: 'profile-BOVA11.SA',
            targetPercentage: 100,
            userId: 'user-1'
          }
        ]
      });
      expect(response.targets).toHaveLength(1);
    });

    it('upserts a SymbolProfile for a symbol never traded locally (no pre-existing row)', async () => {
      transactionClientMock.symbolProfile.upsert.mockResolvedValue({
        id: 'profile-new',
        currency: 'BRL',
        dataSource: DataSource.MANUAL,
        symbol: 'TESOURO-SELIC-2029'
      });
      transactionClientMock.allocationTarget.findMany.mockResolvedValue([
        buildTarget({
          id: 'target-new',
          symbolProfileId: 'profile-new',
          targetPercentage: 100,
          symbolProfile: {
            id: 'profile-new',
            currency: 'BRL',
            dataSource: DataSource.MANUAL,
            name: undefined,
            symbol: 'TESOURO-SELIC-2029'
          }
        })
      ]);

      await service.replaceTargets('user-1', {
        targets: [
          buildAllocationTargetItemDto({
            dataSource: DataSource.MANUAL,
            purchaseMode: PurchaseMode.CONTINUOUS,
            symbol: 'TESOURO-SELIC-2029',
            targetPercentage: 100
          })
        ]
      } as never);

      expect(transactionClientMock.symbolProfile.upsert).toHaveBeenCalledWith({
        create: {
          currency: 'BRL',
          dataSource: DataSource.MANUAL,
          symbol: 'TESOURO-SELIC-2029'
        },
        update: {},
        where: {
          dataSource_symbol: {
            dataSource: DataSource.MANUAL,
            symbol: 'TESOURO-SELIC-2029'
          }
        }
      });
      expect(
        transactionClientMock.allocationTarget.createMany
      ).toHaveBeenCalledWith({
        data: [
          {
            minPurchaseValue: 0,
            purchaseMode: PurchaseMode.CONTINUOUS,
            symbolProfileId: 'profile-new',
            targetPercentage: 100,
            userId: 'user-1'
          }
        ]
      });
    });
  });
});
