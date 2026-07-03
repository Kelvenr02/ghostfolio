# Notas de Arquitetura — Ghostfolio

> Gerado em 2026-07-02 por exploração em modo leitura do repositório, no commit `61fa33a07` (branch `personal`).
> Caminhos são relativos à raiz do repositório. Referências `arquivo:linha` valem para esse commit e podem defasar com o tempo.

## 1. Visão geral do monorepo (Nx)

Stack: **NestJS + Prisma (PostgreSQL) + Redis** (cache e filas **Bull** — `@nestjs/bull` 11 / `bull` 4.16, com painel `@bull-board`) no backend; **Angular** no frontend; workspace **Nx** com npm.

| Projeto Nx             | Caminho        | Descrição                                                                                                                                                                                                                         |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api` (defaultProject) | `apps/api/`    | Backend NestJS. Módulos de feature em `apps/api/src/app/` (ex.: `activities/`, `portfolio/`, `import/`, `user/`, `admin/`); serviços transversais em `apps/api/src/services/` (data providers, câmbio, market data, filas, cron). |
| `client`               | `apps/client/` | SPA Angular (componentes em `src/app/components/`, páginas em `src/app/pages/`, serviços em `src/app/services/`).                                                                                                                 |
| `common`               | `libs/common/` | Código compartilhado API↔client: `src/lib/config.ts` (constantes), `src/lib/helper.ts`, `interfaces/`, `dtos/`, `types/`.                                                                                                         |
| `ui`                   | `libs/ui/`     | Componentes Angular reutilizáveis (ex.: `src/lib/activities-table/`), com Storybook.                                                                                                                                              |

- Banco de dados: `prisma/schema.prisma` (datasource `postgresql`, `prisma/schema.prisma:8`), seed em `prisma/seed.mts`, migrações em `prisma/migrations/`.
- `nx.json`: testes unitários com Jest, e2e default dos generators é Cypress, `parallel: 1`, base `origin/main`.
- Documentação pré-existente (raiz): `README.md`, `DEVELOPMENT.md`, `CHANGELOG.md`, `SECURITY.md`. O diretório `docs/` foi criado junto com este arquivo.

## 2. Skills de agente (`.claude/skills` e `.agents/skills`)

A fonte real é `.agents/skills/`; `.claude/skills/` contém apenas **symlinks Git** para lá (no Windows sem suporte a symlink, aparecem como arquivos de texto de 38/42 bytes contendo `../../.agents/skills/<nome>`). Ambas as skills vieram do **upstream** do Ghostfolio (PRs #6823 e #6824) — não são customizações deste fork.

| Skill                                   | Autor / licença       | Conteúdo                                                                                                                           |
| --------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.agents/skills/angular-developer/`     | Google LLC, MIT, v1.0 | `SKILL.md` + 37 documentos em `references/` (signals, signal forms, DI, routing, SSR, ARIA, styling/Tailwind, testing, CLI etc.).  |
| `.agents/skills/nestjs-best-practices/` | Kadajett, MIT, v1.1.0 | `SKILL.md`, `AGENTS.md` + 40 regras em `rules/`, em 10 categorias (arch, api, di, db, error, security, perf, micro, test, devops). |

## 3. Provedores de dados de mercado

Tudo em `apps/api/src/services/data-provider/`. Há **9 provedores**; cada um implementa `DataProviderInterface` (`apps/api/src/services/data-provider/interfaces/data-provider.interface.ts:11`) com os métodos `canHandle`, `getAssetProfile`, `getDataProviderInfo`, `getDividends`, `getHistorical`, `getMaxNumberOfSymbolsPerRequest?`, `getName`, `getQuotes`, `getTestSymbol`, `search`.

