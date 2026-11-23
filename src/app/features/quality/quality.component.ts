import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ToastService } from '../../core/notifications/toast.service';
import { OrganizationContext } from '../../core/org/organization-context';
import { DuplicateDecision, DuplicateKeep, MAX_DUPLICATE_RESOLUTION, PossibleDuplicate, TripId } from '../../domain/models/duplicates';
import { QUALITY_TAB_PARAM, SHARED_OPERATIONS_TAB } from '../../shared/layouts/actions-bell.component';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { ConfirmableDecision, DuplicateDecisionDialogComponent } from './duplicate-decision-dialog.component';
import { DuplicatePairComponent } from './duplicate-pair.component';
import { DUPLICATES_PAGE_SIZES, DuplicatesFacade } from './duplicates.facade';
import { hasResult, resolutionMessage } from './duplicates.view';
import { SharedOperationsComponent } from './shared-operations.component';
import { SharedOperationsFacade } from './shared-operations.facade';

/** Parámetro de la ruta que limita la bandeja a una carga (`/calidad?import_file_id=…`); lo usan los enlaces desde Cargas. */
export const IMPORT_FILE_PARAM = 'import_file_id';

/** Pestañas de la página: los posibles duplicados y las operaciones compartidas con empresas vinculadas (`?tab=compartidas`). */
type QualityTab = 'duplicates' | 'shared';

/** Trazo del ícono del estado vacío (viewBox 24, sin relleno). */
const CHECK_ICON = 'M9 4h6l1 2h3v15H5V6h3zM9 14l2 2 4-4';

/** Lo que espera confirmación: a qué viajes aplica y qué se decide. */
interface PendingDecision {
  readonly ids: readonly TripId[];
  readonly decision: ConfirmableDecision;
  readonly fileA: string | null;
  readonly fileB: string | null;
  readonly retainedHasResult: boolean;
  readonly currentHasResult: boolean;
  readonly withoutResult: number;
}

/**
 * «Calidad de datos»: la bandeja «Por revisar» con dos pestañas, «Posibles duplicados» y «Operaciones compartidas». Cada par muestra el viaje retenido (A) y el vigente (B) lado a lado y se
 * decide uno por uno o por lotes (hasta 500). «Son el mismo viaje» y «Son viajes diferentes» piden confirmación; «Dejar pendiente» no cambia
 * nada. Nada se borra y no hace falta volver a cargar el archivo.
 */
