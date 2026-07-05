/**
 * Módulo 04 — Caso 3 da matriz de validação: MOEDA-BASE BRL PONTA A PONTA.
 *
 * Exercita o ExchangeRateDataService REAL (pares sempre relativos a
 * DEFAULT_CURRENCY='USD', config.ts:83 — logo USDBRL) com MarketData
 * alimentado pela fixture real de câmbio. Cobre: conversão histórica
 * USD->BRL na data, curto-circuito BRL->BRL (fator 1 sem I/O) e o
 * MECANISMO dos campos ...WithCurrencyEffect para ativos BRL em base BRL
 * (IVVB11: ativo negociado em BRL que embute exposição cambial — deve ser
 * tratado como ativo BRL puro, sem efeito cambial explícito).
 *
 * Executar: npx nx test api --test-file case-03-base-currency-brl.spec.ts
 */
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { parseDate } from '@ghostfolio/common/helper';

import { DataSource } from '@prisma/client';

import { loadValidationFixture } from './helpers/load-fixture';
import { YahooChartFixture } from './helpers/validation-fixture.interface';

describe('Caso 3 — moeda-base BRL ponta a ponta', () => {
  let exchangeRateDataService: ExchangeRateDataService;
  let marketDataService: { get: jest.Mock; getRange: jest.Mock };
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

  describe('toCurrencyAtDate (conversão histórica na data)', () => {
    it('converte uma atividade em USD para a base BRL com a taxa USDBRL da data', async () => {
      const activityDate = parseDate('2026-04-22');
      const usdBrlRate = usdBrlCloseByDate['2026-04-22'];

      marketDataService.get.mockResolvedValueOnce({
        marketPrice: usdBrlRate
      });

      const valueInBaseCurrency =
        await exchangeRateDataService.toCurrencyAtDate(
          1000,
          'USD',
          'BRL',
          activityDate
        );

      // O par é montado relativo ao USD: símbolo USDBRL na MarketData
      expect(marketDataService.get).toHaveBeenCalledWith({
        dataSource: DataSource.YAHOO,
        date: activityDate,
        symbol: 'USDBRL'
      });
      expect(valueInBaseCurrency).toBeCloseTo(1000 * usdBrlRate, 8);
      expect(usdBrlRate).toBeGreaterThan(0);
    });

    it('BRL -> BRL em data passada: fator 1, SEM nenhuma consulta à MarketData', async () => {
      const value = await exchangeRateDataService.toCurrencyAtDate(
        171.11,
        'BRL',
        'BRL',
        parseDate('2026-04-22')
      );

      expect(value).toBe(171.11);
      expect(marketDataService.get).not.toHaveBeenCalled();
    });
  });

  describe('mecanismo dos campos ...WithCurrencyEffect para IVVB11 (ativo BRL, base BRL)', () => {
    it('getExchangeRatesByCurrency devolve fator 1 para TODAS as datas de BRLBRL, sem tocar a MarketData', async () => {
      // O calculador ROAI (portfolio-calculator.ts:239-245) multiplica cada
      // valor por exchangeRatesByCurrency['BRLBRL'][date] para produzir os
      // campos ...WithCurrencyEffect. Fator constante 1 == netPerformance
      // idêntico a netPerformanceWithCurrencyEffect: a performance exibida
      // do IVVB11 é exatamente a variação da cota em BRL, sem efeito
      // cambial explícito — a exposição USD embutida fica DENTRO do preço.
      const exchangeRates =
        await exchangeRateDataService.getExchangeRatesByCurrency({
          currencies: ['BRL'],
          endDate: parseDate('2026-04-30'),
          startDate: parseDate('2026-04-01'),
          targetCurrency: 'BRL'
        });

      const factors = Object.values(exchangeRates['BRLBRL']);

      expect(factors.length).toBeGreaterThanOrEqual(30);
      expect(factors.every((factor) => factor === 1)).toBe(true);
      expect(marketDataService.getRange).not.toHaveBeenCalled();
    });

    it('para um ativo em USD na base BRL o fator diário vem da série USDBRL real (efeito cambial existe)', async () => {
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

      expect(exchangeRates['USDBRL']['2026-04-22']).toBeCloseTo(
        usdBrlCloseByDate['2026-04-22'],
        8
      );
      // Fator != 1: ao contrário do IVVB11, um ativo em USD TEM efeito cambial
      expect(exchangeRates['USDBRL']['2026-04-22']).not.toBe(1);
    });
  });
});
