import { ISgsSeriesConfig } from './interfaces/interfaces';

export const SGS_API_BASE_URL = 'https://api.bcb.gov.br/dados/serie';

// The SGS API rejects date windows longer than 10 years on daily series
// (HTTP 406, enforced since 2025-03-26); 5 years keeps a safe margin.
export const SGS_MAX_WINDOW_IN_YEARS = 5;

export const SGS_FETCH_BASE_RETRY_DELAY_IN_MS = 1000;

export const SGS_FETCH_MAX_ATTEMPTS = 3;

export const SGS_INDEX_BASE_VALUE = 100;

// Part of the canonical index definition: every compounding step is rounded
// to 8 decimal places and the persisted value is the anchor of the next step.
export const SGS_INDEX_DECIMAL_PLACES = 8;

export const SGS_SERIES: { [symbol: string]: ISgsSeriesConfig } = {
  CDI: {
    currency: 'BRL',
    frequency: 'DAILY',
    lookbackDays: 15,
    name: 'CDI (índice acumulado, SGS 12)',
    seriesId: 12,
    symbol: 'CDI'
  },
  IPCA: {
    currency: 'BRL',
    frequency: 'MONTHLY',
    lookbackDays: 120,
    name: 'IPCA (índice acumulado, SGS 433)',
    seriesId: 433,
    symbol: 'IPCA'
  }
};
