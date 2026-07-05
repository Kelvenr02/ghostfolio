# 04 - Validação B3 e BRL

Checklist de validação: tickers .SA retornando cotação correta, moeda BRL
como base sem erro de conversão, comportamento do fuso horário nas datas de
transação (B3 fecha em horário de Brasília).

## Status: EXECUTADO (Módulo 04)

O checklist acima virou uma suíte de validação automatizada em camadas:

- **Suíte determinística** (fixtures reais do Yahoo, roda offline no
  `npm test`): `apps/api/src/validation-br/` — 7 casos da matriz de
  validação, 40 testes. Instruções no `README.md` do diretório.
- **Smoke tests live opt-in** (detecção de drift do provedor):
  `RUN_LIVE_PROVIDER_TESTS=true npx nx run api:test-live`.
- **Roteiro visual manual guiado** (sem app e2e — decisão registrada).

**Resultados, evidências, perguntas abertas e roteiro visual:**
[04-relatorio-validacao.md](./04-relatorio-validacao.md)

Matriz coberta: (1) resolução de símbolos .SA/^BVSP; (2) classificação de
ativos (veredito sobre quoteType do Yahoo); (3) moeda-base BRL ponta a
ponta; (4) fuso horário (UTC-3 fixo, sem DST pós-2019); (5) calendário
B3 ≠ NYSE (Tiradentes); (6) dividendos de FII; (7) consumo pelos módulos
01-03.
