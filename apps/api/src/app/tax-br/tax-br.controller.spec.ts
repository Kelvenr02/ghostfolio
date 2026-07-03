import { HAS_PERMISSION_KEY } from '@ghostfolio/api/decorators/has-permission.decorator';
import { permissions } from '@ghostfolio/common/permissions';

import 'reflect-metadata';

import { TaxBrController } from './tax-br.controller';
import { toBrtCalendarDate } from './tax-br.helper';

describe('TaxBrController', () => {
  it('requires the accessTaxBrReport permission, so HasPermissionGuard returns 403 without it', () => {
    const requiredPermission = Reflect.getMetadata(
      HAS_PERMISSION_KEY,
      TaxBrController.prototype.getReport
    );

    expect(requiredPermission).toBe(permissions.accessTaxBrReport);
  });

  it('assumes the current BRT year and month when no query params are given', async () => {
    const impersonationServiceMock = {
      validateImpersonationId: jest.fn().mockResolvedValue(undefined)
    };
    const taxBrReportServiceMock = {
      getReport: jest.fn().mockResolvedValue({})
    };
    const requestMock = { user: { id: 'user-1' } };

    const controller = new TaxBrController(
      impersonationServiceMock as never,
      requestMock as never,
      taxBrReportServiceMock as never
    );

    await controller.getReport(undefined, undefined, undefined);

    const [expectedYear, expectedMonth] = toBrtCalendarDate(new Date())
      .slice(0, 7)
      .split('-')
      .map(Number);

    expect(taxBrReportServiceMock.getReport).toHaveBeenCalledWith({
      month: expectedMonth,
      userId: 'user-1',
      year: expectedYear
    });
  });

  it('returns all 12 months when only year is given', async () => {
    const impersonationServiceMock = {
      validateImpersonationId: jest.fn().mockResolvedValue(undefined)
    };
    const taxBrReportServiceMock = {
      getReport: jest.fn().mockResolvedValue({})
    };
    const requestMock = { user: { id: 'user-1' } };

    const controller = new TaxBrController(
      impersonationServiceMock as never,
      requestMock as never,
      taxBrReportServiceMock as never
    );

    await controller.getReport(undefined, '2025', undefined);

    expect(taxBrReportServiceMock.getReport).toHaveBeenCalledWith({
      userId: 'user-1',
      year: 2025,
      month: undefined
    });
  });
});
