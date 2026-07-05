# Fixtures Yahoo Finance — validação B3/BRL (Módulo 04)

- Capturado em: 2026-07-05T04:04:55.286Z
- Lib: yahoo-finance2@3.15.3
- Comando: `npx tsx tools/validation-br/capture-yahoo-fixtures.ts`
- Conteúdo: payloads públicos de mercado, sem dados pessoais.
- Política de atualização: recapturar SOMENTE em drift detectado pelos
  smoke tests live (`nx run api:test-live`) ou upgrade da lib — registrar
  o motivo em docs/br-customization/04-relatorio-validacao.md.

## Arquivos

- quote.bova11.sa.json
- quote.ivvb11.sa.json
- quote.mxrf11.sa.json
- quote.hglg11.sa.json
- quote.aapl34.sa.json
- quote.index-bvsp.json
- quotesummary.bova11.sa.json
- chart.historical.bova11.sa.json
- chart.usdbrl.holiday-window.json
- chart.dividends.mxrf11.sa.json
- chart.dividends.hglg11.sa.json
- search.bova11.json
