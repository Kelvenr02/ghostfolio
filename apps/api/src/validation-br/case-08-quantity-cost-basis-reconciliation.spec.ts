/**
 * Módulo 04 — Caso 8 da matriz de validação: RECONCILIAÇÃO ENTRE MOTORES.
 *
 * Item 18 do diagnóstico BR (2026-07-05): o Tax-BR usa motores próprios
 * (EquityTaxCalculatorService/FixedIncomeTaxCalculatorService), separados do
 * PortfolioCalculator central usado por Allocations/Contribution Plan. A
 * unificação foi avaliada e rejeitada nesta rodada: o PortfolioCalculator não
 * modela segregação de day-trade nem datas de calendário B3
 * (toBrtCalendarDate), e forçar essa modelagem no motor central violaria a
 * regra do CLAUDE.md de preservar compatibilidade com o core/upstream. Este
 * teste é a alternativa obrigatória: uma guarda de regressão que falha alto
 * se as duas fontes da verdade divergirem em quantidade, ou em custo de
 * aquisição além da diferença já esperada/reconciliada de tratamento de taxa
 * de corretagem (ver comentário na asserção abaixo), para o mesmo conjunto
 * de atividades (cenário simples, só-compra, sem day-trade). Se este teste
 * passar, a duplicação documentada no item 18 segue sendo segura para uso;
 * se falhar, os dois motores divergiram silenciosamente e a unificação deve
 * ser reconsiderada.
 *
 * Executar: npx nx test api --test-file case-08-quantity-cost-basis-reconciliation.spec.ts
 */
import {
  activityDummyData,
  symbolProfileDummyData,
  userDummyData
} from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator-test-utils';
import { PortfolioCalculatorFactory } from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator.factory';
import { CurrentRateService } from '@ghostfolio/api/app/portfolio/current-rate.service';
import { CurrentRateServiceMock } from '@ghostfolio/api/app/portfolio/current-rate.service.mock';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { RedisCacheServiceMock } from '@ghostfolio/api/app/redis-cache/redis-cache.service.mock';
import { EquityTaxCalculatorService } from '@ghostfolio/api/app/tax-br/equity-tax-calculator.service';
import {
  ISymbolClassification,
  ITaxActivity
} from '@ghostfolio/api/app/tax-br/interfaces/interfaces';
import { roundToCents } from '@ghostfolio/api/app/tax-br/tax-br.helper';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { PortfolioSnapshotService } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service';
import { PortfolioSnapshotServiceMock } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service.mock';
import { parseDate } from '@ghostfolio/common/helper';
import { Activity } from '@ghostfolio/common/interfaces';
import { PerformanceCalculationType } from '@ghostfolio/common/types/performance-calculation-type.type';

import { DataSource, Type as ActivityType } from '@prisma/client';
import { Big } from 'big.js';

jest.mock('@ghostfolio/api/app/portfolio/current-rate.service', () => {
  return {
    CurrentRateService: jest.fn().mockImplementation(() => {
      return CurrentRateServiceMock;
    })
  };
});

jest.mock(
  '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service',
  () => {
    return {
      PortfolioSnapshotService: jest.fn().mockImplementation(() => {
        return PortfolioSnapshotServiceMock;
      })
    };
  }
);

jest.mock('@ghostfolio/api/app/redis-cache/redis-cache.service', () => {
  return {
    RedisCacheService: jest.fn().mockImplementation(() => {
      return RedisCacheServiceMock;
    })
  };
});

const SYMBOL = 'BOVA11.SA';
const ASSET_PROFILE_IDENTIFIER = `${DataSource.YAHOO}-${SYMBOL}`;

