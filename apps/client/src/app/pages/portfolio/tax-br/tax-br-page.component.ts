import { UserService } from '@ghostfolio/client/services/user/user.service';
import { TaxBrReportResponse } from '@ghostfolio/common/interfaces';
import { User } from '@ghostfolio/common/interfaces/user.interface';
import { DataService } from '@ghostfolio/ui/services';

import { ChangeDetectorRef, Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

@Component({
  imports: [NgxSkeletonLoaderModule],
  selector: 'gf-tax-br-page',
  styleUrl: './tax-br-page.component.scss',
  templateUrl: './tax-br-page.component.html'
})
export class GfTaxBrPageComponent {
  public isLoading = false;
  public report: TaxBrReportResponse;
  public user: User;

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private destroyRef: DestroyRef,
    private userService: UserService
  ) {}

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          if (this.user.settings?.isExperimentalFeatures && !this.report) {
            this.initializeTaxBrReport();
          }

          this.changeDetectorRef.markForCheck();
        }
      });
  }

  private initializeTaxBrReport() {
    this.isLoading = true;

    const now = new Date();

    this.dataService
      .fetchTaxBrReport({ year: now.getFullYear() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((report) => {
        this.report = report;
        this.isLoading = false;

        this.changeDetectorRef.markForCheck();
      });
  }
}
