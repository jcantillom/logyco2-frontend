import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { FreightVehicle } from '../../domain/models/emissions';
import { Finding } from '../../domain/models/vehicles';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { VehicleDiagramComponent } from '../../shared/ui/vehicle-diagram/vehicle-diagram.component';
import { unreadableNote } from './analysis.labels';
import { VehiclesFacade } from './vehicles.facade';
import { fuelLabel } from './vehicles.labels';

/** Revisión individual de un vehículo nuevo del archivo: lo que se detectó y, si puede decidir, el botón para registrarlo. */
@Component({
  selector: 'app-finding-detail',
  imports: [CloseOnBackdropDirective, VehicleDiagramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.panel { width: min(560px, calc(100vw - var(--dlg-left, 0px) - 32px)); border-radius: 18px; }
      .body { padding: 18px 24px; display: flex; flex-direction: column; gap: 14px; }
      .body h2 { margin: 0; font-size: 1.2rem; letter-spacing: 0.02em; color: var(--c-head); }
      .body h2 small { display: block; font-size: 0.8rem; font-weight: 400; letter-spacing: 0; color: var(--c-mu); }
      .stage { display: grid; justify-items: center; gap: 4px; padding: 8px; border-radius: 12px; background: var(--c-s2); text-align: center; font-size: 0.86rem; color: var(--c-text2); }
      .stage app-vehicle-diagram { width: min(360px, 100%); --diagram-max-h: 140px; }
      dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin: 0; }
      dt { font-size: 0.78rem; color: var(--c-mu); }
      dd { margin: 2px 0 0; font-weight: 600; color: var(--c-head); overflow-wrap: anywhere; }
      .note-u { margin: 0; font-size: 0.84rem; color: var(--c-text2); }
      .warn { margin: 0; font-size: 0.84rem; color: var(--c-warning); }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid var(--c-bd); background: var(--c-s2); }
    `,
  ],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog panel" aria-labelledby="finding-title" (close)="closed.emit()" data-testid="finding-detail">
      <div class="body">
        <h2 id="finding-title">{{ finding().plate }}@if (finding().plateOriginal !== finding().plate) { <small>Como llegó: {{ finding().plateOriginal }}</small> }</h2>
        @if (freight(); as f) {
          <div class="stage"><app-vehicle-diagram [vehicle]="f" /><span>{{ f.code }} · {{ f.shortName }}</span></div>
        }
        <dl>
          <div><dt>Configuración</dt><dd>{{ finding().detected.configurationCode ?? '—' }}</dd></div>
          <div><dt>Tipo</dt><dd>{{ finding().detected.vehicleType ?? '—' }}</dd></div>
          <div><dt>Combustible</dt><dd>{{ fuel(finding().detected.fuelType) }}</dd></div>
          <div><dt>Modelo</dt><dd>{{ finding().detected.modelYear ?? '—' }}</dd></div>
          <div><dt>Tecnología</dt><dd>{{ finding().detected.technology ?? '—' }}</dd></div>
          <div><dt>Capacidad</dt><dd>{{ finding().detected.capacityTons === null ? '—' : finding().detected.capacityTons + ' t' }}</dd></div>
          <div><dt>Apariciones en el archivo</dt><dd>{{ finding().occurrences }}</dd></div>
          <div><dt>Filas de muestra</dt><dd>{{ finding().sampleRows.join(', ') || '—' }}</dd></div>
        </dl>
        @if (unreadable(); as note) { <p class="note-u" data-testid="unreadable">{{ note }}</p> }
        @if (finding().detected.configurationCode && finding().configurationRecognized === false) {
          <p class="warn">La configuración «{{ finding().detected.configurationCode }}» no está en el catálogo; se registrará tal como llegó.</p>
        }
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" (click)="dialog.close()">Cerrar</button>
        @if (canManage()) { <button type="button" class="btn btn-primary" data-testid="register-one" [disabled]="busy()" (click)="register.emit(finding().id)">Registrar este vehículo</button> }
      </div>
    </dialog>
  `,
})
export class FindingDetailComponent {
  private readonly facade = inject(VehiclesFacade);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly finding = input.required<Finding>();
  readonly canManage = input(false);
  readonly busy = input(false);
  readonly closed = output();
  readonly register = output<string>();

  protected readonly fuel = fuelLabel;
  protected readonly unreadable = computed(() => unreadableNote(this.finding()));
  protected readonly freight = computed<FreightVehicle | null>(() => {
    const code = this.finding().detected.configurationCode;

    return (code && this.facade.catalog.data()?.items.find((item) => item.code === code)) || null;
  });

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;

      if (!dialog.open) dialog.showModal();
    });
  }
}
