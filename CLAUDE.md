# CLAUDE.md — Ghostfolio (fork pessoal, customização Brasil)

## Contexto

Fork pessoal do Ghostfolio (github.com/ghostfolio/ghostfolio) para uso
individual de acompanhamento de carteira de investimentos no Brasil.
Uso não-comercial, instância privada, uso pessoal (ver seção de
licenciamento AGPL-3.0 no guia de setup).

## Stack e Arquitetura

- Monorepo Nx: Backend NestJS + PostgreSQL (Prisma) + Redis/Bull; Frontend Angular.
- Aliases internos: @ghostfolio/api, @ghostfolio/client, @ghostfolio/common, @ghostfolio/ui.
- Referência: Consulte docs/ARCHITECTURE_NOTES.md para o mapa detalhado de provedores de dados, lógica de câmbio e atividades.

## Comandos Essenciais

- npm run start:server / npm run start:client — ambiente de dev
- npm test — suíte de testes completa (injeta .env.example automaticamente)
- npx nx test api --test-file <spec> — rodar teste unitário específico
- npm run database:push — sincroniza schema Prisma sem criar migration
- npm run database:gui — abre Prisma Studio pra inspecionar dados
- git rebase -i --autosquash main — padrão do projeto pra limpar commits

## Branch de Trabalho e Governança

Todo trabalho de customização acontece na branch 'personal'.
Nunca commitar direto em 'main' (ela é espelho do upstream).
Siga o padrão de prefixos do upstream para branches de trabalho: Feature/, Bugfix/, Task/.

## Objetivo das Customizações (ver docs/br-customization/)

1. Benchmark CDI/IPCA via API SGS do Banco Central
2. Calculadora de IR brasileira (tabela regressiva, isenções)
3. Otimizador de aporte mensal (ativos contínuos vs. discretos)
4. Validação de tickers .SA e moeda BRL end-to-end

## Regras de Trabalho

- Nunca inventar lógica tributária — toda regra de IR deve ser conferida contra fonte oficial (Receita Federal) antes de implementar.
- Preservar compatibilidade com o schema/API originais sempre que possível (ex: isolar código com feature flags via without() ou @if (user?.settings?.isExperimentalFeatures) se apropriado).
- Testes automatizados para qualquer cálculo financeiro novo (IR, otimizador) — esse tipo de código não pode ter erro silencioso.
