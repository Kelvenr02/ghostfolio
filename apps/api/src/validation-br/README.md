# Suíte de validação B3/BRL/Timezone (Módulo 04)

Suíte de VALIDAÇÃO (não de feature): prova que a cadeia Yahoo → MarketData →
câmbio → calculador → módulos BR funciona para tickers `.SA`, moeda-base BRL
e fuso America/Sao_Paulo. Relatório de evidências:
`docs/br-customization/04-relatorio-validacao.md`.

## Camadas

| Camada                        | Arquivos               | Como roda                                                                     |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| A — determinística (fixtures) | `case-0*.spec.ts`      | `npm test` / `npx nx test api --test-file src/validation-br` (offline)        |
| B — smoke live opt-in         | `case-0*.live-spec.ts` | `RUN_LIVE_PROVIDER_TESTS=true npx nx run api:test-live` (NUNCA no `npm test`) |
| C — visual manual             | roteiro no relatório   | checklist com a instância local rodando                                       |

Rodar um caso: `npx nx test api --test-file case-04-timezone.spec.ts`

## Fixtures

- `fixtures/yahoo/*.json`: payloads públicos reais (ver `fixtures/yahoo/README.md`
  para data de captura e versão da lib). Sem dados pessoais.
- Recaptura: `npx tsx tools/validation-br/capture-yahoo-fixtures.ts` — SOMENTE
  em drift detectado pela camada B ou upgrade da yahoo-finance2; registrar o
  motivo no relatório.
- `helpers/load-fixture.ts` revive strings ISO em `Date` (mesmo shape que a
  lib entrega em runtime).

## Mock da yahoo-finance2

`jest.mock('yahoo-finance2', ...)` substitui a classe antes do campo de
classe `private readonly yahooFinance = new YahooFinance(...)` executar.
As instâncias mockadas são recuperadas por ordem de construção via
`(YahooFinance as jest.Mock).mock.results[i].value` — `[0]` é a do data
enhancer, `[1]` a do provedor (quando ambos são construídos).

## Limitação conhecida

`quote()`/`quoteSummary()` exigem cookie/crumb do Yahoo e FALHAM sob Jest
("No set-cookie header present"), embora funcionem via tsx/produção. A camada
B usa apenas caminhos via `chart()` (sem crumb). Detalhes no relatório.
