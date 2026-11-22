import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { FreightVehicle, VehicleCatalog } from '../../domain/models/emissions';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { axlesLabel, decodeCode, formatKg, formatMeters } from './emissions.format';
import { vehicleKind } from '../../shared/ui/vehicle-diagram/vehicle-label';
import { VehicleDiagramComponent } from '../../shared/ui/vehicle-diagram/vehicle-diagram.component';

/** Detalle de un vehículo en un diálogo modal: se abre solo al crearse y avisa con `closed` cuando se cierra (Esc, fondo o botón). */
@Component({
  selector: 'app-vehicle-detail',
  imports: [VehicleDiagramComponent, CloseOnBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    dialog { width: min(680px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 0; overflow: auto; }
    .body { display: flex; flex-direction: column; gap: 14px; padding: 20px 22px; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    h2 { margin: 6px 0 0; font-size: 1.25rem; color: var(--c-head); }
    .designation { margin: 2px 0 0; color: var(--c-mu); font-size: 0.9rem; }
    app-vehicle-diagram { --diagram-max-h: 190px; padding: 8px; border-radius: 12px; background: var(--c-s2); }
    .decoder { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .decoder li { display: flex; flex-direction: column; gap: 1px; max-width: 200px; padding: 5px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); }
    .code { display: inline-block; padding: 1px 10px; border-radius: 6px; border-left: 3px solid var(--c-primary); background: color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); color: var(--c-head); font-size: 0.78rem; font-weight: 700; }
    .decoder b { font-size: 0.95rem; color: var(--c-head); }
    .decoder span { font-size: 0.72rem; line-height: 1.25; color: var(--c-mu); }
    .layouts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 0.84rem; color: var(--c-mu); }
    .layouts .seg { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); }
    .layouts button { padding: 4px 12px; border: 0; border-radius: 7px; background: none; color: var(--c-mu); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
    .layouts button[aria-pressed='true'] { background: var(--c-primary); color: var(--c-gray-50); }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px 18px; margin: 0; }
    dl div { display: flex; flex-direction: column; gap: 2px; }
    dt { font-size: 0.8rem; font-weight: 600; color: var(--c-mu); }
    dd { margin: 0; color: var(--c-head); }
    ul { margin: 0; padding-left: 18px; }
    .note { margin: 0; font-size: 0.86rem; }
    .foot { margin: 0; font-size: 0.82rem; color: var(--c-mu); }
  `],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog" [attr.aria-labelledby]="titleId" (close)="closed.emit()" data-testid="vehicle-detail">
      <div class="body">
        <header>
          <div>
            <span class="code">{{ vehicle().code }}</span>
            <h2 [id]="titleId">{{ vehicle().name }}</h2>
            <p class="designation">Designación de la norma: {{ vehicle().designation }}</p>
            @if (chips().length > 0) {
              <ul class="decoder" aria-label="Cómo leer el código" data-testid="code-decoder">
                @for (chip of chips(); track $index) { <li><b>{{ chip.symbol }}</b>@if (chip.meaning) { <span>{{ chip.meaning }}</span> }</li> }
              </ul>
            }
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-testid="detail-close" (click)="close()">Cerrar</button>
        </header>
        @if (vehicle().layouts.length > 0) {
          <div class="layouts" role="group" aria-label="Disposición de ejes">
            <span>Disposición de ejes:</span>
            <div class="seg">
              <button type="button" [attr.aria-pressed]="layoutId() === ''" data-testid="layout-default" (click)="layoutId.set('')">Estándar</button>
              @for (l of vehicle().layouts; track l.id) { <button type="button" [attr.aria-pressed]="layoutId() === l.id" [attr.data-testid]="'layout-' + l.id" (click)="layoutId.set(l.id)">{{ l.label }}</button> }
            </div>
          </div>
          @if (currentLayout()?.note; as note) { <p class="note" data-testid="layout-note">{{ note }}</p> }
        }
        <app-vehicle-diagram [vehicle]="vehicle()" [truckGroups]="currentLayout()?.truckAxleGroups ?? null" />
        @if (vehicle().description) { <p>{{ vehicle().description }}</p> }
        <dl>
          <div><dt>Ejes</dt><dd data-testid="detail-axles">{{ axles() }}</dd></div>
          <div><dt>Tipo</dt><dd>{{ kind() }}</dd></div>
          @if (vehicle().verified && vehicle().pbvVariants.length > 1) {
            <div data-testid="detail-variants">
              <dt>PBV máximo según la disposición de ejes</dt>
              <dd>
                <ul>
                  @for (v of vehicle().pbvVariants; track $index) { <li>{{ kg(v.grossWeightKg) }} (tolerancia {{ kg(v.toleranceKg) }}) · {{ v.note }}</li> }
                </ul>
              </dd>
            </div>
          } @else if (vehicle().verified && vehicle().grossWeightKg !== null) {
            <div><dt>PBV máximo</dt><dd data-testid="detail-pbv">{{ kg(vehicle().grossWeightKg!) }}</dd></div>
          } @else {
            <div><dt>PBV máximo</dt><dd data-testid="detail-pbv-pending">Dato aún no verificado</dd></div>
          }
          @if (vehicle().toleranceKg !== null) { <div><dt>Tolerancia</dt><dd data-testid="detail-tolerance">{{ kg(vehicle().toleranceKg!) }}</dd></div> }
          @if (vehicle().maxLengthM !== null) { <div><dt>Longitud máxima</dt><dd data-testid="detail-length">{{ meters(vehicle().maxLengthM!) }}</dd></div> }
          @if (catalog().generalDimensions.maxWidthM !== null) { <div><dt>Ancho máximo general</dt><dd data-testid="detail-width">{{ meters(catalog().generalDimensions.maxWidthM!) }}</dd></div> }
          @if (catalog().generalDimensions.maxHeightM !== null) { <div><dt>Altura máxima general</dt><dd data-testid="detail-height">{{ meters(catalog().generalDimensions.maxHeightM!) }}</dd></div> }
        </dl>
        <p class="note" data-testid="detail-pbv-note"><strong>El PBV es el peso del vehículo más su carga; no es la capacidad de carga útil.</strong></p>
        @if (catalog().tolerance.description) { <p class="note">{{ catalog().tolerance.description }}</p> }
        @if (vehicle().notes) { <p class="note" data-testid="detail-notes">{{ vehicle().notes }}</p> }
        @if (vehicle().citation) { <p class="foot" data-testid="detail-citation">Referencia normativa: {{ vehicle().citation }}</p> }
      </div>
    </dialog>
  `,
})
export class VehicleDetailComponent {
  readonly vehicle = input.required<FreightVehicle>();
  readonly catalog = input.required<VehicleCatalog>();
  readonly closed = output();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private static nextId = 0;

  protected readonly titleId = `vehicle-detail-title-${VehicleDetailComponent.nextId++}`;
  protected readonly layoutId = signal('');
  protected readonly currentLayout = computed(() => this.vehicle().layouts.find((l) => l.id === this.layoutId()) ?? null);
  protected readonly chips = computed(() => {
    const guide = this.catalog().codeGuide;

    return guide ? decodeCode(this.vehicle().code, guide) : [];
  });
  protected readonly axles = computed(() => axlesLabel(this.vehicle()));
  protected readonly kind = computed(() => vehicleKind(this.vehicle()));
  protected readonly kg = formatKg;
  protected readonly meters = formatMeters;

  constructor() {
    // showModal() mueve el foco al diálogo y lo devuelve al elemento que lo abrió al cerrarse.
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (!dialog.open) dialog.showModal();
    });
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
