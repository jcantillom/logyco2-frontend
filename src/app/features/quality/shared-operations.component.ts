import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ToastService } from '../../core/notifications/toast.service';
import { CandidateStatus, MAX_SHARED_DECISIONS, SharedCandidate, SharedDecision } from '../../domain/models/reconciliation';
import { PagerComponent } from '../../shared/ui/pager.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { SharedCandidateComponent } from './shared-candidate.component';
import { SharedConfirmKind, SharedDecisionDialogComponent } from './shared-decision-dialog.component';
import { SHARED_PAGE_SIZES, SharedOperationsFacade } from './shared-operations.facade';
import { STATUS_FILTERS, STATUS_FILTER_HINT, SelectionChoice, decisionMessage, isDecidable, selectionMessage, sideFor } from './shared-operations.view';

/** Trazo del ícono del estado vacío (viewBox 24, sin relleno). */
const SHARED_ICON = 'M4 8h14l-3-3M20 16H6l3 3';

/** Códigos tras los cuales la lista ya no coincide con el servidor: se renueva para quitar lo que cambió. */
const STALE_CODES: readonly string[] = ['CANDIDATE_NOT_FOUND', 'CANDIDATE_ALREADY_RESOLVED', 'MATCHING_NOT_ACTIVE', 'PAIR_NOT_CONFIRMABLE', 'OPERATION_NOT_FOUND', 'OPERATION_NOT_IN_CONFLICT'];

/** Lo que espera confirmación: a qué candidatos aplica y qué se hace. */
type Pending =
  | { readonly kind: 'SAME' | 'DISTINCT'; readonly ids: readonly string[] }
  | { readonly kind: 'MINE' | 'THEIRS'; readonly item: SharedCandidate };

/**
 * «Calidad de datos → Operaciones compartidas»: bandeja de posibles viajes que tu empresa y una empresa vinculada podrían haber declarado. Se
 * decide solo por el lado propio, uno por uno o por lotes (hasta 500); «mismo viaje» y «viajes distintos» piden confirmación. Ambas empresas
 * conservan siempre sus declaraciones; la coincidencia solo se confirma cuando las dos coinciden.
 */
