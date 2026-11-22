import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ToastService } from '../../core/notifications/toast.service';
import { NewVehicle, VehicleChanges, VehicleDetail, VehicleOwnership } from '../../domain/models/vehicles';
import { VehiclesFacade } from './vehicles.facade';
import { VEHICLE_LIMITS, capacityValidator } from './vehicles.limits';
import { FUEL_OPTIONS, OWNERSHIP_LABELS } from './vehicles.labels';

interface Option {
  readonly value: string;
  readonly label: string;
}

/** Campo del servidor (`body.model_year`) → control del formulario. */
const SERVER_FIELDS: Readonly<Record<string, string>> = {
  plate: 'plate',
  configuration_code: 'configurationCode',
  vehicle_type: 'vehicleType',
  fuel_type: 'fuelType',
  model_year: 'modelYear',
  technology: 'technology',
  capacity_tons: 'capacityTons',
  ownership: 'ownership',
};

type ControlName = 'plate' | 'configurationCode' | 'vehicleType' | 'fuelType' | 'modelYear' | 'technology' | 'capacityTons' | 'ownership';

interface FormValue {
  readonly plate: string;
  readonly configurationCode: string;
  readonly vehicleType: string;
  readonly fuelType: string;
  readonly modelYear: number | null;
  readonly technology: string;
  readonly capacityTons: string;
  readonly ownership: string;
}

const DECIMAL = /^\d+(\.\d+)?$/;

const OWNERSHIP_OPTIONS = (Object.keys(OWNERSHIP_LABELS) as VehicleOwnership[]).map((value) => ({ value, label: OWNERSHIP_LABELS[value] }));
const text = (value: string): string | undefined => value.trim() || undefined;
const blank = (value: string | null): string => value ?? '';

/**
 * Registro manual (sin `vehicle`) y edición (con `vehicle`) de un vehículo. En la edición solo se envía lo que cambió; cambiar la
 * configuración o el tipo exige marcar una confirmación explícita (`confirm_structural`).
 */
