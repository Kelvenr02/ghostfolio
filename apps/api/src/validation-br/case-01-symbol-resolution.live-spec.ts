/**
 * Módulo 04 — SMOKE LIVE opt-in do caso 1: detecta DRIFT do provedor Yahoo
 * (moeda, instrumentType, resolução .SA) batendo na API REAL. Falha aqui
 * significa "o mundo mudou" (recapturar fixtures + revisar relatório), não
 * regressão de código.
 *
 * LIMITAÇÃO CONHECIDA (registrada no relatório): os endpoints quote() e
 * quoteSummary() da yahoo-finance2 exigem handshake de cookie/crumb que
 * FALHA sob o ambiente Jest ("No set-cookie header present in Yahoo's
 * response") embora funcione fora dele (o script de captura de fixtures usa
 * quote() com sucesso via tsx). Por isso este smoke usa apenas os caminhos
 * baseados em chart() — sem crumb — que cobrem resolução, moeda e
 * instrumentType. Drift de quote() é detectado indiretamente na recaptura
 * de fixtures.
 *
 * Executar: RUN_LIVE_PROVIDER_TESTS=true npx nx run api:test-live
 */
import { YahooFinanceDataEnhancerService } from '@ghostfolio/api/services/data-provider/data-enhancer/yahoo-finance/yahoo-finance.service';
import { YahooFinanceService } from '@ghostfolio/api/services/data-provider/yahoo-finance/yahoo-finance.service';

import { subDays } from 'date-fns';
import YahooFinance from 'yahoo-finance2';

const describeLive =
  process.env.RUN_LIVE_PROVIDER_TESTS === 'true' ? describe : describe.skip;

jest.setTimeout(60000);

describeLive(
  'LIVE — caso 1: resolução de símbolos .SA na API real do Yahoo',
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

    it('getHistorical resolve BOVA11.SA com pregões recentes e preços > 0', async () => {
      const response = await yahooFinanceService.getHistorical({
        from: subDays(new Date(), 14),
        symbol: 'BOVA11.SA',
        to: new Date()
      });

      const historicalDates = Object.keys(response['BOVA11.SA'] ?? {});

      // 14 dias corridos contêm ao menos 8 pregões (menos se houver feriados)
      expect(historicalDates.length).toBeGreaterThanOrEqual(6);

      for (const date of historicalDates) {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(response['BOVA11.SA'][date].marketPrice).toBeGreaterThan(0);
      }
    });

    it('chart() segue reportando BRL/America/Sao_Paulo/EQUITY para BOVA11.SA (se falhar: drift — recapturar fixtures)', async () => {
      const yahooFinance = new YahooFinance({
        suppressNotices: ['yahooSurvey']
      });

      const { meta } = await yahooFinance.chart('BOVA11.SA', {
        interval: '1d',
        period1: subDays(new Date(), 14),
        period2: new Date()
      });

      expect(meta.currency).toBe('BRL');
      expect(meta.exchangeTimezoneName).toBe('America/Sao_Paulo');
      // Premissa do caso 2 (classificação): toda a B3 chega como EQUITY
      expect(meta.instrumentType).toBe('EQUITY');
    });
  }
);
