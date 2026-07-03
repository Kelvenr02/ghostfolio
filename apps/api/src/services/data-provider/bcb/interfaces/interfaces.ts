import { Big } from 'big.js';

export interface ISgsRawObservation {
  data: string;
  valor: string;
}

export interface ISgsObservation {
  date: string; // yyyy-MM-dd
  rate: Big;
}

export type SgsFrequency = 'DAILY' | 'MONTHLY';

export interface ISgsSeriesConfig {
  currency: 'BRL';
  frequency: SgsFrequency;
  // Refetch window: must exceed the publication lag of the series (CDI is
  // published at D-1; IPCA for month M is published around day 10 of M+1),
  // so that an anchor older than the lookback is always final.
  lookbackDays: number;
  name: string;
  seriesId: number;
  symbol: 'CDI' | 'IPCA';
}

export interface IIndexAnchor {
  date: string; // yyyy-MM-dd
  value: Big;
}

export interface IIndexPoint {
  date: string; // yyyy-MM-dd
  value: Big;
}
