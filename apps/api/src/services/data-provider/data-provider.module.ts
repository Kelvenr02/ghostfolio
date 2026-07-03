import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { CryptocurrencyModule } from '@ghostfolio/api/services/cryptocurrency/cryptocurrency.module';
import { AlphaVantageService } from '@ghostfolio/api/services/data-provider/alpha-vantage/alpha-vantage.service';
import { BcbService } from '@ghostfolio/api/services/data-provider/bcb/bcb.service';
import { SgsClientService } from '@ghostfolio/api/services/data-provider/bcb/sgs-client.service';
import { SgsIndexBuilderService } from '@ghostfolio/api/services/data-provider/bcb/sgs-index-builder.service';
import { CoinGeckoService } from '@ghostfolio/api/services/data-provider/coingecko/coingecko.service';
import { EodHistoricalDataService } from '@ghostfolio/api/services/data-provider/eod-historical-data/eod-historical-data.service';
import { FinancialModelingPrepService } from '@ghostfolio/api/services/data-provider/financial-modeling-prep/financial-modeling-prep.service';
import { GhostfolioService } from '@ghostfolio/api/services/data-provider/ghostfolio/ghostfolio.service';
import { GoogleSheetsService } from '@ghostfolio/api/services/data-provider/google-sheets/google-sheets.service';
import { ManualService } from '@ghostfolio/api/services/data-provider/manual/manual.service';
import { RapidApiService } from '@ghostfolio/api/services/data-provider/rapid-api/rapid-api.service';
import { YahooFinanceService } from '@ghostfolio/api/services/data-provider/yahoo-finance/yahoo-finance.service';
import { FetchModule } from '@ghostfolio/api/services/fetch/fetch.module';
import { MarketDataModule } from '@ghostfolio/api/services/market-data/market-data.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';
import { SymbolProfileModule } from '@ghostfolio/api/services/symbol-profile/symbol-profile.module';

import { Module } from '@nestjs/common';

import { DataEnhancerModule } from './data-enhancer/data-enhancer.module';
import { YahooFinanceDataEnhancerService } from './data-enhancer/yahoo-finance/yahoo-finance.service';
import { DataProviderService } from './data-provider.service';

@Module({
  imports: [
    ConfigurationModule,
    CryptocurrencyModule,
    DataEnhancerModule,
    FetchModule,
    MarketDataModule,
    PrismaModule,
    PropertyModule,
    RedisCacheModule,
    SymbolProfileModule
  ],
  providers: [
    AlphaVantageService,
    BcbService,
    SgsClientService,
    SgsIndexBuilderService,
    CoinGeckoService,
    DataProviderService,
    EodHistoricalDataService,
    FinancialModelingPrepService,
    GhostfolioService,
    GoogleSheetsService,
    ManualService,
    RapidApiService,
    YahooFinanceService,
    {
      inject: [
        AlphaVantageService,
        BcbService,
        CoinGeckoService,
        EodHistoricalDataService,
        FinancialModelingPrepService,
        GhostfolioService,
        GoogleSheetsService,
        ManualService,
        RapidApiService,
        YahooFinanceService
      ],
      provide: 'DataProviderInterfaces',
      useFactory: (
        alphaVantageService,
        bcbService,
        coinGeckoService,
        eodHistoricalDataService,
        financialModelingPrepService,
        ghostfolioService,
        googleSheetsService,
        manualService,
        rapidApiService,
        yahooFinanceService
      ) => [
        alphaVantageService,
        bcbService,
        coinGeckoService,
        eodHistoricalDataService,
        financialModelingPrepService,
        ghostfolioService,
        googleSheetsService,
        manualService,
        rapidApiService,
        yahooFinanceService
      ]
    },
    YahooFinanceDataEnhancerService
  ],
  exports: [DataProviderService, ManualService, YahooFinanceService]
})
export class DataProviderModule {}
