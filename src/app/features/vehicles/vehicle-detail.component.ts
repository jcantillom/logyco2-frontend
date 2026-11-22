import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { FreightVehicle } from '../../domain/models/emissions';
import { Vehicle, VehicleDetail } from '../../domain/models/vehicles';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { VehicleDiagramComponent } from '../../shared/ui/vehicle-diagram/vehicle-diagram.component';
import { VehicleInventory } from './vehicle-inventory';
import { VehiclesFacade } from './vehicles.facade';
import { OWNERSHIP_LABELS, SOURCE_LABELS, STATUS_LABELS, changeValue, eventLabel, fieldLabel, fuelLabel } from './vehicles.labels';

/** Panel de consulta de un vehículo: identificación, dibujo de su configuración, características, historial y archivos donde apareció. */
@Component({
  selector: 'app-vehicle-detail',
  imports: [DatePipe, CloseOnBackdropDirective, StatusBadgeComponent, VehicleDiagramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.panel { width: min(680px, calc(100vw - var(--dlg-left, 0px) - 32px)); max-height: calc(100dvh - 32px); border-radius: 18px; overflow: hidden; }
      dialog.panel[open] { display: flex; flex-direction: column; }
      .head { display: flex; align-items: center; gap: 12px; padding: 18px 24px; border-bottom: 1px solid var(--c-bd); background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); }
      .head h2 { margin: 0; font-size: 1.25rem; letter-spacing: 0.02em; color: var(--c-head); }
      .head .grow { flex: 1 1 auto; min-width: 0; }
      .head small { color: var(--c-mu); }
      .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 24px; display: flex; flex-direction: column; gap: 20px; }
      .stage { display: grid; justify-items: center; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--c-s2); text-align: center; }
      .stage app-vehicle-diagram { width: min(420px, 100%); --diagram-max-h: 170px; }
      .stage svg.placeholder { width: min(260px, 70%); height: auto; fill: none; stroke: color-mix(in srgb, var(--c-head) 40%, var(--c-sf)); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
      .stage strong { color: var(--c-head); font-size: 0.95rem; }
      .stage span { color: var(--c-mu); font-size: 0.82rem; }
      h3 { margin: 0 0 8px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); }
      dl.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; margin: 0; }
      dl.facts div { min-width: 0; }
      dl.facts dt { font-size: 0.78rem; color: var(--c-mu); }
      dl.facts dd { margin: 2px 0 0; font-weight: 600; color: var(--c-head); overflow-wrap: anywhere; }
      dl.facts dd small { display: block; font-weight: 400; color: var(--c-mu); }
      .hint { margin: 8px 0 0; font-size: 0.82rem; color: var(--c-mu); }
      ol.history, ul.runs { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
      ol.history li, ul.runs li { padding: 8px 12px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); font-size: 0.86rem; }
      ol.history .top, ul.runs .top { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      ol.history strong, ul.runs strong { color: var(--c-head); }
      ol.history .meta, ul.runs .meta { color: var(--c-mu); font-size: 0.8rem; }
      ol.history ul { margin: 4px 0 0; padding-left: 18px; color: var(--c-text2); }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid var(--c-bd); background: var(--c-s2); }
      @media (max-width: 520px) { dl.facts { grid-template-columns: 1fr; } }
    `,
  ],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog panel" aria-labelledby="vehicle-detail-title" (close)="closed.emit()" data-testid="vehicle-detail">
      <div class="head">
        <div class="grow">
          <h2 id="vehicle-detail-title">{{ vehicle().plate }}</h2>
          <small>Vehículo de tu empresa</small>
        </div>
        <app-status-badge [label]="statusLabel()" />
      </div>

      <div class="body" aria-live="polite">
        @if (detail(); as d) {
          <section aria-labelledby="vd-diagram" class="stage" data-testid="vehicle-stage">
            <h3 id="vd-diagram" class="sr-only">Configuración</h3>
            @if (freight(); as f) {
              <app-vehicle-diagram [vehicle]="f" />
              <strong>{{ f.code }} · {{ f.shortName }}</strong>
              <span>{{ f.name }}</span>
            } @else if (catalogPending()) {
              <span class="skeleton" style="height: 110px; width: min(420px, 100%)" role="status" aria-busy="true"><span class="sr-only">Cargando…</span></span>
            } @else {
              <svg class="placeholder" viewBox="0 0 120 56" role="img" aria-label="Dibujo genérico de un vehículo de carga" data-testid="vehicle-placeholder">
                <path d="M4 38V10h62v28M66 20h24l16 14v4H66M4 38h112" />
                <circle cx="26" cy="42" r="6" /><circle cx="52" cy="42" r="6" /><circle cx="94" cy="42" r="6" />
              </svg>
              <strong>{{ d.configurationCode ? 'Configuración «' + d.configurationCode + '» no reconocida' : 'Sin configuración registrada' }}</strong>
              <span>{{ inv().catalog.status() === 'error' ? 'No se pudo cargar el catálogo de configuraciones.' : 'No hay un dibujo para este vehículo en el catálogo.' }}</span>
            }
          </section>

          <section aria-labelledby="vd-facts">
            <h3 id="vd-facts">Datos del vehículo</h3>
            <dl class="facts">
              <div><dt>Placa</dt><dd>{{ d.plate }}<small>Como llegó: {{ d.plateOriginal }}</small></dd></div>
              <div><dt>País</dt><dd>{{ d.country }}</dd></div>
              <div><dt>Configuración</dt><dd>{{ d.configurationCode ?? '—' }}</dd></div>
              <div><dt>Tipo</dt><dd>{{ d.vehicleType ?? '—' }}</dd></div>
              <div><dt>Combustible</dt><dd>{{ fuelText(d.fuelType) }}</dd></div>
              <div><dt>Modelo</dt><dd>{{ d.modelYear ?? '—' }}</dd></div>
              <div><dt>Tecnología</dt><dd>{{ d.technology ?? '—' }}</dd></div>
              <div><dt>Capacidad</dt><dd>{{ d.capacityTons === null ? '—' : d.capacityTons + ' t' }}</dd></div>
              <div><dt>Propiedad</dt><dd data-testid="ownership">{{ ownershipText() }}</dd></div>
              <div><dt>Origen del registro</dt><dd>{{ sourceText() }}</dd></div>
              <div><dt>Primera aparición</dt><dd>{{ d.firstSeenAt | date: 'd MMM y' }}</dd></div>
              <div><dt>Última aparición</dt><dd>{{ d.lastSeenAt | date: 'd MMM y' }}</dd></div>
            </dl>
            <p class="hint">La aparición de la placa en tus archivos no implica que el vehículo sea de tu empresa.</p>
          </section>

          <section aria-labelledby="vd-history">
            <h3 id="vd-history">Historial</h3>
            @if (d.history.length === 0) {
              <p class="muted small">Todavía no hay cambios registrados.</p>
            } @else {
              <ol class="history" data-testid="history">
                @for (entry of d.history; track entry.id) {
                  <li>
                    <div class="top"><strong>{{ eventText(entry.event) }}</strong><span class="meta">{{ entry.at | date: 'd MMM y, HH:mm' }}</span></div>
                    <div class="meta">{{ entry.actorName ? 'Por ' + entry.actorName : 'Proceso automático' }}</div>
                    @if (entry.changes.length > 0) {
                      <ul>
                        @for (c of entry.changes; track c.field) {
                          <li>{{ fieldText(c.field) }}: {{ valueText(c.field, c.before) }} → {{ valueText(c.field, c.after) }}</li>
                        }
                      </ul>
                    }
                  </li>
                }
              </ol>
            }
          </section>

          @if (d.runs.length > 0) {
            <section aria-labelledby="vd-runs">
              <h3 id="vd-runs">Archivos donde apareció</h3>
              <ul class="runs" data-testid="runs">
                @for (run of d.runs; track run.runId) {
                  <li>
                    <div class="top"><strong>{{ run.fileName }}</strong><span class="meta">{{ run.at | date: 'd MMM y' }}</span></div>
                    <div class="meta">{{ run.occurrences }} {{ run.occurrences === 1 ? 'aparición' : 'apariciones' }}</div>
                  </li>
                }
              </ul>
            </section>
          }
        } @else if (inv().detail.status() === 'error') {
          <div class="alert alert-danger" role="alert">
            <div class="stack" style="gap: 4px; flex: 1"><strong>{{ inv().detail.error()?.message }}</strong></div>
            <button type="button" class="btn btn-secondary btn-sm" (click)="load()">Reintentar</button>
          </div>
        } @else {
          <div class="stack" role="status" aria-busy="true">
            <span class="sr-only">Cargando…</span>
            <span class="skeleton" style="height: 150px"></span>
            <span class="skeleton" style="height: 120px"></span>
          </div>
        }
      </div>

      <div class="actions">
        @if (canManage() && detail(); as d) { <button type="button" class="btn btn-secondary" data-testid="edit-vehicle" (click)="edit.emit(d)">Editar</button> }
        <button type="button" class="btn btn-primary" (click)="dialog.close()">Cerrar</button>
      </div>
    </dialog>
  `,
})
export class VehicleDetailComponent {
  private readonly company = inject(VehiclesFacade);
  private readonly access = inject(AccessPolicy);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** La fila elegida: da la placa y el estado mientras llega el detalle. */
  readonly vehicle = input.required<Vehicle>();
  /** De dónde se lee el detalle y el catálogo; sin indicarlo, la empresa activa. */
  readonly source = input<VehicleInventory | null>(null);
  /** Solo consulta (consola de plataforma): sin «Editar». */
  readonly readOnly = input(false);
  protected readonly inv = computed<VehicleInventory>(() => this.source() ?? this.company);
  readonly closed = output();
  readonly edit = output<VehicleDetail>();

