import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { ImpersonationService } from '@ghostfolio/api/services/impersonation/impersonation.service';
import { HEADER_KEY_IMPERSONATION } from '@ghostfolio/common/config';
import { TaxBrReportResponse } from '@ghostfolio/common/interfaces';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  Query,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { TaxBrReportService } from './tax-br-report.service';
import { toBrtCalendarDate } from './tax-br.helper';

@Controller('tax-br')
export class TaxBrController {
  public constructor(
    private readonly impersonationService: ImpersonationService,
    @Inject(REQUEST) private readonly request: RequestWithUser,
    private readonly taxBrReportService: TaxBrReportService
  ) {}

  @Get('report')
  @HasPermission(permissions.accessTaxBrReport)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getReport(
    @Headers(HEADER_KEY_IMPERSONATION.toLowerCase()) impersonationId: string,
    @Query('year') yearParam?: string,
    @Query('month') monthParam?: string
  ): Promise<TaxBrReportResponse> {
    const impersonationUserId =
      await this.impersonationService.validateImpersonationId(impersonationId);

    let year: number;
    let month: number | undefined;

    if (yearParam == null && monthParam == null) {
      const [currentYear, currentMonth] = toBrtCalendarDate(new Date())
        .slice(0, 7)
        .split('-')
        .map(Number);

      year = currentYear;
      month = currentMonth;
    } else {
      year =
        yearParam != null
          ? this.parseYear(yearParam)
          : Number(toBrtCalendarDate(new Date()).slice(0, 4));
      month = monthParam != null ? this.parseMonth(monthParam) : undefined;
    }

    return this.taxBrReportService.getReport({
      month,
      year,
      userId: impersonationUserId || this.request.user.id
    });
  }

  private parseYear(yearParam: string): number {
    const year = Number(yearParam);

    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw new BadRequestException('year must be a 4-digit integer');
    }

    return year;
  }

  private parseMonth(monthParam: string): number {
    const month = Number(monthParam);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException(
        'month must be an integer between 1 and 12'
      );
    }

    return month;
  }
}
