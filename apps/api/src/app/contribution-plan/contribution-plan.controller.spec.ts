import { HAS_PERMISSION_KEY } from '@ghostfolio/api/decorators/has-permission.decorator';
import { permissions } from '@ghostfolio/common/permissions';

import 'reflect-metadata';

import { ContributionPlanController } from './contribution-plan.controller';

describe('ContributionPlanController', () => {
  let contributionPlanServiceMock: {
    createPlan: jest.Mock;
    getTargets: jest.Mock;
    replaceTargets: jest.Mock;
  };
  let impersonationServiceMock: { validateImpersonationId: jest.Mock };
  let requestMock: { user: { id: string } };
  let controller: ContributionPlanController;

  beforeEach(() => {
    contributionPlanServiceMock = {
      createPlan: jest.fn().mockResolvedValue({}),
      getTargets: jest.fn().mockResolvedValue({ targets: [] }),
      replaceTargets: jest.fn().mockResolvedValue({ targets: [] })
    };
    impersonationServiceMock = {
      validateImpersonationId: jest.fn().mockResolvedValue(undefined)
    };
    requestMock = { user: { id: 'user-1' } };

    controller = new ContributionPlanController(
      contributionPlanServiceMock as never,
      impersonationServiceMock as never,
      requestMock as never
    );
  });

  it('requires the accessContributionPlan permission on GET /contribution-plan, so HasPermissionGuard returns 403 without it', () => {
    const requiredPermission = Reflect.getMetadata(
      HAS_PERMISSION_KEY,
      ContributionPlanController.prototype.getContributionPlan
    );

    expect(requiredPermission).toBe(permissions.accessContributionPlan);
  });

  it('requires the accessContributionPlan permission on GET /contribution-plan/targets', () => {
    const requiredPermission = Reflect.getMetadata(
      HAS_PERMISSION_KEY,
      ContributionPlanController.prototype.getTargets
    );

    expect(requiredPermission).toBe(permissions.accessContributionPlan);
  });

  it('requires the accessContributionPlan permission on PUT /contribution-plan/targets', () => {
    const requiredPermission = Reflect.getMetadata(
      HAS_PERMISSION_KEY,
      ContributionPlanController.prototype.putTargets
    );

    expect(requiredPermission).toBe(permissions.accessContributionPlan);
  });

  it('resolves the impersonated user id and delegates the calculation to contributionPlanService.createPlan', async () => {
    impersonationServiceMock.validateImpersonationId.mockResolvedValue(
      'impersonated-user'
    );

    await controller.getContributionPlan('impersonation-1', { amount: 300 });

    expect(
      impersonationServiceMock.validateImpersonationId
    ).toHaveBeenCalledWith('impersonation-1');
    expect(contributionPlanServiceMock.createPlan).toHaveBeenCalledWith({
      amount: 300,
      impersonationId: 'impersonation-1',
      userId: 'impersonated-user'
    });
  });

  it('falls back to the signed-in user id when there is no impersonation for the calculation', async () => {
    await controller.getContributionPlan(undefined, { amount: 130 });

    expect(contributionPlanServiceMock.createPlan).toHaveBeenCalledWith({
      amount: 130,
      impersonationId: undefined,
      userId: 'user-1'
    });
  });

  it('resolves the impersonated user id and delegates to contributionPlanService.getTargets', async () => {
    impersonationServiceMock.validateImpersonationId.mockResolvedValue(
      'impersonated-user'
    );

    await controller.getTargets('impersonation-1');

    expect(contributionPlanServiceMock.getTargets).toHaveBeenCalledWith(
      'impersonated-user'
    );
  });

  it('falls back to the signed-in user id when there is no impersonation for GET /targets', async () => {
    await controller.getTargets(undefined);

    expect(contributionPlanServiceMock.getTargets).toHaveBeenCalledWith(
      'user-1'
    );
  });

  it('never uses impersonation for PUT /targets - writes always go through the signed-in user', async () => {
    const dto = { targets: [] } as never;

    await controller.putTargets(dto);

    expect(contributionPlanServiceMock.replaceTargets).toHaveBeenCalledWith(
      'user-1',
      dto
    );
    expect(
      impersonationServiceMock.validateImpersonationId
    ).not.toHaveBeenCalled();
  });
});
