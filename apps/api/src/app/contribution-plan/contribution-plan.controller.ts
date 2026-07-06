import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { ImpersonationService } from '@ghostfolio/api/services/impersonation/impersonation.service';
import { HEADER_KEY_IMPERSONATION } from '@ghostfolio/common/config';
import { UpdateAllocationTargetsDto } from '@ghostfolio/common/dtos';
import {
  AllocationTargetsResponse,
  ContributionPlanResponse
} from '@ghostfolio/common/interfaces';
import { AllocationDriftResponse } from '@ghostfolio/common/interfaces/responses/allocation-drift-response.interface';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { ContributionPlanService } from './contribution-plan.service';
import { GetContributionPlanQueryDto } from './dto/get-contribution-plan-query.dto';

@Controller('contribution-plan')
export class ContributionPlanController {
  public constructor(
    private readonly contributionPlanService: ContributionPlanService,
    private readonly impersonationService: ImpersonationService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Get()
  @HasPermission(permissions.accessContributionPlan)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getContributionPlan(
    @Headers(HEADER_KEY_IMPERSONATION.toLowerCase()) impersonationId: string,
    @Query() { amount }: GetContributionPlanQueryDto
  ): Promise<ContributionPlanResponse> {
    const impersonationUserId =
      await this.impersonationService.validateImpersonationId(impersonationId);

    return this.contributionPlanService.createPlan({
      amount,
      impersonationId,
      userId: impersonationUserId || this.request.user.id
    });
  }

  @Get('drift')
  @HasPermission(permissions.accessContributionPlan)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getAllocationDrift(
    @Headers(HEADER_KEY_IMPERSONATION.toLowerCase()) impersonationId: string
  ): Promise<AllocationDriftResponse> {
    const impersonationUserId =
      await this.impersonationService.validateImpersonationId(impersonationId);

    return this.contributionPlanService.getAllocationDrift({
      impersonationId,
      userId: impersonationUserId || this.request.user.id
    });
  }

  @Get('targets')
  @HasPermission(permissions.accessContributionPlan)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getTargets(
    @Headers(HEADER_KEY_IMPERSONATION.toLowerCase()) impersonationId: string
  ): Promise<AllocationTargetsResponse> {
    const impersonationUserId =
      await this.impersonationService.validateImpersonationId(impersonationId);

    return this.contributionPlanService.getTargets(
      impersonationUserId || this.request.user.id
    );
  }

  @Put('targets')
  @HasPermission(permissions.accessContributionPlan)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async putTargets(
    @Body() dto: UpdateAllocationTargetsDto
  ): Promise<AllocationTargetsResponse> {
    // Writes never go through impersonation - always the real signed-in user,
    // never the impersonated one (§6.2 of the plan).
    return this.contributionPlanService.replaceTargets(
      this.request.user.id,
      dto
    );
  }
}
