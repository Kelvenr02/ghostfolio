import { SGS_SERIES } from './bcb.constants';

describe('SGS_SERIES catalog', () => {
  it('maps CDI to SGS series 12 (daily) in BRL', () => {
    expect(SGS_SERIES.CDI.seriesId).toBe(12);
    expect(SGS_SERIES.CDI.frequency).toBe('DAILY');
    expect(SGS_SERIES.CDI.currency).toBe('BRL');
  });

  it('maps IPCA to SGS series 433 (monthly) in BRL', () => {
    expect(SGS_SERIES.IPCA.seriesId).toBe(433);
    expect(SGS_SERIES.IPCA.frequency).toBe('MONTHLY');
    expect(SGS_SERIES.IPCA.currency).toBe('BRL');
  });

  it('uses lookbacks that exceed the publication lag of each series', () => {
    expect(SGS_SERIES.CDI.lookbackDays).toBeGreaterThanOrEqual(5);
    expect(SGS_SERIES.IPCA.lookbackDays).toBeGreaterThanOrEqual(60);
  });
});
