import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { ExchangeRateDataModule } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.module';
import { ImpersonationModule } from '@ghostfolio/api/services/impersonation/impersonation.module';
import { MarketDataModule } from '@ghostfolio/api/services/market-data/market-data.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { PortfolioModule } from '../portfolio/portfolio.module';
import { ContributionPlanController } from './contribution-plan.controller';
import { ContributionPlanService } from './contribution-plan.service';

@Module({
  controllers: [ContributionPlanController],
  imports: [
    DataProviderModule,
    ExchangeRateDataModule,
    ImpersonationModule,
    MarketDataModule,
    PortfolioModule,
    PrismaModule
  ],
  providers: [ContributionPlanService]
})
export class ContributionPlanModule {}
