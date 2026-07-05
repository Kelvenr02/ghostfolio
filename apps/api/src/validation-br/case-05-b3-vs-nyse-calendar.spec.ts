/**
 * Módulo 04 — Caso 5 da matriz de validação: CALENDÁRIO B3 != NYSE.
 *
 * Janela real de abril/2026, contendo Tiradentes (21/04, terça-feira,
 * feriado B3 com NYSE aberta) e Sexta-feira Santa (03/04). Evidência das
 * fixtures: o pregão da B3 NÃO existe em 21/04 (buraco no histórico de
 * BOVA11), mas o câmbio USDBRL (FX global, símbolo BRL=X) TEM taxa em
 * 21/04. O forward-fill de getExchangeRatesByCurrency precisa preencher
 * qualquer buraco remanescente sem exceção, sem NaN e sem zero espúrio.
 *
 * Executar: npx nx test api --test-file case-05-b3-vs-nyse-calendar.spec.ts
 */
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { parseDate } from '@ghostfolio/common/helper';

import { DataSource } from '@prisma/client';
import { eachDayOfInterval, format } from 'date-fns';

import { loadValidationFixture } from './helpers/load-fixture';
import { YahooChartFixture } from './helpers/validation-fixture.interface';

const DATE_FORMAT = 'yyyy-MM-dd';

describe('Caso 5 — feriado B3 com NYSE aberta (Tiradentes 21/04/2026)', () => {
  let usdBrlCloseByDate: { [date: string]: number };

  beforeAll(() => {
    const usdBrlFixture = loadValidationFixture<YahooChartFixture>(
      'yahoo/chart.usdbrl.holiday-window.json'
    );

    usdBrlCloseByDate = Object.fromEntries(
      usdBrlFixture.quotes.map(({ close, date }) => [
        date.toISOString().slice(0, 10),
        close
      ])
    );
  });

  describe('evidência do mundo real (fixtures congeladas de 2026-07-04)', () => {
    it('a B3 não tem pregão em 21/04 nem 03/04, mas tem nos dias úteis vizinhos', () => {
      const bova11Fixture = loadValidationFixture<YahooChartFixture>(
        'yahoo/chart.historical.bova11.sa.json'
      );

      const tradingDays = bova11Fixture.quotes.map(({ date }) =>
        date.toISOString().slice(0, 10)
      );

      expect(tradingDays).toContain('2026-04-20');
      expect(tradingDays).toContain('2026-04-22');
      expect(tradingDays).not.toContain('2026-04-21'); // Tiradentes
      expect(tradingDays).not.toContain('2026-04-03'); // Sexta-feira Santa
    });

    it('o câmbio USDBRL (FX global) TEM taxa em 21/04 — feriado B3 não abre buraco no câmbio', () => {
      expect(usdBrlCloseByDate['2026-04-21']).toBeGreaterThan(0);
    });
  });

  describe('forward-fill do câmbio sobre buracos de calendário', () => {
    let exchangeRateDataService: ExchangeRateDataService;
    let marketDataService: { get: jest.Mock; getRange: jest.Mock };

    beforeEach(() => {
      marketDataService = {
        get: jest.fn(),
        getRange: jest.fn()
      };

      exchangeRateDataService = new ExchangeRateDataService(
        {
          getDataSourceForExchangeRates: () => DataSource.YAHOO
        } as never,
        marketDataService as never,
        null,
        null
      );
    });

    it('preenche um buraco sintético em 21/04 com a taxa conhecida mais próxima — sem exceção, sem NaN, sem zero', async () => {
      // Cenário sintético: como se o câmbio TAMBÉM não tivesse taxa no
      // feriado (ex.: provedor de câmbio seguindo calendário B3)
      const marketDataRows = Object.entries(usdBrlCloseByDate)
        .filter(([date]) => date !== '2026-04-21')
        .map(([date, marketPrice]) => ({
          marketPrice,
          date: parseDate(date)
        }));

      marketDataService.getRange.mockResolvedValueOnce(marketDataRows);

      const exchangeRates =
        await exchangeRateDataService.getExchangeRatesByCurrency({
          currencies: ['USD'],
          endDate: parseDate('2026-04-30'),
          startDate: parseDate('2026-04-01'),
          targetCurrency: 'BRL'
        });

      const usdBrlRates = exchangeRates['USDBRL'];

      // O loop de preenchimento anda do fim para o início: o buraco de
      // 21/04 recebe a taxa conhecida seguinte (22/04)
      expect(usdBrlRates['2026-04-21']).toBe(usdBrlCloseByDate['2026-04-22']);

      // Nenhum dia da janela (incluindo fins de semana sem taxa) fica com
      // NaN ou zero espúrio — repetição controlada é o comportamento esperado
      for (const date of eachDayOfInterval({
        end: parseDate('2026-04-30'),
        start: parseDate('2026-04-01')
      })) {
        const rate = usdBrlRates[format(date, DATE_FORMAT)];

        expect(Number.isFinite(rate)).toBe(true);
        expect(rate).toBeGreaterThan(0);
      }
    });

    it('série real (com 21/04 presente): a taxa do feriado B3 é a do próprio dia, não uma repetição', async () => {
      const marketDataRows = Object.entries(usdBrlCloseByDate).map(
        ([date, marketPrice]) => ({
          marketPrice,
          date: parseDate(date)
        })
      );

      marketDataService.getRange.mockResolvedValueOnce(marketDataRows);

      const exchangeRates =
        await exchangeRateDataService.getExchangeRatesByCurrency({
          currencies: ['USD'],
          endDate: parseDate('2026-04-30'),
          startDate: parseDate('2026-04-01'),
          targetCurrency: 'BRL'
        });

      expect(exchangeRates['USDBRL']['2026-04-21']).toBeCloseTo(
        usdBrlCloseByDate['2026-04-21'],
        8
      );
    });
  });
});