| Provedor                   | Diretório (sob `data-provider/`) | `DataSource`              | Premium |
| -------------------------- | -------------------------------- | ------------------------- | ------- |
| Alpha Vantage              | `alpha-vantage/`                 | `ALPHA_VANTAGE`           | não     |
| CoinGecko                  | `coingecko/`                     | `COINGECKO`               | não     |
| EOD Historical Data        | `eod-historical-data/`           | `EOD_HISTORICAL_DATA`     | sim     |
| Financial Modeling Prep    | `financial-modeling-prep/`       | `FINANCIAL_MODELING_PREP` | sim     |
| Ghostfolio (proxy premium) | `ghostfolio/`                    | `GHOSTFOLIO`              | sim     |
| Google Sheets              | `google-sheets/`                 | `GOOGLE_SHEETS`           | não     |
| Manual (scraper/custom)    | `manual/`                        | `MANUAL`                  | não     |
| Rapid API                  | `rapid-api/`                     | `RAPID_API`               | não     |
| **Yahoo Finance**          | `yahoo-finance/`                 | `YAHOO`                   | não     |

O enum `DataSource` está em `prisma/schema.prisma:326-336`.

### Despachante: `DataProviderService`

`apps/api/src/services/data-provider/data-provider.service.ts:44`.

- Os 9 provedores são injetados como array no token DI `'DataProviderInterfaces'` (factory em `data-provider.module.ts:48-82`).
- `getDataProvider(DataSource)` (`:149`) seleciona pelo `getName()`; suporta remapeamento configurado pelo admin via property `PROPERTY_DATA_SOURCE_MAPPING`.
- `getDataSources()` (`:184`) lê a env `DATA_SOURCES`; adiciona `GHOSTFOLIO` quando a property `PROPERTY_API_KEY_GHOSTFOLIO` existe. Câmbio usa a env `DATA_SOURCE_EXCHANGE_RATES` (`getDataSourceForExchangeRates()` `:174`); importação usa `DATA_SOURCE_IMPORT`.
- `getQuotes` é cache-first (Redis, TTL `CACHE_QUOTES_TTL`), fatiado por `getMaxNumberOfSymbolsPerRequest`, e grava quotes intraday de volta na tabela `MarketData` (`:760-780`). `getHistorical` lê a tabela `MarketData` via `$queryRaw`; a busca ao vivo nos provedores é `getHistoricalRaw`. `search` consulta todos os provedores habilitados e mescla.

### Yahoo Finance (dois serviços distintos)

- **Provedor** (quotes/histórico/busca): `apps/api/src/services/data-provider/yahoo-finance/yahoo-finance.service.ts` — usa a lib npm **`yahoo-finance2`**. `getQuotes` (`:183`) via `quote()` com fallback por símbolo em `quoteSummary()`; `getHistorical`/`getDividends` via `chart()` (`1d`/`1mo`); máx. 50 símbolos/requisição; `getTestSymbol()` = `AAPL`; `canHandle()` sempre `true`; símbolo deslistado lança `AssetProfileDelistedError`.
- **Data enhancer** (perfil de ativo + conversão de símbolos): `apps/api/src/services/data-provider/data-enhancer/yahoo-finance/yahoo-finance.service.ts` — `convertToYahooFinanceSymbol` (`:75`; moeda → sufixo `=X`, ex. `USDCHF=X`; cripto → `BTC-USD`), `convertFromYahooFinanceSymbol` (`:51`; remove `=X`, prefixa `DEFAULT_CURRENCY`, caso especial `USDZAC → USDZAc`), `parseAssetClass` (`:294`; mapeia `quoteType` do Yahoo → `AssetClass`/`AssetSubClass`). Enhancers irmãos: `openfigi/` e `trackinsight/`, orquestrados por `data-enhancer/data-enhancer.service.ts`.

### Persistência e coleta

