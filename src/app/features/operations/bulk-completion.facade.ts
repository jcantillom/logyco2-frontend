import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, switchMap, tap } from 'rxjs';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { BulkApplyResult, BulkEfficiencyItem, BulkPreview, BulkScope, CappedCount, CompletionPlate } from '../../domain/models/operations';
import { OperationsRepository } from '../../domain/repositories/operations.repositories';
import { OperationsFacade, SEARCH_DEBOUNCE_MS } from './operations.facade';
import { countText } from './operations.view';

export type BulkStep = 'values' | 'review' | 'result';

/** Placas que se ven a la vez en el diálogo (sin scroll interno: el resto va en otra página del propio diálogo). */
export const BULK_PAGE_SIZE = 6;
/** Tope de placas por revisión del servidor. */
export const BULK_MAX_PLATES = 200;

/** Vuelven a pedir la revisión: el alcance cambió, venció o no corresponde. */
const REVIEW_AGAIN_CODES: ReadonlySet<string> = new Set(['COMPLETION_PREVIEW_STALE', 'COMPLETION_TOKEN_EXPIRED', 'COMPLETION_TOKEN_INVALID']);

/** Lo que la persona escribió de una placa. `declared` es la unidad que sus viajes ya declararon (no se pide ni se envía unidad); `''` si hay que elegirla. */
export interface PlateValue {
  readonly value: string;
  readonly unit: string;
  readonly declared: string | null;
}

interface PlatesRequest {
  readonly cursor: string | null;
  readonly page: number;
}

/**
 * «Completar por vehículo»: un rendimiento EXPLÍCITO por placa para los viajes que no lo traen. Tres pasos: valores → revisión (el servidor cuenta y calcula en seco) → resultado.
 *
 * - Las placas salen del servidor (todas las que tienen viajes por completar, de a 6 por página con cursor, y una búsqueda por prefijo con debounce y cancelación); lo escrito se conserva al paginar.
 * - Nunca se aplica sin un valor escrito: las filas vacías se omiten. Si los viajes ya declaran la unidad se muestra tal cual y no se envía; si no, se elige a mano entre las que ofrece el servidor.
 * - El token de confirmación vive solo en memoria (nunca en la URL, el almacenamiento del navegador ni la pantalla) y se descarta al cerrar, al pedir otra revisión o al cambiar de empresa.
 */
@Injectable({ providedIn: 'root' })
export class BulkCompletionFacade {
  private readonly repository = inject(OperationsRepository);
  private readonly operations = inject(OperationsFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);

  readonly open = signal(false);
  readonly step = signal<BulkStep>('values');
  /** Las placas de la página abierta. */
  readonly plates = signal<readonly CompletionPlate[]>([]);
  readonly page = signal(0);
  readonly hasNext = signal(false);
  /** Total acotado de placas (solo lo trae la primera página de cada búsqueda). */
  readonly total = signal<CappedCount | null>(null);
  readonly query = signal('');
  readonly loading = signal(false);
  /** Lo escrito por placa, conservado entre páginas y búsquedas. */
  readonly entries = signal<ReadonlyMap<string, PlateValue>>(new Map());
  /** `true`: todas las cargas; `false`: solo la carga elegida en el filtro (si hay una). */
  readonly allImports = signal(true);
  readonly busy = signal(false);
  readonly error = signal<AppError | null>(null);
  /** Un mensaje propio de la pantalla (p. ej. falta la unidad). */
  readonly problem = signal<string | null>(null);
  /** Mensajes del servidor o de la pantalla por placa. */
  readonly plateErrors = signal<Readonly<Record<string, string>>>({});
  readonly preview = signal<BulkPreview | null>(null);
  readonly result = signal<BulkApplyResult | null>(null);
  /** Debe pedirse otra revisión (el servidor la invalidó). */
  readonly stale = signal(false);
  readonly announcement = signal('');

