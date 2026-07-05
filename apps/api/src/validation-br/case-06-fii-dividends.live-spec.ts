/**
 * Módulo 04 — SMOKE LIVE opt-in do caso 6: rendimentos de FII na API REAL.
 * Usa apenas meses já ENCERRADOS (rendimento pago) para não flakear com o
 * provento do mês corrente ainda não anunciado.
 *
 * Executar: RUN_LIVE_PROVIDER_TESTS=true npx nx run api:test-live
 */
import { YahooFinanceDataEnhancerService } from '@ghostfolio/api/services/data-provider/data-enhancer/yahoo-finance/yahoo-finance.service';
import { YahooFinanceService } from '@ghostfolio/api/services/data-provider/yahoo-finance/yahoo-finance.service';

import { startOfMonth, subMonths } from 'date-fns';

const describeLive =
  process.env.RUN_LIVE_PROVIDER_TESTS === 'true' ? describe : describe.skip;

jest.setTimeout(60000);

describeLive(
  'LIVE — caso 6: dividendos mensais de FII na API real do Yahoo',
  () => {
    let yahooFinanceService: YahooFinanceService;

    beforeAll(() => {
      const cryptocurrencyService = {
        isCryptocurrency: () => false
      } as never;

      yahooFinanceService = new YahooFinanceService(
        cryptocurrencyService,
        new YahooFinanceDataEnhancerService(cryptocurrencyService) as never
      );
    });

    it('MXRF11.SA distribui rendimento mensal (janela dos 4 meses encerrados mais recentes)', async () => {
      const response = await yahooFinanceService.getDividends({
        from: startOfMonth(subMonths(new Date(), 4)),
        granularity: 'day',
        symbol: 'MXRF11.SA',
        to: startOfMonth(new Date())
      });

      const dividendDates = Object.keys(response);

      // Pelo menos 3 dos 4 meses encerrados devem ter rendimento pago
      expect(dividendDates.length).toBeGreaterThanOrEqual(3);

      const distinctMonths = new Set(
        dividendDates.map((date) => date.slice(0, 7))
      );

      expect(distinctMonths.size).toBe(dividendDates.length);

      for (const date of dividendDates) {
        // MXRF11 paga na casa de R$ 0,10/cota — valores fora de (0, 1) são
        // drift/anomalia do provedor a investigar
        expect(response[date].marketPrice).toBeGreaterThan(0);
        expect(response[date].marketPrice).toBeLessThan(1);
      }
    });
  }
);
