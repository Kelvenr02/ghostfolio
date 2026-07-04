# 03 - Otimizador de Aporte Mensal

O algoritmo guloso já desenhado: dado um valor de aporte mensal e os percentuais-alvo por ativo, decide quanto comprar de cada um, respeitando que ativos discretos (ETF, ação, FII) só aceitam unidades inteiras e ativos contínuos (Tesouro Direto, CDB) aceitam qualquer fração — sempre rebalanceando só com dinheiro novo, nunca vendendo posição existente.

Módulo full-stack `contribution-plan`, implementado em `apps/api/src/app/contribution-plan/` (backend) e `apps/client/src/app/pages/portfolio/contribution-plan/` (frontend), atrás da permissão `accessContributionPlan` (gated por `isExperimentalFeatures`). Persistência greenfield via model Prisma `AllocationTarget`. Evidência TDD completa (motor puro, orquestrador, controller) documentada abaixo; plano de execução original em `~/.claude/plans/ultrathink-papel-voc-zippy-moonbeam.md`.

## Visão geral e filosofia

- **Rebalanceamento só com dinheiro novo**: o otimizador nunca vende posição existente. Ele traduz um valor de aporte mensal em ordens de compra que aproximam a carteira dos percentuais-alvo, mas jamais gera uma ordem de venda — mesmo quando um ativo já está acima do seu alvo (nesse caso, seu "gap" é zero e ele simplesmente não recebe compra naquele mês).
- **Nunca SELL por construção**: o tipo `ContributionPlanEnginePurchase` não tem variante de venda; o motor e o serviço só produzem valores positivos. Essa garantia evita um evento tributável indesejado durante a fase de acumulação (relevante para o Módulo 02 — calculadora de IR).
- **Reserva de emergência fora do cálculo, via `Account.isExcluded`**: contas marcadas como excluídas já ficam fora das posições retornadas por `PortfolioService.getDetails` (comportamento padrão do upstream, `withExcludedAccountsAndActivities: false`). O otimizador herda esse comportamento sem código extra — a reserva simplesmente não aparece nas holdings usadas para calcular `V` (valor total antes do aporte).
- **Universo do otimizador = ativos com alvo configurado.** Holdings existentes sem alvo correspondente não entram em `V'` (valor total pós-aporte); elas aparecem apenas como aviso `HOLDING_NOT_IN_PLAN`, para não inflar artificialmente os gaps dos ativos que o usuário realmente monitora.
- **Somente leitura**: o plano de compras nunca cria `Order`/atividade — executar as compras na corretora continua manual, via o fluxo de atividades já existente do Ghostfolio.

## Mapa do módulo

### Backend (`apps/api/src/app/contribution-plan/`)

