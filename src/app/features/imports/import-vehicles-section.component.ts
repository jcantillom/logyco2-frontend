import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, untracked } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { VehicleCandidate, VehicleDecisionRequest, VehiclesDetected } from '../../domain/models/imports';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { DetectedTab, ImportVehiclesFacade, MAX_DECISION_BATCH } from './import-vehicles.facade';
import { ImportsFacade } from './imports.facade';
import { DECISION_LABELS, skippedReasonLabel } from './imports.labels';

const TABS: readonly DetectedTab[] = ['NEW', 'CHANGED'];

/**
 * «Vehículos detectados» de una carga terminada: lo que el archivo propone contra el inventario vigente. Quien tiene `vehicles:manage`
 * registra, actualiza u omite (por fila o en lote); los demás ven la lista y la nota de que un administrador debe aprobar.
 */
@Component({
  selector: 'app-import-vehicles-section',
  imports: [PaginationComponent, ResourceStateComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      h3 { margin: 0 0 8px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); }
      .muted { margin: 0; color: var(--c-mu); font-size: 0.84rem; }
      .note { margin: 0 0 10px; padding: 8px 12px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); color: var(--c-text2); font-size: 0.86rem; }
      .tabs button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: -3px; }
      .bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
      ul.cands { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
      li.cand { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      .top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      .top .plate { font-size: 1rem; font-weight: 800; color: var(--c-head); }
      .top small { color: var(--c-mu); }
      dl.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 6px 12px; margin: 0; }
      dl.facts > div { display: flex; flex-direction: column; }
      dl.facts dt { color: var(--c-mu); font-size: 0.76rem; font-weight: 600; }
      dl.facts dd { margin: 0; font-size: 0.88rem; color: var(--c-text); }
      ul.diff { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 0.86rem; }
      ul.diff li { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; }
      ul.diff .lbl { font-weight: 700; color: var(--c-head); }
      ul.diff .before { color: var(--c-mu); text-decoration: line-through; }
      ul.diff .after { font-weight: 700; color: var(--c-accent); }
      ul.diff svg { width: 14px; height: 14px; fill: none; stroke: var(--c-mu); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; align-self: center; }
      p.warn { margin: 0; font-size: 0.82rem; color: var(--c-warning); }
      .row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .result { margin-bottom: 10px; }
      .result ul { margin: 4px 0 0; padding-left: 18px; }
    `,
  ],
  template: `
    <section aria-labelledby="vehicles-title" data-testid="detected-vehicles">
      <h3 id="vehicles-title" class="sr-only">Vehículos detectados</h3>

      @if (!canManage()) { <p class="note" data-testid="admin-note">Un administrador debe aprobar estos vehículos.</p> }

      <div class="tabs" role="tablist" aria-label="Tipo de vehículos detectados">
        @for (t of tabs; track t) {
          <button type="button" role="tab" [id]="'veh-tab-' + t" aria-controls="veh-panel" [attr.aria-selected]="facade.tab() === t" [tabIndex]="facade.tab() === t ? 0 : -1" [attr.data-testid]="'tab-' + t" (click)="select(t)" (keydown)="onTabKey($event)">{{ tabLabel(t) }}</button>
        }
      </div>
      <p class="muted" style="margin-top: 8px" data-testid="unchanged-count">{{ counts().unchanged }} {{ counts().unchanged === 1 ? 'vehículo sin cambios' : 'vehículos sin cambios' }}</p>

      <div aria-live="polite">
        @if (facade.result(); as r) {
          <div class="alert alert-success result" role="status" data-testid="decision-result">
            <div class="stack" style="gap: 4px; flex: 1">
              <strong>{{ r.accepted }} {{ r.accepted === 1 ? 'aprobado' : 'aprobados' }} · {{ r.rejected }} {{ r.rejected === 1 ? 'omitido' : 'omitidos' }} · {{ r.skipped }} sin aplicar</strong>
              @if (r.skippedReasons.length > 0) {
                <ul data-testid="skipped-reasons">@for (reason of r.skippedReasons; track reason.code) { <li>{{ reasonLabel(reason.code) }}: {{ reason.rows }}</li> }</ul>
              }
            </div>
          </div>
        }
        @if (facade.decisionError(); as e) { <div class="alert alert-danger result" role="alert" data-testid="decision-error"><strong>{{ e.message }}</strong></div> }
      </div>

      <div role="tabpanel" id="veh-panel" [attr.aria-labelledby]="'veh-tab-' + facade.tab()" tabindex="0">
        @if (canManage() && tabCount() > 0) {
          <div class="bar">
            <button type="button" class="btn btn-primary btn-sm" data-testid="decide-all" [disabled]="facade.deciding()" (click)="decideAll()">{{ facade.tab() === 'NEW' ? 'Registrar todos los nuevos' : 'Actualizar todos' }}</button>
          </div>
        }
        <app-resource-state [status]="facade.list.status()" [error]="facade.list.error()" (retry)="facade.reload()">
          @if (facade.list.data(); as page) {
            @if (page.items.length === 0) {
              <p class="muted" data-testid="vehicles-empty">{{ facade.tab() === 'NEW' ? 'Esta carga no trae vehículos nuevos.' : 'Esta carga no trae vehículos con cambios.' }}</p>
            } @else {
              <ul class="cands" data-testid="candidates">
                @for (c of page.items; track c.id) {
                  <li class="cand" data-testid="candidate">
                    <div class="top">
                      <span class="plate">{{ c.plate }}</span>
                      @if (c.plateOriginal !== c.plate) { <small>Como llegó: {{ c.plateOriginal }}</small> }
                      @if (c.inactive) { <app-status-badge data-testid="inactive" [label]="inactiveLabel" /> }
                      @if (c.decision !== 'PENDING') { <app-status-badge data-testid="decision" [label]="decisionLabels[c.decision]" /> }
                    </div>
                    <dl class="facts">
                      <div><dt>Configuración</dt><dd>{{ c.proposed.configurationCode ?? '—' }}</dd></div>
                      <div><dt>Año</dt><dd>{{ c.proposed.modelYear ?? '—' }}</dd></div>
                      <div><dt>Combustible</dt><dd>{{ c.fuelLabel ?? c.proposed.fuelType ?? '—' }}</dd></div>
                      @if (c.proposed.vehicleType) { <div><dt>Tipo</dt><dd>{{ c.proposed.vehicleType }}</dd></div> }
                      <div><dt>Filas del archivo</dt><dd>{{ c.tripRows }}</dd></div>
                    </dl>
                    @if (c.changes.length > 0) {
                      <ul class="diff" aria-label="Cambios propuestos" data-testid="changes">
                        @for (ch of c.changes; track ch.field) {
                          <li><span class="lbl">{{ ch.label }}:</span><span class="before">{{ ch.before ?? '—' }}</span><svg viewBox="0 0 24 24" aria-label="cambia a" role="img"><path d="M5 12h14M13 6l6 6-6 6" /></svg><span class="after">{{ ch.after ?? '—' }}</span></li>
                        }
                      </ul>
                    }
                    @for (k of c.conflicts; track k.field) {
                      <p class="muted" data-testid="conflict">El archivo trae valores distintos para {{ k.label }}. Revisa este vehículo para mantener limpio tu inventario; tus viajes se calculan igual con los datos de cada fila.</p>
                    }
                    @if (c.inactive) { <p class="warn" data-testid="inactive-note">Este vehículo está inactivo: aprobar no lo reactiva.</p> }
                    @if (canManage() && c.decision === 'PENDING') {
                      <div class="row-actions">
                        <button type="button" class="btn btn-primary btn-sm" data-testid="accept" [disabled]="facade.deciding()" [attr.aria-label]="(c.kind === 'NEW' ? 'Registrar ' : 'Actualizar ') + c.plate" (click)="decideOne(c, 'ACCEPT')">{{ c.kind === 'NEW' ? 'Registrar' : 'Actualizar' }}</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-testid="reject" [disabled]="facade.deciding()" [attr.aria-label]="'Omitir ' + c.plate" (click)="decideOne(c, 'REJECT')">Omitir</button>
                      </div>
                    }
                  </li>
                }
              </ul>
              <div style="margin-top: 10px"><app-pagination [page]="page" (pageChange)="facade.load(importId(), facade.tab(), $event)" /></div>
            }
          }
        </app-resource-state>
      </div>
    </section>
  `,
})
export class ImportVehiclesSectionComponent {
  protected readonly facade = inject(ImportVehiclesFacade);
  private readonly imports = inject(ImportsFacade);
  private readonly confirm = inject(ConfirmService);
  private readonly access = inject(AccessPolicy);

  readonly importId = input.required<string>();
  readonly counts = input.required<VehiclesDetected>();

  protected readonly tabs = TABS;
  protected readonly decisionLabels = DECISION_LABELS;
  protected readonly inactiveLabel = { text: 'Inactivo', tone: 'neutral' } as const;
  protected readonly reasonLabel = skippedReasonLabel;
  protected readonly canManage = computed(() => this.access.can('vehicles:manage'));
  /** Cuántos vehículos hay en la pestaña abierta, según los conteos de la carga. */
  protected readonly tabCount = computed(() => (this.facade.tab() === 'NEW' ? this.counts().new : this.counts().changed));

  constructor() {
    effect(() => {
      const id = this.importId();

      // Sin nuevos pero con cambios, se abre directamente donde hay algo que revisar.
      untracked(() => this.facade.load(id, this.counts().new === 0 && this.counts().changed > 0 ? 'CHANGED' : 'NEW'));
    });
    inject(DestroyRef).onDestroy(() => this.facade.clear());
  }

  protected tabLabel(tab: DetectedTab): string {
    return tab === 'NEW' ? `Nuevos (${this.counts().new})` : `Con cambios (${this.counts().changed})`;
  }

  protected select(tab: DetectedTab): void {
    if (tab !== this.facade.tab()) this.facade.load(this.importId(), tab, 1);
  }

  /** Flechas izquierda y derecha pasan de una pestaña a otra y llevan el foco. */
  protected onTabKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const next = this.facade.tab() === 'NEW' ? 'CHANGED' : 'NEW';

    this.select(next);
    queueMicrotask(() => (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#veh-tab-${next}`)?.focus());
  }

  protected decideOne(candidate: VehicleCandidate, decision: 'ACCEPT' | 'REJECT'): void {
    this.run({ decision, candidateIds: [candidate.id] });
  }

  /** «Registrar todos los nuevos» / «Actualizar todos»: pide una confirmación breve antes de decidir sobre todo un tipo. */
  protected decideAll(): void {
    const kind = this.facade.tab();
    const total = this.tabCount();
    const request = kind === 'NEW'
      ? { title: 'Registrar vehículos nuevos', message: `Se registrarán ${total} ${total === 1 ? 'vehículo nuevo' : 'vehículos nuevos'} en tu empresa. ¿Continuar?`, confirmLabel: 'Registrar todos' }
      : { title: 'Actualizar vehículos', message: `Se actualizarán ${total} ${total === 1 ? 'vehículo' : 'vehículos'} con los datos del archivo. ¿Continuar?`, confirmLabel: 'Actualizar todos' };

    void this.confirm.confirm(request).then((accepted) => {
      if (accepted) this.run({ decision: 'ACCEPT', kind }, total);
    });
  }

  /** Con más pendientes que el máximo por petición se decide por ids, en lotes, y se muestra un solo resultado. */
  private run(request: VehicleDecisionRequest, total = 0): void {
    const id = this.importId();
    const call$ = 'kind' in request && total > MAX_DECISION_BATCH ? this.facade.decideInBatches(id, request.kind) : this.facade.decide(id, request);

    call$.subscribe({
      // Tras decidir se vuelve a pedir la lista (desde la primera página) y la carga, para refrescar `vehicles_detected`.
      next: () => {
        this.facade.load(id, this.facade.tab(), 1);
        this.imports.reloadImport(id);
      },
      error: () => undefined,
    });
  }
}
