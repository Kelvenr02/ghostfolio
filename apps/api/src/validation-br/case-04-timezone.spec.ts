/**
 * Módulo 04 — Caso 4 da matriz de validação: FUSO HORÁRIO.
 *
 * O Brasil aboliu o horário de verão em 2019: America/Sao_Paulo é UTC-3
 * FIXO para qualquer data recente. Estes testes provam que (a) o bucketing
 * fiscal BRT do módulo 02 coloca atividades no dia/mês corretos, (b) o
 * offset fixo de -3h coincide com a IANA para datas pós-2019 em todas as
 * estações, e (c) caracterizam — sem corrigir — o risco estrutural do
 * bucket intraday em UTC (data-provider.service.ts:761-778).
 *
 * Executar: npx nx test api --test-file case-04-timezone.spec.ts
 */
import {
  lastWeekdayOfMonth,
  toBrtCalendarDate
} from '@ghostfolio/api/app/tax-br/tax-br.helper';
import {
  getStartOfUtcDate,
  parseDate,
  resetHours
} from '@ghostfolio/common/helper';

function toIanaSaoPauloCalendarDate(date: Date): string {
  // en-CA produz yyyy-MM-dd; a IANA é a referência contra a qual o offset
  // fixo de -3h do tax-br.helper é comparado
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
    year: 'numeric'
  }).format(date);
}

describe('Caso 4 — timezone B3/BRT', () => {
  it('roda com TZ=UTC (premissa de determinismo do apps/api/jest.config.ts)', () => {
    expect(process.env.TZ).toBe('UTC');
    expect(new Date().getTimezoneOffset()).toBe(0);
  });

  describe('bucketing fiscal BRT (módulo 02)', () => {
    it('atividade às 23h30 BRT do dia 31/01 cai no mês 2026-01, não em 2026-02', () => {
      // 23h30 BRT de 31/01/2026 = 02h30 UTC de 01/02/2026
      const activityDate = new Date('2026-02-01T02:30:00.000Z');

      const brtCalendarDate = toBrtCalendarDate(activityDate);

      expect(brtCalendarDate).toBe('2026-01-31');
      expect(brtCalendarDate.slice(0, 7)).toBe('2026-01');
    });

    it('fechamento da B3 (18h BRT = 21h UTC) permanece no MESMO dia em UTC e em BRT', () => {
      const b3Close = new Date('2026-04-22T21:00:00.000Z');

      expect(toBrtCalendarDate(b3Close)).toBe('2026-04-22');
      expect(b3Close.toISOString().slice(0, 10)).toBe('2026-04-22');
    });
  });

  describe('nenhuma lógica de DST para datas brasileiras pós-2019', () => {
    it.each([
      ['verão 2020', '2020-01-15T02:30:00.000Z'],
      ['inverno 2021', '2021-07-15T02:30:00.000Z'],
      [
        'verão 2023 (véspera de virada de ano-calendário BRT)',
        '2023-12-31T02:59:59.000Z'
      ],
      ['verão 2026', '2026-01-31T02:30:00.000Z'],
      ['inverno 2026', '2026-07-04T02:30:00.000Z']
    ])(
      'offset fixo -3h coincide com a IANA America/Sao_Paulo (%s)',
      (_label, isoDate) => {
        const date = new Date(isoDate);

        expect(toBrtCalendarDate(date)).toBe(toIanaSaoPauloCalendarDate(date));
      }
    );

    it('CARACTERIZAÇÃO: para datas com DST pré-2019 o offset fixo DIVERGE da IANA (limitação documentada do módulo 02)', () => {
      // 15/01/2018, 02h30 UTC: vigorava o horário de verão (BRST = UTC-2).
      // IANA: 00h30 de 15/01; offset fixo -3h: 23h30 de 14/01.
      const dstDate = new Date('2018-01-15T02:30:00.000Z');

      expect(toIanaSaoPauloCalendarDate(dstDate)).toBe('2018-01-15');
      expect(toBrtCalendarDate(dstDate)).toBe('2018-01-14');
    });
  });

  describe('normalização UTC dos helpers compartilhados', () => {
    it('getStartOfUtcDate zera o horário em UTC preservando o dia', () => {
      const date = getStartOfUtcDate(new Date('2026-04-22T21:00:00.000Z'));

      expect(date.toISOString()).toBe('2026-04-22T00:00:00.000Z');
    });

    it('resetHours(parseDate(...)) produz meia-noite UTC estável para datas yyyy-MM-dd', () => {
      const date = resetHours(parseDate('2026-04-22'));

      expect(date.toISOString()).toBe('2026-04-22T00:00:00.000Z');
    });
  });

  describe('CARACTERIZAÇÃO do risco estrutural: bucket intraday em dia UTC', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('coleta intraday entre 21h e 00h BRT grava MarketData no dia UTC SEGUINTE ao pregão B3 (pergunta aberta — não corrigir aqui)', () => {
      // 22h00 BRT de 22/04/2026 = 01h00 UTC de 23/04/2026, pregão B3 ainda é 22/04
      jest
        .useFakeTimers()
        .setSystemTime(new Date('2026-04-23T01:00:00.000Z').getTime());

      const tradingDayInBrt = toBrtCalendarDate(new Date());
      const marketDataBucket = getStartOfUtcDate(new Date())
        .toISOString()
        .slice(0, 10);

      expect(tradingDayInBrt).toBe('2026-04-22');
      // Comportamento ATUAL (data-provider.service.ts:773): dia UTC — diverge
      // do dia de pregão B3 nessa janela. Se este assert quebrar, o upstream
      // mudou o bucketing e o relatório do Módulo 04 precisa ser revisado.
      expect(marketDataBucket).toBe('2026-04-23');
      expect(marketDataBucket).not.toBe(tradingDayInBrt);
    });

    it('fora da janela de risco (pregão aberto, 14h BRT) o dia UTC e o dia BRT coincidem', () => {
      jest
        .useFakeTimers()
        .setSystemTime(new Date('2026-04-22T17:00:00.000Z').getTime());

      expect(getStartOfUtcDate(new Date()).toISOString().slice(0, 10)).toBe(
        toBrtCalendarDate(new Date())
      );
    });
  });

  describe('vencimento fiscal (DARF) em UTC puro', () => {
    it('lastWeekdayOfMonth devolve o último dia útil sem influência de fuso local', () => {
      // Maio/2026: dia 31 é domingo -> volta para sexta 29
      expect(lastWeekdayOfMonth(2026, 5)).toBe('2026-05-29');
    });
  });
});
