export interface YahooQuoteFixture {
  currency: string;
  exchange: string;
  exchangeTimezoneName: string;
  longName?: string;
  marketState: string;
  quoteType: string;
  regularMarketPrice: number;
  shortName?: string;
  symbol: string;
}

export interface YahooChartFixture {
  events?: {
    dividends: {
      amount: number;
      date: Date;
    }[];
  };
  meta: {
    currency: string;
    exchangeTimezoneName: string;
    gmtoffset: number;
    instrumentType: string;
    symbol: string;
  };
  quotes: {
    close: number;
    date: Date;
  }[];
}

export interface YahooQuoteSummaryFixture {
  price: {
    currency: string;
    longName?: string;
    marketState: string;
    quoteType: string;
    regularMarketPrice: number;
    shortName?: string;
    symbol: string;
  };
  summaryProfile?: {
    country?: string;
    sector?: string;
    website?: string;
  };
}

export interface YahooSearchFixture {
  quotes: {
    quoteType?: string;
    symbol?: string;
  }[];
}
