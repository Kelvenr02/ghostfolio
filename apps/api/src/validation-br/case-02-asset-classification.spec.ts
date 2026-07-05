/**
 * Módulo 04 — Caso 2 da matriz de validação: CLASSIFICAÇÃO DE ATIVOS.
 *
 * Teste de CARACTERIZAÇÃO (não de correção): o Yahoo devolve
 * quoteType='EQUITY' para TODO ativo listado na B3 — ETF (BOVA11, IVVB11),
 * FII (MXRF11, HGLG11) e BDR (AAPL34) — confirmado com evidência direta na
 * API em 2026-07-04 (ver fixtures/yahoo/quote.*.json). Consequência:
 * parseAssetClass classifica tudo como EQUITY/STOCK, sem distinguir
 * ETF/FII/BDR. O módulo 02 (tax-br) NÃO depende disso: classifica por tags
 * canônicas manuais — veredito espelhado no fim deste arquivo.
 *
 * Se este spec falhar um dia, o enhancer (ou o Yahoo) passou a distinguir
 * ativos B3 — atualizar fixtures e o relatório conscientemente.
 *
 * Executar: npx nx test api --test-file case-02-asset-classification.spec.ts
 */
import { CANONICAL_TAG_NAME_TO_FISCAL_CLASS } from '@ghostfolio/api/app/tax-br/tax-br.constants';
import { YahooFinanceDataEnhancerService } from '@ghostfolio/api/services/data-provider/data-enhancer/yahoo-finance/yahoo-finance.service';

import { AssetClass, AssetSubClass } from '@prisma/client';

import { loadValidationFixture } from './helpers/load-fixture';
import { YahooQuoteFixture } from './helpers/validation-fixture.interface';

describe('Caso 2 — classificação de ativos B3 (caracterização)', () => {
  let yahooFinanceDataEnhancerService: YahooFinanceDataEnhancerService;

  beforeAll(() => {
    yahooFinanceDataEnhancerService = new YahooFinanceDataEnhancerService({
      isCryptocurrency: () => false
    } as never);
  });

  describe('parseAssetClass com os quoteType REAIS capturados do Yahoo', () => {
    it.each([
      ['quote.bova11.sa.json', 'ETF de Ibovespa'],
      ['quote.ivvb11.sa.json', 'ETF de S&P 500'],
      ['quote.mxrf11.sa.json', 'FII de papel'],
      ['quote.hglg11.sa.json', 'FII de logística'],
      ['quote.aapl34.sa.json', 'BDR de Apple']
    ])(
      '%s (%s): Yahoo devolve EQUITY e o enhancer classifica como EQUITY/STOCK',
      (fixtureFile) => {
        const [quote] = loadValidationFixture<YahooQuoteFixture[]>(
          `yahoo/${fixtureFile}`
        );

        // Evidência primária: o próprio Yahoo não distingue o tipo real
        expect(quote.quoteType).toBe('EQUITY');
        expect(quote.currency).toBe('BRL');

        const { assetClass, assetSubClass } =
          yahooFinanceDataEnhancerService.parseAssetClass({
            quoteType: quote.quoteType,
            shortName: quote.shortName
          });

        expect(assetClass).toBe(AssetClass.EQUITY);
        expect(assetSubClass).toBe(AssetSubClass.STOCK);
      }
    );

    it('^BVSP: Yahoo devolve INDEX, que o enhancer NÃO mapeia (assetClass indefinido)', () => {
      const [quote] = loadValidationFixture<YahooQuoteFixture[]>(
        'yahoo/quote.index-bvsp.json'
      );

      expect(quote.quoteType).toBe('INDEX');

      const { assetClass, assetSubClass } =
        yahooFinanceDataEnhancerService.parseAssetClass({
          quoteType: quote.quoteType,
          shortName: quote.shortName
        });

      expect(assetClass).toBeUndefined();
      expect(assetSubClass).toBeUndefined();
    });

    it('o mapeamento ETF só é atingido com quoteType=ETF — que a B3 nunca recebe do Yahoo', () => {
      const { assetSubClass } = yahooFinanceDataEnhancerService.parseAssetClass(
        { quoteType: 'ETF', shortName: 'ISHARES IBOVESPA' }
      );

      expect(assetSubClass).toBe(AssetSubClass.ETF);
    });
  });

  describe('veredito para o módulo 02 (tax-br)', () => {
    it('a classificação fiscal por tags canônicas cobre ETF/BDR/FII — independente do quoteType do Yahoo (estratégia NECESSÁRIA e validada)', () => {
      expect(Object.keys(CANONICAL_TAG_NAME_TO_FISCAL_CLASS)).toEqual(
        expect.arrayContaining(['ETF', 'BDR', 'FII'])
      );
    });
  });
});
