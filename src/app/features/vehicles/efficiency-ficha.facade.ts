import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { AppliedToPending, FichaApplyResult, FichaPreview } from '../../domain/models/vehicle-efficiency';
import { VehicleEfficiencyRepository } from '../../domain/repositories/vehicle-efficiency.repositories';
import { saveFile } from '../imports/save-file';
import { REVIEW_AGAIN_CODES, canApplyFicha } from './vehicle-efficiency.view';
import { VehiclesFacade } from './vehicles.facade';

export type FichaStep = 'file' | 'review' | 'result';

/** Problemas de la ficha que se ven a la vez (sin scroll interno: el resto va en otra página del propio diálogo). */
export const FICHA_PAGE_SIZE = 6;
/**
 * Tamaño máximo del archivo, copiado del backend (`VEHICLE_EFFICIENCY_FICHA_MAX_MB`, 10) solo para avisar antes de subirlo; el servidor sigue
 * siendo quien valida (413 `FILE_TOO_LARGE`).
 */
export const FICHA_MAX_BYTES = 10 * 1024 * 1024;

const XLSX = /\.xlsx$/i;

/** Lo que se muestra tras aplicar la ficha; lo recalculado se acumula entre las llamadas de «Continuar». */
export interface FichaOutcome {
  readonly recordsCreated: number;
  readonly recordsReplaced: number;
  readonly recordsReplacedMeasured: number;
  readonly skippedMeasuredProtected: number;
  readonly unchanged: number;
  readonly applied: AppliedToPending;
  readonly recalculated: number;
  /** «Continuar» no recalculó nada y no quedan menos viajes: repetir no avanza. */
  readonly stalled: boolean;
}

/**
 * «Ficha por vehículo»: el rendimiento de muchos vehículos desde un Excel. Tres pasos: archivo (vista previa del servidor, que no guarda nada) →
 * revisión (conteos y problemas, solo del servidor) → resultado.
 *
 * - Se aplica el MISMO archivo de la vista previa con su token; el token vive solo en memoria (nunca en la URL ni en el almacenamiento) y se
 *   descarta al cerrar, al pedir otra vista previa o al cambiar de empresa.
 * - Si la vista previa venció o los vehículos cambiaron, hay que revisarla de nuevo (con el mismo archivo, sin volver a elegirlo).
 * - Aplicar es idempotente: si quedan viajes por examinar (`remaining > 0`), «Continuar» repite la misma llamada.
 */
@Injectable({ providedIn: 'root' })
export class EfficiencyFichaFacade {
  private readonly repository = inject(VehicleEfficiencyRepository);
  private readonly vehicles = inject(VehiclesFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);
  private readonly document = inject(DOCUMENT);

  readonly open = signal(false);
  readonly step = signal<FichaStep>('file');
  readonly fileName = signal<string | null>(null);
  readonly busy = signal<'preview' | 'apply' | null>(null);
  readonly downloading = signal(false);
  readonly error = signal<AppError | null>(null);
  /** Un aviso propio de la pantalla (archivo que no es .xlsx, vacío o demasiado grande). */
  readonly problem = signal<string | null>(null);
  readonly preview = signal<FichaPreview | null>(null);
  readonly outcome = signal<FichaOutcome | null>(null);
  /** La vista previa ya no sirve (venció o los vehículos cambiaron): hay que revisarla de nuevo. */
  readonly stale = signal(false);
  /** Página (desde 0) de los problemas. */
  readonly issuesPage = signal(0);
  /** Página (desde 0) de las filas con un medido vigente. */
  readonly protectedPage = signal(0);
  /** «Reemplazar también los rendimientos medidos»: SIEMPRE empieza sin marcar; solo así se envía `confirm_replace_measured`. */
  readonly replaceMeasured = signal(false);
  readonly announcement = signal('');

  readonly canManage = computed(() => this.access.can('vehicles:manage'));
  readonly canApply = computed(() => {
    const preview = this.preview();

    return !!preview && !this.stale() && canApplyFicha(preview.counts, this.replaceMeasured());
  });
  readonly issuePages = computed(() => Math.max(1, Math.ceil((this.preview()?.issues.length ?? 0) / FICHA_PAGE_SIZE)));
  readonly protectedPages = computed(() => Math.max(1, Math.ceil((this.preview()?.protectedRows.length ?? 0) / FICHA_PAGE_SIZE)));
  readonly pageProtected = computed(() => this.preview()?.protectedRows.slice(this.protectedPage() * FICHA_PAGE_SIZE, (this.protectedPage() + 1) * FICHA_PAGE_SIZE) ?? []);
  readonly pageIssues = computed(() => this.preview()?.issues.slice(this.issuesPage() * FICHA_PAGE_SIZE, (this.issuesPage() + 1) * FICHA_PAGE_SIZE) ?? []);

  /** El archivo y el token de la vista previa: lo que se aplica, no lo que haya en pantalla después. */
  private file: File | null = null;
  private token: string | null = null;

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  show(): void {
    if (!this.canManage()) return;

    this.clear();
    this.open.set(true);
  }

  close(): void {
    this.clear();
  }

  /** Descarga la plantilla oficial con la sesión y la guarda en el equipo. */
  downloadTemplate(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.downloading()) return;

