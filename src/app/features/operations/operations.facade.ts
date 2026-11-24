import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, debounceTime, filter, finalize, map } from 'rxjs';
import { AccessPolicy } from '../../core/auth/access-policy';
import { toAppError } from '../../core/errors/http-error-mapper';
import { AppError } from '../../core/errors/app-error';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { ImportPeriod, ImportSummary } from '../../domain/models/imports';
import { DedupFilter, OperationsFilter, OperationsPage, OperationsView, TabCounts, TripDetail, TripStatus } from '../../domain/models/operations';
import { ImportsRepository } from '../../domain/repositories/imports.repositories';
import { OperationsRepository } from '../../domain/repositories/operations.repositories';
import { PeriodSelection, samePeriod } from '../dashboard/imports-overview.facade';
import { saveFile } from '../imports/save-file';
import { OperationExportsFacade } from './operation-exports.facade';

/** Viajes por página: 10 por defecto (la vista cabe sin scroll); 50 es el máximo que el servidor admite sin configuración propia. */
export const OPERATIONS_PAGE_SIZES: readonly number[] = [8, 10, 25, 50];
export const OPERATIONS_DEFAULT_PAGE_SIZE = 8;
/** Espera tras la última tecla antes de pedir la búsqueda al servidor. */
export const SEARCH_DEBOUNCE_MS = 300;
/** El servidor rechaza búsquedas de menos de 2 caracteres o de más de 100. */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
/** Cuántas cargas se ofrecen en el filtro «Archivo de carga» (las más recientes ya completadas). */
const IMPORT_FILE_OPTIONS = 50;

export type StatusFilter = Exclude<TripStatus, 'DUPLICATE'>;