describe('Caso 8 — reconciliação de quantidade e preço médio (Tax-BR vs. PortfolioCalculator)', () => {
  it('bate quantidade e preço médio entre EquityTaxCalculatorService e PortfolioCalculator para o mesmo histórico de compras (sem day-trade)', async () => {
    // Duas compras simples do mesmo ativo BRL, em dias diferentes, cada uma
    // com uma taxa de corretagem distinta - o cenário mínimo em que "preço
    // médio ponderado" já não é trivial (não é só repetir o preço da última
    // compra).
    const purchases = [
      { date: '2026-06-01', fee: 5, quantity: 10, unitPrice: 130 },
      { date: '2026-06-15', fee: 3, quantity: 5, unitPrice: 140 }
    ];

    // --- Fonte A: EquityTaxCalculatorService (motor próprio do Tax-BR) ---
    const taxActivities: ITaxActivity[] = purchases.map(
      ({ date, fee, quantity, unitPrice }, index) => ({
        dataSource: DataSource.YAHOO,
        dateBrt: date,
        feeBrl: new Big(fee),
        grossValueBrl: new Big(quantity).times(unitPrice),
        id: `buy-${index}`,
        quantity: new Big(quantity),
        symbol: SYMBOL,
        tagNames: [],
        type: ActivityType.BUY,
        yearMonth: date.slice(0, 7)
      })
    );

    const classifications = new Map<string, ISymbolClassification>([
      [
        ASSET_PROFILE_IDENTIFIER,
        {
          assetProfileIdentifier: ASSET_PROFILE_IDENTIFIER,
          conflictingTagNames: [],
          dataSource: DataSource.YAHOO,
          fiscalClass: 'ETF',
          isConflicted: false,
          symbol: SYMBOL
        }
      ]
    ]);

    const { symbolStates } = new EquityTaxCalculatorService().compute(
      taxActivities,
      classifications
    );
    const taxBrState = symbolStates.get(ASSET_PROFILE_IDENTIFIER);

    // --- Fonte B: PortfolioCalculator (motor central de Allocations/Aporte) ---
    const configurationService = new ConfigurationService();
    const currentRateService = new CurrentRateService(null, null, null, null);
    const exchangeRateDataService = new ExchangeRateDataService(
      null,
      null,
      null,
      null
    );
    const portfolioSnapshotService = new PortfolioSnapshotService(null);
    const redisCacheService = new RedisCacheService(null, null);

    const portfolioCalculatorFactory = new PortfolioCalculatorFactory(
      configurationService,
      currentRateService,
      exchangeRateDataService,
      portfolioSnapshotService,
      redisCacheService
    );

    jest.useFakeTimers().setSystemTime(parseDate('2026-07-05').getTime());

    const activities: Activity[] = purchases.map(
      ({ date, fee, quantity, unitPrice }) => ({
        ...activityDummyData,
        date: new Date(date),
        feeInAssetProfileCurrency: fee,
        feeInBaseCurrency: fee,
        quantity,
        SymbolProfile: {
          ...symbolProfileDummyData,
          currency: 'BRL',
          dataSource: DataSource.YAHOO,
          name: 'iShares Ibovespa Fundo de Índice',
          symbol: SYMBOL
        },
        type: 'BUY',
        unitPriceInAssetProfileCurrency: unitPrice
      })
    );

    const portfolioCalculator = portfolioCalculatorFactory.createCalculator({
      activities,
      calculationType: PerformanceCalculationType.ROAI,
      currency: 'BRL',
      userId: userDummyData.id
    });

    const portfolioSnapshot = await portfolioCalculator.computeSnapshot();
    const [position] = portfolioSnapshot.positions;

    jest.useRealTimers();

    // --- Reconciliação ---
    // Quantidade: deve bater exatamente - não há motivo fiscal ou de
    // performance para as duas fontes divergirem aqui.
    expect(position.symbol).toBe(SYMBOL);
    expect(position.quantity.toString()).toBe(taxBrState.quantity.toString());

    // Custo/preço médio: as fontes NÃO devem bater em valor bruto, por
    // desenho - PortfolioCalculator.averagePrice é livre de taxa de
    // corretagem (a taxa vira `fee` à parte, para performance), enquanto
    // EquityTaxCalculatorService.averagePriceBrl inclui a taxa no custo de
    // aquisição (exigência da Receita Federal para apuração de ganho de
    // capital). A guarda de regressão real é: quantity x averagePrice (custo
    // fee-exclusive do motor central) somado à taxa total deve reconciliar
    // exatamente com o costBasisBrl fee-inclusive do Tax-BR. Se essa
    // igualdade quebrar, um dos dois motores divergiu silenciosamente em
    // quantidade ou em valor de compra/taxa - exatamente o risco do item 18
    // do diagnóstico. (Não se usa `position.investment` aqui porque esse
    // campo depende de cotação corrente via CurrentRateService, que este
    // teste não mocka para BOVA11.SA.)
    const coreCostBasisPlusFee = position.quantity
      .times(position.averagePrice)
      .plus(position.fee);

    expect(roundToCents(coreCostBasisPlusFee).toString()).toBe(
      roundToCents(taxBrState.costBasisBrl).toString()
    );
  });
});
