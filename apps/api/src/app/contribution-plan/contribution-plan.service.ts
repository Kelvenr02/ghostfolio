import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { ContributionPlanResponse } from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';

import { PortfolioService } from '../portfolio/portfolio.service';

@Injectable()
export class ContributionPlanService {
  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly marketDataService: MarketDataService,
    private readonly portfolioService: PortfolioService,
    private readonly prismaService: PrismaService
  ) {
    void this.dataProviderService;
    void this.exchangeRateDataService;
    void this.marketDataService;
    void this.portfolioService;
    void this.prismaService;
  }

  public async createPlan(input: {
    amount: number;
    impersonationId: string;
    userId: string;
  }): Promise<ContributionPlanResponse> {
    void input;

    throw new Error('not implemented');
  }
}
