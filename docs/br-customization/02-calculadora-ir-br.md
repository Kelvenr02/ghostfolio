# 02 - Calculadora de IR Brasileiro

Módulo de cálculo de Imposto de Renda sobre investimentos de pessoa física, derivado do histórico de `Order`/`Activity` já existente no Ghostfolio. Motor de cálculo puro (`apps/api/src/app/tax-br/`) orquestrado por um serviço que busca atividades via `ActivitiesService` e monta a resposta HTTP `GET /api/v1/tax-br/report`, atrás da permissão `accessTaxBrReport` (gated por `isExperimentalFeatures`). Zero migration de banco — classificação fiscal por símbolo reaproveita o model `Tag` já existente (tags canônicas: `Ação`, `ETF`, `BDR`, `FII`, `RendaFixa`).

Evidência TDD completa (RED→GREEN por arquivo, cobertura, gates): `docs/testing/calculadora-ir-br.tdd.md`.

## Tabela regra → fonte oficial

| #   | Regra                                                                                                                                                                                                                                  | Fonte oficial                                                        | Confiança                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | Renda fixa: tabela regressiva 22,5% (≤180 dias) / 20% (181–360) / 17,5% (361–720) / 15% (>720), por aplicação individual (não por portfólio)                                                                                           | Lei 11.033/2004, Art. 1º, incisos I–IV                               | Alta                                               |
| 2   | Ações (só mercado à vista): isenção quando a soma agregada de todas as vendas de ações no mês-calendário ≤ R$20.000,00 (não por ativo individual); incide sobre o valor total vendido, não sobre o lucro; day-trade nunca tem isenção  | gov.br/receitafederal, página "Isenções"                             | Alta                                               |
| 3   | ETF e BDR: 15% sobre o ganho, sem isenção de R$20k em qualquer valor de venda                                                                                                                                                          | Página "Isenções" do gov.br (exclusão explícita de fundos de índice) | Alta (ETF) / média-alta (BDR)                      |
| 4   | FII: 20% sobre ganho de capital na venda de cotas (sem isenção); rendimentos mensais distribuídos são isentos para PF se: (i) negociação exclusivamente em bolsa/balcão, (ii) fundo com ≥50 cotistas, (iii) cotista com <10% das cotas | Lei 8.668/1993                                                       | Alta (regra) / média (artigo exato não confirmado) |
| 5   | Compensação de prejuízo: segregação por modalidade confirmada em princípio; sub-regras "FII só compensa com FII" e "prejuízo não abate ganho isento" só em fonte secundária                                                            | gov.br/receitafederal "Compensações" (parcial)                       | Média — v1 não implementa compensação automática   |
| 6   | DARF: código 6015 para ganhos líquidos em renda variável PF; vencimento no último dia útil do mês seguinte                                                                                                                             | gov.br/receitafederal "Cálculo e Pagamento do Imposto"               | Alta                                               |
| 7   | IOF regressivo em RF: 96% (dia 1) → 3% (dia 29) → 0% (dia 30+)                                                                                                                                                                         | Decreto 6.306/2007                                                   | Alta — fora do escopo v1                           |

## Decisões de escopo v1

- **Day-trade (regra 2) implementado com uma simplificação registrada**: uma venda é classificada como day-trade quando há compra E venda do mesmo ativo no mesmo dia BRT (mesmo critério já usado pelo aviso `SAME_DAY_ACTIVITY`); o valor INTEIRO da venda nesse dia é tratado como day-trade — não há apuração de lotes específicos comprados/vendidos no dia. Day-trade nunca recebe a isenção de R$20.000/mês e é sempre tributado a 20%, separado das vendas comuns (swing-trade) do mesmo mês/classe fiscal, que continuam com sua própria apuração de isenção. Auditado e corrigido em 2026-07-05 (o motor anteriormente ignorava a segregação).
- **Sem compensação de prejuízo entre meses, e sem netting entre classes fiscais no mesmo mês** (regra 5 acima não totalmente confirmada em fonte primária).
- **IOF fora de escopo** (usuário buy & hold, resgates antecipados de RF raros; adicionar depois é aditivo).
- **JCP (juros sobre capital próprio)** não tem tratamento dedicado — lacuna conhecida.
- **Classificação fiscal por símbolo**: usuário atribui manualmente uma das 5 tags canônicas via UI de tags já existente (não há provisionamento automático). Símbolo sem tag reconhecida ou com tags conflitantes aparece em `classificationWarnings`, nunca é adivinhado.
- **Rendimento de FII** sempre assumido isento (as 3 condições legais não são verificáveis com os dados do Ghostfolio) — disclaimer explícito no relatório.

## Uso

1. Ative "Experimental Features" em Configurações da conta.
2. Marque cada símbolo de renda variável/renda fixa com a tag fiscal correspondente (`Ação`, `ETF`, `BDR`, `FII` ou `RendaFixa`) na tela de atividades.
3. Acesse a aba "Calculadora de IR" em Portfolio.