@Component({
  selector: 'app-quality',
  imports: [PageHeroComponent, PagerComponent, ResourceStateComponent, DuplicatePairComponent, DuplicateDecisionDialogComponent, SharedOperationsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .panel { display: grid; gap: 14px; }
      .head { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 6px 14px; border-bottom: 1px solid var(--c-bd); }
      .head h2 { margin: 0 0 6px; font-size: 1.1rem; color: var(--c-head); }
      .head h2:focus { outline: none; }
      .qtabs { display: flex; flex-wrap: wrap; gap: 4px 18px; }
      .tab { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; margin: 0 0 -1px; padding: 8px 4px; border-bottom: 3px solid transparent; font-size: 1rem; font-weight: 700; color: var(--c-text2); }
      .tab[aria-selected='true'] { border-bottom-color: var(--c-primary); color: var(--c-accent); }
      .tab:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 6px; }
      .count { padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: var(--c-accent); font-size: 0.78rem; font-weight: 800; font-variant-numeric: tabular-nums; }
      .intro { margin: 0; color: var(--c-text2); font-size: 0.95rem; line-height: 1.45; max-width: 860px; }
      .filter { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin: 0; padding: 8px 14px; border-radius: 12px; background: var(--c-info-bg); color: var(--c-info); font-size: 0.9rem; font-weight: 600; }
      .linkbtn { all: unset; box-sizing: border-box; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; font-weight: 700; }
      .linkbtn:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      .bulk { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding: 10px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .bulk .all { display: inline-flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 600; color: var(--c-head); cursor: pointer; }
      .bulk .all input { width: 18px; height: 18px; margin: 0; accent-color: var(--c-primary); }
      .bulk .all input:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .bulk .sel { color: var(--c-text2); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
      .bulk .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
      .max { margin: 0; color: var(--c-text2); font-size: 0.86rem; }
      .list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    `,
  ],
  template: `
    <div class="page">
      <app-page-hero title="Calidad de datos" subtitle="Revisa lo que necesita tu decisión antes de que se sume a tu cálculo de emisiones." />

      <section class="card panel" aria-labelledby="review-title" data-testid="review-section">
        <div class="head">
          <h2 id="review-title" #heading tabindex="-1">Por revisar</h2>
          <div class="qtabs" role="tablist" aria-label="Por revisar">
            <button type="button" class="tab" role="tab" id="tab-duplicates" aria-controls="panel-quality" data-testid="tab-duplicates" [attr.aria-selected]="tab() === 'duplicates'" [attr.tabindex]="tab() === 'duplicates' ? 0 : -1" (click)="selectTab('duplicates')" (keydown)="onTabKey($event)">Posibles duplicados @if (total() > 0) { <span class="count" data-testid="duplicates-count">{{ total() }}</span> }</button>
            <button type="button" class="tab" role="tab" id="tab-shared" aria-controls="panel-quality" data-testid="tab-shared" [attr.aria-selected]="tab() === 'shared'" [attr.tabindex]="tab() === 'shared' ? 0 : -1" (click)="selectTab('shared')" (keydown)="onTabKey($event)">Operaciones compartidas @if (sharedTotal() > 0) { <span class="count" data-testid="shared-count">{{ sharedTotal() }}</span> }</button>
          </div>
        </div>

        <div id="panel-quality" role="tabpanel" [attr.aria-labelledby]="'tab-' + tab()" class="panel">
        @if (tab() === 'shared') {
          <app-shared-operations />
        } @else {
        <p class="intro">Estos viajes quedaron retenidos porque podrían estar repetidos. Mientras no decidas, no se suman a tus emisiones.</p>

        @if (importFileId()) {
          <p class="filter" data-testid="filter-note">Mostrando solo los de una carga. <button type="button" class="linkbtn" data-testid="clear-filter" (click)="clearFilter()">Ver todos</button></p>
        }

        <app-resource-state
          [status]="facade.list.status()"
          [error]="facade.list.error()"
          [empty]="total() === 0"
          emptyTitle="No hay posibles duplicados por revisar"
          emptyMessage="Cuando una carga traiga viajes que podrían estar repetidos, aparecerán aquí para que decidas."
          [emptyIcon]="checkIcon"
          (retry)="reload()"
        >
          <div class="bulk" role="toolbar" aria-label="Decidir varios a la vez" data-testid="bulk-bar">
            <label class="all"><input type="checkbox" data-testid="select-page" [checked]="pageSelected()" [disabled]="facade.resolving()" (change)="facade.togglePage(items())" /> Seleccionar los de esta página</label>
            <span class="sel" role="status" data-testid="selected-count">{{ facade.selectedCount() === 0 ? 'Ninguno seleccionado' : facade.selectedCount() + (facade.selectedCount() === 1 ? ' seleccionado' : ' seleccionados') }}</span>
            <span class="acts" role="group" aria-label="Aplicar a los seleccionados">
              <button type="button" class="btn btn-primary btn-sm" data-testid="bulk-same" [disabled]="noSelection()" (click)="decideSelected('SAME_TRIP')">Son el mismo viaje</button>
              <button type="button" class="btn btn-secondary btn-sm" data-testid="bulk-different" [disabled]="noSelection()" (click)="decideSelected('DIFFERENT_TRIPS')">Son viajes diferentes</button>
              <button type="button" class="btn btn-ghost btn-sm" data-testid="bulk-pending" [disabled]="noSelection()" (click)="decideSelected('KEEP_PENDING')">Dejar pendiente</button>
              <button type="button" class="btn btn-ghost btn-sm" data-testid="bulk-clear" [disabled]="noSelection()" (click)="facade.clearSelection()">Quitar selección</button>
            </span>
          </div>
          @if (facade.selectionFull()) { <p class="max" role="status" data-testid="selection-max">Llegaste al máximo de {{ max }} por vez. Decide estos y luego sigue con los demás.</p> }

          <ul class="list" aria-label="Posibles duplicados" data-testid="duplicates-list">
            @for (item of items(); track item.id) {
              <li>
                <app-duplicate-pair [item]="item" [selected]="facade.isSelected(item.a.id)" [selectionFull]="facade.selectionFull()" [busy]="facade.resolving()" (toggled)="facade.toggle(item)" (decide)="decideOne(item, $event)" />
              </li>
            }
          </ul>

          <app-pager [page]="facade.page()" [pageSize]="facade.pageSize()" [total]="total()" [sizes]="sizes" (pageChange)="facade.load({ page: $event })" (sizeChange)="facade.load({ pageSize: $event })" />
        </app-resource-state>
        }
        </div>
      </section>
    </div>

    @if (pending(); as p) {
      <app-duplicate-decision-dialog [decision]="p.decision" [count]="p.ids.length" [fileA]="p.fileA" [fileB]="p.fileB" [retainedHasResult]="p.retainedHasResult" [currentHasResult]="p.currentHasResult" [withoutResult]="p.withoutResult" [busy]="facade.resolving()" [error]="dialogError()" (confirmed)="confirm(p, $event)" (closed)="closeDialog()" />
    }
  `,
})
export class QualityComponent {
  protected readonly facade = inject(DuplicatesFacade);
  private readonly shared = inject(SharedOperationsFacade);
  private readonly context = inject(OrganizationContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly checkIcon = CHECK_ICON;
  protected readonly sizes = DUPLICATES_PAGE_SIZES;
  protected readonly max = MAX_DUPLICATE_RESOLUTION;
  protected readonly pending = signal<PendingDecision | null>(null);
  protected readonly dialogError = signal<string | null>(null);

  protected readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get(QUALITY_TAB_PARAM))), { initialValue: null });
  /** La pestaña sale de `?tab=compartidas` (el enlace del aviso de la campana) y cambia al elegirla. */
  protected readonly tab = linkedSignal<QualityTab>(() => (this.tabParam() === SHARED_OPERATIONS_TAB ? 'shared' : 'duplicates'));
  protected readonly sharedTotal = computed(() => this.shared.list.data()?.total ?? 0);
  protected readonly importFileId = toSignal(this.route.queryParamMap.pipe(map((params) => params.get(IMPORT_FILE_PARAM))), { initialValue: null });
  protected readonly items = computed<readonly PossibleDuplicate[]>(() => this.facade.list.data()?.items ?? []);
  protected readonly total = computed(() => this.facade.list.data()?.total ?? 0);
  protected readonly noSelection = computed(() => this.facade.selectedCount() === 0 || this.facade.resolving());
  protected readonly pageSelected = computed(() => this.items().length > 0 && this.items().every((item) => this.facade.isSelected(item.a.id)));

  constructor() {
    // Una visita nueva empieza sin pares marcados de una visita anterior.
    this.facade.clearSelection();
    this.shared.clearSelection();

    // Carga al entrar y al cambiar de empresa o de carga filtrada (`?import_file_id=`).
    effect(() => {
      this.context.activeOrganizationId();

      const filter = this.importFileId();

      untracked(() => {
        this.pending.set(null);
        this.facade.load({ importFileId: filter });
        this.shared.load();
      });
    });
  }

  protected reload(): void {
    this.facade.load();
  }

  protected selectTab(tab: QualityTab): void {
    this.tab.set(tab);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [QUALITY_TAB_PARAM]: tab === 'shared' ? SHARED_OPERATIONS_TAB : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Flechas, Inicio y Fin cambian de pestaña y llevan el foco a la elegida. */
  protected onTabKey(event: KeyboardEvent): void {
    const order: readonly QualityTab[] = ['duplicates', 'shared'];
    const current = order.indexOf(this.tab());
    const next = { ArrowRight: (current + 1) % order.length, ArrowLeft: (current + order.length - 1) % order.length, Home: 0, End: order.length - 1 }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    this.selectTab(order[next]);
    queueMicrotask(() => document.getElementById(`tab-${order[next]}`)?.focus());
  }

  protected clearFilter(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [IMPORT_FILE_PARAM]: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Decisión sobre un par: «Dejar pendiente» se aplica directo; las otras piden confirmación. */
  protected decideOne(item: PossibleDuplicate, decision: DuplicateDecision): void {
    this.start([item.a.id], decision, { fileA: item.a.fileName, fileB: item.b?.fileName ?? null, retainedHasResult: hasResult(item.a), currentHasResult: hasResult(item.b), withoutResult: hasResult(item.a) ? 0 : 1 });
  }

  protected decideSelected(decision: DuplicateDecision): void {
    this.start(this.facade.selection(), decision, { fileA: null, fileB: null, retainedHasResult: this.facade.withoutResultCount() === 0, currentHasResult: true, withoutResult: this.facade.withoutResultCount() });
  }

  protected confirm(p: PendingDecision, keep: DuplicateKeep | undefined): void {
    this.dialogError.set(null);
    this.run(p.ids, p.decision, keep);
  }

  protected closeDialog(): void {
    this.pending.set(null);
    this.dialogError.set(null);
  }

  private start(ids: readonly TripId[], decision: DuplicateDecision, context: Omit<PendingDecision, 'ids' | 'decision'>): void {
    if (ids.length === 0 || this.facade.resolving()) return;

    if (decision === 'KEEP_PENDING') return this.run(ids, decision);

    this.dialogError.set(null);
    this.pending.set({ ids, decision, ...context });
  }

  private run(ids: readonly TripId[], decision: DuplicateDecision, keep?: DuplicateKeep): void {
    this.facade.resolve(ids, decision, keep).subscribe({
      next: (result) => {
        this.toast.success(resolutionMessage(decision, keep, result));
        this.pending.set(null);

        // Los pares decididos salen de la lista: el foco vuelve al título para no quedar en un botón que ya no existe.
        if (decision !== 'KEEP_PENDING') queueMicrotask(() => this.heading().nativeElement.focus());
      },
      error: (error: unknown) => {
        const app = toAppError(error);

        // Con un 404 no cambió nada en el servidor: la lista se renueva para quitar lo que ya no existe.
        if (app.code === 'TRIP_NOT_FOUND') this.facade.load({ background: true });

        if (this.pending()) this.dialogError.set(app.message);
        else this.toast.error(app);
      },
    });
  }
}
