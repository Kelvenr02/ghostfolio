# 01 - Benchmark CDI e IPCA

Benchmarks CDI e IPCA via API SGS do Banco Central (`api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados`), comparáveis à performance da carteira ao lado do Ibovespa (^BVSP via Yahoo Finance, nativo).

> Plano completo (decisões, trade-offs, matemática): sessão de planejamento de 2026-07-02.
> Implementação: `apps/api/src/services/data-provider/bcb/`.

## Arquitetura

- **`DataSource.BCB`** (enum Prisma + migration `20260703000000_add_data_source_bcb`, append-only e irreversível por design).
- **`BcbService`** implementa `DataProviderInterface` (Strategy, registrado no token DI `'DataProviderInterfaces'`), orquestrando:
  - **`SgsClientService`** — HTTP via `FetchService` + `AbortSignal.timeout`; paginação em janelas ≤ 5 anos (a API limita consultas de séries diárias a 10 anos — HTTP 406); retry exponencial limitado (3 tentativas: 1s, 2s); validação de payload (nunca confia na resposta); parse textual `dd/MM/yyyy → yyyy-MM-dd` e `valor` string → `Big`.
  - **`SgsIndexBuilderService`** — núcleo puro (sem IO): converte taxas em **índice sintético acumulado base 100**.
- Coleta, persistência (`MarketData`, state `CLOSE`), cron horário e endpoints de benchmark: **reuso integral do pipeline existente** — zero mudança em cron/filas/client.

## Séries e matemática (verificadas empiricamente em 2026-07-02)

| Série | Código SGS | Unidade                                                                            | Fator           | Materialização                                                                    |
| ----- | ---------- | ---------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| CDI   | 12         | % ao dia, só dias úteis (fonte já exclui feriados), defasagem D-1                  | `1 + valor/100` | diária densa; dias não úteis carregam o nível (CDI não acrua)                     |
| IPCA  | 433        | % ao mês, datado no 1º dia do mês de referência, publicado ~dia 10 do mês seguinte | `1 + valor/100` | step no **último dia do mês de referência** (semântica IBGE); constante intra-mês |

- Índice canônico: `I_t = round8(I_{t−1} × f_t)` em **Big.js** — o arredondamento a 8 casas por passo é parte da definição (erro relativo acumulado ≤ ~4·10⁻⁷ em 30 anos; sem ele os dígitos explodem).
- Atualização **incremental O(1)**: âncora = último valor persistido antes da janela estendida; re-coletas sobrepostas reproduzem os valores bit a bit (idempotência).
- **Lookback de refetch** (CDI 15d, IPCA 120d): janelas de 7 dias incorporam publicações atrasadas do IPCA; âncora além do lookback é final por construção.
- Base 100 na primeira data solicitada pelo pipeline (~10 anos para benchmarks). Rebase em prepend é inócuo: o endpoint de benchmark normaliza % por razão desde a startDate.
- **Sem extrapolação** do mês corrente do IPCA (a linha termina no último dado oficial; o restante é a semântica uniforme de "último nível conhecido" da plataforma).

## Runbook de ativação (zero código)

1. _(Opcional)_ env `DATA_SOURCES` += `"BCB"` — só é necessário para o símbolo aparecer no **search**/import do admin; criação de perfil, coleta e benchmark funcionam sem.
2. `npm run database:push` (dev) — aplica o enum `BCB` (produção: `prisma migrate deploy` usa a migration).
3. Admin → Market Data → **criar asset profile** `BCB` / `CDI` e `BCB` / `IPCA` (o `getAssetProfile` do provider resolve `currency: BRL` automaticamente).
4. Backfill: ação **Gather historical data** no perfil (ou `gatherMax`) — pagina sozinho.
5. No dialog do perfil, ativar o toggle **Benchmark** (property `BENCHMARKS`).
6. Registrar também **^BVSP** (Yahoo) como benchmark pelo mesmo toggle.
7. Página _Analysis_ → selecionar o benchmark no comparador. Usuário com `baseCurrency BRL`: fator cambial = 1 (sem conversão); outra moeda: o servidor aplica BRL→base relativo à startDate (efeito cambial, como ^BVSP para usuário USD).

## Validação

- Specs: `bcb.constants.spec.ts`, `sgs-index-builder.service.spec.ts` (12), `sgs-client.service.spec.ts` (11), `bcb.service.spec.ts` (14) — `npx nx test api --test-file apps/api/src/services/data-provider/bcb`.
- Aceite quantitativo: acumulado de um período fechado (ex.: ano de 2025) ≡ **Calculadora do Cidadão** do BCB (CDI e IPCA), tolerância ±0,01 p.p.

## Limitações conhecidas

- **Janela de revisão do IPCA**: entre o fim do mês de referência e a primeira coleta pós-publicação, ~3 dias podem reter o nível anterior **fora** da janela de 7 dias; autocorrige com _gather_ manual do símbolo (1 clique) ou `gatherMax`.
- Indisponibilidade do SGS: job falha com erro tipado + log (Bull re-tenta); demais símbolos não são afetados; a série retoma sozinha.
- Se o CDI um dia virar ativo **custodiado** (com atividades), a semântica de rebase da base 100 deixa de ser válida — invariante documentado no plano (o benchmark só usa razões).
