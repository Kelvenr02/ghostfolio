# 04 — Relatório de Validação B3 / BRL / Timezone

> Módulo 04 do fork BR. Branch `Feature/validacao-b3-brl`. Executado em
> 2026-07-05, fixtures capturadas em 2026-07-04 (`yahoo-finance2@3.15.3`).
> Suíte: `apps/api/src/validation-br/` (7 specs determinísticos, 40 testes,
> offline) + 2 smoke tests live opt-in. Comandos no README da suíte.

## Achados do search-first (pré-validação, com evidência direta na API)

| Fato                                                                                                              | Status                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `chart()` da yahoo-finance2 devolve `Date` JS (epoch×1000); barras diárias .SA chegam às 13h00 UTC (10h00 BRT)    | CONFIRMADO                                                              |
| `meta.currency='BRL'`, `exchangeTimezoneName='America/Sao_Paulo'`, `gmtoffset=-10800` para todos os .SA e ^BVSP   | CONFIRMADO                                                              |
| `quoteType` de BOVA11/IVVB11/MXRF11/HGLG11/AAPL34 = **todos `EQUITY`** (nem ETF B3 vem como ETF); ^BVSP = `INDEX` | CONFIRMADO — hipótese de risco do caso 2 confirmada de forma MAIS ampla |
| Dividendos de FII via `chart(events=div)` funcionam (MXRF11 ~R$0,0999/mês)                                        | CONFIRMADO — sem lacuna                                                 |
| `quote()`/`quoteSummary()` exigem cookie/crumb; lib valida schema (Zod)                                           | CONFIRMADO                                                              |

## Matriz de validação — resultados

| #   | Caso                              | Resultado                    | Evidência                                                                                                                                                                                                                                                                                                               | Implicação                                                                                                                                                                                                                 | Ação recomendada                                                                                                                              |
| --- | --------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resolução de símbolos .SA + ^BVSP | **PASS**                     | `case-01-symbol-resolution.spec.ts` (5 testes): getQuotes BRL/preço>0 p/ 5 .SA + ^BVSP; fallback quote→quoteSummary resolve BRL; getHistorical sem shift de dia e sem zero em feriado; search acha BOVA11.SA; getAssetProfile BRL                                                                                       | Portfólio inteiro do usuário resolve pelo provedor Yahoo em BRL                                                                                                                                                            | Nenhuma                                                                                                                                       |
| 2   | Classificação de ativos           | **PASS (caracterização)**    | `case-02-asset-classification.spec.ts` (8 testes): TODOS os .SA chegam como EQUITY→EQUITY/STOCK; ^BVSP (INDEX) não mapeado; tags canônicas do módulo 02 cobrem ETF/BDR/FII                                                                                                                                              | **Veredito: a estratégia de tags manuais do módulo 02 é NECESSÁRIA e está validada** — o Yahoo não distingue ETF/FII/BDR na B3. Risco latente p/ consumidores futuros de `assetSubClass`                                   | PA-2                                                                                                                                          |
| 3   | Moeda-base BRL ponta a ponta      | **PASS**                     | `case-03-base-currency-brl.spec.ts` (4 testes): toCurrencyAtDate usa USDBRL da data (par relativo a USD, config.ts:83); BRL→BRL fator 1 SEM I/O; `getExchangeRatesByCurrency` BRLBRL = 1 em todas as datas (mecanismo dos `...WithCurrencyEffect`) vs USDBRL = série real                                               | IVVB11 é tratado como ativo BRL puro: `netPerformance === netPerformanceWithCurrencyEffect` (fator constante 1 aplicado pelo calculador em portfolio-calculator.ts:239-245); performance exibida = variação da cota em BRL | Nota: prova por mecanismo + roteiro visual (abaixo); cálculo ROAI completo p/ IVVB11 não foi instanciado para não editar mocks compartilhados |
| 4   | Timezone                          | **PASS + 2 caracterizações** | `case-04-timezone.spec.ts` (14 testes): atividade 23h30 BRT de 31/01 → bucket `2026-01`; offset fixo −3h ≡ IANA para 2020-2026 em todas as estações; helpers UTC estáveis; TZ=UTC do Jest confirmado                                                                                                                    | Bucketing fiscal do módulo 02 correto para o uso real                                                                                                                                                                      | PA-1 (intraday) e PA-3 (pré-2019)                                                                                                             |
| 5   | Calendário B3 ≠ NYSE              | **PASS**                     | `case-05-b3-vs-nyse-calendar.spec.ts` (4 testes): Tiradentes 21/04/2026 sem pregão B3 (e 03/04 Sexta Santa), MAS câmbio USDBRL (FX global) TEM taxa em 21/04; buraco sintético é preenchido pelo forward-fill com a taxa conhecida seguinte, sem NaN/zero/exceção em toda a janela                                      | Feriado B3 não quebra câmbio nem gera zero espúrio no gráfico; buraco de pregão é omissão (correta), não zero                                                                                                              | Nenhuma; fixture fixa o ano 2026 (ver Riscos)                                                                                                 |
| 6   | Dividendos de FII                 | **PASS**                     | `case-06-fii-dividends.spec.ts` (3 testes): 6 rendimentos mensais de MXRF11 (0,099922/0,094926) e HGLG11 (1,10) com datas de pregão corretas; conferência com fonte oficial: MXRF11 anuncia R$ 0,10/cota e HGLG11 R$ 1,10/cota — valores do Yahoo conferem (MXRF11 com ajuste de arredondamento do provedor na 4ª casa) | getDividends alimenta a isenção de FII do módulo 02 sem lançamento manual                                                                                                                                                  | PA-4 (falha silenciosa `{}`)                                                                                                                  |
| 7   | Consumo pelos módulos 01-03       | **PASS**                     | `case-07-module-consumption.spec.ts` (2 testes): série CDI (BCB) e histórico BOVA11 (Yahoo) com contrato idêntico `{yyyy-MM-dd: {marketPrice}}`, ambos BRL; CDI DENSO cobre o feriado B3; otimizador valora BOVA11.SA com a cotação BRL intocada, SEM chamar `toCurrency` nem fallback STALE_PRICE                      | Benchmark CDI + ^BVSP componíveis no gráfico; otimizador sem câmbio espúrio                                                                                                                                                | Nenhuma                                                                                                                                       |

