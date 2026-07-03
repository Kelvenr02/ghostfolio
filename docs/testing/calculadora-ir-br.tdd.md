# Evidência TDD — Módulo 02: Calculadora de IR Brasileiro (tax-br)

- **Plano-fonte**: sessão de planejamento aprovada (plan mode), documentada em `docs/br-customization/02-calculadora-ir-br.md` (seções 1-12 do plano original).
- **Branch**: `Feature/calculadora-ir-br` (descendente de `personal`).

## Ciclos RED → GREEN (commits na branch, verificáveis por `git log`)

| Ciclo                                                                                | RED (commit, evidência)                                     | GREEN (commit, evidência)  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------- |
| Helpers de bucketing BRT + arredondamento (`tax-br.helper.ts`)                       | `2c9ed5268` — 7/7 falhas                                    | `13658e241` — 7/7 passed   |
| Classificação fiscal por tag + hoist (`tax-classification.helper.ts`)                | `3dfd3909f` — 6/6 falhas                                    | `bab6cdb92` — 6/6 passed   |
| Motor RV — PM ponderado + ganho realizado (`equity-tax-calculator.service.ts`)       | `e90abbb15` — 10/10 falhas                                  | `5a8607ff1` — 10/10 passed |
| Motor RF — lotes FIFO + tabela regressiva (`fixed-income-tax-calculator.service.ts`) | `7a2658a9c` — 10/10 falhas                                  | `0ea9ef38f` — 10/10 passed |
| Rendimento isento de FII (`fii-income.helper.ts`)                                    | `5e49e6052` — 3/3 falhas                                    | `3a7adffad` — 3/3 passed   |
| Agregador mensal — isenção/alíquota/DARF (`monthly-tax-aggregator.service.ts`)       | `7e4bce741` — 13/13 falhas                                  | `7c2a5e2a6` — 13/13 passed |
| Orquestrador (`tax-br-report.service.ts`)                                            | `6cf3977a8` — 6/6 falhas                                    | `32efee0a2` — 6/6 passed   |
| Controller + module (`tax-br.controller.ts`)                                         | (spec sem estágio RED estrito — decorator/wiring, ver nota) | `3b68c242f` — 3/3 passed   |

Comando por spec: `npx nx test api --test-file <caminho do spec>`.

## O que os testes garantem