@Component({
  selector: 'app-shared-operations',
  imports: [PagerComponent, ResourceStateComponent, RouterLink, SharedCandidateComponent, SharedDecisionDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: grid; gap: 14px; }
      .intro { margin: 0; color: var(--c-text2); font-size: 0.95rem; line-height: 1.45; max-width: 860px; }
      .intro a { color: var(--c-accent); font-weight: 700; text-underline-offset: 3px; }
      .intro a:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      .filter { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; font-size: 0.9rem; font-weight: 600; color: var(--c-head); }
      .filter select { min-height: 36px; padding: 0 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); color: var(--c-head); font: inherit; }
      .filter select:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
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
    <p class="intro" data-testid="shared-intro">Estos son viajes que tu empresa y una empresa vinculada podrían haber declarado. Decides solo por tu lado: las dos empresas conservan siempre sus declaraciones y, en un consolidado, el viaje se contará una sola vez cuando ambas confirmen. <a routerLink="/mi-empresa" [queryParams]="{ tab: 'links' }" data-testid="shared-permissions-link">Ver permisos de conciliación</a></p>

    <label class="filter">Estado
      <select data-testid="shared-status-filter" [title]="filterHint" [attr.aria-describedby]="'shared-filter-hint'" [value]="facade.status() ?? ''" (change)="onStatus($event)">
        @for (option of filters; track option.value) { <option [value]="option.value" [selected]="option.value === (facade.status() ?? '')">{{ option.label }}</option> }
      </select>
      <span class="sr-only" id="shared-filter-hint">{{ filterHint }}</span>
    </label>

    <app-resource-state
      [status]="facade.list.status()"
      [error]="facade.list.error()"
      [empty]="total() === 0"
      emptyTitle="No hay operaciones compartidas por revisar"
      emptyMessage="Cuando tu empresa y una empresa vinculada permitan la conciliación y sus cargas coincidan, los posibles viajes compartidos aparecerán aquí."
      [emptyIcon]="icon"
      (retry)="reload()"
    >
      <div class="bulk" role="toolbar" aria-label="Decidir varios a la vez" data-testid="shared-bulk">
        <label class="all"><input type="checkbox" data-testid="shared-select-page" [checked]="pageSelected()" [disabled]="facade.saving() || decidable().length === 0" (change)="facade.togglePage(decidableIds())" /> Seleccionar los de esta página</label>
        <span class="sel" role="status" data-testid="shared-selected-count">{{ facade.selectedCount() === 0 ? 'Ninguno seleccionado' : facade.selectedCount() + (facade.selectedCount() === 1 ? ' seleccionado' : ' seleccionados') }}</span>
        <span class="acts" role="group" aria-label="Aplicar a los seleccionados">
          <button type="button" class="btn btn-primary btn-sm" data-testid="bulk-same" [disabled]="noSelection()" (click)="decideSelected('SAME')">Confirmar que es el mismo viaje</button>
          <button type="button" class="btn btn-secondary btn-sm" data-testid="bulk-distinct" [disabled]="noSelection()" (click)="decideSelected('DISTINCT')">Confirmar que son viajes distintos</button>
          <button type="button" class="btn btn-secondary btn-sm" data-testid="bulk-needs-info" [disabled]="noSelection()" (click)="decideSelected('NEEDS_INFO')">Solicitar aclaración</button>
          <button type="button" class="btn btn-ghost btn-sm" data-testid="bulk-pending" [disabled]="noSelection()" (click)="decideSelected('KEEP_PENDING')">Dejar pendiente</button>
          <button type="button" class="btn btn-ghost btn-sm" data-testid="bulk-clear" [disabled]="noSelection()" (click)="facade.clearSelection()">Quitar selección</button>
        </span>
      </div>
      @if (facade.selectionFull()) { <p class="max" role="status" data-testid="shared-selection-max">Llegaste al máximo de {{ max }} por vez. Decide estos y luego sigue con los demás.</p> }

      <ul class="list" aria-label="Posibles viajes compartidos" data-testid="shared-list">
        @for (item of items(); track item.id) {
          <li>
            <app-shared-candidate [item]="item" [selected]="facade.isSelected(item.id)" [selectionFull]="facade.selectionFull()" [busy]="facade.saving()" (toggled)="facade.toggle(item.id)" (decide)="decideOne(item, $event)" (choose)="choose(item, $event)" />
          </li>
        }
      </ul>

      <app-pager [page]="facade.page()" [pageSize]="facade.pageSize()" [total]="total()" [sizes]="sizes" (pageChange)="facade.load({ page: $event })" (sizeChange)="facade.load({ pageSize: $event })" />
    </app-resource-state>

    @if (pending(); as p) {
      <app-shared-decision-dialog [kind]="p.kind" [count]="count(p)" [busy]="facade.saving()" [error]="dialogError()" (confirmed)="confirm(p)" (closed)="closeDialog()" />
    }
  `,
})
export class SharedOperationsComponent {
  protected readonly facade = inject(SharedOperationsFacade);
  private readonly toast = inject(ToastService);

  protected readonly icon = SHARED_ICON;
  protected readonly sizes = SHARED_PAGE_SIZES;
  protected readonly max = MAX_SHARED_DECISIONS;
  protected readonly filters = STATUS_FILTERS;
  protected readonly filterHint = STATUS_FILTER_HINT;
  protected readonly pending = signal<Pending | null>(null);
  protected readonly dialogError = signal<string | null>(null);

  protected readonly items = computed<readonly SharedCandidate[]>(() => this.facade.list.data()?.items ?? []);
  protected readonly total = computed(() => this.facade.list.data()?.total ?? 0);
  protected readonly decidable = computed(() => this.items().filter(isDecidable));
  protected readonly decidableIds = computed(() => this.decidable().map((item) => item.id));
  protected readonly noSelection = computed(() => this.facade.selectedCount() === 0 || this.facade.saving());
  protected readonly pageSelected = computed(() => this.decidable().length > 0 && this.decidable().every((item) => this.facade.isSelected(item.id)));

  protected reload(): void {
    this.facade.load();
  }

  protected onStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.facade.clearSelection();
    this.facade.load({ status: value === '' ? null : (value as CandidateStatus) });
  }

  protected count(p: Pending): number {
    return 'ids' in p ? p.ids.length : 1;
  }

  protected decideOne(item: SharedCandidate, decision: SharedDecision): void {
    this.startDecision([item.id], decision);
  }

  protected decideSelected(decision: SharedDecision): void {
    this.startDecision(this.facade.selection(), decision);
  }

  protected choose(item: SharedCandidate, choice: SelectionChoice): void {
    if (this.facade.saving() || !item.operation) return;

    this.dialogError.set(null);
    this.pending.set({ kind: choice, item });
  }

  protected confirm(p: Pending): void {
    this.dialogError.set(null);

    if ('item' in p) this.runSelection(p.item, p.kind);
    else this.runDecision(p.ids, p.kind);
  }

  protected closeDialog(): void {
    this.pending.set(null);
    this.dialogError.set(null);
  }

  /** «Mismo viaje» y «viajes distintos» piden confirmación; pedir aclaración y dejar pendiente son reversibles y se aplican directo. */
  private startDecision(ids: readonly string[], decision: SharedDecision): void {
    if (ids.length === 0 || this.facade.saving()) return;

    if (decision === 'SAME' || decision === 'DISTINCT') {
      this.dialogError.set(null);
      this.pending.set({ kind: decision, ids });

      return;
    }

    this.runDecision(ids, decision);
  }

  private runDecision(ids: readonly string[], decision: SharedDecision): void {
    this.facade.decide(ids, decision).subscribe({
      next: (result) => {
        this.toast.success(decisionMessage(decision, result, ids.length));
        this.pending.set(null);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private runSelection(item: SharedCandidate, choice: SharedConfirmKind): void {
    if (!item.operation) return;

    this.facade.select(item.operation.id, sideFor(item.mySide, choice === 'MINE' ? 'MINE' : 'THEIRS')).subscribe({
      next: (result) => {
        this.toast.success(selectionMessage(result));
        this.pending.set(null);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    const app = toAppError(error);

    // Si algo cambió en el servidor la lista se renueva; nada se aplicó (la operación es atómica).
    if (STALE_CODES.includes(app.code)) this.facade.load({ background: true });

    if (this.pending()) this.dialogError.set(app.message);
    else this.toast.error(app);
  }
}