@Component({
  selector: 'app-vehicle-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      .confirm { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--c-warning) 40%, var(--c-bd)); border-radius: 10px; background: var(--c-warn-soft); font-size: 0.88rem; }
      .confirm input { margin-top: 3px; accent-color: var(--c-primary); }
      .fixed { margin: 0; font-weight: 700; letter-spacing: 0.02em; color: var(--c-head); }
    `,
  ],
  template: `
    <dialog #dialog class="dialog dialog-pro" aria-labelledby="vehicle-form-title" (close)="closed.emit()" data-testid="vehicle-form">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <header class="dp-head">
          <span class="dp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7h18v10H3zM6.5 12h2M11 12h2M15.5 12h2" /></svg></span>
          <div>
            <h2 id="vehicle-form-title">{{ editing() ? 'Editar vehículo' : 'Registrar vehículo' }}</h2>
            <p>{{ editing() ? 'Cambia solo lo que haga falta; el historial guarda cada cambio.' : 'Los campos con * son obligatorios.' }}</p>
          </div>
        </header>
        <div class="dialog-body" aria-live="polite">
          @if (error(); as e) {
            <div class="alert alert-danger" role="alert" data-testid="form-error">{{ e.message }}</div>
          }
          @if (vehicle(); as v) {
            <div class="field"><span class="muted small">Placa</span><p class="fixed">{{ v.plate }}</p></div>
          } @else {
            <div class="field">
              <label for="vf-plate">Placa *</label>
              <input id="vf-plate" class="input" type="text" formControlName="plate" maxlength="12" autocomplete="off" [attr.aria-invalid]="invalid('plate')" aria-describedby="vf-plate-err" />
              <span id="vf-plate-err" class="field-error">{{ message('plate') }}</span>
            </div>
          }
          <div class="dp-grid">
            <div class="field">
              <label for="vf-config">Configuración</label>
              <select id="vf-config" class="input" formControlName="configurationCode">
                <option value="">Sin definir</option>
                @for (o of configurationOptions(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
              </select>
              <span class="field-error">{{ message('configurationCode') }}</span>
            </div>
            <div class="field">
              <label for="vf-type">Tipo de vehículo</label>
              <input id="vf-type" class="input" type="text" formControlName="vehicleType" [attr.maxlength]="limits.textMax" />
              <span class="field-error">{{ message('vehicleType') }}</span>
            </div>
            <div class="field">
              <label for="vf-fuel">Combustible</label>
              <select id="vf-fuel" class="input" formControlName="fuelType">
                <option value="">Sin definir</option>
                @for (o of fuelOptions(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
              </select>
              <span class="field-error">{{ message('fuelType') }}</span>
            </div>
            <div class="field">
              <label for="vf-year">Modelo (año)</label>
              <input id="vf-year" class="input" type="number" inputmode="numeric" formControlName="modelYear" [attr.min]="minYear" [attr.max]="maxYear" />
              <span class="field-error">{{ message('modelYear') }}</span>
            </div>
            <div class="field">
              <label for="vf-tech">Tecnología</label>
              <input id="vf-tech" class="input" type="text" formControlName="technology" [attr.maxlength]="limits.textMax" />
              <span class="field-error">{{ message('technology') }}</span>
            </div>
            <div class="field">
              <label for="vf-capacity">Capacidad (toneladas)</label>
              <input id="vf-capacity" class="input" type="text" inputmode="decimal" autocomplete="off" formControlName="capacityTons" aria-describedby="vf-capacity-hint" />
              <span id="vf-capacity-hint" class="muted small">Con punto decimal, por ejemplo 8.5</span>
              <span class="field-error">{{ message('capacityTons') }}</span>
            </div>
            <div class="field">
              <label for="vf-ownership">Propiedad</label>
              <select id="vf-ownership" class="input" formControlName="ownership">
                @for (o of ownershipOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
              </select>
            </div>
          </div>
          @if (structural()) {
            <label class="confirm">
              <input type="checkbox" data-testid="confirm-structural" [checked]="confirmed()" (change)="confirmed.set(!confirmed())" />
              <span>Entiendo que cambiar la configuración o el tipo modifica la estructura del vehículo y queda en su historial.</span>
            </label>
          }
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" (click)="dialog.close()">Cancelar</button>
          <button type="submit" class="btn btn-primary" data-testid="save-vehicle" [disabled]="busy() || !canSave()">{{ busy() ? 'Guardando…' : editing() ? 'Guardar cambios' : 'Registrar vehículo' }}</button>
        </div>
      </form>
    </dialog>
  `,
})
export class VehicleFormComponent {
  private readonly facade = inject(VehiclesFacade);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Vehículo a editar; sin él el diálogo registra uno nuevo. */
  readonly vehicle = input<VehicleDetail | null>(null);
  readonly closed = output();

  protected readonly minYear = VEHICLE_LIMITS.yearMin;
  protected readonly maxYear = VEHICLE_LIMITS.yearMax;
  protected readonly limits = VEHICLE_LIMITS;
  protected readonly ownershipOptions: readonly Option[] = OWNERSHIP_OPTIONS;
  protected readonly busy = signal(false);
  protected readonly error = signal<AppError | null>(null);
  protected readonly confirmed = signal(false);
  protected readonly editing = computed(() => this.vehicle() !== null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    plate: ['', [Validators.required, Validators.pattern(/^\s*[A-Za-z0-9 -]{5,12}\s*$/)]],
    configurationCode: ['', Validators.maxLength(VEHICLE_LIMITS.configurationMax)],
    vehicleType: ['', Validators.maxLength(VEHICLE_LIMITS.textMax)],
    fuelType: ['', Validators.maxLength(VEHICLE_LIMITS.textMax)],
    modelYear: [null as number | null, [Validators.min(this.minYear), Validators.max(this.maxYear)]],
    technology: ['', Validators.maxLength(VEHICLE_LIMITS.textMax)],
    capacityTons: ['', [capacityValidator]],
    ownership: ['UNKNOWN'],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly configurationOptions = computed<readonly Option[]>(() => {
    const options = (this.facade.catalog.data()?.items ?? []).map((item) => ({ value: item.code, label: `${item.code} · ${item.shortName}` }));
    const current = this.vehicle()?.configurationCode;

    return current && !options.some((o) => o.value === current) ? [{ value: current, label: `${current} (no reconocida)` }, ...options] : options;
  });

  protected readonly fuelOptions = computed<readonly Option[]>(() => {
    const options = FUEL_OPTIONS;
    const current = this.vehicle()?.fuelType;

    return current && !options.some((o) => o.value === current) ? [{ value: current, label: current }, ...options] : options;
  });

  /** Lo que cambió respecto al vehículo editado (vacío al registrar). */
  private readonly changes = computed<VehicleChanges>(() => {
    const v = this.vehicle();
    const f = this.value();

    if (!v) return {};

    const next: { -readonly [K in keyof VehicleChanges]: VehicleChanges[K] } = {};
    if ((f.configurationCode ?? '') !== blank(v.configurationCode) && f.configurationCode) next.configurationCode = f.configurationCode;
    if ((f.vehicleType ?? '').trim() !== blank(v.vehicleType) && text(f.vehicleType ?? '')) next.vehicleType = text(f.vehicleType ?? '');
    if ((f.fuelType ?? '') !== blank(v.fuelType) && f.fuelType) next.fuelType = f.fuelType;
    if (f.modelYear !== null && f.modelYear !== undefined && f.modelYear !== v.modelYear) next.modelYear = f.modelYear;
    if ((f.technology ?? '').trim() !== blank(v.technology) && text(f.technology ?? '')) next.technology = text(f.technology ?? '');
    const capacity = DECIMAL.test((f.capacityTons ?? '').trim()) ? Number(f.capacityTons) : null;
    if (capacity !== null && capacity !== v.capacityTons) next.capacityTons = capacity;
    if (f.ownership && f.ownership !== v.ownership) next.ownership = f.ownership as VehicleOwnership;

    return next;
  });

  /** Solo cambiar un campo estructural que ya tenía valor exige confirmación (poner el primer valor no). */
  protected readonly structural = computed(() => {
    const v = this.vehicle();
    const changes = this.changes();

    return !!v && ((changes.configurationCode !== undefined && !!v.configurationCode) || (changes.vehicleType !== undefined && !!v.vehicleType));
  });
  protected readonly canSave = computed(() => !this.editing() || (Object.keys(this.changes()).length > 0 && (!this.structural() || this.confirmed())));

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;

      // showModal() mueve el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!dialog.open) dialog.showModal();
    });
    effect(() => {
      const v = this.vehicle();

      if (v) {
        untracked(() =>
          this.form.patchValue({
            configurationCode: blank(v.configurationCode),
            vehicleType: blank(v.vehicleType),
            fuelType: blank(v.fuelType),
            modelYear: v.modelYear,
            technology: blank(v.technology),
            capacityTons: v.capacityTons === null ? '' : String(v.capacityTons),
            ownership: v.ownership,
          }),
        );
        this.form.controls.plate.disable();
      }
    });
    effect(() => {
      untracked(() => {
        if (this.facade.catalog.status() === 'idle') this.facade.loadCatalog();
      });
    });
  }

  protected invalid(name: ControlName): boolean {
    const control = this.form.controls[name];

    return control.touched && control.invalid;
  }

  protected message(name: ControlName): string {
    const control: AbstractControl = this.form.controls[name];

    if (!control.touched || !control.errors) return '';
    if (control.errors['server']) return 'El servidor no aceptó este dato. Revísalo.';
    if (control.errors['conflict']) return 'Esta placa ya está registrada en tu empresa';
    if (control.errors['required']) return 'Ingresa la placa.';
    if (control.errors['capacityFormat']) return 'Usa punto como separador decimal, por ejemplo 8.5 (sin comas).';
    if (control.errors['capacityPositive']) return 'La capacidad debe ser mayor que 0.';
    if (control.errors['capacityDecimals']) return `Usa hasta ${VEHICLE_LIMITS.capacityDecimals} decimales.`;
    if (control.errors['capacityDigits']) return `La capacidad admite hasta ${VEHICLE_LIMITS.capacityDigits} dígitos en total.`;
    if (control.errors['pattern']) return 'La placa debe tener entre 5 y 12 letras o números.';
    if (control.errors['min'] || control.errors['max']) return `Ingresa un año entre ${this.minYear} y ${this.maxYear}.`;
    if (control.errors['maxlength']) return `Usa como máximo ${control.errors['maxlength'].requiredLength} caracteres.`;

    return '';
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    this.error.set(null);

    if (this.busy() || this.form.invalid || !this.canSave()) return;

    this.busy.set(true);
    const f = this.form.getRawValue();
    const v = this.vehicle();
    const request$ = v
      ? this.facade.update(v.id, { ...this.changes(), confirmStructural: this.structural() ? true : undefined })
      : this.facade.create(this.newVehicle(f));

    request$.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(v ? 'Vehículo actualizado.' : 'Vehículo registrado.');
        this.dialogRef().nativeElement.close();
      },
      error: (e: unknown) => this.fail(toAppError(e)),
    });
  }

  private newVehicle(f: FormValue): NewVehicle {
    return {
      plate: f.plate,
      configurationCode: text(f.configurationCode),
      vehicleType: text(f.vehicleType),
      fuelType: text(f.fuelType),
      modelYear: f.modelYear ?? undefined,
      technology: text(f.technology),
      capacityTons: f.capacityTons.trim() ? Number(f.capacityTons) : undefined,
      ownership: f.ownership === 'UNKNOWN' ? undefined : (f.ownership as VehicleOwnership),
    };
  }

  private fail(error: AppError): void {
    this.busy.set(false);
    this.error.set(error);

    if (error.code === 'VEHICLE_ALREADY_REGISTERED') {
      this.form.controls.plate.setErrors({ conflict: true });
      this.form.controls.plate.markAsTouched();
    }

    for (const issue of error.details) {
      const control = (this.form.controls as Record<string, AbstractControl | undefined>)[SERVER_FIELDS[issue.field.split('.').pop() ?? ''] ?? ''];

      control?.setErrors({ server: true });
      control?.markAsTouched();
    }
  }
}