| #   | Garantia                                                                                                                                                                                                                                                           | Spec                                          | Resultado |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------- |
| 1   | Venda às 23h59 BRT do dia 31 é agrupada no mês correto mesmo com o instante UTC caindo no dia seguinte; venda às 00h30 BRT do dia 1º não recua para o mês anterior                                                                                                 | `tax-br.helper.spec.ts`                       | PASS      |
| 2   | Arredondamento para centavos (half-up) só na serialização; `roundToCents` clona em vez de mutar o valor original                                                                                                                                                   | `tax-br.helper.spec.ts`                       | PASS      |
| 3   | Tag reconhecida numa única atividade se propaga (hoist) para todas as atividades do mesmo símbolo; símbolo sem tag reconhecida vira `UNCLASSIFIED`; duas tags fiscais diferentes no mesmo símbolo viram `CONFLICTING_TAGS` (`fiscalClass: null`, nunca um palpite) | `tax-classification.helper.spec.ts`           | PASS      |
| 4   | PM pondera na compra (com fee no custo), não repondera em venda parcial (usa o PM antigo), zera em venda total (guarda `Number.EPSILON`), reinicia do zero numa recompra após zeragem                                                                              | `equity-tax-calculator.service.spec.ts`       | PASS      |
| 5   | Ganho realizado = valor líquido de venda − custo dos vendidos (pode ser negativo); aviso de possível day-trade quando há compra e venda do mesmo símbolo no mesmo dia BRT                                                                                          | `equity-tax-calculator.service.spec.ts`       | PASS      |
| 6   | Cada compra de renda fixa cria um lote com sua própria data; tabela regressiva aplicada corretamente nos 4 patamares (22,5% / 20% / 17,5% / 15%)                                                                                                                   | `fixed-income-tax-calculator.service.spec.ts` | PASS      |
| 7   | Resgate que atravessa dois lotes consome em FIFO por quantidade, aplicando a alíquota própria de cada lote; resgate parcial reduz sem fechar o lote                                                                                                                | `fixed-income-tax-calculator.service.spec.ts` | PASS      |
| 8   | Rendimento tributável = valor de resgate − principal proporcional; imposto retido na fonte, nunca somado ao DARF                                                                                                                                                   | `fixed-income-tax-calculator.service.spec.ts` | PASS      |
| 9   | Rendimento mensal de FII tratado como renda isenta, nunca misturado com ganho de capital de venda de cotas no mesmo mês; disclaimer fixo de isenção anexado a todo mês                                                                                             | `fii-income.helper.spec.ts`                   | PASS      |
| 10  | **Isenção de R$20k é agregada entre símbolos de ações no mesmo mês** (não por ativo); isenta em exatamente R$20.000,00, tributa em R$20.000,01                                                                                                                     | `monthly-tax-aggregator.service.spec.ts`      | PASS      |
| 11  | ETF, BDR e ganho de capital de FII nunca são isentos, independente do valor vendido; ações/ETF/BDR a 15%, FII a 20%                                                                                                                                                | `monthly-tax-aggregator.service.spec.ts`      | PASS      |
| 12  | Mês de prejuízo gera imposto zero; prejuízo de uma classe fiscal **não** compensa ganho de outra classe no mesmo mês (decisão de escopo v1)                                                                                                                        | `monthly-tax-aggregator.service.spec.ts`      | PASS      |
| 13  | DARF soma o imposto de todas as classes do mês; `isPayable: false` quando o total é zero; vencimento = último dia útil do mês seguinte                                                                                                                             | `monthly-tax-aggregator.service.spec.ts`      | PASS      |
| 14  | Orquestrador força `userCurrency: 'BRL'` sempre; inclui contas "exclude from analysis"; nunca filtra por data (histórico completo, mesmo pedindo 1 mês); relatório parcial com avisos de classificação em vez de exceção                                           | `tax-br-report.service.spec.ts`               | PASS      |
| 15  | Holdings de RV e lotes abertos de RF refletem o estado atual, desacoplado do período pedido                                                                                                                                                                        | `tax-br-report.service.spec.ts`               | PASS      |
| 16  | Rota protegida pela permissão `accessTaxBrReport` (guard `HasPermissionGuard` retorna 403 sem ela); assume ano/mês corrente em BRT sem query params; ano isolado retorna os 12 meses                                                                               | `tax-br.controller.spec.ts`                   | PASS      |

## Gates finais

- Suíte completa da API (`npx nx test api`): **133 passed, 2 skipped (pré-existentes), 37/39 suítes** — sem regressão.
- `npx nx build api`: verde.
- `npx nx build client`: verde (só avisos esperados de i18n para strings novas, sem tradução ainda).
- Superfície fora de `apps/api/src/app/tax-br/`: 3 DTOs novos + 1 barrel em `libs/common`, 1 permissão em `permissions.ts`, 1 bloco preenchido em `user.service.ts` (antes vazio/comentado), 1 linha em `app.module.ts`, 1 subrota em `libs/common/routes/routes.ts`, 1 método em `data.service.ts`, 4 arquivos novos + 2 edições no client — **zero migration de banco** (classificação fiscal reaproveita o model `Tag` existente).

## Lacunas intencionais (documentadas no plano, Seção 11)

- **Sem compensação de prejuízo entre meses, e sem netting entre classes fiscais no mesmo mês** — decisão de escopo v1, dado que 2 sub-regras (FII só compensa com FII; prejuízo não abate ganho isento) não foram confirmadas em fonte primária.
- **IOF fora do escopo v1** — usuário buy & hold, resgates antecipados de RF são raros; adicionar depois é aditivo (lotes já carregam `acquisitionDateBrt`/dias corridos).
- **JCP (juros sobre capital próprio)** não tem tratamento dedicado — não é capturado pelo extrator de FII nem pelo motor de RV. Lacuna conhecida.
- **As 3 condições legais de isenção do rendimento de FII** (negociação em bolsa, ≥50 cotistas, <10% das cotas) não são verificáveis com os dados do Ghostfolio — sempre assumidas verdadeiras, com disclaimer explícito no relatório.
- **Desdobramento/grupamento/bonificação** de ações não tem `Type` dedicado no schema — limitação herdada do calculador de performance existente, não introduzida por este módulo.
- Sem e2e novo (o padrão de navegação/tabs do client não muda estruturalmente); validação funcional recomendada via conferência manual de pelo menos 1 mês real contra as regras da Seção 1 do plano, antes do merge.