- `MarketDataService` (`apps/api/src/services/market-data/market-data.service.ts`): `get`, `getLatest`, `getRange`, `updateMarketData` (upsert), `updateMany`, `replaceForSymbol` etc. Modelo `MarketData` em `prisma/schema.prisma:118-134` — unique `[dataSource, date, symbol]`, `state` `CLOSE`/`INTRADAY`; **não tem campo de moeda** (o preço está implicitamente na moeda do `SymbolProfile`).
- Coleta em fila: `apps/api/src/services/queues/data-gathering/` (`data-gathering.service.ts` + `data-gathering.processor.ts`; métodos `gatherSymbol`, `gatherMax`, `gatherRecentMarketData`, `gatherAssetProfiles`...). Disparo horário por `apps/api/src/services/cron/cron.service.ts` (`runEveryHourAtRandomMinute` `:39`). Nomes/opções de jobs em `libs/common/src/lib/config.ts:176-192`. Filas irmãs: `portfolio-snapshot/`, `statistics-gathering/`.

## 4. Moeda e câmbio

Núcleo: **`ExchangeRateDataService`** — `apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts:34`.

- Pares de moeda são sempre construídos **relativos a `DEFAULT_CURRENCY = 'USD'`** (`libs/common/src/lib/config.ts:83`), na forma `USD<CUR>` (ex.: `USDBRL`); a direção oposta é derivada por inversão (`1/rate`). Conversões entre duas moedas não-USD passam indiretamente pelo USD.
- Métodos-chave:
  - `initialize()` (`:141`) — monta lista de moedas, fatores de moedas derivadas e pares; chama `loadCurrencies()`.
  - `loadCurrencies()` (`:166`) — busca as taxas de ontem via `getHistorical` + `getQuotes` do `DataProviderService` e preenche o mapa em memória `exchangeRates`.
  - `toCurrency(value, from, to)` (`:241`) — conversão síncrona com a taxa mais recente em memória.
  - `toCurrencyAtDate(value, from, to, date)` (`:281`) — conversão histórica (usa `MarketDataService.get()` para a data; fatores de moedas derivadas quando aplicável).
  - `getExchangeRatesByCurrency({...})` (`:58`) — **entrada principal da valoração de portfólio**: mapa por moeda de `data → taxa` para um intervalo, com forward-fill de dias sem cotação.
  - `prepareCurrencies()` (`:510`, privado) — união das moedas de contas + symbol profiles + property `CURRENCIES` + `USX` + derivadas.
- **Moedas derivadas** (`DERIVED_CURRENCIES`, `libs/common/src/lib/config.ts:158-174`): `GBp`→GBP, `ILA`→ILS, `ZAc`→ZAR, todas com fator 100. `USX` é tratado à parte (marketPrice fixo 100 no `DataProviderService`). Helpers compartilhados em `libs/common/src/lib/helper.ts`: `isDerivedCurrency` (`:444`), `isRootCurrency` (`:454`), `isCurrency` (`:422`), `getCurrencyFromSymbol` (`:239`).
- **Conversão na valoração de portfólio**: a classe base `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts` injeta o serviço e chama `getExchangeRatesByCurrency` (`:239-245`); aplica `exchangeRatesByCurrency[`${currency}${this.currency}`][date]` para produzir os campos `...WithCurrencyEffect` (`grossPerformanceWithCurrencyEffect`, `totalInvestmentWithCurrencyEffect` etc.). Variantes de calculador instanciadas por `calculator/portfolio-calculator.factory.ts`.

## 5. Cálculos de fees existentes

Fluxo do fee, da persistência ao resumo do portfólio:

