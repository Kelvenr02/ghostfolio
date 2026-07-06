import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  AllocationTargetItemDto,
  UpdateAllocationTargetsDto
} from '@ghostfolio/common/dtos';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';
import {
  AllocationTarget,
  ContributionPlanAllocation,
  ContributionPlanOrder,
  ContributionPlanResponse,
  ContributionPlanWarning,
  DataProviderResponse,
  PortfolioPosition
} from '@ghostfolio/common/interfaces';
import { AllocationDriftResponse } from '@ghostfolio/common/interfaces/responses/allocation-drift-response.interface';
import { AllocationTargetsResponse } from '@ghostfolio/common/interfaces/responses/allocation-targets-response.interface';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, Prisma, PurchaseMode } from '@prisma/client';
import { Big } from 'big.js';

import { PortfolioService } from '../portfolio/portfolio.service';
import { DRIFT_THRESHOLD_PERCENT } from './contribution-plan-drift.constants';
import { buildContributionPlan } from './contribution-plan-engine';
import { roundToCents } from './contribution-plan.helper';
import { ContributionPlanEngineInput } from './interfaces/interfaces';

type AllocationTargetWithSymbolProfile = Prisma.AllocationTargetGetPayload<{
  include: { symbolProfile: true };
}>;

// This fork is a single-user, Brazil-only instance (see CLAUDE.md) - the
// same hardcoded base currency the tax-br module already relies on.
const BASE_CURRENCY = 'BRL';
const PERCENT_ROUND_DECIMALS = 4;

interface ResolvedAsset {
  currentValue: Big;
  dataSource: DataSource;
  minPurchaseValue?: Big;
  name?: string;
  purchaseMode: PurchaseMode;
  symbol: string;
  targetPercentage: Big;
  unitPrice?: Big;
  unitPriceAsOf?: string;
}

interface PriceResolution {
  asOf: string;
  isStale: boolean;
  unitPrice: Big;
}

