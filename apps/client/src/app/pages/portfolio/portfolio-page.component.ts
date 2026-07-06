import { UserService } from '@ghostfolio/client/services/user/user.service';
import { User } from '@ghostfolio/common/interfaces';
import { AllocationDriftResponse } from '@ghostfolio/common/interfaces/responses/allocation-drift-response.interface';
import { internalRoutes } from '@ghostfolio/common/routes/routes';
import {
  GfPageTabsComponent,
  TabConfiguration
} from '@ghostfolio/ui/page-tabs';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  calculatorOutline,
  cartOutline,
  pieChartOutline,
  receiptOutline,
  scanOutline,
  swapVerticalOutline
} from 'ionicons/icons';

@Component({
  host: { class: 'page' },
  imports: [CommonModule, GfPageTabsComponent, RouterLink],
  selector: 'gf-portfolio-page',
  styleUrls: ['./portfolio-page.scss'],
  templateUrl: './portfolio-page.html'
})
export class PortfolioPageComponent {
  public contributionPlanRouterLink =
    internalRoutes.portfolio.subRoutes.contributionPlan.routerLink;
  public drift: AllocationDriftResponse;
  public tabs: TabConfiguration[] = [];
  public user: User;

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private destroyRef: DestroyRef,
    private userService: UserService
  ) {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          if (state.user.settings?.isExperimentalFeatures && !this.drift) {
            this.loadAllocationDrift();
          }

          this.tabs = [
            {
              iconName: 'analytics-outline',
              label: internalRoutes.portfolio.subRoutes.analysis.title,
              routerLink: internalRoutes.portfolio.routerLink
            },
            {
              iconName: 'swap-vertical-outline',
              label: internalRoutes.portfolio.subRoutes.activities.title,
              routerLink:
                internalRoutes.portfolio.subRoutes.activities.routerLink
            },
            {
              iconName: 'pie-chart-outline',
              label: internalRoutes.portfolio.subRoutes.allocations.title,
              routerLink:
                internalRoutes.portfolio.subRoutes.allocations.routerLink
            },
            {
              iconName: 'cart-outline',
              label: internalRoutes.portfolio.subRoutes.contributionPlan.title,
              routerLink:
                internalRoutes.portfolio.subRoutes.contributionPlan.routerLink,
              showCondition: !!state.user?.settings?.isExperimentalFeatures
            },
            {
              iconName: 'calculator-outline',
              label: internalRoutes.portfolio.subRoutes.fire.title,
              routerLink: internalRoutes.portfolio.subRoutes.fire.routerLink
            },
            {
              iconName: 'scan-outline',
              label: internalRoutes.portfolio.subRoutes.xRay.title,
              routerLink: internalRoutes.portfolio.subRoutes.xRay.routerLink
            },
            {
              iconName: 'receipt-outline',
              label: internalRoutes.portfolio.subRoutes.taxBr.title,
              routerLink: internalRoutes.portfolio.subRoutes.taxBr.routerLink,
              showCondition: !!state.user?.settings?.isExperimentalFeatures
            }
          ];
          this.user = state.user;

          this.changeDetectorRef.markForCheck();
        }
      });

    addIcons({
      analyticsOutline,
      calculatorOutline,
      cartOutline,
      pieChartOutline,
      receiptOutline,
      scanOutline,
      swapVerticalOutline
    });
  }

  private loadAllocationDrift() {
    this.dataService
      .fetchAllocationDrift()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Best-effort banner: a failure here must never block the portfolio
        // shell itself from rendering, so it is intentionally silent beyond
        // simply not showing the banner.
        error: () => undefined,
        next: (drift) => {
          this.drift = drift;

          this.changeDetectorRef.markForCheck();
        }
      });
  }
}