1. **Persistência**: `Order.fee` (`Float`, não-nulo, `prisma/schema.prisma:144`), na moeda efetiva da atividade (`order.currency ?? SymbolProfile.currency`).
2. **Normalização de moeda** (única origem dos valores convertidos): `apps/api/src/app/activities/activities.service.ts` `getActivities` (`:746-789`) calcula, por atividade, `feeInAssetProfileCurrency` e `feeInBaseCurrency` via `toCurrencyAtDate`.
3. **Calculador (base)**: `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts` converte para `Big` (`:121-157`) e acumula por símbolo em `computeTransactionPoints` (`:928-1090`). Nuance: o `fee` por símbolo soma **todas** as atividades; já o campo `fees` do transaction point é preenchido **apenas** para atividades `type === 'FEE'` (`:1051-1055`).
4. **Calculador (ROAI)**: `calculator/roai/portfolio-calculator.ts` — `getSymbolMetrics` calcula `feeInBaseCurrency`/`feeInBaseCurrencyWithCurrencyEffect` por ordem (`:456-461`) e acumula `fees`/`feesWithCurrencyEffect` (`:576-580`); `calculateOverallPerformance` (`:30-114`) soma `totalFeesWithCurrencyEffect` sobre as posições com `includeInTotalAssetValue`.
5. **Exposição**: `getFeesInBaseCurrency()` na base (`:663-667`) retorna `snapshot.totalFeesWithCurrencyEffect`; `apps/api/src/app/portfolio/portfolio.service.ts` `getSummary` (`:1938`, `:2033-2049`) define `summary.fees` e `grossPerformance = netPerformance + fees`. Interface `PortfolioSummary` em `libs/common/src/lib/interfaces/portfolio-summary.interface.ts` (`fees: number`, `:17`).

Pontos importantes:

- **Só o calculador ROAI está implementado.** `mwr/`, `roi/` e `twr/` são stubs que lançam `'Method not implemented.'`. O default do usuário é ROAI (`apps/api/src/app/user/user.service.ts:316-318`); a seleção vem de `user.settings.performanceCalculationType` via `portfolio-calculator.factory.ts`.
- **Regra X-Ray de fees** (única): `FeeRatioTotalInvestmentVolume` (`apps/api/src/models/rules/fees/fee-ratio-total-investment-volume.ts`) — `feeRatio = fees / totalInvestmentVolume`, alerta acima do threshold (default 1%); registrada em `portfolio.service.ts:1346-1358` sob a chave `'fees'`.
- **Impostos (tax/withholding): não existem no código.** Busca repo-wide por `tax` só encontra um slogan de marketing em `libs/common/src/lib/personal-finance-tools.ts:240`. Não há tipo de atividade, campo ou cálculo de imposto.
- Exibição no cliente: `libs/ui/src/lib/activities-table/` (coluna Fee), `apps/client/src/app/components/portfolio-summary/` (linha Fees), `apps/client/src/app/components/holding-detail-dialog/`, formulário em `apps/client/src/app/pages/portfolio/activities/create-or-update-activity-dialog/`, parsing de CSV em `apps/client/src/app/services/import-activities.service.ts`.

## 6. Modelo de dados Activity/Order

### Prisma (`prisma/schema.prisma:136-162`)

```prisma
model Order {
  account         Account?      @relation(fields: [accountId, accountUserId], references: [id, userId])
  accountId       String?
  accountUserId   String?
  comment         String?
  createdAt       DateTime      @default(now())
  currency        String?
  date            DateTime
  fee             Float
  id              String        @id @default(uuid())
  isDraft         Boolean       @default(false)
  quantity        Float
  symbolProfileId String
  tags            Tag[]
  type            Type
  unitPrice       Float
  updatedAt       DateTime      @updatedAt
  user            User          @relation(fields: [userId], onDelete: Cascade, references: [id])
  userId          String
  SymbolProfile   SymbolProfile @relation(fields: [symbolProfileId], references: [id])
}
```

- Enum `Type` (`:357-364`): **`BUY`, `DIVIDEND`, `FEE`, `INTEREST`, `LIABILITY`, `SELL`** — não existe `ITEM` nem tipo de imposto.
- **Semântica de moeda**: `Order.currency` é **nullable**; a moeda efetiva é `order.currency ?? SymbolProfile.currency`. `Order.currency` só diverge quando o usuário informa `customCurrency` na criação/edição. `SymbolProfile.currency` é obrigatório (`:193`); `SymbolProfile` tem unique `[dataSource, symbol]` (`:215`).
- Relações: `Account` (chave composta `accountId`+`accountUserId`, opcional), `SymbolProfile`, `User` (cascade delete), `Tag[]` (N:N implícito).

