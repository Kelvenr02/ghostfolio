/**
 * Módulo 04 — Caso 7 da matriz de validação: CONSUMO PELOS MÓDULOS 01-03.
 *
 * (a) Módulo 01: a série de benchmark do BcbService (CDI, BRL, densa) tem
 *     shape compatível com o histórico .SA do Yahoo para composição no
 *     gráfico de performance (benchmark-comparator) — mesmo formato de
 *     data, mesma unidade de resposta, cobertura no feriado B3.
 * (b) Módulo 03: o otimizador de aporte valora posições .SA com a cotação
 *     BRL correta e SEM fator de câmbio espúrio (base BRL).
 *
 * Executar: npx nx test api --test-file case-07-module-consumption.spec.ts
 */
import { ContributionPlanService } from '@ghostfolio/api/app/contribution-plan/contribution-plan.service';
import { BcbService } from '@ghostfolio/api/services/data-provider/bcb/bcb.service';
import { SgsIndexBuilderService } from '@ghostfolio/api/services/data-provider/bcb/sgs-index-builder.service';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';

import { DataSource, PurchaseMode } from '@prisma/client';
import { Big } from 'big.js';

import { loadValidationFixture } from './helpers/load-fixture';
import {
  YahooChartFixture,
  YahooQuoteFixture
} from './helpers/validation-fixture.interface';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

describe('Caso 7 — consumo pelos módulos 01-03', () => {
  describe('módulo 01: benchmark CDI (BCB) componível com histórico .SA (Yahoo) em BRL', () => {
    it('as duas séries usam o MESMO contrato { [yyyy-MM-dd]: { marketPrice } } e o CDI cobre o feriado B3', async () => {
      const bcbService = new BcbService(
        { get: () => undefined } as never,
        {
          marketData: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn()
          }
        } as never,
        {
          fetchObservations: jest.fn().mockResolvedValue([
            { date: '2026-04-17', rate: new Big('0.053400') },
            { date: '2026-04-20', rate: new Big('0.053400') },
            { date: '2026-04-22', rate: new Big('0.053400') }
          ])
        } as never,
        new SgsIndexBuilderService()
      );

      const cdiResponse = await bcbService.getHistorical({
        from: new Date('2026-04-17T00:00:00'),
        symbol: 'CDI',
        to: new Date('2026-04-23T00:00:00')
      });

      const bova11Fixture = loadValidationFixture<YahooChartFixture>(
        'yahoo/chart.historical.bova11.sa.json'
      );
      const bova11Response = Object.fromEntries(
        bova11Fixture.quotes.map(({ close, date }) => [
          date.toISOString().slice(0, 10),
          { marketPrice: close }
        ])
      );

      // Mesmo contrato de chave e valor nas duas fontes
      for (const response of [cdiResponse.CDI, bova11Response]) {
        for (const [date, { marketPrice }] of Object.entries(response)) {
          expect(date).toMatch(DATE_KEY_PATTERN);
          expect(marketPrice).toBeGreaterThan(0);
        }
      }

      // O índice CDI é DENSO: acumula/carrega nível no feriado B3
      // (Tiradentes) em que a B3 não tem pregão — o gráfico de benchmark
      // não ganha buraco nem zero por causa do calendário
      expect(cdiResponse.CDI['2026-04-21']).toBeDefined();
      expect(cdiResponse.CDI['2026-04-21'].marketPrice).toBeGreaterThan(0);
      expect(bova11Response['2026-04-21']).toBeUndefined();

      // Ambos declaram BRL (CDI via asset profile; BOVA11 via meta do chart)
      const cdiProfile = await bcbService.getAssetProfile({ symbol: 'CDI' });

      expect(cdiProfile.currency).toBe('BRL');
      expect(bova11Fixture.meta.currency).toBe('BRL');
    });
  });

  describe('módulo 03: otimizador de aporte valorando posição .SA em BRL', () => {
    it('usa a cotação BRL do provedor SEM chamar conversão de câmbio nem fallback de fechamento', async () => {
      const [bova11Quote] = loadValidationFixture<YahooQuoteFixture[]>(
        'yahoo/quote.bova11.sa.json'
      );
      const identifier = getAssetProfileIdentifier({
        dataSource: DataSource.YAHOO,
        symbol: 'BOVA11.SA'
      });

      const exchangeRateToCurrencyMock = jest.fn();
      const marketDataGetLatestMock = jest.fn();

      const contributionPlanService = new ContributionPlanService(
        {
          getQuotes: jest.fn().mockResolvedValue({
            [identifier]: {
              currency: bova11Quote.currency,
              dataSource: DataSource.YAHOO,
              marketPrice: bova11Quote.regularMarketPrice,
              marketState: 'closed'
            }
          })
        } as never,
        { toCurrency: exchangeRateToCurrencyMock } as never,
        { getLatest: marketDataGetLatestMock } as never,
        { getDetails: jest.fn().mockResolvedValue({ holdings: {} }) } as never,
        {
          allocationTarget: {
            findMany: jest.fn().mockResolvedValue([
              {
                minPurchaseValue: null,
                purchaseMode: PurchaseMode.DISCRETE,
                targetPercentage: 100,
                symbolProfile: {
                  currency: 'BRL',
                  dataSource: DataSource.YAHOO,
                  name: 'iShares Ibovespa Fundo de Índice',
                  symbol: 'BOVA11.SA'
                }
              }
            ])
          }
        } as never
      );

      const plan = await contributionPlanService.createPlan({
        amount: 1000,
        impersonationId: undefined,
        userId: 'validation-user'
      });

      const [order] = plan.orders;

      // Preço unitário = cotação BRL do Yahoo, intocada (171.11 na fixture)
      expect(order.symbol).toBe('BOVA11.SA');
      expect(order.unitPrice).toBe(bova11Quote.regularMarketPrice);

      // Quantidade inteira comprável com R$ 1.000 e valor coerente
      const expectedQuantity = Math.floor(
        1000 / bova11Quote.regularMarketPrice
      );

      expect(order.quantity).toBe(expectedQuantity);
      expect(order.amount).toBeCloseTo(
        expectedQuantity * bova11Quote.regularMarketPrice,
        2
      );

      // Base BRL + ativo BRL: NENHUMA conversão de câmbio (fator espúrio)
      // e NENHUM fallback STALE_PRICE de último fechamento
      expect(exchangeRateToCurrencyMock).not.toHaveBeenCalled();
      expect(marketDataGetLatestMock).not.toHaveBeenCalled();
      expect(
        plan.warnings.filter(({ code }) => code === 'STALE_PRICE')
      ).toHaveLength(0);
    });
  });
});
