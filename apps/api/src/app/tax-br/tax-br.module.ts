import { ImpersonationModule } from '@ghostfolio/api/services/impersonation/impersonation.module';

import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { EquityTaxCalculatorService } from './equity-tax-calculator.service';
import { FixedIncomeTaxCalculatorService } from './fixed-income-tax-calculator.service';
import { MonthlyTaxAggregatorService } from './monthly-tax-aggregator.service';
import { TaxBrReportService } from './tax-br-report.service';
import { TaxBrController } from './tax-br.controller';

@Module({
  controllers: [TaxBrController],
  exports: [TaxBrReportService],
  imports: [ActivitiesModule, ImpersonationModule],
  providers: [
    EquityTaxCalculatorService,
    FixedIncomeTaxCalculatorService,
    MonthlyTaxAggregatorService,
    TaxBrReportService
  ]
})
export class TaxBrModule {}
