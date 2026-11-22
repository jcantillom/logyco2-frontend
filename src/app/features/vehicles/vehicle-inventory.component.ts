import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AccessPolicy } from '../../core/auth/access-policy';
import { Vehicle, VehicleFilter, VehicleStatus, VehicleSummary } from '../../domain/models/vehicles';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { VehicleInventory } from './vehicle-inventory';
import { FUEL_OPTIONS, STATUS_LABELS, fuelLabel } from './vehicles.labels';

/** Trazos de los íconos (viewBox 24, sin relleno). */
const ICONS = {
  plate: 'M3 7h18v10H3zM6.5 12h2M11 12h2M15.5 12h2',
  pending: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  alert: 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
  off: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM8 12h8',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
} as const;

const PENDING_HINT = 'Disponible al analizar un archivo';

interface Tile {
  readonly id: 'registered' | 'pending' | 'conflicts' | 'inactive';
  readonly label: string;
  readonly value: number;
  readonly icon: string;
  readonly tone: string;
  readonly disabled: boolean;
  readonly action: () => void;
}

/**
 * Inventario de vehículos de una empresa: tarjetas de resumen, búsqueda, filtros, tabla y paginación. Lee de un `VehicleInventory`
 * (la empresa activa o, en la consola de plataforma, una empresa elegida) y no sabe quién lo usa: con `readOnly` las tarjetas dejan de
 * ser botones y no hay acciones de registro ni de carga.
 */
