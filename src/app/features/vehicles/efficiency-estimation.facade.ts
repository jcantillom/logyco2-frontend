import { Injectable, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { EstimateApplyResult, EstimatePreview, EstimateScope } from '../../domain/models/vehicle-efficiency';
import { VehicleEfficiencyRepository } from '../../domain/repositories/vehicle-efficiency.repositories';
import { EfficiencySettingsFacade } from './efficiency-settings.facade';
import { VehicleEfficiencyFacade } from './vehicle-efficiency.facade';
import { ESTIMATE_REVIEW_AGAIN_CODES, canApplyEstimate } from './vehicle-efficiency.view';
import { VehiclesFacade } from './vehicles.facade';

/** Un vehículo desde su diálogo (se aplica solo tras la vista previa) o los pendientes de la empresa (con revisión y confirmación). */
export type EstimateMode = 'vehicle' | 'pending';

/** Lo que se muestra tras aplicar: lo guardado y el efecto sobre los pendientes (lo recalculado se acumula entre las llamadas de «Continuar»). */
export interface EstimateOutcome {
  readonly result: EstimateApplyResult;
  readonly recalculated: number;
  /** «Continuar» no recalculó nada y no quedan menos viajes: repetir no avanza. */
  readonly stalled: boolean;
}

/**
 * Estimación del rendimiento por referencia técnica (UPME, teórica). La pantalla no calcula ni decide nada: pide al servidor la vista previa
 * (que no guarda nada) y aplica el MISMO alcance con su token. Un valor declarado o medido nunca se toca desde aquí: el servidor lo conserva.
 *
 * - `enabled` es lo que dice el servidor (`estimation_enabled` del rendimiento de un vehículo): hasta saberlo, o si está apagada, nada se muestra.
 * - El token vive solo en memoria y se descarta al cerrar, al revisar de nuevo y al cambiar de empresa.
 * - Aplicar es idempotente: si quedan viajes por examinar (`remaining > 0`), «Continuar» repite la misma llamada.
 */
@Injectable({ providedIn: 'root' })
export class EfficiencyEstimationFacade {
  private readonly repository = inject(VehicleEfficiencyRepository);
  private readonly vehicles = inject(VehiclesFacade);
  private readonly efficiency = inject(VehicleEfficiencyFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);
  private readonly settings = inject(EfficiencySettingsFacade);

  /** `null`: el servidor aún no lo dijo. */
  readonly enabled = signal<boolean | null>(null);
  readonly mode = signal<EstimateMode | null>(null);
  readonly open = signal(false);
  readonly busy = signal<'preview' | 'apply' | null>(null);
  readonly error = signal<AppError | null>(null);
  readonly preview = signal<EstimatePreview | null>(null);
  readonly outcome = signal<EstimateOutcome | null>(null);
  /** La vista previa ya no sirve (venció o los vehículos cambiaron): hay que revisarla de nuevo. */
  readonly stale = signal(false);
  readonly announcement = signal('');

  readonly canManage = computed(() => this.access.can('vehicles:manage'));
  /** La acción existe solo para quien administra vehículos y con la estimación encendida en el servidor. */
  readonly canEstimate = computed(() => this.canManage() && this.enabled() === true);
  /** El modo de estimación de la empresa es OFF (de los ajustes que da el servidor): las acciones explícitas no se ofrecen. */
  readonly modeOff = computed(() => this.settings.settings.data()?.mode === 'OFF');
  /** Se puede estimar de verdad: encendida en el servidor, permiso y la empresa no la apagó. */
  readonly canRun = computed(() => this.canEstimate() && !this.modeOff());
  readonly canApply = computed(() => {
    const preview = this.preview();

    return !!preview && !this.stale() && canApplyEstimate(preview.counts);
  });

  private scope: EstimateScope | null = null;
  private token: string | null = null;
  private probing = false;

  constructor() {
    this.registry.track({
      reset: () => {
        this.clear();
        this.enabled.set(null);
        this.probing = false;
      },
    });
  }

  /** El rendimiento de un vehículo trae el estado de la función: se aprende de ahí. */
  learn(enabled: boolean): void {
    this.enabled.set(enabled);
    this.loadSettings(enabled);
  }

  private loadSettings(enabled: boolean): void {
    if (enabled && this.settings.settings.status() === 'idle') this.settings.load();
  }

  /** El servidor solo informa si la estimación está encendida junto con el rendimiento de un vehículo: se pregunta con el primero de la lista. */
  probe(vehicleId: string): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.canManage() || this.enabled() !== null || this.probing) return;

    this.probing = true;
    this.repository.view(organizationId, vehicleId, { page: 1, pageSize: 1 }).subscribe({
      next: (view) => {
        this.probing = false;
        this.enabled.set(view.estimationEnabled);
        this.loadSettings(view.estimationEnabled);
      },
      error: () => {
        this.probing = false;
      },
    });
  }

  /** «Estimar rendimiento de pendientes»: abre el diálogo y pide la vista previa del primer lote. */
  show(): void {
    if (!this.canRun()) return;

    this.clear();
    this.mode.set('pending');
    this.open.set(true);
    this.requestPreview({ kind: 'pending', after: null });
  }

  /** «Usar como estimado» en el diálogo de un vehículo: vista previa y, si hay algo que guardar, aplicación con su token. */
  useReference(vehicleId: string): void {
    if (!this.canRun() || this.busy()) return;

    this.clear();
    this.mode.set('vehicle');
    this.requestPreview({ kind: 'vehicles', vehicleIds: [vehicleId] });
  }

  close(): void {
    this.clear();
  }

  /** Vuelve a pedir la vista previa con el mismo alcance (la anterior venció o los vehículos cambiaron). */
  reviewAgain(): void {
    if (this.scope) this.requestPreview(this.scope);
  }

  /** Revisa el siguiente lote de pendientes con el cursor que dio el servidor. */
  nextBatch(): void {
    const cursor = this.outcome()?.result.nextCursor;

    if (cursor) this.requestPreview({ kind: 'pending', after: cursor });
  }

  /** Confirma lo revisado: aplica el MISMO alcance con el token en memoria. */
  apply(): void {
    this.send(null);
  }

  /** «Continuar»: repite la misma aplicación para examinar los viajes que faltaron. */
  continue(): void {
    const current = this.outcome();

    if (current) this.send(current);
  }

  /** Reintenta lo último (p. ej. tras «hay una carga procesándose»): la aplicación si ya hubo vista previa, si no, la vista previa. */
  retry(): void {
    if (this.token) return this.send(this.outcome());

    this.reviewAgain();
  }

  private requestPreview(scope: EstimateScope): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy()) return;

    this.discardReview();
    this.scope = scope;
    this.busy.set('preview');
    this.error.set(null);
    this.announcement.set('Revisando los vehículos…');

    this.repository.previewEstimate(organizationId, scope).subscribe({
      next: (preview) => {
        this.busy.set(null);
        this.token = preview.token;
        this.preview.set(preview);
        this.announcement.set('Revisión lista.');

        // Desde el diálogo del vehículo, la pulsación de «Usar como estimado» es la confirmación: se aplica si hay algo que guardar.
        if (this.mode() === 'vehicle' && canApplyEstimate(preview.counts)) this.send(null);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.announcement.set('');
        this.fail(toAppError(error));
      },
    });
  }

  private send(previous: EstimateOutcome | null): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.scope || !this.token || this.busy() || (!previous && !this.canApply())) return;

    this.busy.set('apply');
    this.error.set(null);
    this.announcement.set('Aplicando la estimación…');

    this.repository.applyEstimate(organizationId, this.scope, this.token).subscribe({
      next: (result) => {
        this.busy.set(null);
        this.outcome.set({
          result,
          recalculated: (previous?.recalculated ?? 0) + result.applied.tripsRecalculated,
          stalled: !!previous && result.applied.tripsRecalculated === 0 && result.applied.remaining >= previous.result.applied.remaining,
        });
        this.announcement.set('Estimación aplicada.');
        this.vehicles.loadList();

        if (this.mode() === 'vehicle') this.efficiency.loadHistory(1);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.announcement.set('');
        this.fail(toAppError(error));
      },
    });
  }

  private fail(failure: AppError): void {
    this.error.set(failure);

    if (ESTIMATE_REVIEW_AGAIN_CODES.has(failure.code)) {
      this.token = null;
      this.stale.set(true);
    }

    // Apagada en el servidor: se oculta todo lo demás.
    if (failure.code === 'ESTIMATION_DISABLED') this.enabled.set(false);
  }

  private discardReview(): void {
    this.token = null;
    this.preview.set(null);
    this.outcome.set(null);
    this.stale.set(false);
  }

  private clear(): void {
    this.discardReview();
    this.scope = null;
    this.mode.set(null);
    this.open.set(false);
    this.busy.set(null);
    this.error.set(null);
    this.announcement.set('');
  }
}