| Arquivo                                  | Papel                                                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contribution-plan-engine.ts`            | Motor guloso **puro** — `buildContributionPlan(input)`, síncrono, sem `@Injectable`, sem I/O. Toda a aritmética financeira em `Big.js`.                                                                                                             |
| `contribution-plan-engine.spec.ts`       | 7 invariantes + fixture da carteira real (B=300) + testes paramétricos (`test.each`) — 25 casos de teste.                                                                                                                                           |
| `contribution-plan.helper.ts`            | `roundToCents` — LOCAL e duplicado de propósito (não importa de `tax-br.helper.ts`, que arrastaria `tax-br.constants` e acoplaria dois módulos de feature independentes).                                                                           |
| `contribution-plan.helper.spec.ts`       | Cobertura do arredondamento half-up (3 casos).                                                                                                                                                                                                      |
| `interfaces/interfaces.ts`               | Tipos internos do engine: `ContributionPlanEngineAsset`, `ContributionPlanEngineInput`, `ContributionPlanEnginePurchase`, `ContributionPlanEngineResult`.                                                                                           |
| `contribution-plan.service.ts`           | Orquestrador `@Injectable`: busca alvos (Prisma), holdings (`PortfolioService.getDetails`), resolve cotações (`DataProviderService`/`MarketDataService`) e câmbio (`ExchangeRateDataService`), monta o input do engine e serializa a resposta HTTP. |
| `contribution-plan.service.spec.ts`      | Mocks diretos (`jest.fn()`) de todas as dependências — 18 casos, incluindo exclusão da reserva de emergência e as políticas de preço ausente/desatualizado.                                                                                         |
| `dto/get-contribution-plan-query.dto.ts` | `GetContributionPlanQueryDto` — valida o `amount` da query string via class-validator.                                                                                                                                                              |
| `contribution-plan.controller.ts`        | `@Controller('contribution-plan')`: `GET /`, `GET /targets`, `PUT /targets`, guardado por `AuthGuard('jwt')` + `HasPermissionGuard(accessContributionPlan)`.                                                                                        |
| `contribution-plan.controller.spec.ts`   | Verificação de metadata de permissão + validação do DTO — 8 casos.                                                                                                                                                                                  |
| `contribution-plan.module.ts`            | Importa `DataProviderModule`, `ExchangeRateDataModule`, `ImpersonationModule`, `MarketDataModule`, `PortfolioModule`, `PrismaModule`. Registrado em `app.module.ts` ao lado do `TaxBrModule`.                                                       |

### Persistência

- **Model Prisma `AllocationTarget`** (`prisma/schema.prisma`): `userId` × `symbolProfileId` (chave única composta), `targetPercentage: Float`, `purchaseMode: PurchaseMode` (default `DISCRETE`), `minPurchaseValue: Float?`, `createdAt`/`updatedAt`. FKs `ON DELETE CASCADE` nas duas pontas (`User`, `SymbolProfile`).
- **Enum `PurchaseMode`**: `CONTINUOUS | DISCRETE`.
- **Migration** `prisma/migrations/20260704000000_add_allocation_target/migration.sql`: `CREATE TYPE`, `CREATE TABLE`, índice único `AllocationTarget_userId_symbolProfileId_key`, 2 `ALTER TABLE ... ADD CONSTRAINT` para as FKs. Escrita à mão no padrão do fork (timestamp redondo, prefixo `add_`), 100% aditiva — nenhum arquivo upstream de schema é modificado além de duas linhas de back-relation.
- Decisão registrada (vs. JSON em `User.Settings` ou reaproveitar `Tag`): model dedicado ganha em integridade referencial, validação de tipo/enum no banco e custo de rebase (migrations nunca conflitam; editar DTOs upstream de alta rotatividade seria mais caro).

### Client (`apps/client/src/app/pages/portfolio/contribution-plan/`)

| Arquivo                                                                                  | Papel                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contribution-plan-page.component.ts/.html/.scss`                                        | Página standalone. Carrega os alvos (`fetchAllocationTargets`) reativamente via `userService.stateChanged`, só quando `user.settings?.isExperimentalFeatures` está ativo. Formulário reativo (`FormBuilder`) para o valor do aporte; estados de carregamento, erro (com retry) e resíduo tratados explicitamente. |
| `contribution-plan-page.routes.ts`                                                       | Rota lazy protegida por `AuthGuard`, no padrão de `tax-br-page.routes.ts`.                                                                                                                                                                                                                                        |
| `edit-allocation-targets-dialog/edit-allocation-targets-dialog.component.ts/.html/.scss` | Dialog de edição de alvos: `FormArray` de linhas (ativo via `gf-symbol-autocomplete`, percentual, modo de compra, mínimo de compra), validação client de soma = 100%, chama `putAllocationTargets`.                                                                                                               |
| `edit-allocation-targets-dialog/interfaces/interfaces.ts`                                | `EditAllocationTargetsDialogParams`.                                                                                                                                                                                                                                                                              |

A aba "Planejador de aporte" no Portfolio é **condicional** (`showCondition: user?.settings?.isExperimentalFeatures`) — diferença deliberada em relação ao Módulo 02 (Calculadora de IR), que é always-visible. Registrada em `portfolio-page.component.ts`/`portfolio-page.routes.ts`.

### Tipos compartilhados (`libs/common`)

