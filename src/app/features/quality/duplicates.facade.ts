import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { DuplicateDecision, DuplicateKeep, DuplicateResolutionResult, MAX_DUPLICATE_RESOLUTION, PossibleDuplicate, TripId } from '../../domain/models/duplicates';
import { Page } from '../../domain/models/pagination';
import { DuplicatesRepository } from '../../domain/repositories/duplicates.repositories';

/** Pares por página: cada uno es una tarjeta con dos viajes, así que la página se mantiene corta. */
export const DUPLICATES_PAGE_SIZE = 5;
export const DUPLICATES_PAGE_SIZES: readonly number[] = [5, 10];

/**
 * Bandeja «Posibles duplicados» de la empresa activa: lista paginada de pares, selección para decidir por lotes (hasta 500, también entre
 * páginas) y la decisión sobre uno o varios. Todo lo entrega el servidor; cambiar de empresa descarta lista, filtro y selección.
 */
@Injectable({ providedIn: 'root' })
export class DuplicatesFacade {
  private readonly repository = inject(DuplicatesRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);

  readonly list = this.registry.track(new ScopedResource<Page<PossibleDuplicate>>());
  readonly page = signal(1);
  readonly pageSize = signal(DUPLICATES_PAGE_SIZE);
  /** Carga a la que se limita la lista (`?import_file_id=`); `null` = todas. */
  readonly importFileId = signal<string | null>(null);
  /** Viajes retenidos (los `a` de los pares) marcados para decidir juntos. */
  readonly selection = signal<readonly TripId[]>([]);
  /** De los marcados, los retenidos que todavía no tienen resultado calculado (no sumarían emisiones al decidir). */
  readonly selectionWithoutResult = signal<readonly TripId[]>([]);
  readonly resolving = signal(false);

  readonly selectedCount = computed(() => this.selection().length);
  readonly withoutResultCount = computed(() => this.selection().filter((id) => this.selectionWithoutResult().includes(id)).length);
  readonly selectionFull = computed(() => this.selection().length >= MAX_DUPLICATE_RESOLUTION);

  constructor() {
    this.registry.track({
      reset: () => {
        this.page.set(1);
        this.pageSize.set(DUPLICATES_PAGE_SIZE);
        this.importFileId.set(null);
        this.selection.set([]);
        this.selectionWithoutResult.set([]);
        this.resolving.set(false);
      },
    });
  }

  /** Pide una página con el filtro vigente; con `filter` se reemplaza la carga elegida y se vuelve a la primera página. */
  load(options: { page?: number; pageSize?: number; importFileId?: string | null; background?: boolean } = {}): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.list.reset();

    if (options.importFileId !== undefined) {
      if (options.importFileId !== this.importFileId()) this.page.set(1);

      this.importFileId.set(options.importFileId);
    }

    if (options.pageSize !== undefined) {
      this.pageSize.set(options.pageSize);
      this.page.set(1);
    }

    if (options.page !== undefined) this.page.set(options.page);

    const importFileId = this.importFileId() ?? undefined;

    this.list.load(
      this.repository.list(id, { page: this.page(), pageSize: this.pageSize() }, { importFileId }).pipe(
        tap((result) => {
          // Al resolver el último par de la última página, esa página ya no existe: se vuelve a la última que queda.
          if (result.items.length === 0 && result.total > 0 && this.page() > 1) this.load({ page: result.totalPages });
        }),
      ),
      { keepData: options.background ?? this.list.data() !== null },
    );
  }

  isSelected(id: TripId): boolean {
    return this.selection().includes(id);
  }

  /** Marca o desmarca un par; no deja pasar de 500 (el máximo que admite una decisión). */
  toggle(item: PossibleDuplicate): void {
    const id = item.a.id;
    const adding = !this.selection().includes(id) && this.selection().length < MAX_DUPLICATE_RESOLUTION;

    this.selection.update((all) => (all.includes(id) ? all.filter((value) => value !== id) : adding ? [...all, id] : all));

    if (adding) this.rememberResult([item]);
  }

  /** Marca todos los pares de la página (hasta completar los 500) o, si ya lo estaban, los desmarca. */
  togglePage(items: readonly PossibleDuplicate[]): void {
    const ids = items.map((item) => item.a.id);

    this.selection.update((all) => {
      if (ids.every((id) => all.includes(id))) return all.filter((id) => !ids.includes(id));

      const merged = [...all, ...ids.filter((id) => !all.includes(id))];

      return merged.slice(0, MAX_DUPLICATE_RESOLUTION);
    });
    this.rememberResult(items);
  }

  /** Recuerda cuáles de los pares vistos tienen el retenido sin resultado, porque los marcados de otras páginas ya no están a la vista. */
  private rememberResult(items: readonly PossibleDuplicate[]): void {
    const without = items.filter((item) => item.a.kgCo2 === null).map((item) => item.a.id);

    this.selectionWithoutResult.update((all) => [...all.filter((id) => !items.some((item) => item.a.id === id)), ...without]);
  }

  clearSelection(): void {
    this.selection.set([]);
    this.selectionWithoutResult.set([]);
  }

  /**
   * Decide sobre viajes retenidos. Al terminar, los decididos salen de la selección y la lista se renueva sin parpadeo. Un error (p. ej. 404 si
   * un viaje ya no existe) no cambia nada en el servidor: la selección se conserva para reintentar.
   */
  resolve(tripIds: readonly TripId[], decision: DuplicateDecision, keep?: DuplicateKeep): Observable<DuplicateResolutionResult> {
    const id = this.context.activeOrganizationId();

    if (!id) throw new Error('No hay una empresa activa.');

    this.resolving.set(true);

    return this.repository.resolve(id, { tripIds, decision, ...(keep ? { keep } : {}) }).pipe(
      tap({
        next: () => {
          this.resolving.set(false);

          this.selection.update((all) => all.filter((item) => !tripIds.includes(item)));

          // «Dejar pendiente» no cambia nada en el servidor: los pares siguen en la lista y no hace falta renovarla.
          if (decision !== 'KEEP_PENDING') this.load({ background: true });
        },
        error: () => this.resolving.set(false),
      }),
    );
  }
}