@Injectable()
export class ContributionPlanService {
  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly marketDataService: MarketDataService,
    private readonly portfolioService: PortfolioService,
    private readonly prismaService: PrismaService
  ) {}

  public async createPlan({
    amount,
    impersonationId,
    userId
  }: {
    amount: number;
    impersonationId: string;
    userId: string;
  }): Promise<ContributionPlanResponse> {
    const contributionAmount = roundToCents(new Big(amount));

    const { resolvedAssets, warnings } = await this.resolvePlanAssets({
      impersonationId,
      userId
    });

    const engineInput = this.buildEngineInput(
      resolvedAssets,
      contributionAmount
    );

    const result = buildContributionPlan(engineInput);

    return this.serializePlanResponse({
      contributionAmount,
      result,
      resolvedAssets,
      warnings
    });
  }

  // FIX 2 (refactor mecânico, sem mudança de comportamento): etapa 1 de
  // createPlan - carrega os alvos e os holdings, resolve preço unitário de
  // cada DISCRETE (com o batch de cotações do FIX 3, inalterado) e monta os
  // ResolvedAsset + warnings correspondentes. Lança os mesmos HttpException
  // de antes (TARGETS_NOT_CONFIGURED, PRICE_UNAVAILABLE) nos mesmos pontos.
  private async resolvePlanAssets({
    impersonationId,
    userId
  }: {
    impersonationId: string;
    userId: string;
  }): Promise<{
    resolvedAssets: ResolvedAsset[];
    warnings: ContributionPlanWarning[];
  }> {
    const targets = await this.prismaService.allocationTarget.findMany({
      where: { userId },
      include: { symbolProfile: true }
    });

    if (targets.length === 0) {
      throw new HttpException(
        {
          code: 'TARGETS_NOT_CONFIGURED',
          message:
            'Configure ao menos um alvo de alocação antes de calcular o plano de aporte.'
        },
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    const { holdings } = await this.portfolioService.getDetails({
      impersonationId,
      userId
    });

    const holdingsByIdentifier = new Map<string, PortfolioPosition>();

    for (const holding of Object.values(holdings)) {
      holdingsByIdentifier.set(
        getAssetProfileIdentifier({
          dataSource: holding.assetProfile.dataSource,
          symbol: holding.assetProfile.symbol
        }),
        holding
      );
    }

    const matchedIdentifiers = new Set<string>();
    const warnings: ContributionPlanWarning[] = [];
    const missingPriceSymbols: string[] = [];
    const resolvedAssets: ResolvedAsset[] = [];

    // FIX 3 (batch de cotações, N+1): coleta todos os (dataSource, symbol) de
    // alvos DISCRETE sem holding correspondente e resolve com UMA única
    // chamada a getQuotes, em vez de uma chamada por símbolo dentro do loop.
    // A cascata por símbolo (quote ausente -> marketDataService.getLatest com
    // aviso STALE_PRICE -> acumula em missingPriceSymbols -> 422) permanece
    // idêntica; apenas a origem da quote muda de "buscar agora" para
    // "consultar o mapa já resolvido".
    const quoteItemsByIdentifier = new Map<
      string,
      { dataSource: DataSource; symbol: string }
    >();

    for (const target of targets) {
      const identifier = getAssetProfileIdentifier({
        dataSource: target.symbolProfile.dataSource,
        symbol: target.symbolProfile.symbol
      });
      const holding = holdingsByIdentifier.get(identifier);

      if (
        target.purchaseMode === PurchaseMode.DISCRETE &&
        !holding &&
        !quoteItemsByIdentifier.has(identifier)
      ) {
        quoteItemsByIdentifier.set(identifier, {
          dataSource: target.symbolProfile.dataSource,
          symbol: target.symbolProfile.symbol
        });
      }
    }

    const quotesByIdentifier: { [identifier: string]: DataProviderResponse } =
      quoteItemsByIdentifier.size > 0
        ? await this.dataProviderService.getQuotes({
            items: Array.from(quoteItemsByIdentifier.values())
          })
        : {};

    for (const target of targets) {
      const identifier = getAssetProfileIdentifier({
        dataSource: target.symbolProfile.dataSource,
        symbol: target.symbolProfile.symbol
      });
      const holding = holdingsByIdentifier.get(identifier);

      if (holding) {
        matchedIdentifiers.add(identifier);
      }

      const currentValue = new Big(holding?.valueInBaseCurrency ?? 0);

      let unitPrice: Big | undefined;
      let unitPriceAsOf: string | undefined;

      if (target.purchaseMode === PurchaseMode.DISCRETE) {
        const priceResolution = await this.resolveUnitPrice({
          currency: target.symbolProfile.currency,
          dataSource: target.symbolProfile.dataSource,
          holding,
          quote: quotesByIdentifier[identifier],
          symbol: target.symbolProfile.symbol
        });

        if (!priceResolution) {
          missingPriceSymbols.push(target.symbolProfile.symbol);
          continue;
        }

        unitPrice = priceResolution.unitPrice;
        unitPriceAsOf = priceResolution.asOf;

        if (priceResolution.isStale) {
          warnings.push({
            code: 'STALE_PRICE',
            message: `Cotação de ${target.symbolProfile.symbol} indisponível em tempo real; usando o último fechamento (${priceResolution.asOf}).`,
            symbol: target.symbolProfile.symbol
          });
        }
      }

      resolvedAssets.push({
        currentValue,
        dataSource: target.symbolProfile.dataSource,
        minPurchaseValue:
          target.minPurchaseValue != null
            ? new Big(target.minPurchaseValue)
            : undefined,
        name: target.symbolProfile.name,
        purchaseMode: target.purchaseMode,
        symbol: target.symbolProfile.symbol,
        targetPercentage: new Big(target.targetPercentage),
        unitPrice,
        unitPriceAsOf
      });
    }

    if (missingPriceSymbols.length > 0) {
      throw new HttpException(
        {
          code: 'PRICE_UNAVAILABLE',
          message: `Não foi possível obter uma cotação para: ${missingPriceSymbols.join(', ')}.`,
          symbols: missingPriceSymbols
        },
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    for (const [identifier, holding] of holdingsByIdentifier) {
      if (!matchedIdentifiers.has(identifier)) {
        warnings.push({
          code: 'HOLDING_NOT_IN_PLAN',
          message: `${holding.assetProfile.symbol} está fora do plano de aporte porque não tem alvo configurado.`,
          symbol: holding.assetProfile.symbol
        });
      }
    }

    return { resolvedAssets, warnings };
  }

  // FIX 2 (refactor mecânico, sem mudança de comportamento): etapa 2 de
  // createPlan - mapeamento puro de ResolvedAsset[] para o input do engine
  // (aritmética sempre em Big.js, re-quantizada a centavos).
  private buildEngineInput(
    resolvedAssets: ResolvedAsset[],
    contributionAmount: Big
  ): ContributionPlanEngineInput {
    return {
      assets: resolvedAssets.map((asset) => ({
        currentValue: roundToCents(asset.currentValue),
        minPurchaseValue: asset.minPurchaseValue
          ? roundToCents(asset.minPurchaseValue)
          : undefined,
        purchaseMode: asset.purchaseMode,
        symbol: asset.symbol,
        targetPercentage: asset.targetPercentage,
        unitPrice: asset.unitPrice ? roundToCents(asset.unitPrice) : undefined
      })),
      contributionAmount
    };
  }

  // FIX 2 (refactor mecânico, sem mudança de comportamento): etapa 3 de
  // createPlan - traduz o resultado puro do engine (Big.js) para o
  // ContributionPlanResponse da API (numbers), incluindo o warning de
  // resíduo não alocado e os cálculos de percentual antes/depois.
  private serializePlanResponse({
    contributionAmount,
    result,
    resolvedAssets,
    warnings
  }: {
    contributionAmount: Big;
    result: ReturnType<typeof buildContributionPlan>;
    resolvedAssets: ResolvedAsset[];
    warnings: ContributionPlanWarning[];
  }): ContributionPlanResponse {
    if (result.residualAmount.gt(0)) {
      warnings.push({
        code: 'RESIDUAL_NOT_ALLOCATED',
        message: `R$ ${result.residualAmount.toFixed(2)} não coube em nenhum ativo-alvo neste mês.`
      });
    }

    const assetBySymbol = new Map(
      resolvedAssets.map((asset) => [asset.symbol, asset])
    );

    const totalValueBefore = result.allocations.reduce(
      (total, allocation) => total.plus(allocation.valueBefore),
      new Big(0)
    );
    const totalValueAfter = totalValueBefore.plus(contributionAmount);

    const allocations: ContributionPlanAllocation[] = result.allocations.map(
      (allocation) => {
        const asset = assetBySymbol.get(allocation.symbol);

        const allocationBeforeInPercentage = totalValueBefore.eq(0)
          ? new Big(0)
          : allocation.valueBefore
              .div(totalValueBefore)
              .times(100)
              .round(PERCENT_ROUND_DECIMALS, Big.roundHalfUp);
        const allocationAfterInPercentage = totalValueAfter.eq(0)
          ? new Big(0)
          : allocation.valueAfter
              .div(totalValueAfter)
              .times(100)
              .round(PERCENT_ROUND_DECIMALS, Big.roundHalfUp);

        return {
          allocationAfterInPercentage: allocationAfterInPercentage.toNumber(),
          allocationBeforeInPercentage: allocationBeforeInPercentage.toNumber(),
          deviationAfterInPercentage: allocationAfterInPercentage
            .minus(asset.targetPercentage)
            .round(PERCENT_ROUND_DECIMALS, Big.roundHalfUp)
            .toNumber(),
          purchasedAmount: roundToCents(allocation.purchasedAmount).toNumber(),
          remainingGapAmount: roundToCents(allocation.remainingGap).toNumber(),
          symbol: allocation.symbol,
          targetPercentage: asset.targetPercentage.toNumber()
        };
      }
    );

    const orders: ContributionPlanOrder[] = result.purchases.map((purchase) => {
      const asset = assetBySymbol.get(purchase.symbol);

      return {
        amount: roundToCents(purchase.amount).toNumber(),
        dataSource: asset.dataSource,
        name: asset.name,
        purchaseMode: asset.purchaseMode,
        quantity:
          asset.purchaseMode === PurchaseMode.DISCRETE
            ? purchase.quantity.toNumber()
            : undefined,
        symbol: purchase.symbol,
        unitPrice:
          asset.purchaseMode === PurchaseMode.DISCRETE
            ? asset.unitPrice.toNumber()
            : undefined,
        unitPriceAsOf:
          asset.purchaseMode === PurchaseMode.DISCRETE
            ? asset.unitPriceAsOf
            : undefined
      };
    });

    return {
      allocations,
      orders,
      warnings,
      contributionAmount: contributionAmount.toNumber(),
      residualAmount: roundToCents(result.residualAmount).toNumber(),
      totalValueAfter: roundToCents(totalValueAfter).toNumber(),
      totalValueBefore: roundToCents(totalValueBefore).toNumber()
    };
  }

  // Objetivo 1 + 2 do diagnóstico BR: expõe alvo % vs. atual % (e o flag de
  // desbalanceamento) sem depender do fluxo de simulação de aporte. Reaproveita
  // o mesmo par targets + PortfolioService.getDetails() de resolvePlanAssets,
  // mas lê `allocationInPercentage` (já calculado pelo PortfolioCalculator
  // central) em vez de recalcular um terceiro percentual - único motivo de não
  // chamar serializePlanResponse aqui, que soma apenas os ativos-alvo, e não a
  // carteira inteira.
  public async getAllocationDrift({
    impersonationId,
    userId
  }: {
    impersonationId: string;
    userId: string;
  }): Promise<AllocationDriftResponse> {
    const targets = await this.prismaService.allocationTarget.findMany({
      include: { symbolProfile: true },
      where: { userId }
    });

    if (targets.length === 0) {
      return {
        asOf: new Date().toISOString(),
        driftThresholdPercent: DRIFT_THRESHOLD_PERCENT,
        isDrifted: false,
        items: []
      };
    }

    const { holdings } = await this.portfolioService.getDetails({
      impersonationId,
      userId
    });

    const holdingsByIdentifier = new Map<string, PortfolioPosition>();

    for (const holding of Object.values(holdings)) {
      holdingsByIdentifier.set(
        getAssetProfileIdentifier({
          dataSource: holding.assetProfile.dataSource,
          symbol: holding.assetProfile.symbol
        }),
        holding
      );
    }

    let isDrifted = false;

    const items = targets.map((target) => {
      const identifier = getAssetProfileIdentifier({
        dataSource: target.symbolProfile.dataSource,
        symbol: target.symbolProfile.symbol
      });
      const holding = holdingsByIdentifier.get(identifier);

      const currentPercentage = new Big(holding?.allocationInPercentage ?? 0)
        .times(100)
        .round(PERCENT_ROUND_DECIMALS, Big.roundHalfUp);
      const targetPercentage = new Big(target.targetPercentage);
      const deviationInPercentage = currentPercentage
        .minus(targetPercentage)
        .round(PERCENT_ROUND_DECIMALS, Big.roundHalfUp);

      if (deviationInPercentage.abs().gt(DRIFT_THRESHOLD_PERCENT)) {
        isDrifted = true;
      }

      return {
        currentPercentage: currentPercentage.toNumber(),
        deviationInPercentage: deviationInPercentage.toNumber(),
        name: target.symbolProfile.name ?? undefined,
        symbol: target.symbolProfile.symbol,
        targetPercentage: targetPercentage.toNumber()
      };
    });

    return {
      isDrifted,
      items,
      asOf: new Date().toISOString(),
      driftThresholdPercent: DRIFT_THRESHOLD_PERCENT
    };
  }

  public async getTargets(userId: string): Promise<AllocationTargetsResponse> {
    const targets = await this.prismaService.allocationTarget.findMany({
      include: { symbolProfile: true },
      where: { userId }
    });

    return {
      targets: targets.map((target) => this.toAllocationTarget(target))
    };
  }

  public async replaceTargets(
    userId: string,
    { targets }: UpdateAllocationTargetsDto
  ): Promise<AllocationTargetsResponse> {
    this.validateTargetsOrThrow(targets);

    const currencyByIdentifier =
      await this.resolveCurrenciesForNewProfiles(targets);

    return this.prismaService.$transaction(async (prisma) => {
      const symbolProfileIdByTarget = new Map<
        (typeof targets)[number],
        string
      >();

      for (const target of targets) {
        const identifier = getAssetProfileIdentifier({
          dataSource: target.dataSource,
          symbol: target.symbol
        });

        const symbolProfile = await prisma.symbolProfile.upsert({
          create: {
            currency: currencyByIdentifier.get(identifier)!,
            dataSource: target.dataSource,
            symbol: target.symbol
          },
          update: {},
          where: {
            dataSource_symbol: {
              dataSource: target.dataSource,
              symbol: target.symbol
            }
          }
        });

        symbolProfileIdByTarget.set(target, symbolProfile.id);
      }

      await prisma.allocationTarget.deleteMany({ where: { userId } });

      await prisma.allocationTarget.createMany({
        data: targets.map((target) => ({
          minPurchaseValue:
            target.minPurchaseValue != null
              ? target.minPurchaseValue
              : target.purchaseMode === PurchaseMode.CONTINUOUS
                ? 0
                : null,
          purchaseMode: target.purchaseMode,
          symbolProfileId: symbolProfileIdByTarget.get(target),
          targetPercentage: target.targetPercentage,
          userId
        }))
      });

      const createdTargets = await prisma.allocationTarget.findMany({
        include: { symbolProfile: true },
        where: { userId }
      });

      return {
        targets: createdTargets.map((target) => this.toAllocationTarget(target))
      };
    });
  }

  // FIX 2 (refactor mecânico, sem mudança de comportamento): etapa 1 de
  // replaceTargets - valida que a soma dos percentuais-alvo é exatamente
  // 100% e que não há símbolo duplicado, lançando os mesmos HttpException
  // de antes (TARGET_PERCENTAGE_SUM_INVALID, DUPLICATE_TARGET).
  private validateTargetsOrThrow(targets: AllocationTargetItemDto[]): void {
    const sumOfTargetPercentages = targets.reduce(
      (total, target) => total.plus(new Big(String(target.targetPercentage))),
      new Big(0)
    );

    if (!sumOfTargetPercentages.eq(new Big(100))) {
      throw new HttpException(
        {
          code: 'TARGET_PERCENTAGE_SUM_INVALID',
          message: `A soma dos percentuais-alvo deve ser exatamente 100% (atual: ${sumOfTargetPercentages.toFixed(2)}%).`
        },
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    const seenIdentifiers = new Set<string>();

    for (const target of targets) {
      const identifier = getAssetProfileIdentifier({
        dataSource: target.dataSource,
        symbol: target.symbol
      });

      if (seenIdentifiers.has(identifier)) {
        throw new HttpException(
          {
            code: 'DUPLICATE_TARGET',
            message: `O ativo ${target.symbol} (${target.dataSource}) está duplicado nos alvos.`,
            symbol: target.symbol
          },
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }

      seenIdentifiers.add(identifier);
    }
  }

  // FIX 1 (CRITICAL, moeda autoritativa do servidor) + FIX 2 (refactor
  // mecânico, sem mudança de comportamento): etapa 2 de replaceTargets - o
  // cliente não é mais fonte de verdade para `currency` (o DTO não carrega
  // mais esse campo - ver update-allocation-targets.dto.ts). Para símbolos
  // que já têm SymbolProfile local, a moeda persistida é preservada (o
  // upsert em replaceTargets usa update: {} e não a toca). Para símbolos
  // novos, a moeda real é resolvida aqui via UMA chamada batch a
  // dataProviderService.getQuotes ANTES da transação; se algum símbolo novo
  // não puder ter a moeda resolvida, falha alto (422 CURRENCY_UNRESOLVED)
  // em vez de persistir um SymbolProfile com moeda adivinhada.
  private async resolveCurrenciesForNewProfiles(
    targets: AllocationTargetItemDto[]
  ): Promise<Map<string, string>> {
    const existingSymbolProfiles =
      await this.prismaService.symbolProfile.findMany({
        select: { currency: true, dataSource: true, symbol: true },
        where: {
          OR: targets.map((target) => ({
            dataSource: target.dataSource,
            symbol: target.symbol
          }))
        }
      });

    const currencyByIdentifier = new Map<string, string>();

    for (const profile of existingSymbolProfiles) {
      currencyByIdentifier.set(
        getAssetProfileIdentifier({
          dataSource: profile.dataSource,
          symbol: profile.symbol
        }),
        profile.currency
      );
    }

    const newTargets = targets.filter(
      (target) =>
        !currencyByIdentifier.has(
          getAssetProfileIdentifier({
            dataSource: target.dataSource,
            symbol: target.symbol
          })
        )
    );

    if (newTargets.length > 0) {
      const quotesByIdentifier = await this.dataProviderService.getQuotes({
        items: newTargets.map((target) => ({
          dataSource: target.dataSource,
          symbol: target.symbol
        }))
      });

      const unresolvedSymbols: string[] = [];

      for (const target of newTargets) {
        const identifier = getAssetProfileIdentifier({
          dataSource: target.dataSource,
          symbol: target.symbol
        });
        const quote = quotesByIdentifier[identifier];

        if (!quote?.currency) {
          unresolvedSymbols.push(target.symbol);
          continue;
        }

        currencyByIdentifier.set(identifier, quote.currency);
      }

      if (unresolvedSymbols.length > 0) {
        throw new HttpException(
          {
            code: 'CURRENCY_UNRESOLVED',
            message: `Não foi possível resolver a moeda para: ${unresolvedSymbols.join(', ')}.`,
            symbols: unresolvedSymbols
          },
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }
    }

    return currencyByIdentifier;
  }

  private toAllocationTarget(
    target: AllocationTargetWithSymbolProfile
  ): AllocationTarget {
    return {
      dataSource: target.symbolProfile.dataSource,
      id: target.id,
      minPurchaseValue: target.minPurchaseValue ?? undefined,
      name: target.symbolProfile.name ?? undefined,
      purchaseMode: target.purchaseMode,
      symbol: target.symbolProfile.symbol,
      symbolProfileId: target.symbolProfileId,
      targetPercentage: target.targetPercentage
    };
  }

  private async resolveUnitPrice({
    currency,
    dataSource,
    holding,
    quote,
    symbol
  }: {
    currency: string;
    dataSource: DataSource;
    holding: PortfolioPosition | undefined;
    quote: DataProviderResponse | undefined;
    symbol: string;
  }): Promise<PriceResolution | null> {
    if (holding) {
      return {
        asOf: new Date().toISOString(),
        isStale: false,
        unitPrice: this.convertToBaseCurrency(
          new Big(holding.marketPrice),
          holding.assetProfile.currency
        )
      };
    }

    if (quote) {
      return {
        asOf: new Date().toISOString(),
        isStale: false,
        unitPrice: this.convertToBaseCurrency(
          new Big(quote.marketPrice),
          quote.currency
        )
      };
    }

    const latest = await this.marketDataService.getLatest({
      dataSource,
      symbol
    });

    if (latest) {
      return {
        asOf: latest.date.toISOString(),
        isStale: true,
        unitPrice: this.convertToBaseCurrency(
          new Big(latest.marketPrice),
          currency
        )
      };
    }

    return null;
  }

  // FIX 1 (fronteira controlada Big.js <-> number): esta é a ÚNICA fronteira
  // do módulo em que a aritmética sai de Big.js. O ExchangeRateDataService
  // .toCurrency do upstream é number-only (não aceita nem devolve Big), então
  // não há como preservar precisão arbitrária atravessando essa chamada. Por
  // isso o resultado é imediatamente re-quantizado a centavos via
  // roundToCents logo abaixo, ANTES de qualquer decisão do engine (que só
  // enxerga valores já em centavos). Esta é uma exceção controlada e
  // documentada à regra do CLAUDE.md de manter toda a aritmética financeira
  // em Big.js - o desvio dura exatamente uma chamada de função.
  private convertToBaseCurrency(value: Big, currency: string): Big {
    if (currency === BASE_CURRENCY) {
      return roundToCents(value);
    }

    return roundToCents(
      new Big(
        this.exchangeRateDataService.toCurrency(
          value.toNumber(),
          currency,
          BASE_CURRENCY
        )
      )
    );
  }
}
