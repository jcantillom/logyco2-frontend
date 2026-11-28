import { Injectable, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { AppliedToPending, EfficiencyDeclaration, EfficiencyRecord, EfficiencyView, MeasuredProtection } from '../../domain/models/vehicle-efficiency';
import { toMeasuredProtection } from '../../infrastructure/mappers/vehicle-efficiency.mappers';
import { VehicleEfficiencyRepository } from '../../domain/repositories/vehicle-efficiency.repositories';
import { VehiclesFacade } from './vehicles.facade';

/** Registros de la historia que se ven a la vez (sin scroll interno: el resto va en otra página del propio diálogo). */
export const EFFICIENCY_HISTORY_PAGE_SIZE = 5;

/** Campos del cuerpo de la declaración que el servidor puede señalar. */
const DECLARE_FIELDS: ReadonlySet<string> = new Set(['value', 'unit', 'note', 'measured_on']);

/** Lo que se muestra tras declarar: lo guardado y el efecto sobre los pendientes (acumulado entre llamadas de «Continuar»). */
export interface DeclareOutcome {
  /** De la primera llamada: las siguientes repiten la misma declaración y siempre dicen «sin cambios». */
  readonly changed: boolean;
  readonly record: EfficiencyRecord;
  readonly applied: AppliedToPending;
  /** Viajes que pasaron a calculados entre todas las llamadas de esta declaración. */
  readonly recalculated: number;
  /** «Continuar» no recalculó nada y no quedan menos viajes: repetir no avanza. */
  readonly stalled: boolean;
}

/**
 * Rendimiento declarado de UN vehículo de la empresa activa: lo vigente, su historia (de a 5) y la declaración. Todo número que se muestra lo
 * entrega el servidor; la pantalla no calcula ni decide nada.
 *
 * - Declarar es idempotente: si quedan viajes por examinar (`remaining > 0`), «Continuar» repite la MISMA declaración hasta que no queden.
 * - Un error nunca borra lo que la persona escribió (el formulario vive en el diálogo); un conflicto de declaración recarga lo vigente.
 */
@Injectable({ providedIn: 'root' })
export class VehicleEfficiencyFacade {
  private readonly repository = inject(VehicleEfficiencyRepository);
  private readonly vehicles = inject(VehiclesFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);

  readonly view = this.registry.track(new ScopedResource<EfficiencyView>());
  readonly page = signal(1);
  readonly busy = signal(false);
  readonly error = signal<AppError | null>(null);
  /** Mensaje del servidor por campo (`value`, `unit`, `note`, `measured_on`) de una declaración rechazada. */
  readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  readonly outcome = signal<DeclareOutcome | null>(null);
  /** El servidor protegió un rendimiento medido vigente (409 `MEASURED_PROTECTED`): la persona debe decidir si lo reemplaza. */
  readonly protection = signal<MeasuredProtection | null>(null);
  /** Solo quien administra vehículos declara; el resto consulta. */
  readonly canManage = computed(() => this.access.can('vehicles:manage'));

  private vehicleId: string | null = null;
  private last: EfficiencyDeclaration | null = null;

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  /** Abre el vehículo: pide lo vigente y la primera página de la historia. */
  open(vehicleId: string): void {
    this.clear();
    this.vehicleId = vehicleId;
    this.loadHistory(1);
  }

  close(): void {
    this.clear();
  }

  loadHistory(page: number): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.vehicleId) return;

    this.page.set(page);
    this.view.load(this.repository.view(organizationId, this.vehicleId, { page, pageSize: EFFICIENCY_HISTORY_PAGE_SIZE }), { keepData: true });
  }

  declare(declaration: EfficiencyDeclaration): void {
    if (!this.canManage()) return;

    this.last = declaration;
    this.outcome.set(null);
    this.send(declaration, null);
  }

  /** «Reemplazar por el declarado»: repite la MISMA declaración con la confirmación explícita. */
  confirmReplace(): void {
    if (!this.last || !this.canManage() || !this.protection()) return;

    this.send({ ...this.last, confirmReplaceMeasured: true }, null);
  }

  /** «Conservar el medido»: no se envía nada; lo escrito queda en el formulario. */
  keepMeasured(): void {
    this.protection.set(null);
    this.error.set(null);
  }

  /** «Continuar»: repite la misma declaración para examinar los viajes que faltaron. */
  continue(): void {
    const current = this.outcome();

    if (this.last && current) this.send(this.last, current);
  }

  /** Reintenta lo último que se intentó (p. ej. tras «hay una carga procesándose»), con los mismos valores. */
  retry(): void {
    if (!this.last) return;

    this.send(this.last, this.outcome());
  }

  private send(declaration: EfficiencyDeclaration, previous: DeclareOutcome | null): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.vehicleId || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    this.protection.set(null);

    this.repository.declare(organizationId, this.vehicleId, declaration).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.outcome.set({
          changed: previous ? previous.changed : result.changed,
          record: result.record,
          applied: result.applied,
          recalculated: (previous?.recalculated ?? 0) + result.applied.tripsRecalculated,
          stalled: !!previous && result.applied.tripsRecalculated === 0 && result.applied.remaining >= previous.applied.remaining,
        });
        this.loadHistory(1);
        this.vehicles.loadList();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.fail(toAppError(error));
      },
    });
  }

  private fail(failure: AppError): void {
    const byField: Record<string, string> = {};

    if (failure.code === 'INVALID_FIELD_VALUE') {
      for (const detail of failure.details) {
        const field = detail.field.split('.').pop() ?? '';

        if (DECLARE_FIELDS.has(field) && detail.message) byField[field] = detail.message;
      }
    }

    // Otra persona declaró a la vez: se muestra lo que quedó vigente para que la persona decida.
    if (failure.code === 'EFFICIENCY_CONFLICT') this.loadHistory(1);

    if (failure.code === 'MEASURED_PROTECTED' && this.canManage()) {
      this.protection.set(toMeasuredProtection(failure.details));
      this.fieldErrors.set({});
      this.error.set(null);

      return;
    }

    this.fieldErrors.set(byField);
    this.error.set(Object.keys(byField).length > 0 ? null : failure);
  }

  private clear(): void {
    this.view.reset();
    this.vehicleId = null;
    this.last = null;
    this.page.set(1);
    this.busy.set(false);
    this.error.set(null);
    this.fieldErrors.set({});
    this.outcome.set(null);
    this.protection.set(null);
  }
}