  protected readonly canManage = computed(() => !this.readOnly() && this.access.can('vehicles:manage'));
  protected readonly detail = computed(() => {
    const data = this.inv().detail.data();

    return data?.id === this.vehicle().id ? data : null;
  });
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.detail()?.status ?? this.vehicle().status]);
  protected readonly ownershipText = computed(() => OWNERSHIP_LABELS[this.detail()?.ownership ?? 'UNKNOWN']);
  protected readonly sourceText = computed(() => SOURCE_LABELS[this.detail()?.source ?? 'IMPORT']);
  /** El dibujo sale del catálogo estático de configuraciones, emparejado por código; sin coincidencia se usa un dibujo neutro. */
  protected readonly freight = computed<FreightVehicle | null>(() => {
    const code = this.detail()?.configurationCode;

    return (code && this.inv().catalog.data()?.items.find((item) => item.code === code)) || null;
  });

  /** Con configuración, mientras el catálogo no responde no se sabe aún si hay dibujo. */
  protected readonly catalogPending = computed(() => !!this.detail()?.configurationCode && ['idle', 'loading'].includes(this.inv().catalog.status()));

  protected readonly eventText = eventLabel;
  protected readonly fieldText = fieldLabel;

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;

      // showModal() mueve el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!dialog.open) dialog.showModal();
    });
    effect(() => {
      const id = this.vehicle().id;

      untracked(() => this.load(id));
    });
  }

  protected load(id = this.vehicle().id): void {
    this.inv().loadDetail(id);
    if (this.inv().catalog.status() === 'idle') this.inv().loadCatalog();
  }

  /** Valor de un campo del historial: combustible, propiedad y estado se traducen. */
  protected valueText(field: string, value: string | null): string {
    return changeValue(field, value);
  }

  protected readonly fuelText = fuelLabel;
}
