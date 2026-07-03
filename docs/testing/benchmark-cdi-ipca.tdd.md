# Evidência TDD — Módulo 01: Benchmarks CDI/IPCA (provider BCB)

- **Plano-fonte**: sessão de planejamento de 2026-07-02 (plan mode, aprovado); jornadas derivadas do plano (seções 8 e 12).
- **Branch**: `feature/benchmark-cdi-ipca` (descendente de `personal`).

## Ciclos RED → GREEN (commits na branch, verificáveis por `git log`)

| Ciclo                                | RED (commit, evidência)                              | GREEN (commit, evidência)  |
| ------------------------------------ | ---------------------------------------------------- | -------------------------- |
| Núcleo puro `SgsIndexBuilderService` | `7b2c4818d` — 12/12 falhas runtime `NOT_IMPLEMENTED` | `a8dca2789` — 12/12 passed |
| Cliente HTTP `SgsClientService`      | `a32bd6cd1` — 11/11 falhas runtime                   | `c5835d4ac` — 11/11 passed |
| Orquestrador `BcbService`            | `3de9e9c9a` — 14/14 falhas runtime                   | `27e2d02c4` — 14/14 passed |

Comando por spec: `npx nx test api --test-file <caminho do spec>`.

## O que os testes garantem

| #   | Garantia                                                                                                                     | Spec                                | Resultado |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------- |
| 1   | Catálogo: CDI=SGS 12 (diária), IPCA=SGS 433 (mensal), BRL; lookbacks > defasagem de publicação                               | `bcb.constants.spec.ts` (3)         | PASS      |
| 2   | Índice recursivo `round8` ≡ forma fechada (amostra real jun/2026 e série sintética de 30 anos, drift ≤ 1e-6)                 | `sgs-index-builder.service.spec.ts` | PASS      |
| 3   | Carry exato em fins de semana e feriado real (Corpus Christi 04/06/2026); base 100 na 1ª observação                          | idem                                | PASS      |
| 4   | Step do IPCA no último dia do mês de referência (incl. 29/02 bissexto); constante intra-mês; sem extrapolação                | idem                                | PASS      |
| 5   | Incremental a partir da âncora persistida ≡ série integral (igualdade exata — idempotência de re-coleta)                     | idem                                | PASS      |
| 6   | Mês faltante no IPCA ⇒ erro explícito (nunca inflação silenciosamente perdida)                                               | idem                                | PASS      |
| 7   | Parse do payload real; malformado ⇒ erro tipado; valor vazio ⇒ skip + warn                                                   | `sgs-client.service.spec.ts`        | PASS      |
| 8   | Paginação ≤ 5 anos (limite de 10 anos da API, HTTP 406 sem retry); dedupe/sort                                               | idem                                | PASS      |
| 9   | Retry exponencial (1s, 2s) em erro de rede/5xx; desiste após 3 tentativas com log estruturado                                | idem                                | PASS      |
| 10  | Contrato `DataProviderInterface`: shape denso de `getHistorical`, âncora via Prisma, lookback do IPCA corrige janela recente | `bcb.service.spec.ts`               | PASS      |
| 11  | `getQuotes` = última MarketData (delayed, BRL), sem quote fabricado; degradação com log em falha de DB                       | idem                                | PASS      |
| 12  | Métodos honestos: `getDividends={}`, `search` catálogo, `canHandle` whitelist, `getAssetProfile` BRL                         | idem                                | PASS      |

## Gates finais

- Suíte completa `npm test`: 29 suites passed, 2 skipped, 0 falhas (4 projetos Nx) — sem regressão.
- `npx nx build api`: verde.
- Cobertura do diretório `bcb`: **98,91% stmts / 90% branch / 100% funcs / 98,87% lines** (gate: ≥80%).
- Superfície fora de `apps/api/src/services/data-provider/bcb/`: 1 linha no enum do `schema.prisma`, 1 migration, registro no `data-provider.module.ts`, docs.

## Lacunas intencionais

- Sem e2e novo (superfície client inalterada); validação funcional pelo runbook (`docs/br-customization/01-benchmark-cdi-ipca.md`) contra a Calculadora do Cidadão do BCB.
- Janela de revisão do IPCA (~3 dias fora da janela de 7d) documentada como limitação operacional, não coberta por teste de integração.
