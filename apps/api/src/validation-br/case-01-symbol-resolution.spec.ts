/**
 * Módulo 04 — Caso 1 da matriz de validação: RESOLUÇÃO DE SÍMBOLOS B3.
 *
 * Exercita o YahooFinanceService REAL contra payloads reais do Yahoo
 * gravados como fixtures (ver fixtures/yahoo/README.md): getQuotes (com o
 * caminho de fallback via quoteSummary), getHistorical, search e
 * getAssetProfile para os símbolos do portfólio do usuário + ^BVSP.
 *
 * Executar: npx nx test api --test-file case-01-symbol-resolution.spec.ts
 */
import { YahooFinanceDataEnhancerService } from '@ghostfolio/api/services/data-provider/data-enhancer/yahoo-finance/yahoo-finance.service';
import { YahooFinanceService } from '@ghostfolio/api/services/data-provider/yahoo-finance/yahoo-finance.service';
import { parseDate } from '@ghostfolio/common/helper';

import { AssetClass, AssetSubClass, DataSource } from '@prisma/client';
import YahooFinance from 'yahoo-finance2';

import { loadValidationFixture } from './helpers/load-fixture';
import {
  YahooChartFixture,
  YahooQuoteFixture,
  YahooQuoteSummaryFixture,
  YahooSearchFixture
} from './helpers/validation-fixture.interface';

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chart: jest.fn(),
    quote: jest.fn(),
    quoteSummary: jest.fn(),
    search: jest.fn()
  }))
}));

const B3_QUOTE_FIXTURES = [
  'quote.bova11.sa.json',
  'quote.ivvb11.sa.json',
  'quote.mxrf11.sa.json',
  'quote.hglg11.sa.json',
  'quote.aapl34.sa.json'
];