export const VIEWS: readonly OperationsView[] = ['all', 'calculated', 'pending', 'issues', 'shared'];
const STATUSES: readonly StatusFilter[] = ['CALCULATED', 'PENDING', 'BLOCKED'];
const DEDUPS: readonly DedupFilter[] = ['counted', 'duplicates', 'held', 'all_states'];
const FUELS: readonly string[] = ['DIESEL', 'GASOLINE', 'NATURAL_GAS', 'ELECTRIC', 'HYBRID', 'OTHER'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo mínimo que se lee de los parámetros de la URL (`ParamMap` lo cumple). */
export interface ParamSource {
  get(name: string): string | null;
}

/**
 * Estado de la vista «Operaciones logísticas» de la empresa activa: filtros, pila de cursores, listado, conteos de las pestañas y detalle bajo demanda.
 *
 * - Todo lo entrega el servidor; aquí no se calcula nada ambiental.
 * - Cualquier cambio de filtro, de pestaña o de tamaño vuelve a la primera página y descarta el total conocido (un cursor solo vale con los mismos filtros).
 * - Cada petición nueva cancela la anterior que siga en vuelo (`ScopedResource` se desuscribe), así que no hay tormenta de peticiones ni respuestas tardías.
 * - La búsqueda espera 300 ms tras la última tecla y solo se aplica con 2 a 100 caracteres.
 * - Cambiar de empresa descarta todo (`ContextResetRegistry`).
 */
@Injectable({ providedIn: 'root' })
export class OperationsFacade {
  private readonly repository = inject(OperationsRepository);
  private readonly imports = inject(ImportsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);
  private readonly document = inject(DOCUMENT);
  private readonly exports = inject(OperationExportsFacade);

  readonly list = this.registry.track(new ScopedResource<OperationsPage>());
  readonly summary = this.registry.track(new ScopedResource<TabCounts>());
  readonly detail = this.registry.track(new ScopedResource<TripDetail>());
  readonly periods = this.registry.track(new ScopedResource<ImportPeriod[]>());
  readonly importFiles = this.registry.track(new ScopedResource<ImportSummary[]>());

  readonly view = signal<OperationsView>('all');
  readonly status = signal<StatusFilter | null>(null);
  readonly fuel = signal<string | null>(null);
  readonly importFileId = signal<string | null>(null);
  readonly period = signal<PeriodSelection>('ALL');
  readonly dedup = signal<DedupFilter>('counted');
  /** Lo que la persona escribió (se muestra tal cual) y lo que ya se aplicó al servidor (recortado y con 2 o más caracteres). */
  readonly searchText = signal('');
  readonly query = signal('');
  readonly pageSize = signal(OPERATIONS_DEFAULT_PAGE_SIZE);
  /** Cursores de las páginas visitadas: la última es la actual y «Anterior» la quita. Solo se conserva la página visible. */
  readonly cursors = signal<readonly (string | null)[]>([null]);
  /** Total de la primera página (las siguientes no lo traen): se conserva mientras no cambien los filtros. */
  readonly total = signal<{ readonly value: number; readonly capped: boolean } | null>(null);
  readonly selectedId = signal<string | null>(null);
  /** Hay una página nueva en camino (con filas viejas a la vista): la pantalla se atenúa sin saltar. */
  readonly refreshing = signal(false);

  /** Se está generando el reporte Excel en el servidor. */
  readonly exporting = signal(false);
  readonly exportError = signal<AppError | null>(null);
  /** La descarga directa dijo «demasiado grande» (`EXPORT_TOO_LARGE` con el tope en `sync_max_rows`): se ofrece generarlo en segundo plano; `maxRows` es ese tope (o `null` si el servidor no lo dijo). */
  readonly exportOffer = signal<{ readonly maxRows: number | null } | null>(null);

  readonly items = computed(() => this.list.data()?.items ?? []);
  /** Hay algo que exportar: el resultado actual tiene al menos una fila. */
  readonly canExport = computed(() => this.items().length > 0);
  readonly pageIndex = computed(() => this.cursors().length - 1);
  readonly from = computed(() => (this.items().length === 0 ? 0 : this.pageIndex() * this.pageSize() + 1));
  readonly to = computed(() => this.pageIndex() * this.pageSize() + this.items().length);
  readonly hasNext = computed(() => !!this.list.data()?.nextCursor);
  readonly hasPrevious = computed(() => this.pageIndex() > 0);
  /** Filtros del servidor (sin la pestaña): los mismos del listado y del resumen. */
  readonly filter = computed<OperationsFilter>(() => {
    const period = this.period();

    return {
      status: this.status() ?? undefined,
      fuel: this.fuel() ?? undefined,
      importFileId: this.importFileId() ?? undefined,
      from: period === 'ALL' ? undefined : period.from,
      to: period === 'ALL' ? undefined : period.to,
      dedup: this.dedup() === 'counted' ? undefined : this.dedup(),
      query: this.query() || undefined,
    };
  });
  /** Hay algún criterio distinto del inicial (sin contar la pestaña). */
  readonly hasFilters = computed(() => Object.values(this.filter()).some((value) => value !== undefined));
  /** Estado de la vista como parámetros de la URL: lo inicial no se escribe. */
  readonly urlParams = computed<Readonly<Record<string, string | null>>>(() => {
    const period = this.period();

    return {
      view: this.view() === 'all' ? null : this.view(),
      status: this.status(),
      fuel: this.fuel(),
      import_file_id: this.importFileId(),
      from: period === 'ALL' ? null : period.from,
      to: period === 'ALL' ? null : period.to,
      dedup: this.dedup() === 'counted' ? null : this.dedup(),
      q: this.query() || null,
      limit: this.pageSize() === OPERATIONS_DEFAULT_PAGE_SIZE ? null : String(this.pageSize()),
    };
  });

  private readonly search$ = new Subject<string>();
  private listToken = 0;
  private exportRequest: Subscription | null = null;

  constructor() {
    this.registry.track({ reset: () => this.resetState() });

    this.search$
      .pipe(
        map((text) => this.normalizeQuery(text)),
        debounceTime(SEARCH_DEBOUNCE_MS),
        // Se compara con lo ya aplicado (no con el valor anterior del flujo): borrar y volver a escribir lo mismo dentro del debounce igual busca.
        filter((query) => query !== this.query()),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((query) => this.applyQuery(query));
  }

  /** Lee los filtros de la URL (valores fuera del vocabulario se ignoran: la URL es de la persona, no del servidor). No pide nada. */
  restore(params: ParamSource): void {
    const view = params.get('view') as OperationsView | null;
    const status = params.get('status') as StatusFilter | null;
    const fuel = params.get('fuel');
    const importFileId = params.get('import_file_id');
    const from = params.get('from');
    const to = params.get('to');
    const dedup = params.get('dedup') as DedupFilter | null;
    const q = params.get('q') ?? '';
    const limit = Number(params.get('limit'));

    this.view.set(view && VIEWS.includes(view) ? view : 'all');
    this.status.set(status && STATUSES.includes(status) && this.view() === 'all' ? status : null);
    this.fuel.set(fuel && FUELS.includes(fuel) ? fuel : null);
    this.importFileId.set(importFileId && UUID.test(importFileId) ? importFileId : null);
    this.period.set(from && to && ISO_DAY.test(from) && ISO_DAY.test(to) && from <= to ? { from, to } : 'ALL');
    this.dedup.set(dedup && DEDUPS.includes(dedup) ? dedup : 'counted');
    this.searchText.set(q.slice(0, SEARCH_MAX_LENGTH));
    this.query.set(this.normalizeQuery(q));
    this.pageSize.set(OPERATIONS_PAGE_SIZES.includes(limit) ? limit : OPERATIONS_DEFAULT_PAGE_SIZE);
    this.cursors.set([null]);
    this.total.set(null);
  }

  /** Pide la lista, los conteos de las pestañas y las opciones de los filtros de la empresa activa. */
  load(): void {
    this.loadList();
    this.loadSummary();
    this.loadFilterOptions();
  }

  /** Vuelve a pedir la página actual; si el cursor ya no vale (400 `INVALID_CURSOR`) vuelve a la primera. */
  retry(): void {
    if (this.summary.status() === 'error') this.loadSummary();

    if (this.list.error()?.code === 'INVALID_CURSOR') return this.firstPage();

    this.loadList();
  }

  setView(view: OperationsView): void {
    if (view === this.view()) return;

    this.view.set(view);

    // «Estado» y las pestañas de estado dicen lo mismo: elegir una pestaña distinta de «Todos» deja libre el filtro de estado.
    const clearedStatus = view !== 'all' && this.status() !== null;

    if (clearedStatus) this.status.set(null);

    this.firstPage(clearedStatus);
  }

  setStatus(status: StatusFilter | null): void {
    if (status === this.status()) return;

    this.status.set(status);

    if (status) this.view.set('all');

    this.firstPage(true);
  }

  setFuel(fuel: string | null): void {
    this.fuel.set(fuel);
    this.firstPage(true);
  }

  setImportFile(id: string | null): void {
    this.importFileId.set(id);
    this.firstPage(true);
  }

  setPeriod(period: PeriodSelection): void {
    const current = this.period();

    if (period === current || (period !== 'ALL' && current !== 'ALL' && samePeriod(period, current))) return;

    this.period.set(period);
    this.firstPage(true);
  }

  setDedup(dedup: DedupFilter): void {
    if (dedup === this.dedup()) return;

    this.dedup.set(dedup);
    this.firstPage(true);
  }

  /** Lo que se escribe en el buscador: se muestra al instante y se pide al servidor tras 300 ms sin teclear. */
  setSearchText(text: string): void {
    this.searchText.set(text.slice(0, SEARCH_MAX_LENGTH));
    this.search$.next(text);
  }

  /** Borra la búsqueda ya, sin esperar el debounce. */
  clearSearch(): void {
    this.searchText.set('');
    this.search$.next('');
    this.applyQuery('');
  }

  /** Quita todos los filtros (la pestaña vuelve a «Todos»). */
  clearFilters(): void {
    this.view.set('all');
    this.status.set(null);
    this.fuel.set(null);
    this.importFileId.set(null);
    this.period.set('ALL');
    this.dedup.set('counted');
    this.searchText.set('');
    this.query.set('');
    this.search$.next('');
    this.firstPage(true);
  }

  setPageSize(size: number): void {
    if (!OPERATIONS_PAGE_SIZES.includes(size) || size === this.pageSize()) return;

    this.pageSize.set(size);
    this.firstPage(false);
  }

  /** Página siguiente con el cursor que dio el servidor; sin cursor, o con una petición en curso, no hace nada. */
  next(): void {
    const cursor = this.list.data()?.nextCursor;

    if (!cursor || this.refreshing()) return;

    this.cursors.update((stack) => [...stack, cursor]);
    this.loadList();
  }

  previous(): void {
    if (this.cursors().length <= 1 || this.refreshing()) return;

    this.cursors.update((stack) => stack.slice(0, -1));
    this.loadList();
  }

  /** Descarga el reporte Excel de lo que se ve (mismos filtros y pestaña, sin cursor ni límite); una sola descarga a la vez. */
  exportReport(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.exporting() || !this.canExport()) return;

    this.exporting.set(true);
    this.exportError.set(null);
    this.exportOffer.set(null);

    this.exportRequest = this.repository.exportReport(organizationId, this.filter(), this.view()).subscribe({
      next: (file) => {
        saveFile(this.document, file.blob, file.fileName);
        this.exporting.set(false);
      },
      error: (error: unknown) => {
        const failure = toAppError(error);

        this.exporting.set(false);

        if (failure.code !== 'EXPORT_TOO_LARGE') return this.exportError.set(failure);

        const maxRows = Number(failure.details.find((detail) => detail.field === 'sync_max_rows')?.message);

        this.exportOffer.set({ maxRows: Number.isFinite(maxRows) && maxRows > 0 ? maxRows : null });
      },
    });
  }

  /** Pide el mismo reporte (filtros y pestaña actuales) como trabajo en segundo plano; si el servidor lo rechaza (p. ej. demasiado grande aun así) el motivo queda en la alerta roja. */
  generateReport(): void {
    this.exports.request(this.filter(), this.view(), (error) => {
      this.exportOffer.set(null);

      if (error) this.exportError.set(error);
    });
  }

  /** Cancela la descarga directa en curso (al salir de la pantalla: el archivo no debe guardarse en silencio después). */
  cancelExport(): void {
    this.exportRequest?.unsubscribe();
    this.exportRequest = null;
    this.exporting.set(false);
  }

  /** Abre el detalle de un viaje: se pide solo ahora, y cada apertura cancela la anterior. */
  open(tripId: string): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) return;

    this.selectedId.set(tripId);
    this.detail.load(this.repository.detail(organizationId, tripId));
  }

  retryDetail(): void {
    const id = this.selectedId();

    if (id) this.open(id);
  }

  close(): void {
    this.selectedId.set(null);
    this.detail.reset();
  }

  /**
   * Refleja un viaje recién completado SIN recargar la lista: la fila (estado, motivo, kg, marca de corregido) y el detalle abierto se reemplazan con lo que el servidor devolvió;
   * la pila de cursores y la página siguen igual (en «Por completar» la fila se queda hasta el próximo cambio de página o filtro). Los conteos de las pestañas sí se piden de nuevo.
   */
  applyCompleted(trip: TripDetail): void {
    this.list.data.update((page) =>
      page
        ? {
            ...page,
            items: page.items.map((row) =>
              row.id === trip.id
                ? {
                    ...row,
                    status: trip.status,
                    stateLabel: trip.stateLabel,
                    reason: trip.reason,
                    reasonLabel: trip.reasonLabel,
                    kgCo2: trip.emissions?.kgCo2 ?? null,
                    distanceKm: trip.distanceKm,
                    fuelType: trip.fuelType,
                    dedupStatus: trip.dedup.status,
                    corrected: trip.corrected !== null,
                  }
                : row,
            ),
          }
        : page,
    );

    if (this.selectedId() === trip.id) this.detail.replace(trip);

    this.loadSummary();
  }

  /** Vuelve a pedir la página actual (misma pila de cursores) y los conteos: para después de una operación en bloque. */
  reload(): void {
    this.loadList();
    this.loadSummary();
  }

  private normalizeQuery(text: string): string {
    const trimmed = text.trim().slice(0, SEARCH_MAX_LENGTH);

    return trimmed.length >= SEARCH_MIN_LENGTH ? trimmed : '';
  }

  private applyQuery(query: string): void {
    if (query === this.query()) return;

    this.query.set(query);
    this.firstPage(true);
  }

  /** Cualquier criterio nuevo invalida los cursores y el total conocido; `summary` pide además los conteos de las pestañas. */
  private firstPage(summary = false): void {
    this.cursors.set([null]);
    this.total.set(null);
    this.exportError.set(null);
    this.exportOffer.set(null);
    this.loadList();

    if (summary) this.loadSummary();
  }

  private loadList(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) {
      this.list.reset();

      return this.refreshing.set(false);
    }

    const token = ++this.listToken;

    this.refreshing.set(true);
    this.list.load(
      this.repository.list(organizationId, this.filter(), { view: this.view(), limit: this.pageSize(), cursor: this.cursors().at(-1) }).pipe(
        map((page) => {
          if (page.total) this.total.set(page.total);

          return page;
        }),
        finalize(() => {
          if (token === this.listToken) this.refreshing.set(false);
        }),
      ),
      { keepData: true },
    );
  }

  private loadSummary(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) return this.summary.reset();

    this.summary.load(this.repository.summary(organizationId, this.filter()), { keepData: true });
  }

  /** Periodos y archivos de carga salen del módulo de cargas: sin ese permiso no se ofrecen (el resto de la pantalla no los necesita). */
  private loadFilterOptions(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.access.can('imports:create')) {
      this.periods.reset();

      return this.importFiles.reset();
    }

    this.periods.load(this.imports.periods(organizationId), { keepData: true });
    this.importFiles.load(
      this.imports.list(organizationId, { page: 1, pageSize: IMPORT_FILE_OPTIONS }, 'COMPLETED').pipe(map((page) => [...page.items])),
      { keepData: true },
    );
  }

  private resetState(): void {
    this.listToken++;
    this.view.set('all');
    this.status.set(null);
    this.fuel.set(null);
    this.importFileId.set(null);
    this.period.set('ALL');
    this.dedup.set('counted');
    this.searchText.set('');
    this.query.set('');
    this.pageSize.set(OPERATIONS_DEFAULT_PAGE_SIZE);
    this.cursors.set([null]);
    this.total.set(null);
    this.selectedId.set(null);
    this.refreshing.set(false);
    this.exportRequest?.unsubscribe();
    this.exportRequest = null;
    this.exporting.set(false);
    this.exportError.set(null);
    this.exportOffer.set(null);
  }
}
