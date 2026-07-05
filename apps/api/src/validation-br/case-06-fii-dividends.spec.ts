/**
 * Módulo 04 — Caso 6 da matriz de validação: DIVIDENDOS DE FII.
 *
 * Os rendimentos mensais de FIIs são o principal fluxo de renda passiva do
 * plano do usuário e alimentam a isenção do módulo 02 — esta validação é
 * crítica, não cosmética. Fixtures capturadas da API real em 2026-07-04
 * comprovam que chart(events=dividends) RETORNA os rendimentos mensais de
 * MXRF11.SA e HGLG11.SA (sem lacuna do provedor).
 *
 * Executar: npx nx test api --test-file case-06-fii-dividends.spec.ts
 */
import { YahooFinanceDataEnhancerService } from '@ghostfolio/api/services/data-provider/data-enhancer/yahoo-finance/yahoo-finance.service';
import { YahooFinanceService } from '@ghostfolio/api/services/data-provider/yahoo-finance/yahoo-finance.service';
import { parseDate } from '@ghostfolio/common/helper';

import YahooFinance from 'yahoo-finance2';

import { loadValidationFixture } from './helpers/load-fixture';
import { YahooChartFixture } from './helpers/validation-fixture.interface';

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chart: jest.fn(),
    quote: jest.fn(),
    quoteSummary: jest.fn(),
    search: jest.fn()
  }))
}));

describe('Caso 6 — rendimentos mensais de FII via getDividends', () => {
  let providerYahooFinanceMock: Record<string, jest.Mock>;
  let yahooFinanceService: YahooFinanceService;

  beforeEach(() => {
    (YahooFinance as unknown as jest.Mock).mockClear();

    const cryptocurrencyService = {
      isCryptocurrency: () => false
    } as never;

    yahooFinanceService = new YahooFinanceService(
      cryptocurrencyService,
      new YahooFinanceDataEnhancerService(cryptocurrencyService) as never
    );

    // [0] = instância do enhancer, [1] = do provedor (ordem de construção)
    providerYahooFinanceMock = (YahooFinance as unknown as jest.Mock).mock
      .results[1].value;
  });

  it.each([
    // MXRF11 paga ~R$ 0,10/cota/mês (valores reais da fixture)
    [
      'chart.dividends.mxrf11.sa.json',
      'MXRF11.SA',
      {
        '2026-01-02': 0.099922,
        '2026-02-02': 0.099922,
        '2026-03-02': 0.099922,
        '2026-04-01': 0.094926,
        '2026-05-04': 0.099922,
        '2026-06-01': 0.099922
      }
    ],
    // HGLG11 paga R$ 1,10/cota/mês
    [
      'chart.dividends.hglg11.sa.json',
      'HGLG11.SA',
      {
        '2026-01-02': 1.1,
        '2026-02-02': 1.1,
        '2026-03-02': 1.1,
        '2026-04-01': 1.1,
        '2026-05-04': 1.1,
        '2026-06-01': 1.1
      }
    ]
  ])(
    '%s: getDividends devolve os 6 rendimentos mensais com data BRT correta e valor exato',
    async (fixtureFile, symbol, expectedDividends) => {
      const chartFixture = loadValidationFixture<YahooChartFixture>(
        `yahoo/${fixtureFile}`
      );

      providerYahooFinanceMock.chart.mockResolvedValueOnce(chartFixture);

      const response = await yahooFinanceService.getDividends({
        from: parseDate('2026-01-01'),
        granularity: 'day',
        symbol,
        to: parseDate('2026-07-01')
      });

      expect(providerYahooFinanceMock.chart).toHaveBeenCalledWith(symbol, {
        events: 'dividends',
        interval: '1d',
        period1: '2026-01-01',
        period2: '2026-07-01'
      });

      const dividendsByDate = Object.fromEntries(
        Object.entries(response).map(([date, { marketPrice }]) => [
          date,
          marketPrice
        ])
      );

      // Datas e valores idênticos aos eventos reais capturados: os eventos
      // chegam às 13h00 UTC (10h00 BRT) e caem no dia de pregão correto
      expect(dividendsByDate).toEqual(expectedDividends);

      // Cadência mensal: um rendimento por mês, 6 meses distintos
      const distinctMonths = new Set(
        Object.keys(response).map((date) => date.slice(0, 7))
      );

      expect(distinctMonths.size).toBe(6);
    }
  );

  it('retorna {} (sem exceção) quando o Yahoo falha — lacuna silenciosa a registrar no relatório', async () => {
    providerYahooFinanceMock.chart.mockRejectedValueOnce(
      new Error('Yahoo indisponível')
    );

    const response = await yahooFinanceService.getDividends({
      from: parseDate('2026-01-01'),
      granularity: 'day',
      symbol: 'MXRF11.SA',
      to: parseDate('2026-07-01')
    });

    // Comportamento ATUAL (caracterização): erro vira {} + log, sem
    // propagação — quem consome não distingue "sem dividendos" de "falha"
    expect(response).toEqual({});
  });
});
