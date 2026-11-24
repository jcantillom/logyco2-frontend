import { Injectable, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { BulkApplyResult, BulkEfficiencyItem, BulkPreview, BulkScope, CompletionOption } from '../../domain/models/operations';
import { OperationsRepository } from '../../domain/repositories/operations.repositories';
import { OperationsFacade } from './operations.facade';

export type BulkStep = 'values' | 'review' | 'result';

/** Placas que se ven a la vez en el diálogo (sin scroll interno: el resto va en otra página del propio diálogo). */
export const BULK_PAGE_SIZE = 6;
/** Tope de placas por petición del servidor. */
export const BULK_MAX_PLATES = 200;
/** El motivo que cubre este diálogo. */
export const BULK_REASON = 'DISTANCE_WITHOUT_EFFICIENCY';

/** Vuelven a pedir la revisión: el alcance cambió, venció o no corresponde. */
const REVIEW_AGAIN_CODES: ReadonlySet<string> = new Set(['COMPLETION_PREVIEW_STALE', 'COMPLETION_TOKEN_EXPIRED', 'COMPLETION_TOKEN_INVALID']);

export interface PlateValue {
  readonly value: string;
  readonly unit: string;
}

/**
 * «Completar por vehículo»: un rendimiento EXPLÍCITO por placa para los viajes que no lo traen. Tres pasos: valores → revisión (el servidor cuenta y calcula en seco) → resultado.
 *
 * - Las placas que se ofrecen salen de los viajes de la página abierta con ese motivo (el contrato no lista placas) y se pueden agregar otras; el servidor dice cuántos viajes afecta cada una.
 * - Nunca se aplica sin un valor escrito: las filas vacías se omiten (no hay valor ni unidad por defecto) y la unidad se elige a mano.
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
  /** Placas ofrecidas al abrir (de la página visible) y las que la persona agregó. */
  readonly plates = signal<readonly string[]>([]);
  readonly entries = signal<Readonly<Record<string, PlateValue>>>({});
  readonly page = signal(0);
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
  /** Unidades de rendimiento que ofrece el servidor por combustible (de lo que pide el formulario de un viaje de ese combustible); nunca una lista propia de la pantalla. */
  readonly units = signal<Readonly<Record<string, readonly CompletionOption[]>>>({});
  readonly unitsStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  readonly canComplete = computed(() => this.access.can('imports:create'));
  /** El botón solo se ofrece donde hay viajes por completar a la vista. */
  readonly available = computed(() => this.operations.view() === 'pending' && this.operations.items().length > 0);
  readonly importFileId = computed(() => this.operations.importFileId());
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.plates().length / BULK_PAGE_SIZE)));
  readonly visiblePlates = computed(() => this.plates().slice(this.page() * BULK_PAGE_SIZE, (this.page() + 1) * BULK_PAGE_SIZE));
  /** Placas con un rendimiento escrito: lo único que se envía. */
  readonly filled = computed(() => this.plates().filter((plate) => (this.entries()[plate]?.value ?? '').trim() !== ''));

  /** El token de confirmación y el alcance exacto que se revisó: es lo que se aplica, no lo que haya en pantalla después. */
  private token: string | null = null;
  private reviewed: BulkScope | null = null;
  private fuelOf = new Map<string, string>();
  private unitsRequest = 0;

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  /** Abre el diálogo: ofrece las placas de los viajes visibles sin rendimiento. */
  show(): void {
    if (!this.canComplete()) return;

    const offered = this.operations
      .items()
      .filter((trip) => trip.status === 'PENDING' && trip.reason === BULK_REASON && !!trip.plate)
      .map((trip) => trip.plate as string);

    this.clear();
    this.plates.set(Array.from(new Set(offered)));
    this.allImports.set(!this.operations.importFileId());
    this.open.set(true);
    this.loadUnits();
  }

  /** Las unidades compatibles de cada combustible a la vista: una consulta por combustible con el primer viaje de ese combustible. */
  private loadUnits(): void {
    const organizationId = this.context.activeOrganizationId();
    const firstByFuel = new Map<string, string>();

    this.fuelOf = new Map();

    for (const trip of this.operations.items()) {
      if (trip.status !== 'PENDING' || trip.reason !== BULK_REASON || !trip.plate) continue;

      const fuel = trip.fuelType ?? '';

      this.fuelOf.set(trip.plate, fuel);

      if (!firstByFuel.has(fuel)) firstByFuel.set(fuel, trip.id);
    }

    if (!organizationId || firstByFuel.size === 0) return this.unitsStatus.set(firstByFuel.size === 0 ? 'ready' : 'idle');

    const request = ++this.unitsRequest;
    let pending = firstByFuel.size;

    this.unitsStatus.set('loading');

    for (const [fuel, tripId] of firstByFuel) {
      this.repository.completionState(organizationId, tripId).subscribe({
        next: (state) => {
          if (request !== this.unitsRequest) return;

          const options = state.fields.find((field) => field.name === 'efficiency.unit')?.options ?? [];

          this.units.update((current) => ({ ...current, [fuel]: options }));
        },
        error: () => {
          if (request === this.unitsRequest) this.unitsStatus.set('error');
        },
        complete: () => {
          if (request === this.unitsRequest && --pending === 0 && this.unitsStatus() !== 'error') this.unitsStatus.set('ready');
        },
      });
    }
  }

  /** Unidades que el servidor ofrece para la placa (las de su combustible; sin dato, todas las conocidas sin repetir). */
  unitsFor(plate: string): readonly CompletionOption[] {
    const byFuel = this.units();
    const fuel = this.fuelOf.get(plate);

    if (fuel !== undefined && byFuel[fuel]) return byFuel[fuel];

    const seen = new Map<string, CompletionOption>();

    for (const list of Object.values(byFuel)) for (const option of list) seen.set(option.value, option);

    return Array.from(seen.values());
  }

  close(): void {
    this.clear();
  }

  setEntry(plate: string, patch: Partial<PlateValue>): void {
    this.entries.update((current) => ({ ...current, [plate]: { ...(current[plate] ?? { value: '', unit: '' }), ...patch } }));
    this.plateErrors.update((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== plate)));
    this.problem.set(null);
  }

  setScope(allImports: boolean): void {
    this.allImports.set(allImports || !this.importFileId());
  }

  /** Agrega una placa escrita a mano; el servidor dirá cuántos viajes le corresponden. */
  addPlate(text: string): boolean {
    const plate = text.toUpperCase().replace(/[\s-]/g, '');

    if (plate.length < 2 || plate.length > 20 || this.plates().length >= BULK_MAX_PLATES) return false;

    if (!this.plates().includes(plate)) this.plates.update((current) => [...current, plate]);

    this.page.set(Math.floor((this.plates().indexOf(plate)) / BULK_PAGE_SIZE));

    return true;
  }

  setPage(page: number): void {
    this.page.set(Math.min(Math.max(0, page), this.pageCount() - 1));
  }

  /** Paso 2: pide al servidor la revisión de lo escrito (no escribe nada). */
  review(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy()) return;

    const items: BulkEfficiencyItem[] = [];
    const missing: Record<string, string> = {};

    for (const plate of this.filled()) {
      const entry = this.entries()[plate];

      if (!entry.unit) missing[plate] = 'Elige la unidad';
      else items.push({ plate, value: entry.value, unit: entry.unit });
    }

    if (Object.keys(missing).length > 0) {
      this.plateErrors.set(missing);
      this.page.set(Math.floor(this.plates().indexOf(Object.keys(missing)[0]) / BULK_PAGE_SIZE));
      this.problem.set('Falta elegir la unidad de algunas placas.');

      return;
    }

    if (items.length === 0) {
      this.problem.set('Escribe el rendimiento de al menos una placa.');

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

        if (Object.keys(byPlate).length > 0) {
          this.plateErrors.set(byPlate);
          this.page.set(Math.floor(this.plates().indexOf(Object.keys(byPlate)[0]) / BULK_PAGE_SIZE));
          this.problem.set(failure.message);

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

  private clear(): void {
    this.token = null;
    this.reviewed = null;
    this.open.set(false);
    this.step.set('values');
    this.plates.set([]);
    this.entries.set({});
    this.page.set(0);
    this.allImports.set(true);
    this.busy.set(false);
    this.error.set(null);
    this.problem.set(null);
    this.plateErrors.set({});
    this.preview.set(null);
    this.result.set(null);
    this.stale.set(false);
    this.announcement.set('');
    this.units.set({});
    this.unitsStatus.set('idle');
    this.unitsRequest++;
    this.fuelOf = new Map();
  }
}
