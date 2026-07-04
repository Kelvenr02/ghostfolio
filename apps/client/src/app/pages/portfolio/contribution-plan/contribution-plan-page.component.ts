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
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { GfEditAllocationTargetsDialogComponent } from './edit-allocation-targets-dialog/edit-allocation-targets-dialog.component';
import { EditAllocationTargetsDialogParams } from './edit-allocation-targets-dialog/interfaces/interfaces';

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
    private dialog: MatDialog,
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

  public openEditAllocationTargetsDialog() {
    const dialogRef = this.dialog.open<
      GfEditAllocationTargetsDialogComponent,
      EditAllocationTargetsDialogParams
    >(GfEditAllocationTargetsDialogComponent, {
      data: {
        targets: this.targets?.targets ?? []
      },
      height: '80vh',
      width: '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: AllocationTargetsResponse | undefined) => {
        if (result) {
          this.initializeAllocationTargets();
        }
      });
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