- `interfaces/allocation-target.interface.ts` — `AllocationTarget` (leitura, enriquecida com `dataSource`/`symbol`/`name` do `SymbolProfile`).
- `interfaces/responses/allocation-targets-response.interface.ts` — `AllocationTargetsResponse`.
- `interfaces/responses/contribution-plan-response.interface.ts` — `ContributionPlanResponse`, `ContributionPlanOrder` (só compras), `ContributionPlanAllocation`, `ContributionPlanWarning`.
- `interfaces/contribution-plan-parameters.interface.ts` — `{ amount: number }`.
- `dtos/update-allocation-targets.dto.ts` — `UpdateAllocationTargetsDto` + `AllocationTargetItemDto` (class-validator estrito; **sem campo `currency`** — ver política Big.js/fronteira de câmbio abaixo, e a seção de limitações).

## Contrato da API

| Endpoint                                       | Descrição                                           |
| ---------------------------------------------- | --------------------------------------------------- |
| `GET /api/v1/contribution-plan?amount=<valor>` | Calcula o plano de compras para o aporte informado. |
| `GET /api/v1/contribution-plan/targets`        | Lista os alvos de alocação do usuário.              |
| `PUT /api/v1/contribution-plan/targets`        | Substitui (replace atômico) o conjunto de alvos.    |

Todos protegidos por `AuthGuard('jwt')` + `HasPermissionGuard`, permissão `accessContributionPlan` — concedida a ADMIN/USER e revogada via `without()` em `user.service.ts` quando `!isExperimentalFeatures` (mesmo padrão de `accessTaxBrReport`).

### Códigos de erro 422 (`UNPROCESSABLE_ENTITY`)

| Código                          | Quando ocorre                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TARGETS_NOT_CONFIGURED`        | `GET /contribution-plan` chamado sem nenhum alvo cadastrado.                                                                                                                                                |
| `PRICE_UNAVAILABLE`             | Algum ativo-alvo discreto não tem cotação (nem intraday, nem fallback de último fechamento) — lista os símbolos afetados. Fail-loud deliberado: excluir o ativo silenciosamente distorceria `V'` e os gaps. |
| `CURRENCY_UNRESOLVED`           | `PUT /targets` com símbolo novo cuja moeda não pôde ser resolvida via cotação — lista os símbolos afetados.                                                                                                 |
| `TARGET_PERCENTAGE_SUM_INVALID` | `PUT /targets` com soma dos `targetPercentage` ≠ 100% (validado em `Big.eq`, não em ponto flutuante).                                                                                                       |
| `DUPLICATE_TARGET`              | `PUT /targets` com o mesmo `(dataSource, symbol)` repetido na lista.                                                                                                                                        |

### Warnings (não bloqueiam a resposta)

| Código                   | Significado                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STALE_PRICE`            | Preço usado é o último fechamento (`MarketDataService.getLatest`), não uma cotação em tempo real; a resposta carrega `unitPriceAsOf` para exibição. |
| `HOLDING_NOT_IN_PLAN`    | Existe uma posição na carteira sem alvo configurado — ela fica fora de `V'` e dos gaps.                                                             |
| `RESIDUAL_NOT_ALLOCATED` | Sobrou dinheiro do aporte que não coube em nenhum ativo-alvo neste mês (ex.: menor que o mínimo de todos os contínuos elegíveis).                   |

## Algoritmo

Especificação formal completa em §7 do plano de execução. Resumo:

- **Entradas**: `B` (valor do aporte), conjunto de ativos-alvo `A = D ∪ C` (discretos/contínuos), alvo `t_i` (Σ=100%), posição atual `V_i`, preço unitário `p_i` (discretos, `p_i > 0`) ou mínimo de compra `m_i` (contínuos).
- **`V' = Σ V_i + B`**; **`gap_i = max(0, t_i · V' − V_i)`** — ativo acima do alvo tem gap zero (nunca compra negativa/venda).
- **Fase 1 — loop guloso discreto**: enquanto existir `i ∈ D` com `gap_i > 0` e `p_i ≤ orçamento restante`, compra 1 unidade do ativo de **maior gap** (desempate: menor símbolo em ordem lexicográfica de string — nunca `localeCompare`). Elegibilidade é `gap_i > 0 ∧ p_i ≤ r`, não `p_i ≤ gap_i`: uma compra pode ultrapassar o alvo do ativo (overshoot documentado, exibido na UI).
- **Fase 2 — varredura contínua final**: se sobrar orçamento após a Fase 1, aloca 100% do restante no ativo contínuo elegível (`gap_i > 0 ∧ m_i ≤ r`) de maior gap; se nenhum for elegível, o restante vira **resíduo não alocado** (não força compra acima do alvo).
- **Terminação**: garantida porque `r` decresce estritamente em cada iteração da Fase 1 (pré-condição `p_i > 0`); no máximo `⌊B / p_min⌋` iterações.
- **Determinismo**: função pura síncrona, sem aleatoriedade/relógio/I/O; comparador total explícito (gap desc, depois símbolo asc).

