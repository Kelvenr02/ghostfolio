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
import {
  DataProviderHistoricalResponse,
  DataProviderInfo,
  DataProviderResponse,
  LookupResponse
} from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';
import { DataSource, SymbolProfile } from '@prisma/client';

import { SgsClientService } from './sgs-client.service';
import { SgsIndexBuilderService } from './sgs-index-builder.service';

@Injectable()
export class BcbService implements DataProviderInterface {
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly prismaService: PrismaService,
    private readonly sgsClientService: SgsClientService,
    private readonly sgsIndexBuilderService: SgsIndexBuilderService
  ) {}

  public canHandle(symbol: string): boolean {
    void symbol;
    void this.configurationService;
    void this.prismaService;
    void this.sgsClientService;
    void this.sgsIndexBuilderService;

    throw new Error('NOT_IMPLEMENTED');
  }

  public async getAssetProfile({}: GetAssetProfileParams): Promise<
    Partial<SymbolProfile>
  > {
    throw new Error('NOT_IMPLEMENTED');
  }

  public getDataProviderInfo(): DataProviderInfo {
    throw new Error('NOT_IMPLEMENTED');
  }

  public async getDividends({}: GetDividendsParams): Promise<{
    [date: string]: DataProviderHistoricalResponse;
  }> {
    throw new Error('NOT_IMPLEMENTED');
  }

  public async getHistorical({}: GetHistoricalParams): Promise<{
    [symbol: string]: { [date: string]: DataProviderHistoricalResponse };
  }> {
    throw new Error('NOT_IMPLEMENTED');
  }

  public getName(): DataSource {
    throw new Error('NOT_IMPLEMENTED');
  }

  public async getQuotes({}: GetQuotesParams): Promise<{
    [symbol: string]: DataProviderResponse;
  }> {
    throw new Error('NOT_IMPLEMENTED');
  }

  public getTestSymbol(): string {
    throw new Error('NOT_IMPLEMENTED');
  }

  public async search({}: GetSearchParams): Promise<LookupResponse> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