@Component({
  selector: 'app-vehicle-inventory',
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, PaginationComponent, ResourceStateComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      svg.i { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      .kpi { --tone: var(--c-primary); --tone-bg: var(--c-ok-soft); all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'label label' 'line ico'; align-items: center; column-gap: 10px; row-gap: 4px; min-height: 84px; padding: 12px 16px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: var(--shadow); transition: border-color 0.15s, box-shadow 0.15s; }
      .kpi:hover:not(:disabled) { border-color: var(--c-primary); box-shadow: 0 8px 18px color-mix(in srgb, var(--c-head) 20%, transparent); }
      .kpi:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .kpi:disabled { cursor: not-allowed; opacity: 0.75; }
      .kpi.warn { --tone: var(--c-warning); --tone-bg: var(--c-warn-soft); }
      .kpi.bad { --tone: var(--c-danger); --tone-bg: var(--c-bad-soft); }
      .kpi.neutral { --tone: var(--c-mute2); --tone-bg: var(--c-s3); }
      .kpi .label { grid-area: label; font-size: 0.78rem; font-weight: 600; color: var(--c-mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kpi .value { grid-area: line; font-size: 1.7rem; font-weight: 750; line-height: 1.1; letter-spacing: -0.03em; color: var(--c-head); }
      .kpi .ico { grid-area: ico; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--tone-bg); color: var(--tone); }
      .kpi .ico svg { width: 19px; height: 19px; fill: color-mix(in srgb, currentColor 14%, transparent); stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
      .kpis .skeleton { height: 84px; border-radius: 14px; }
      .panel { border: 1px solid var(--c-bd); border-radius: 16px; background: var(--c-sf); padding: 16px 20px; box-shadow: var(--shadow); }
      .tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
      .tools .grow { flex: 1 1 220px; }
      .search { position: relative; display: block; max-width: 340px; }
      .search svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 18px; color: var(--c-mu); pointer-events: none; }
      .search .input { padding-left: 40px; min-height: 38px; width: 100%; border-radius: 12px; }
      .btn-f { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--c-bd); background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
      .btn-f:hover, .btn-f[aria-expanded='true'] { border-color: var(--c-primary); background: var(--c-ok-soft); }
      .btn-f:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .btn-f i { font-style: normal; background: var(--c-primary); color: var(--c-sf); border-radius: 999px; padding: 0 7px; font-size: 0.74rem; font-weight: 800; }
      .add { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; }
      .filters { display: flex; gap: 12px; flex-wrap: wrap; margin: 0 0 14px; }
      .filters select.input { min-height: 40px; width: auto; border-radius: 10px; }
      .tw { border: 1px solid var(--c-bd); border-radius: 14px; overflow: hidden; }
      .tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.87rem; }
      .tbl th { text-align: left; padding: 10px 14px; font-weight: 600; font-size: 0.82rem; color: var(--c-text2); background: var(--c-s2); white-space: nowrap; border-bottom: 1px solid var(--c-bd); }
      .tbl td { padding: 9px 14px; border-bottom: 1px solid var(--c-bd); vertical-align: middle; }
      .tbl tbody tr:last-child td { border-bottom: 0; }
      .tbl tbody tr:hover td { background: color-mix(in srgb, var(--c-s2) 60%, transparent); }
      .tbl tbody th { padding: 9px 14px; border-bottom: 1px solid var(--c-bd); background: none; font-size: inherit; font-weight: 700; letter-spacing: 0.03em; color: var(--c-head); text-align: left; }
      .tbl tbody tr:last-child th { border-bottom: 0; }
      .tbl small { display: block; color: var(--c-mu); font-size: 0.76rem; }
      .tbl .nw { white-space: nowrap; }
      .empty { text-align: center; padding: 34px 16px; }
      .empty h2 { margin: 0; font-size: 1.1rem; color: var(--c-head); }
      .empty p { margin: 6px auto 14px; max-width: 460px; color: var(--c-mu); }
      .empty .row { justify-content: center; }
      .empty-ico { display: inline-grid; place-items: center; width: 52px; height: 52px; margin-bottom: 12px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-primary); font-size: 24px; }
      .foot { margin-top: 12px; }
      @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 768px) {
        .kpis { grid-template-columns: 1fr; }
        .panel { padding: 14px; }
        .tw { border: 0; border-radius: 0; overflow: visible; }
        .tbl thead { display: none; }
        .tbl, .tbl tbody { display: block; }
        .tbl tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 12px 14px; margin-bottom: 10px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); }
        .tbl td, .tbl tbody th { display: block; padding: 0; border: 0; background: none !important; }
        .tbl td[data-l]::before { content: attr(data-l) ': '; color: var(--c-mu); }
        .tbl .k-plate, .tbl .k-act { grid-row: 1; }
        .tbl .k-plate { grid-column: 1; }
        .tbl .k-act { grid-column: 2; text-align: right; }
        .tbl td:not(.k-act) { grid-column: 1 / -1; }
      }
    `,
  ],
  template: `
      <section class="kpis" aria-label="Resumen de vehículos" data-testid="vehicle-tiles" [attr.aria-busy]="source().summary.status() === 'loading'">
        @if (source().summary.data(); as s) {
          @for (t of tiles(s); track t.id) {
            @if (readOnly()) {
              <div class="kpi" [class]="t.tone" [attr.data-testid]="'tile-' + t.id"><ng-container *ngTemplateOutlet="body; context: { $implicit: t }" /></div>
            } @else {
              <button type="button" class="kpi" [class]="t.tone" [attr.data-testid]="'tile-' + t.id" [disabled]="t.disabled" [attr.title]="t.disabled ? pendingHint : null" (click)="t.action()"><ng-container *ngTemplateOutlet="body; context: { $implicit: t }" /></button>
            }
          }
        } @else if (source().summary.status() === 'error') {
          <div class="alert alert-danger" role="alert" style="grid-column: 1 / -1">
            <div class="stack" style="gap: 4px; flex: 1"><strong>{{ source().summary.error()?.message }}</strong></div>
            <button type="button" class="btn btn-secondary btn-sm" (click)="source().loadSummary()">Reintentar</button>
          </div>
        } @else {
          <span class="sr-only" role="status">Cargando resumen…</span>
          @for (n of [1, 2, 3, 4]; track n) { <span class="skeleton"></span> }
        }
      </section>
      <ng-template #body let-t><span class="label">{{ t.label }}</span><b class="value">{{ t.value }}</b><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="t.icon" /></svg></span></ng-template>

      <section class="panel" aria-labelledby="vehicles-heading">
        <h2 id="vehicles-heading" class="sr-only">Lista de vehículos</h2>
        <div class="tools">
          <label class="search grow">
            <span class="sr-only">Buscar por placa</span>
            <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.search" /></svg>
            <input class="input" type="search" placeholder="Buscar por placa" autocomplete="off" [formControl]="search" />
          </label>
          <button type="button" class="btn-f" data-testid="more-filters" aria-controls="vehicle-filters" [attr.aria-expanded]="filtersOpen()" (click)="filtersOpen.set(!filtersOpen())">
            <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.filter" /></svg>Más filtros@if (activeFilters() > 0) { <i>{{ activeFilters() }}</i> }
          </button>
          @if (canManage()) {
            <button type="button" class="btn btn-primary add" data-testid="register-vehicle" (click)="register.emit($event)">
              <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.plus" /></svg>Registrar vehículo
            </button>
          }
        </div>

        @if (filtersOpen()) {
          <div class="filters" id="vehicle-filters" data-testid="vehicle-filters">
            <select class="input" aria-label="Filtrar por estado" [value]="source().filter().status ?? ''" (change)="applyStatus($any($event.target).value || undefined)">
              <option value="">Todos los estados</option>
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
            <select class="input" aria-label="Filtrar por combustible" [value]="source().filter().fuel ?? ''" (change)="applyFilter({ fuel: $any($event.target).value || undefined })">
              <option value="">Todos los combustibles</option>
              @for (fuel of fuelOptions; track fuel.value) { <option [value]="fuel.value" [selected]="fuel.value === source().filter().fuel">{{ fuel.label }}</option> }
            </select>
            <select class="input" aria-label="Filtrar por configuración" [value]="source().filter().configuration ?? ''" (change)="applyFilter({ configuration: $any($event.target).value || undefined })">
              <option value="">Todas las configuraciones</option>
              @for (item of source().catalog.data()?.items ?? []; track item.code) { <option [value]="item.code" [selected]="item.code === source().filter().configuration">{{ item.code }}</option> }
            </select>
          </div>
        }

        <app-resource-state [status]="source().list.status()" [error]="source().list.error()" (retry)="source().loadList()">
          <p class="sr-only" aria-live="polite" data-testid="results-live">{{ source().list.data()?.total ?? 0 }} {{ source().list.data()?.total === 1 ? 'vehículo' : 'vehículos' }}</p>
          @if (source().list.data(); as page) {
            @if (page.total === 0) {
              <div class="empty" data-testid="vehicles-empty">
                <span class="empty-ico" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><path [attr.d]="icons.plate" /></svg></span>
                @if (hasFilter()) {
                  <h2>Sin resultados</h2>
                  <p>Ningún vehículo coincide con la búsqueda o los filtros.</p>
                  <button type="button" class="btn btn-secondary" data-testid="clear-filters" (click)="clearFilters()">Quitar filtros</button>
                } @else {
                  @if (readOnly()) {
                    <h2>Esta empresa aún no tiene vehículos registrados.</h2>
                  } @else {
                  <h2>Aún no tienes vehículos registrados</h2>
                  <p>Tus vehículos aparecen aquí cuando analizas un archivo de operaciones o los registras manualmente.</p>
                  <div class="row">
                    @if (canImport()) {
                      <button type="button" class="btn btn-primary" data-testid="analyze-file" (click)="analyze.emit($event)">
                        <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.upload" /></svg> Analizar archivo Excel
                      </button>
                    }
                    @if (canManage()) { <button type="button" class="btn btn-secondary" data-testid="register-empty" (click)="register.emit($event)">Registrar vehículo</button> }
                  </div>
                  }
                }
              </div>
            } @else {
              <div class="tw">
                <table class="tbl" data-testid="vehicle-table">
                  <caption class="sr-only">Vehículos de la empresa</caption>
                  <thead>
                    <tr>
                      <th scope="col">Placa</th><th scope="col">Configuración</th><th scope="col">Tipo</th><th scope="col">Combustible</th><th scope="col">Modelo</th>
                      <th scope="col">Estado</th><th scope="col">Fecha de registro</th><th scope="col">Última aparición</th><th scope="col"><span class="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (v of page.items; track v.id) {
                      <tr>
                        <th scope="row" class="k-plate">{{ v.plate }}@if (v.plateOriginal !== v.plate) { <small>Como llegó: {{ v.plateOriginal }}</small> }</th>
                        <td data-l="Configuración">{{ v.configurationCode ?? '—' }}@if (v.configurationCode && !v.configurationRecognized) { <small>No reconocida</small> }</td>
                        <td data-l="Tipo">{{ v.vehicleType ?? '—' }}</td>
                        <td data-l="Combustible">{{ fuelText(v.fuelType) }}</td>
                        <td data-l="Modelo">{{ v.modelYear ?? '—' }}</td>
                        <td data-l="Estado"><app-status-badge [label]="statusLabels[v.status]" /></td>
                        <td class="nw" data-l="Registro">{{ v.createdAt | date: 'd MMM y' }}</td>
                        <td class="nw" data-l="Última aparición">{{ v.lastSeenAt | date: 'd MMM y' }}</td>
                        <td class="k-act"><button type="button" class="btn btn-secondary btn-sm" data-testid="view-detail" [attr.aria-label]="'Ver detalle de ' + v.plate" (click)="view.emit({ vehicle: v, event: $event })">Ver detalle</button></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="foot"><app-pagination [page]="page" (pageChange)="source().loadList({ page: $event })" /></div>
            }
          }
        </app-resource-state>
      </section>
  `,
})
export class VehicleInventoryComponent {
  private readonly access = inject(AccessPolicy);

  readonly source = input.required<VehicleInventory>();
  readonly readOnly = input(false);
  /** Las tarjetas «Nuevos pendientes» e «Inconsistencias» se habilitan cuando hay una corrida con algo por decidir. */
  readonly pendingNew = input(false);
  readonly pendingConflicts = input(false);
  readonly view = output<{ readonly vehicle: Vehicle; readonly event: Event }>();
  readonly register = output<Event>();
  readonly analyze = output<Event>();
  readonly openPending = output<'new' | 'conflicts'>();

  protected readonly icons = ICONS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly fuelOptions = FUEL_OPTIONS;
  protected readonly fuelText = fuelLabel;
  protected readonly pendingHint = PENDING_HINT;
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly filtersOpen = signal(false);
  protected readonly canManage = computed(() => !this.readOnly() && this.access.can('vehicles:manage'));
  protected readonly canImport = computed(() => !this.readOnly() && this.access.can('imports:create'));
  protected readonly activeFilters = computed(() => Object.values(this.source().filter()).filter(Boolean).length);
  protected readonly hasFilter = computed(() => this.activeFilters() > 0);

  constructor() {
    // El campo de búsqueda sigue al filtro del servidor (p. ej. al cambiar de empresa o quitar filtros).
    effect(() => {
      const search = this.source().filter().search ?? '';

      untracked(() => this.search.setValue(search, { emitEvent: false }));
    });

    this.search.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef))).subscribe((value) => this.applyFilter({ search: value.trim() || undefined }));
  }

  protected tiles(s: VehicleSummary): readonly Tile[] {
    return [
      { id: 'registered', label: 'Registrados', value: s.registered, icon: ICONS.plate, tone: '', disabled: false, action: () => this.applyStatus(undefined) },
      { id: 'pending', label: 'Nuevos pendientes', value: s.pendingNew, icon: ICONS.pending, tone: 'warn', disabled: !this.pendingNew(), action: () => this.openPending.emit('new') },
      { id: 'conflicts', label: 'Con inconsistencias', value: s.conflicts, icon: ICONS.alert, tone: 'bad', disabled: !this.pendingConflicts(), action: () => this.openPending.emit('conflicts') },
      { id: 'inactive', label: 'Inactivos', value: s.inactive, icon: ICONS.off, tone: 'neutral', disabled: false, action: () => this.applyStatus('INACTIVE') },
    ];
  }

  protected applyFilter(change: Partial<VehicleFilter>): void {
    this.source().loadList({ filter: { ...this.source().filter(), ...change } });
  }

  protected applyStatus(status: VehicleStatus | undefined): void {
    this.applyFilter({ status });
  }

  protected clearFilters(): void {
    this.search.setValue('', { emitEvent: false });
    this.source().loadList({ filter: {} });
  }
}
