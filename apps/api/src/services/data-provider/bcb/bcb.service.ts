import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import {
  DataProviderInterface,
  GetAssetProfileParams,
  GetDividendsParams,
  GetHistoricalParams,
  GetQuotesParams,
  GetSearchParams
} from '@ghostfolio/api/services/data-provider/interfaces/data-provider.interface';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { DATE_FORMAT, getStartOfUtcDate } from '@ghostfolio/common/helper';
import {
  DataProviderHistoricalResponse,
  DataProviderInfo,
  DataProviderResponse,
  LookupResponse
} from '@ghostfolio/common/interfaces';

import { Injectable, Logger } from '@nestjs/common';
import { DataSource, SymbolProfile } from '@prisma/client';
import { Big } from 'big.js';
import { format, subDays } from 'date-fns';

import { SGS_SERIES } from './bcb.constants';
import { IIndexAnchor } from './interfaces/interfaces';
import { SgsClientService } from './sgs-client.service';
import { SgsIndexBuilderService } from './sgs-index-builder.service';

@Injectable()
export class BcbService implements DataProviderInterface {
  private readonly logger = new Logger(BcbService.name);

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly prismaService: PrismaService,
    private readonly sgsClientService: SgsClientService,
    private readonly sgsIndexBuilderService: SgsIndexBuilderService
  ) {}

  public canHandle(symbol: string): boolean {
    return !!SGS_SERIES[symbol];
  }

  public async getAssetProfile({
    symbol
  }: GetAssetProfileParams): Promise<Partial<SymbolProfile>> {
    const seriesConfig = SGS_SERIES[symbol];

    if (!seriesConfig) {
      return undefined;
    }

    return {
      symbol,
      currency: seriesConfig.currency,
      dataSource: this.getName(),
      name: seriesConfig.name
    };
  }

  public getDataProviderInfo(): DataProviderInfo {
    return {
      dataSource: this.getName(),
      isPremium: false,
      name: 'Banco Central do Brasil',
      url: 'https://dadosabertos.bcb.gov.br'
    };
  }

  public async getDividends({}: GetDividendsParams): Promise<{
    [date: string]: DataProviderHistoricalResponse;
  }> {
    return {};
  }

  public async getHistorical({
    from,
    requestTimeout = this.configurationService.get('REQUEST_TIMEOUT'),
    symbol,
    to
  }: GetHistoricalParams): Promise<{
    [symbol: string]: { [date: string]: DataProviderHistoricalResponse };
  }> {
    const seriesConfig = SGS_SERIES[symbol];

    if (!seriesConfig) {
      return {};
    }

    try {
      // Anchor older than the lookback horizon is final (beyond any
      // publication lag), so chaining from it is always safe
      const lookbackFrom = subDays(from, seriesConfig.lookbackDays);

      const anchorRow = await this.prismaService.marketData.findFirst({
        orderBy: { date: 'desc' },
        where: {
          symbol,
          dataSource: this.getName(),
          date: { lt: getStartOfUtcDate(lookbackFrom) }
        }
      });

      const anchor: IIndexAnchor = anchorRow
        ? {
            date: anchorRow.date.toISOString().substring(0, 10),
            value: new Big(anchorRow.marketPrice)
          }
        : undefined;

      const observations = await this.sgsClientService.fetchObservations({
        requestTimeout,
        to,
        from: lookbackFrom,
        seriesId: seriesConfig.seriesId
      });

      const points = this.sgsIndexBuilderService.buildDailyIndex({
        anchor,
        observations,
        to,
        config: seriesConfig,
        from: lookbackFrom
      });

      const result: {
        [symbol: string]: { [date: string]: DataProviderHistoricalResponse };
      } = {
        [symbol]: {}
      };

      for (const { date, value } of points) {
        result[symbol][date] = { marketPrice: value.toNumber() };
      }

      return result;
    } catch (error) {
      throw new Error(
        `Could not get historical market data for ${symbol} (${this.getName()}) from ${format(
          from,
          DATE_FORMAT
        )} to ${format(to, DATE_FORMAT)}: [${error.name}] ${error.message}`
      );
    }
  }

  public getName(): DataSource {
    return DataSource.BCB;
  }

  public async getQuotes({
    symbols
  }: GetQuotesParams): Promise<{ [symbol: string]: DataProviderResponse }> {
    const response: { [symbol: string]: DataProviderResponse } = {};

    const catalogSymbols = symbols.filter((symbol) => {
      return this.canHandle(symbol);
    });

    if (catalogSymbols.length <= 0) {
      return response;
    }

    try {
      const marketData = await this.prismaService.marketData.findMany({
        distinct: ['symbol'],
        orderBy: { date: 'desc' },
        take: catalogSymbols.length,
        where: {
          dataSource: this.getName(),
          symbol: { in: catalogSymbols }
        }
      });

      // No fabricated quotes: symbols without persisted data are omitted
      for (const { marketPrice, symbol } of marketData) {
        response[symbol] = {
          marketPrice,
          currency: SGS_SERIES[symbol].currency,
          dataProviderInfo: this.getDataProviderInfo(),
          dataSource: this.getName(),
          marketState: 'delayed'
        };
      }

      return response;
    } catch (error) {
      this.logger.error(error);
    }

    return {};
  }

  public getTestSymbol(): string {
    return 'CDI';
  }

  public async search({ query }: GetSearchParams): Promise<LookupResponse> {
    const normalizedQuery = query?.toLowerCase() ?? '';

    const items = Object.values(SGS_SERIES)
      .filter(({ name, symbol }) => {
        return (
          symbol.toLowerCase().includes(normalizedQuery) ||
          name.toLowerCase().includes(normalizedQuery)
        );
      })
      .map(({ currency, name, symbol }) => {
        return {
          currency,
          name,
          symbol,
          assetClass: undefined,
          assetSubClass: undefined,
          dataProviderInfo: this.getDataProviderInfo(),
          dataSource: this.getName()
        };
      });

    return { items };
  }
}
