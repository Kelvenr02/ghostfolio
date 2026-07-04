import {
  AllocationTargetItemDto,
  UpdateAllocationTargetsDto
} from '@ghostfolio/common/dtos';
import { AllocationTarget, LookupItem } from '@ghostfolio/common/interfaces';
import { validateObjectForForm } from '@ghostfolio/common/utils';
import { DataService } from '@ghostfolio/ui/services';
import { GfSymbolAutocompleteComponent } from '@ghostfolio/ui/symbol-autocomplete';

import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DataSource, PurchaseMode } from '@prisma/client';
import { addIcons } from 'ionicons';
import { addOutline, closeOutline } from 'ionicons/icons';

import { EditAllocationTargetsDialogParams } from './interfaces/interfaces';

const TARGET_PERCENTAGE_SUM_IN_CENTS = 10_000;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'h-100' },
  imports: [
    GfSymbolAutocompleteComponent,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule
  ],
  selector: 'gf-edit-allocation-targets-dialog',
  styleUrls: ['./edit-allocation-targets-dialog.scss'],
  templateUrl: 'edit-allocation-targets-dialog.html'
})
export class GfEditAllocationTargetsDialogComponent implements OnInit {
  protected readonly PurchaseMode = PurchaseMode;

  protected errorMessage: string;
  protected isSubmitting = false;
  protected targetsForm: FormGroup;

  protected readonly data =
    inject<EditAllocationTargetsDialogParams>(MAT_DIALOG_DATA);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly dialogRef =
    inject<MatDialogRef<GfEditAllocationTargetsDialogComponent>>(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);

  public constructor() {
    addIcons({ addOutline, closeOutline });
  }

  public ngOnInit() {
    this.targetsForm = this.formBuilder.group({
      targets: this.formBuilder.array(
        (this.data.targets ?? []).map((target) => {
          return this.buildTargetGroup(target);
        }),
        [this.sumOfTargetPercentagesValidator()]
      )
    });

    if (this.targetsRows.length === 0) {
      this.addTarget();
    }
  }

  protected get targetsRows(): FormArray {
    return this.targetsForm.get('targets') as FormArray;
  }

  protected get sumOfTargetPercentagesInCents(): number {
    return this.getSumOfTargetPercentagesInCents(this.targetsRows);
  }

  protected get remainingPercentage(): number {
    return (
      (TARGET_PERCENTAGE_SUM_IN_CENTS - this.sumOfTargetPercentagesInCents) /
      100
    );
  }

  protected addTarget() {
    this.targetsRows.push(this.buildTargetGroup());
    this.targetsRows.updateValueAndValidity();
  }

  protected removeTarget(index: number) {
    this.targetsRows.removeAt(index);
    this.targetsRows.updateValueAndValidity();
  }

  protected onCancel() {
    this.dialogRef.close();
  }

  protected async onSubmit() {
    if (this.isSubmitting) {
      return;
    }

    this.errorMessage = undefined;

    const targets: AllocationTargetItemDto[] = this.targetsRows.controls.map(
      (group: FormGroup) => {
        const assetProfile: LookupItem = group.get('assetProfile')?.value;
        const purchaseMode: PurchaseMode = group.get('purchaseMode')?.value;

        return {
          dataSource: assetProfile?.dataSource as DataSource,
          minPurchaseValue:
            purchaseMode === PurchaseMode.CONTINUOUS
              ? (group.get('minPurchaseValue')?.value ?? 0)
              : undefined,
          purchaseMode,
          symbol: assetProfile?.symbol,
          targetPercentage: group.get('targetPercentage')?.value
        };
      }
    );

    const updateAllocationTargetsDto: UpdateAllocationTargetsDto = {
      targets
    };

    try {
      await validateObjectForForm({
        classDto: UpdateAllocationTargetsDto,
        form: this.targetsForm,
        object: updateAllocationTargetsDto
      });
    } catch (error) {
      console.error(error);

      this.errorMessage = $localize`Verifique os campos destacados: há dados inválidos ou incompletos nos alvos de alocação.`;
      this.changeDetectorRef.markForCheck();

      return;
    }

    this.isSubmitting = true;

    this.dataService
      .putAllocationTargets(updateAllocationTargetsDto)
      .subscribe({
        error: (error: HttpErrorResponse) => {
          this.isSubmitting = false;
          this.errorMessage =
            error?.error?.message ??
            $localize`Não foi possível salvar os alvos de alocação.`;
        },
        next: (response) => {
          this.isSubmitting = false;

          this.dialogRef.close(response);
        }
      });
  }