    this.downloading.set(true);
    this.error.set(null);

    this.repository.template(organizationId).subscribe({
      next: (file) => {
        saveFile(this.document, file.blob, file.fileName);
        this.downloading.set(false);
      },
      error: (error: unknown) => {
        this.downloading.set(false);
        this.error.set(toAppError(error));
      },
    });
  }

  /** Paso 1: elige el archivo (solo .xlsx, con tope de tamaño) y pide la vista previa; no se guarda nada. */
  choose(file: File | undefined): void {
    if (!file || this.busy() || !this.canManage()) return;

    this.problem.set(null);

    if (!XLSX.test(file.name)) return this.problem.set('El archivo debe ser un libro de Excel con extensión .xlsx.');
    if (file.size === 0) return this.problem.set('El archivo está vacío.');
    if (file.size > FICHA_MAX_BYTES) return this.problem.set(`El archivo supera ${FICHA_MAX_BYTES / (1024 * 1024)} MB. Divídelo en partes más pequeñas.`);

    this.file = file;
    this.fileName.set(file.name);
    this.requestPreview();
  }

  /** Vuelve a pedir la vista previa con el mismo archivo (la anterior venció o los vehículos cambiaron). */
  reviewAgain(): void {
    this.requestPreview();
  }

  /** Paso 2 → 3: aplica exactamente el archivo revisado, con el token en memoria. */
  apply(): void {
    this.send(null);
  }

  /** «Continuar»: repite la misma aplicación para examinar los viajes que faltaron. */
  continue(): void {
    const current = this.outcome();

    if (current) this.send(current);
  }

  /** Reintenta la aplicación con los mismos datos (p. ej. tras «hay una carga procesándose»). */
  retry(): void {
    this.send(this.outcome());
  }

  /** Vuelve a elegir otro archivo. */
  backToFile(): void {
    this.discardReview();
    this.file = null;
    this.fileName.set(null);
    this.error.set(null);
    this.problem.set(null);
    this.step.set('file');
  }

  setProtectedPage(page: number): void {
    if (page >= 0 && page < this.protectedPages()) this.protectedPage.set(page);
  }

  setReplaceMeasured(value: boolean): void {
    if (this.step() === 'review' && !this.busy()) this.replaceMeasured.set(value);
  }

  setIssuesPage(page: number): void {
    if (page >= 0 && page < this.issuePages()) this.issuesPage.set(page);
  }

  private requestPreview(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.file || this.busy()) return;

    this.discardReview();
    this.busy.set('preview');
    this.error.set(null);
    this.announcement.set('Revisando el archivo…');

    this.repository.previewFicha(organizationId, this.file).subscribe({
      next: (preview) => {
        this.busy.set(null);
        this.token = preview.token;
        this.preview.set(preview);
        this.step.set('review');
        this.announcement.set('Revisión lista. Confirma para aplicar.');
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.error.set(toAppError(error));
        this.announcement.set('');
      },
    });
  }

  private send(previous: FichaOutcome | null): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.file || !this.token || this.busy() || (!previous && !this.canApply())) return;

    this.busy.set('apply');
    this.error.set(null);
    this.announcement.set('Aplicando la ficha…');

    this.repository.applyFicha(organizationId, this.file, this.token, this.replaceMeasured()).subscribe({
      next: (result) => {
        this.busy.set(null);
        this.outcome.set(this.merge(result, previous));
        this.step.set('result');
        this.announcement.set('Ficha aplicada.');
        this.vehicles.loadList();
      },
      error: (error: unknown) => {
        this.busy.set(null);

        const failure = toAppError(error);

        this.error.set(failure);
        this.announcement.set('');

        if (REVIEW_AGAIN_CODES.has(failure.code)) {
          this.token = null;
          this.stale.set(true);
          this.step.set('review');
        }
      },
    });
  }

  private merge(result: FichaApplyResult, previous: FichaOutcome | null): FichaOutcome {
    return {
      recordsCreated: previous ? previous.recordsCreated : result.recordsCreated,
      recordsReplaced: previous ? previous.recordsReplaced : result.recordsReplaced,
      recordsReplacedMeasured: previous ? previous.recordsReplacedMeasured : result.recordsReplacedMeasured,
      skippedMeasuredProtected: previous ? previous.skippedMeasuredProtected : result.skippedMeasuredProtected,
      unchanged: previous ? previous.unchanged : result.unchanged,
      applied: result.applied,
      recalculated: (previous?.recalculated ?? 0) + result.applied.tripsRecalculated,
      stalled: !!previous && result.applied.tripsRecalculated === 0 && result.applied.remaining >= previous.applied.remaining,
    };
  }

  private discardReview(): void {
    this.token = null;
    this.preview.set(null);
    this.outcome.set(null);
    this.stale.set(false);
    this.issuesPage.set(0);
    this.protectedPage.set(0);
    this.replaceMeasured.set(false);
  }

  private clear(): void {
    this.discardReview();
    this.file = null;
    this.open.set(false);
    this.step.set('file');
    this.fileName.set(null);
    this.busy.set(null);
    this.downloading.set(false);
    this.error.set(null);
    this.problem.set(null);
    this.announcement.set('');
  }
}
