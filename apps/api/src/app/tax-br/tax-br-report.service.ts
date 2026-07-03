import { TaxBrReportResponse } from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';

import { ActivitiesService } from '../activities/activities.service';
import { EquityTaxCalculatorService } from './equity-tax-calculator.service';
import { FixedIncomeTaxCalculatorService } from './fixed-income-tax-calculator.service';
import { MonthlyTaxAggregatorService } from './monthly-tax-aggregator.service';

@Injectable()
export class TaxBrReportService {
  public constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly equityTaxCalculatorService: EquityTaxCalculatorService,
    private readonly fixedIncomeTaxCalculatorService: FixedIncomeTaxCalculatorService,
    private readonly monthlyTaxAggregatorService: MonthlyTaxAggregatorService
  ) {}

  public async getReport(params: {
    month?: number;
    userId: string;
    year: number;
  }): Promise<TaxBrReportResponse> {
    void params;
    void this.activitiesService;
    void this.equityTaxCalculatorService;
    void this.fixedIncomeTaxCalculatorService;
    void this.monthlyTaxAggregatorService;
    throw new Error('Method not implemented.');
  }
}