### API (módulo `activities` — não existe `apps/api/src/app/order/`)

- `apps/api/src/app/activities/`: `activities.controller.ts`, `activities.service.ts`, `activities.module.ts`.
- Endpoints: `GET /activities` (`getAllActivities` `:108`, com filtros/paginação/ordenação), `GET /activities/:id`, `POST /activities`, `PUT /activities/:id`, `DELETE /activities`, `DELETE /activities/:id`.
- Na criação (`:199-276`) e atualização (`:282-344`): se `customCurrency` for enviado, ele sobrescreve `data.currency` (→ `Order.currency`); o `currency` original vai para o `SymbolProfile.connectOrCreate`. `dataSource` é removido do DTO antes de persistir (usado só para conectar o SymbolProfile e disparar data-gathering).

### DTOs e tipos compartilhados (`libs/common`)

- `libs/common/src/lib/dtos/create-order.dto.ts`: `currency` **obrigatório** (`@IsCurrencyCode`); `customCurrency?`; `fee`/`quantity`/`unitPrice` `@IsNumber @Min(0)`; `dataSource?` (opcional para `FEE`/`INTEREST`/`LIABILITY`); `date` ISO8601 (pós-1970); `type` `@IsEnum(Type)`; `accountId?`, `comment?`, `tags?`, `updateAccountBalance?`.
- `libs/common/src/lib/dtos/update-order.dto.ts`: mesmo formato + `id`, com `dataSource` obrigatório e sem `updateAccountBalance`.
- Interface `Activity` (`libs/common/src/lib/interfaces/activities.interface.ts`): estende `Order` e adiciona `feeInAssetProfileCurrency`, `feeInBaseCurrency`, `unitPriceInAssetProfileCurrency`, `value`, `valueInBaseCurrency`, `SymbolProfile: EnhancedSymbolProfile`, `error?` (código `IS_DUPLICATE`).
- Type `OrderWithAccount` (`libs/common/src/lib/types/order-with-account.type.ts`).

### Importação (`apps/api/src/app/import/`)

- `ImportDataDto.activities: CreateOrderDto[]` — reusa a mesma validação do DTO de criação.
- `import.service.ts`: valida via `dataProviderService.validateActivities`; detecção de duplicata (`:673-687`) compara `accountId`, `comment`, moeda, `dataSource`, data (mesmo segundo), **`fee`**, `quantity`, `symbol`, `type` e `unitPrice`.

## 7. Observações e lacunas relevantes

- **Não há nenhum cálculo de imposto** (dividend tax, withholding etc.) em API, libs ou client — apenas fees. Qualquer feature de impostos partiria do zero.
- **Só o ROAI funciona** como calculador de performance; `MWR`, `ROI` e `TWR` existem como opções do enum/factory mas lançam `'Method not implemented.'`.
- O fee é um **escalar único por atividade** (`Order.fee`), armazenado na moeda efetiva da atividade e convertido em tempo de leitura (`getActivities`) — não há decomposição (corretagem, emolumentos etc.).
- `MarketData` não guarda moeda; o preço está implicitamente na moeda do `SymbolProfile`. Cotações de câmbio são gravadas como símbolos `USD<CUR>` na própria `MarketData`.
- O provedor usado para câmbio é configurável por env (`DATA_SOURCE_EXCHANGE_RATES`), independente dos provedores de ativos (`DATA_SOURCES`).
- O módulo da API para transações chama-se `activities` (endpoints `/api/v1/activities`); o nome `Order` sobrevive no schema Prisma e nos DTOs (`create-order.dto.ts`).
