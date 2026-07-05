/**
 * Captura fixtures do Yahoo Finance para a suíte de validação B3/BRL
 * (apps/api/src/validation-br). Script MANUAL, fora de qualquer target Nx.
 *
 * Uso: npx tsx tools/validation-br/capture-yahoo-fixtures.ts
 *
 * Payloads públicos de mercado, sem dados pessoais. A data de captura e a
 * versão da lib ficam registradas em fixtures/yahoo/README.md (gerado aqui).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YahooFinance from 'yahoo-finance2';

const FIXTURES_DIRECTORY = join(
  __dirname,
  '..',
  '..',
  'apps',
  'api',
  'src',
  'validation-br',
  'fixtures',
  'yahoo'
);

const B3_SYMBOLS = [
  'BOVA11.SA',
  'IVVB11.SA',
  'MXRF11.SA',
  'HGLG11.SA',
  'AAPL34.SA'
];

// Janela contendo Tiradentes (21/04/2026, terça-feira, feriado B3 com NYSE
// aberta) para o caso 5 (calendário B3 != NYSE).
const HOLIDAY_WINDOW = { period1: '2026-04-01', period2: '2026-05-01' };

// Janela de 6 meses de rendimentos mensais de FII para o caso 6.
const DIVIDEND_WINDOW = { period1: '2026-01-01', period2: '2026-07-01' };

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function writeFixture(fileName: string, payload: unknown) {
  const filePath = join(FIXTURES_DIRECTORY, fileName);

  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`  gravado: ${fileName}`);
}

function toFileName(symbol: string) {
  return symbol.replace('^', 'index-').replace('=', '-').toLowerCase();
}

async function main() {
  mkdirSync(FIXTURES_DIRECTORY, { recursive: true });

  const capturedFiles: string[] = [];

  console.log('quote() por símbolo (.SA + ^BVSP)...');
  for (const symbol of [...B3_SYMBOLS, '^BVSP']) {
    const quote = await yahooFinance.quote([symbol]);
    const fileName = `quote.${toFileName(symbol)}.json`;

    writeFixture(fileName, quote);
    capturedFiles.push(fileName);
  }

  console.log('quoteSummary() (caminho de fallback de getQuotes)...');
  const quoteSummary = await yahooFinance.quoteSummary('BOVA11.SA');
  writeFixture('quotesummary.bova11.sa.json', quoteSummary);
  capturedFiles.push('quotesummary.bova11.sa.json');

  console.log('chart() histórico BOVA11.SA (janela com feriado B3)...');
  const historicalChart = await yahooFinance.chart('BOVA11.SA', {
    interval: '1d',
    period1: HOLIDAY_WINDOW.period1,
    period2: HOLIDAY_WINDOW.period2
  });
  writeFixture('chart.historical.bova11.sa.json', historicalChart);
  capturedFiles.push('chart.historical.bova11.sa.json');

  console.log('chart() câmbio BRL=X / USDBRL (mesma janela do feriado)...');
  const exchangeRateChart = await yahooFinance.chart('BRL=X', {
    interval: '1d',
    period1: HOLIDAY_WINDOW.period1,
    period2: HOLIDAY_WINDOW.period2
  });
  writeFixture('chart.usdbrl.holiday-window.json', exchangeRateChart);
  capturedFiles.push('chart.usdbrl.holiday-window.json');

  console.log('chart() dividendos de FII (MXRF11, HGLG11)...');
  for (const symbol of ['MXRF11.SA', 'HGLG11.SA']) {
    const dividendChart = await yahooFinance.chart(symbol, {
      events: 'dividends',
      interval: '1d',
      period1: DIVIDEND_WINDOW.period1,
      period2: DIVIDEND_WINDOW.period2
    });
    const fileName = `chart.dividends.${toFileName(symbol)}.json`;

    writeFixture(fileName, dividendChart);
    capturedFiles.push(fileName);
  }

  console.log('search()...');
  const searchResult = await yahooFinance.search('BOVA11');
  writeFixture('search.bova11.json', searchResult);
  capturedFiles.push('search.bova11.json');

  const readme = [
    '# Fixtures Yahoo Finance — validação B3/BRL (Módulo 04)',
    '',
    `- Capturado em: ${new Date().toISOString()}`,
    `- Lib: yahoo-finance2@${
      JSON.parse(
        readFileSync(
          join(
            __dirname,
            '..',
            '..',
            'node_modules',
            'yahoo-finance2',
            'package.json'
          ),
          'utf8'
        )
      ).version
    }`,
    '- Comando: `npx tsx tools/validation-br/capture-yahoo-fixtures.ts`',
    '- Conteúdo: payloads públicos de mercado, sem dados pessoais.',
    '- Política de atualização: recapturar SOMENTE em drift detectado pelos',
    '  smoke tests live (`nx run api:test-live`) ou upgrade da lib — registrar',
    '  o motivo em docs/br-customization/04-relatorio-validacao.md.',
    '',
    '## Arquivos',
    ...capturedFiles.map((fileName) => `- ${fileName}`),
    ''
  ].join('\n');

  writeFileSync(join(FIXTURES_DIRECTORY, 'README.md'), readme);
  console.log('README.md das fixtures gerado.');
}

main().catch((error) => {
  console.error('Falha na captura:', error);
  process.exitCode = 1;
});