### Decisões PA-1..PA-6 (resumo)

| #    | Decisão                                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PA-1 | Overshoot discreto é aceito pela spec literal (elegibilidade por `p_i ≤ r`, não `p_i ≤ gap_i`).                                     |
| PA-2 | Mínimo do contínuo de maior gap: se ele não for elegível (`m_i > r`), desce-se a ordenação até o primeiro contínuo elegível.        |
| PA-3 | Nenhum contínuo com `gap > 0`: vira resíduo, não força overshoot alfabético.                                                        |
| PA-4 | Alvos são por ativo individual, não por grupo — decomposição de grupos (ex. "FII 10%") é responsabilidade do usuário ao configurar. |
| PA-5 | Cotação indisponível para ativo-alvo: falha alto (422 `PRICE_UNAVAILABLE`) em vez de excluir silenciosamente.                       |
| PA-6 | Holdings sem alvo configurado ficam fora de `V'` (universo do otimizador = ativos-alvo), com warning `HOLDING_NOT_IN_PLAN`.         |

### Política Big.js

- Toda a aritmética do motor usa `Big.js` — nenhum `number` intermediário no caminho do dinheiro.
- Caminho da conservação (soma de compras + resíduo = `B`) usa só `+`, `−`, `×` e comparações — **exato**, sem divisão, verificado com `Big.eq` (nunca `toBeCloseTo`).
- Divisões só em campos informativos (percentuais pós-aporte, desvio residual), arredondadas com `round(4, Big.roundHalfUp)` por último.
- Valores monetários são quantizados a centavos (`roundToCents`, half-up) na fronteira de entrada do engine.
- **Fronteira única de `number` documentada**: `ContributionPlanService.convertToBaseCurrency` — o `ExchangeRateDataService.toCurrency` do upstream é `number`-only (não aceita/retorna `Big`), então a conversão de câmbio sai de `Big` por exatamente uma chamada de função e é imediatamente re-quantizada a centavos (`roundToCents`) antes de qualquer decisão do engine. Comentado no código como exceção controlada à regra do CLAUDE.md.

## Evidência TDD

- **7 invariantes** cobertos no engine puro: (1) conservação exata `Σ compras + resíduo == B` em `Big.eq`; (2) nenhuma quantidade negativa/fracionária em discreto; (3) nenhum SELL (por tipo e por teste); (4) determinismo (mesma entrada 2× ⇒ `toStrictEqual`, incluindo empate de gaps); (5) `B` menor que o menor preço discreto ⇒ tudo no melhor contínuo; (6) `B = 0` ⇒ plano vazio válido; (7) carteira vazia (primeiro aporte) ⇒ distribui pelo alvo puro.
- **Fixture da carteira real, B = R$300** (calculada à mão, reproduzida em `contribution-plan-engine.spec.ts`):

  | Ativo                  | Tipo     | Alvo  | Posição V_i | Preço/mín |
  | ---------------------- | -------- | ----- | ----------- | --------- |
  | Tesouro Selic 2029     | contínuo | 10%   | R$ 400,00   | mín R$ 30 |
  | Tesouro IPCA+ 2035     | contínuo | 12,5% | R$ 500,00   | mín R$ 30 |
  | Tesouro IPCA+ 2045     | contínuo | 12,5% | R$ 450,00   | mín R$ 30 |
  | BOVA11                 | discreto | 25%   | R$ 780,00   | R$ 130,00 |
  | IVVB11                 | discreto | 20%   | R$ 615,00   | R$ 102,50 |
  | MXRF11                 | discreto | 5%    | R$ 206,00   | R$ 10,30  |
  | HGLG11                 | discreto | 5%    | R$ 320,00   | R$ 160,00 |
  | Tesouro Prefixado 2027 | contínuo | 10%   | R$ 380,00   | mín R$ 30 |

  Saída esperada: `[{BOVA11, qty 1, R$130,00}, {IVVB11, qty 1, R$102,50}, {Tesouro IPCA+ 2045, R$67,50}]`, resíduo R$0,00 (conservação 130,00 + 102,50 + 67,50 + 0 = 300,00 ✓). Fixture secundária (mesmos alvos, B=8,00): nenhum discreto cabe e R$8,00 é menor que o mínimo de todos os contínuos ⇒ compras vazias, resíduo R$8,00.

