import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { Page } from '../../domain/models/pagination';
import { CandidateStatus, MAX_SHARED_DECISIONS, SelectionResult, SharedCandidate, SharedDecision, SharedDecisionResult, Side } from '../../domain/models/reconciliation';
import { ReconciliationRepository } from '../../domain/repositories/reconciliation.repositories';

/** Candidatos por página: cada uno es una tarjeta con dos declaraciones, así que la página se mantiene corta. */
export const SHARED_PAGE_SIZE = 5;
export const SHARED_PAGE_SIZES: readonly number[] = [5, 10];

/**
 * Bandeja «Operaciones compartidas» de la empresa activa: candidatos a viaje compartido con una empresa vinculada, paginados, con selección
 * para decidir por lotes (hasta 500, también entre páginas) y la decisión o la elección de la declaración vigente. Todo lo entrega el
 * servidor; cambiar de empresa descarta lista, filtro y selección.
 */
@Injectable({ providedIn: 'root' })
export class SharedOperationsFacade {
  private readonly repository = inject(ReconciliationRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);

  readonly list = this.registry.track(new ScopedResource<Page<SharedCandidate>>());
  readonly page = signal(1);
  readonly pageSize = signal(SHARED_PAGE_SIZE);
  /** Estado al que se limita la lista; `null` = todos. */
  readonly status = signal<CandidateStatus | null>(null);
  /** Candidatos marcados para decidir juntos. */
  readonly selection = signal<readonly string[]>([]);
  readonly saving = signal(false);

  readonly selectedCount = computed(() => this.selection().length);
  readonly selectionFull = computed(() => this.selection().length >= MAX_SHARED_DECISIONS);

  constructor() {
    this.registry.track({
      reset: () => {
        this.page.set(1);
        this.pageSize.set(SHARED_PAGE_SIZE);
        this.status.set(null);
        this.selection.set([]);
        this.saving.set(false);
      },
    });
  }

  /** Pide una página con el filtro vigente; cambiar el estado o el tamaño vuelve a la primera página. */
  load(options: { page?: number; pageSize?: number; status?: CandidateStatus | null; background?: boolean } = {}): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.list.reset();

    if (options.status !== undefined) {
      if (options.status !== this.status()) this.page.set(1);

      this.status.set(options.status);
    }

    if (options.pageSize !== undefined) {
      this.pageSize.set(options.pageSize);
      this.page.set(1);
    }

    if (options.page !== undefined) this.page.set(options.page);

    this.list.load(
      this.repository.listCandidates(id, { page: this.page(), pageSize: this.pageSize() }, { status: this.status() ?? undefined }).pipe(
        tap((result) => {
          // Al decidir el último de la última página, esa página ya no existe: se vuelve a la última que queda.
          if (result.items.length === 0 && result.total > 0 && this.page() > 1) this.load({ page: result.totalPages });
        }),
      ),
      { keepData: options.background ?? this.list.data() !== null },
    );
  }

  isSelected(id: string): boolean {
    return this.selection().includes(id);
  }

  /** Marca o desmarca un candidato; no deja pasar de 500 (el máximo que admite una decisión). */
  toggle(id: string): void {
    this.selection.update((all) => (all.includes(id) ? all.filter((value) => value !== id) : all.length < MAX_SHARED_DECISIONS ? [...all, id] : all));
  }

  /** Marca todos los de la página (hasta completar los 500) o, si ya lo estaban, los desmarca. */
  togglePage(ids: readonly string[]): void {
    this.selection.update((all) => (ids.every((id) => all.includes(id)) ? all.filter((id) => !ids.includes(id)) : [...all, ...ids.filter((id) => !all.includes(id))].slice(0, MAX_SHARED_DECISIONS)));
  }

  clearSelection(): void {
    this.selection.set([]);
  }

  /**
   * Decide por la propia empresa sobre uno o varios candidatos (atómico en el servidor). Al terminar, los decididos salen de la selección
   * y la lista se renueva sin parpadeo. Un error no cambia nada en el servidor: la selección se conserva.
   */
  decide(ids: readonly string[], decision: SharedDecision): Observable<SharedDecisionResult> {
    const id = this.requireOrganization();

    this.saving.set(true);

    return this.repository.decide(id, ids, decision).pipe(tap(this.finish(() => this.selection.update((all) => all.filter((item) => !ids.includes(item))))));
  }

  /** Elige la declaración vigente de una operación en conflicto. `selection` es el lado `A`/`B` del par canónico (ver `sideFor`). */
  select(operationId: string, selection: Side): Observable<SelectionResult> {
    const id = this.requireOrganization();

    this.saving.set(true);

    return this.repository.select(id, [operationId], selection).pipe(tap(this.finish()));
  }

  private requireOrganization(): string {
    const id = this.context.activeOrganizationId();

    if (!id) throw new Error('No hay una empresa activa.');

    return id;
  }

  private finish(onSuccess: () => void = () => undefined): { next: () => void; error: () => void } {
    return {
      next: () => {
        this.saving.set(false);
        onSuccess();
        this.load({ background: true });
      },
      error: () => this.saving.set(false),
    };
  }
}
