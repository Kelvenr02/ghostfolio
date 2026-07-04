import { UserService } from '@ghostfolio/client/services/user/user.service';
import {
  AllocationTargetsResponse,
  ContributionPlanResponse
} from '@ghostfolio/common/interfaces';
import { User } from '@ghostfolio/common/interfaces/user.interface';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

@Component({
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    NgxSkeletonLoaderModule,
    ReactiveFormsModule
  ],
  selector: 'gf-contribution-plan-page',
  styleUrl: './contribution-plan-page.component.scss',
  templateUrl: './contribution-plan-page.component.html'
})
export class GfContributionPlanPageComponent {
  public contributionForm: FormGroup;
  public isCalculating = false;
  public isLoading = false;
  public plan: ContributionPlanResponse;
  public targets: AllocationTargetsResponse;
  public user: User;

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private destroyRef: DestroyRef,
    private formBuilder: FormBuilder,
    private userService: UserService
  ) {
    this.contributionForm = this.formBuilder.group({
      amount: [null, [Validators.required, Validators.min(0)]]
    });
  }

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          if (this.user.settings?.isExperimentalFeatures && !this.targets) {
            this.initializeAllocationTargets();
          }

          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public calculateContributionPlan() {
    if (this.contributionForm.invalid) {
      return;
    }

    this.isCalculating = true;

    const { amount } = this.contributionForm.value;

    this.dataService
      .fetchContributionPlan({ amount })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((plan) => {
        this.plan = plan;
        this.isCalculating = false;

        this.changeDetectorRef.markForCheck();
      });
  }

  // TODO(B7): abrir o dialog de edição de alvos (create-or-update-account-dialog como referência de estilo)
  public openEditAllocationTargetsDialog() {
    // TODO(B7): implementar abertura do MatDialog de edição de alvos
  }

  private initializeAllocationTargets() {
    this.isLoading = true;

    this.dataService
      .fetchAllocationTargets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((targets) => {
        this.targets = targets;
        this.isLoading = false;

        this.changeDetectorRef.markForCheck();
      });
  }
}