- **Testes paramétricos** (`test.each`, substituto do property-based testing — `fast-check` não está disponível no repo): grade de `B ∈ {0; 0,01; 8; 50; 130; 300; 1.234,56; 10.000}` × cenários de carteira (vazia, balanceada, desbalanceada, tudo-acima-do-alvo, só contínuos, só discretos, empate exato de gaps), reafirmando os invariantes 1–4 via helper `expectInvariants`.
- **Contagem final de testes** (backend): 25 (`contribution-plan-engine.spec.ts`) + 18 (`contribution-plan.service.spec.ts`) + 8 (`contribution-plan.controller.spec.ts`) + 3 (`contribution-plan.helper.spec.ts`) = **54 casos**. Cobertura-alvo do engine: 100% de branches (regra do CLAUDE.md — cálculo financeiro não pode ter erro silencioso).
- **2 rodadas de correção pós-revisão do `typescript-reviewer`**, ambas commitadas:
  - `fix(contribution-plan): resolve achados da revisão (2 HIGH, 1 MEDIUM)` — inclui a validação explícita de pré-condições no engine (`assertValidPreconditions`, FIX 2) e o batch de cotações no orquestrador para eliminar N+1 (FIX 3).
  - `fix(contribution-plan): moeda resolvida no servidor e tratamento de erros na UI` — remove `currency` do DTO de escrita (o cliente deixa de ser fonte de verdade para a moeda de um símbolo novo; o servidor resolve via `getQuotes` e falha com `CURRENCY_UNRESOLVED` se não conseguir), e adiciona tratamento de erro com retry na página do client (FIX 1).

## Limitações registradas

- **Lote padrão = 1** (sem lote de 100 para ações) — o usuário compra ETFs/FIIs/BDRs em lote unitário na B3; ações em lote-padrão ficam fora do v1.
- **Alvos por ativo individual, sem agrupamento** (PA-4) — grupos como "FII 10%" ou "Tesouro IPCA+ 25%" precisam ser decompostos manualmente pelo usuário ao configurar os alvos.
- **Preços de símbolos MANUAL (ex.: Tesouro Direto) podem estar defasados** — quando não há cotação intraday nem holding valorada, o fallback é o último fechamento (`MarketDataService.getLatest`), sinalizado com warning `STALE_PRICE` e a data (`asOf`) exibida na UI.
- **Moeda resolvida no servidor apenas na criação do perfil**: para um símbolo novo (nunca negociado), a moeda vem de uma cotação (`getQuotes`) no momento do `PUT /targets`; para símbolos que já têm `SymbolProfile` local, a moeda persistida é preservada e nunca sobrescrita pelo cliente.

## Uso

1. Ative "Experimental Features" em Configurações da conta — a aba "Planejador de aporte" aparece no Portfolio.
2. Configure os alvos de alocação (percentual, modo de compra, mínimo de compra quando contínuo) pelo dialog de edição, buscando o ativo por autocomplete.
3. Informe o valor do aporte do mês e calcule o plano — a tela mostra as ordens de compra, a alocação antes/depois de cada ativo, o resíduo não alocado (se houver) e eventuais avisos de preço defasado.