describe('Caso 1 — resolução de símbolos .SA e ^BVSP', () => {
  let enhancerYahooFinanceMock: Record<string, jest.Mock>;
  let providerYahooFinanceMock: Record<string, jest.Mock>;
  let yahooFinanceService: YahooFinanceService;

  beforeEach(() => {
    (YahooFinance as unknown as jest.Mock).mockClear();

    const cryptocurrencyService = {
      isCryptocurrency: () => false
    } as never;

    // Ordem de construção define o índice da instância mockada:
    // [0] = instância interna do data enhancer, [1] = do provedor
    const yahooFinanceDataEnhancerService = new YahooFinanceDataEnhancerService(
      cryptocurrencyService
    );
    yahooFinanceService = new YahooFinanceService(
      cryptocurrencyService,
      yahooFinanceDataEnhancerService as never
    );

    const constructedInstances = (YahooFinance as unknown as jest.Mock).mock
      .results;
    enhancerYahooFinanceMock = constructedInstances[0].value;
    providerYahooFinanceMock = constructedInstances[1].value;
  });

  describe('getQuotes', () => {
    it('retorna preço em BRL para os 5 símbolos .SA e para ^BVSP', async () => {
      const quoteFixtures = [...B3_QUOTE_FIXTURES, 'quote.index-bvsp.json'].map(
        (fixtureFile) => {
          const [quote] = loadValidationFixture<YahooQuoteFixture[]>(
            `yahoo/${fixtureFile}`
          );

          return quote;
        }
      );

      providerYahooFinanceMock.quote.mockResolvedValueOnce(quoteFixtures);

      const response = await yahooFinanceService.getQuotes({
        symbols: [
          'BOVA11.SA',
          'IVVB11.SA',
          'MXRF11.SA',
          'HGLG11.SA',
          'AAPL34.SA',
          '^BVSP'
        ]
      });

      for (const quoteFixture of quoteFixtures) {
        const quote = response[quoteFixture.symbol];

        expect(quote).toBeDefined();
        expect(quote.currency).toBe('BRL');
        expect(quote.dataSource).toBe(DataSource.YAHOO);
        expect(quote.marketPrice).toBe(quoteFixture.regularMarketPrice);
        expect(quote.marketPrice).toBeGreaterThan(0);
        // Fixture capturada fora do pregão (marketState CLOSED)
        expect(quote.marketState).toBe('closed');
      }
    });

    it('usa o fallback quoteSummary quando quote() falha (instabilidade conhecida do Yahoo) e ainda resolve BRL', async () => {
      const quoteSummaryFixture =
        loadValidationFixture<YahooQuoteSummaryFixture>(
          'yahoo/quotesummary.bova11.sa.json'
        );

      providerYahooFinanceMock.quote.mockRejectedValueOnce(
        new Error('Invalid Crumb')
      );
      providerYahooFinanceMock.quoteSummary.mockResolvedValueOnce(
        quoteSummaryFixture
      );

      const response = await yahooFinanceService.getQuotes({
        symbols: ['BOVA11.SA']
      });

      expect(providerYahooFinanceMock.quoteSummary).toHaveBeenCalledWith(
        'BOVA11.SA'
      );
      expect(response['BOVA11.SA'].currency).toBe('BRL');
      expect(response['BOVA11.SA'].marketPrice).toBe(
        quoteSummaryFixture.price.regularMarketPrice
      );
    });
  });

  describe('getHistorical', () => {
    it('popula o histórico diário de BOVA11.SA com a data do pregão B3 SEM shift de dia, omitindo feriados (sem zero espúrio)', async () => {
      const chartFixture = loadValidationFixture<YahooChartFixture>(
        'yahoo/chart.historical.bova11.sa.json'
      );

      providerYahooFinanceMock.chart.mockResolvedValueOnce(chartFixture);

      const response = await yahooFinanceService.getHistorical({
        from: parseDate('2026-04-01'),
        symbol: 'BOVA11.SA',
        to: parseDate('2026-05-01')
      });

      const historicalDates = Object.keys(response['BOVA11.SA']).sort();

      // Todas as barras diárias chegam do Yahoo às 13h00 UTC (10h00 BRT,
      // abertura da B3) — o dia UTC coincide com o dia de pregão
      expect(historicalDates).toEqual(
        chartFixture.quotes.map(({ date }) => date.toISOString().slice(0, 10))
      );

      // Feriados: Sexta-feira Santa (03/04) e Tiradentes (21/04) não têm
      // pregão — devem estar AUSENTES, não zerados
      expect(historicalDates).toContain('2026-04-20');
      expect(historicalDates).toContain('2026-04-22');
      expect(historicalDates).not.toContain('2026-04-21');
      expect(historicalDates).not.toContain('2026-04-03');

      for (const date of historicalDates) {
        expect(response['BOVA11.SA'][date].marketPrice).toBeGreaterThan(0);
      }

      expect(response['BOVA11.SA']['2026-04-01'].marketPrice).toBe(
        chartFixture.quotes[0].close
      );
    });
  });

  describe('search', () => {
    it('encontra BOVA11.SA com moeda BRL (e caracteriza a classificação EQUITY/STOCK do caso 2)', async () => {
      const searchFixture = loadValidationFixture<YahooSearchFixture>(
        'yahoo/search.bova11.json'
      );
      const [quoteFixture] = loadValidationFixture<YahooQuoteFixture[]>(
        'yahoo/quote.bova11.sa.json'
      );

      providerYahooFinanceMock.search.mockResolvedValueOnce(searchFixture);
      providerYahooFinanceMock.quote.mockResolvedValueOnce([quoteFixture]);

      const { items } = await yahooFinanceService.search({
        query: 'BOVA11'
      });

      const bova11 = items.find(({ symbol }) => symbol === 'BOVA11.SA');

      expect(bova11).toBeDefined();
      expect(bova11.currency).toBe('BRL');
      expect(bova11.dataSource).toBe(DataSource.YAHOO);
      expect(bova11.assetClass).toBe(AssetClass.EQUITY);
      expect(bova11.assetSubClass).toBe(AssetSubClass.STOCK);
      expect(bova11.name).toBeTruthy();
    });
  });

  describe('getAssetProfile', () => {
    it('resolve o perfil de BOVA11.SA com currency BRL via data enhancer', async () => {
      const quoteSummaryFixture =
        loadValidationFixture<YahooQuoteSummaryFixture>(
          'yahoo/quotesummary.bova11.sa.json'
        );

      enhancerYahooFinanceMock.quoteSummary.mockResolvedValueOnce(
        quoteSummaryFixture
      );

      const assetProfile = await yahooFinanceService.getAssetProfile({
        symbol: 'BOVA11.SA'
      });

      expect(enhancerYahooFinanceMock.quoteSummary).toHaveBeenCalledWith(
        'BOVA11.SA',
        { modules: ['price', 'summaryProfile', 'topHoldings'] }
      );
      expect(assetProfile.currency).toBe('BRL');
      expect(assetProfile.symbol).toBe('BOVA11.SA');
      expect(assetProfile.dataSource).toBe(DataSource.YAHOO);
      // Caracterização (caso 2): ETF B3 chega como EQUITY/STOCK
      expect(assetProfile.assetClass).toBe(AssetClass.EQUITY);
      expect(assetProfile.assetSubClass).toBe(AssetSubClass.STOCK);
    });
  });
});