### Smoke tests live (opt-in, executados 1× em 2026-07-05)

| Spec                                     | Resultado              | Observação                                                                                                                                           |
| ---------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case-06-fii-dividends.live-spec.ts`     | **PASS**               | Rendimentos reais de MXRF11 nos 4 meses encerrados, um por mês, na faixa esperada                                                                    |
| `case-01-symbol-resolution.live-spec.ts` | **PASS** (após ajuste) | Via `chart()`: pregões recentes de BOVA11 + meta BRL/America_Sao_Paulo/EQUITY. Ver PA-5: `quote()`/`quoteSummary()` falham SOB JEST por cookie/crumb |

Isolamento comprovado: `nx test api` roda 7 suites/40 testes (zero live);
`nx run api:test-live` sem `RUN_LIVE_PROVIDER_TESTS=true` → tudo skipped;
target `test-live` marcado `cache: false` (o cache do Nx replayava o run
skipped ignorando a env var — corrigido nesta branch).

## Correções pontuais nesta branch

**Nenhum `fix()` em código de produção foi necessário** — todos os 7 casos
passaram contra o comportamento existente. Mudanças de infraestrutura de
teste (não são fix de produto): `apps/api/jest.config.ts`
(+`testPathIgnorePatterns`), `apps/api/project.json` (+target `test-live`,
`cache: false`), `apps/api/jest.config.live.ts` (novo).

Critério vigente para futuros fixes nesta branch: ≤15 linhas de produção,
≤1 arquivo, sem schema/migration, sem mudança de assinatura pública
consumida por outro módulo, demonstrado por teste RED→GREEN, sem nova env
var/pacote. Fora disso → pergunta aberta.

## PERGUNTAS ABERTAS (decisão humana, NÃO corrigidas nesta branch)

1. **PA-1 — Bucket intraday em dia UTC** (`data-provider.service.ts:761-778`):
   coleta entre 21h e 00h BRT grava `MarketData.state=INTRADAY` com
   `date = dia UTC seguinte` ao pregão B3 (demonstrado em
   `case-04-timezone.spec.ts`). Impacto: cotação intraday do pregão D pode
   aparecer como D+1 até o fechamento oficial sobrescrever. Estrutural
   (afeta todos os provedores/mercados). Opções: aceitar (o CLOSE diário
   corrige depois) ou derivar a data do `exchangeTimezoneName`. Decidir se
   vale issue/patch dedicado.
2. **PA-2 — `parseAssetClass` não distingue ETF/FII/BDR na B3** (tudo
   EQUITY/STOCK, causa: o próprio Yahoo). Sem impacto nos módulos 01-03
   (módulo 02 usa tags manuais). Registrar como restrição para qualquer
   feature futura que confie em `assetSubClass` de ativos .SA.
3. **PA-3 — `toBrtCalendarDate` com offset fixo −3h** é exato pós-2019 e
   DIVERGE da IANA para datas com horário de verão pré-2019 (demonstrado no
   caso 4). Decidir se o módulo 02 precisa de guarda/aviso para atividades
   anteriores a nov/2019 (hoje o usuário não tem histórico dessa época).
4. **PA-4 — `getDividends` engole falha do provedor e retorna `{}`**
   (caracterizado no caso 6): quem consome não distingue "FII sem provento"
   de "Yahoo fora do ar" — risco de subestimar renda isenta no módulo 02 em
   mês com falha. Mitigação possível (fora do critério cirúrgico): propagar
   erro ou warning.
5. **PA-5 — cookie/crumb do Yahoo sob Jest**: `quote()`/`quoteSummary()`
   falham no ambiente Jest ("No set-cookie header present") embora funcionem
   via tsx/produção. O smoke live usa só `chart()`. Investigar (interferência
   do ambiente de teste na cookie jar da lib) apenas se um dia o smoke live
   precisar cobrir quote() diretamente.

## Riscos aceitos

- Fixtures congelam o ano-calendário 2026 (Tiradentes 21/04, Sexta Santa
  03/04); "expiram" narrativamente sem quebrar os testes.
- Smoke live pode flakear por anti-bot do Yahoo — falha lá é drift do mundo,
  não regressão; a política de recaptura está no README das fixtures.

## Roteiro de verificação visual (camada C — manual guiado)

Decisão registrada (aprovada em plan mode): SEM app e2e automatizado — o
repo não tem infra Cypress/Playwright e o custo/flakiness de criá-la para
2-3 fluxos numa instância pessoal single-user não se justifica. Executar com
`npm run start:server` + `npm run start:client` e marcar:

- [ ] Buscar "BOVA11" no Assistant/holdings → BOVA11.SA aparece com preço em R$
- [ ] Adicionar atividade BUY de BOVA11.SA → summary/holdings exibem valores
      formatados em BRL (R$ 1.234,56) com o locale do usuário
- [ ] Gráfico de performance (Analysis) com benchmark CDI e ^BVSP juntos:
      sem buraco/zero no feriado B3, séries em BRL
- [ ] Detalhe de MXRF11.SA mostra os rendimentos mensais (dividendos)
- [ ] Planejador de aporte com alvo BOVA11.SA: preço unitário = cotação BRL
      corrente, sem warning STALE_PRICE com o servidor de dados saudável
- [ ] Atividade lançada 23h30 (hora local BRT) do último dia do mês aparece
      no mês correto na Calculadora de IR

## Fechamento do ciclo (módulos 01-04)

Com este relatório, os 4 objetivos do CLAUDE.md estão entregues: 01 benchmark
CDI/IPCA (BCB/SGS), 02 calculadora de IR, 03 otimizador de aporte, 04 esta
validação end-to-end. Pendências vivas: as 5 perguntas abertas acima + itens
dos relatórios dos módulos anteriores.