  private buildTargetGroup(target?: AllocationTarget): FormGroup {
    const purchaseMode = target?.purchaseMode ?? PurchaseMode.DISCRETE;
    const isContinuous = purchaseMode === PurchaseMode.CONTINUOUS;

    const assetProfile: LookupItem = target
      ? // A moeda não é conhecida pelo cliente (a API não a expõe em
        // AllocationTarget) e não é mais enviada ao servidor - o backend é a
        // fonte autoritativa (ver FIX 1, contribution-plan.service.ts). Este
        // placeholder só preenche o tipo LookupItem para pré-carregar a
        // linha no gf-symbol-autocomplete; nunca é lido ou submetido.
        ({
          currency: '',
          dataSource: target.dataSource,
          name: target.name,
          symbol: target.symbol
        } as LookupItem)
      : null;

    const group = this.formBuilder.group({
      assetProfile: [assetProfile, Validators.required],
      minPurchaseValue: [
        {
          disabled: !isContinuous,
          value: target?.minPurchaseValue ?? null
        },
        isContinuous ? [Validators.required, Validators.min(0)] : []
      ],
      purchaseMode: [purchaseMode, Validators.required],
      targetPercentage: [
        target?.targetPercentage ?? null,
        [Validators.required, Validators.min(0.01), Validators.max(100)]
      ]
    });

    group.get('purchaseMode')?.valueChanges.subscribe((mode: PurchaseMode) => {
      const minPurchaseValueControl = group.get('minPurchaseValue');

      if (mode === PurchaseMode.CONTINUOUS) {
        minPurchaseValueControl?.enable({ emitEvent: false });
        minPurchaseValueControl?.setValidators([
          Validators.required,
          Validators.min(0)
        ]);
      } else {
        minPurchaseValueControl?.setValue(null, { emitEvent: false });
        minPurchaseValueControl?.clearValidators();
        minPurchaseValueControl?.disable({ emitEvent: false });
      }

      minPurchaseValueControl?.updateValueAndValidity({ emitEvent: false });
    });

    group.get('targetPercentage')?.valueChanges.subscribe(() => {
      this.targetsRows?.updateValueAndValidity({ emitEvent: false });
    });

    return group;
  }

  private getSumOfTargetPercentagesInCents(targetsRows: FormArray): number {
    return targetsRows.controls.reduce((sum: number, group: FormGroup) => {
      const value = group.get('targetPercentage')?.value;

      // Never sum floats directly - normalize each target percentage to an
      // integer number of cents (basis points of 1%) before summing, so the
      // exact-equality check against 10 000 (= 100.00%) is safe.
      const cents = Number.isFinite(value) ? Math.round(value * 100) : 0;

      return sum + cents;
    }, 0);
  }

  private sumOfTargetPercentagesValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const formArray = control as FormArray;
      const sumInCents = this.getSumOfTargetPercentagesInCents(formArray);

      return sumInCents === TARGET_PERCENTAGE_SUM_IN_CENTS
        ? null
        : {
            sumOfTargetPercentages: {
              actualInCents: sumInCents,
              expectedInCents: TARGET_PERCENTAGE_SUM_IN_CENTS
            }
          };
    };
  }
}