  readonly canComplete = computed(() => this.access.can('imports:create'));
  /** El botón solo se ofrece donde hay viajes por completar a la vista. */
  readonly available = computed(() => this.operations.view() === 'pending' && this.operations.items().length > 0);
  readonly importFileId = computed(() => this.operations.importFileId());
  /** Placas con un rendimiento escrito: lo único que se envía. */
  readonly filled = computed(() => Array.from(this.entries()).filter(([, entry]) => entry.value.trim() !== '').map(([plate]) => plate));
  readonly rangeLabel = computed(() => {
    const from = this.page() * BULK_PAGE_SIZE + 1;
    const total = this.total();

    return `${from}–${from + this.plates().length - 1}${total ? ` de ${countText(total)}` : ''} placas`;
  });

  /** El token de confirmación y el alcance exacto que se revisó: es lo que se aplica, no lo que haya en pantalla después. */
  private token: string | null = null;
  private reviewed: BulkScope | null = null;
  /** El cursor de cada página (la 0 no lleva): lo devolvió el servidor al pedir la anterior; anterior y siguiente no adivinan nada. */
  private cursors: (string | null)[] = [null];
  private readonly requests$ = new Subject<PlatesRequest>();
  private readonly searches$ = new Subject<void>();

  constructor() {
    this.registry.track({ reset: () => this.clear() });

    this.searches$
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        if (this.open()) this.fetch(0);
      });

    // `switchMap`: pedir otra página o escribir otra búsqueda cancela la petición en vuelo (nunca llega una respuesta vieja).
    this.requests$
      .pipe(
        switchMap((request) => {
          const organizationId = this.context.activeOrganizationId();

          if (!organizationId) return EMPTY;

          this.loading.set(true);

          return this.repository
            .completionPlates(organizationId, { importFileId: this.allImports() ? null : this.importFileId(), query: this.query(), limit: BULK_PAGE_SIZE, cursor: request.cursor })
            .pipe(
              tap((page) => {
                if (!this.open()) return;

                this.loading.set(false);
                this.page.set(request.page);
                this.plates.set(page.items);
                this.hasNext.set(page.nextCursor !== null);
                this.cursors[request.page + 1] = page.nextCursor;

                if (page.total) this.total.set(page.total);

                this.announcement.set(page.items.length === 0 ? 'No hay placas.' : `Placas ${this.rangeLabel()}.`);
              }),
              catchError((error: unknown) => {
                this.loading.set(false);
                this.error.set(toAppError(error));

                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe();
  }

  /** Abre el diálogo y pide la primera página de placas. */
  show(): void {
    if (!this.canComplete()) return;

    this.clear();
    this.allImports.set(!this.operations.importFileId());
    this.open.set(true);
    this.fetch(0);
  }

  close(): void {
    this.clear();
  }

  /** La búsqueda por prefijo de placa: espera 300 ms sin teclear, cancela lo que estaba en vuelo y vuelve a la primera página. */
  setQuery(text: string): void {
    const query = text.toUpperCase().replace(/[\s-]/g, '');

    if (query === this.query()) return;

    this.query.set(query);
    this.searches$.next();
  }

  setEntry(plate: CompletionPlate, patch: { readonly value?: string; readonly unit?: string }): void {
    this.entries.update((current) => {
      const next = new Map(current);
      const before = next.get(plate.plate) ?? { value: '', unit: '', declared: plate.efficiencyUnit };

      next.set(plate.plate, { ...before, ...patch });

      if ((next.get(plate.plate)?.value ?? '').trim() === '' && !next.get(plate.plate)?.unit) next.delete(plate.plate);

      return next;
    });
    this.plateErrors.update((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== plate.plate)));
    this.problem.set(null);
  }

  setScope(allImports: boolean): void {
    const all = allImports || !this.importFileId();

    if (all === this.allImports()) return;

    this.allImports.set(all);
    this.fetch(0);
  }

  setPage(page: number): void {
    if (page < 0 || this.loading() || (page > this.page() && !this.hasNext())) return;

    this.fetch(page);
  }

  /** Paso 2: pide al servidor la revisión de lo escrito (no escribe nada). */
  review(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy()) return;

    const items: BulkEfficiencyItem[] = [];
    const missing: Record<string, string> = {};

    for (const plate of this.filled()) {
      const entry = this.entries().get(plate) as PlateValue;

      if (!entry.declared && !entry.unit) missing[plate] = 'Elige la unidad';
      else items.push({ plate, value: entry.value, unit: entry.declared ? null : entry.unit });
    }

    if (Object.keys(missing).length > 0) {
      this.plateErrors.set(missing);
      this.problem.set(`Falta elegir la unidad de ${Object.keys(missing)[0]}${Object.keys(missing).length > 1 ? ' y otras placas' : ''}.`);

      return;
    }

    if (items.length === 0) {
      this.problem.set('Escribe el rendimiento de al menos una placa.');

      return;
    }

    if (items.length > BULK_MAX_PLATES) {
      this.problem.set(`Máximo ${BULK_MAX_PLATES} placas por revisión: borra el valor de ${items.length - BULK_MAX_PLATES} y repite.`);

      return;
    }

    const scope: BulkScope = { importFileId: this.allImports() ? null : this.importFileId(), items };

    this.busy.set(true);
    this.error.set(null);
    this.problem.set(null);
    this.stale.set(false);
    this.plateErrors.set({});
    this.token = null;

    this.repository.previewCompletion(organizationId, scope).subscribe({
      next: (preview) => {
        this.busy.set(false);
        this.token = preview.token;
        this.reviewed = scope;
        this.preview.set(preview);
        this.step.set('review');
        this.announcement.set('Revisión lista. Confirma para aplicar.');
      },
      error: (error: unknown) => {
        this.busy.set(false);

        const failure = toAppError(error);
        const byPlate: Record<string, string> = {};

        for (const detail of failure.details) {
          const index = /^items\.(\d+)\./.exec(detail.field)?.[1];

          if (index !== undefined && detail.message && failure.code === 'INVALID_FIELD_VALUE') byPlate[items[Number(index)].plate] = detail.message;
        }

        const [first] = Object.entries(byPlate);

        if (first) {
          this.plateErrors.set(byPlate);
          this.problem.set(`${first[0]}: ${first[1]}`);

          return;
        }

        this.error.set(failure);
      },
    });
  }

  /** Paso 3: aplica exactamente lo revisado, con el token en memoria. */
  apply(): void {
    const organizationId = this.context.activeOrganizationId();
    const preview = this.preview();

    if (!organizationId || !this.token || !this.reviewed || !preview || preview.totals.affected === 0 || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);

    this.repository.applyCompletion(organizationId, this.reviewed, this.token).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.token = null;
        this.result.set(result);
        this.step.set('result');
        this.announcement.set(`Listo: ${result.applied} viajes completados.`);
        this.operations.reload();
      },
      error: (error: unknown) => {
        this.busy.set(false);

        const failure = toAppError(error);

        this.error.set(failure);

        if (REVIEW_AGAIN_CODES.has(failure.code)) {
          this.token = null;
          this.stale.set(true);
        }
      },
    });
  }

  /** Vuelve a los valores (conservados) para cambiarlos o pedir otra revisión. */
  backToValues(): void {
    this.token = null;
    this.reviewed = null;
    this.preview.set(null);
    this.error.set(null);
    this.stale.set(false);
    this.step.set('values');
  }

  /** Pide una página; la primera (de una búsqueda o alcance nuevos) reinicia los cursores. */
  private fetch(page: number): void {
    if (page === 0) this.cursors = [null];

    this.error.set(null);
    this.requests$.next({ page, cursor: this.cursors[page] ?? null });
  }

  private clear(): void {
    this.token = null;
    this.reviewed = null;
    this.open.set(false);
    this.step.set('values');
    this.plates.set([]);
    this.page.set(0);
    this.hasNext.set(false);
    this.total.set(null);
    this.query.set('');
    this.loading.set(false);
    this.entries.set(new Map());
    this.allImports.set(true);
    this.busy.set(false);
    this.error.set(null);
    this.problem.set(null);
    this.plateErrors.set({});
    this.preview.set(null);
    this.result.set(null);
    this.stale.set(false);
    this.announcement.set('');
    this.cursors = [null];
  }
}
