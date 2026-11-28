import { Injectable, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ToastService } from '../../core/notifications/toast.service';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ManualTripsRepository } from '../../domain/repositories/manual-trips.repositories';
import { TripDetail } from '../../domain/models/operations';
import { OperationsFacade } from './operations.facade';

/** Errores tras los cuales el detalle abierto ya no es el vigente: se vuelve a pedir. */
const STALE_DETAIL_CODES: ReadonlySet<string> = new Set(['TRIP_NOT_MANUAL', 'TRIP_HAS_CONFIRMED_MATCH', 'TRIP_VERSION_CONFLICT']);

/** Longitud máxima del motivo (el servidor rechaza más). */
export const VOID_REASON_MAX = 200;

/**
 * «Anular viaje» (solo viajes manuales): una confirmación con la consecuencia en palabras simples y un motivo opcional. Nunca se borra: el servidor deja el viaje como «Anulado»
 * y fuera de las emisiones. Al terminar se actualizan el detalle, la lista (sin perder la pila de cursores) y los conteos.
 */
@Injectable({ providedIn: 'root' })
export class TripVoidFacade {
  private readonly repository = inject(ManualTripsRepository);
  private readonly operations = inject(OperationsFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);
  private readonly toast = inject(ToastService);

  readonly trip = signal<TripDetail | null>(null);
  readonly reason = signal('');
  readonly saving = signal(false);
  readonly error = signal<AppError | null>(null);
  readonly announcement = signal('');

  readonly canVoid = computed(() => this.access.can('imports:create'));
  readonly isOpen = computed(() => this.trip() !== null);

  constructor() {
    this.registry.track({ reset: () => this.cancel() });
  }

  /** Abre la confirmación de un viaje que el servidor dice que se puede anular. */
  request(trip: TripDetail): void {
    if (!this.canVoid() || !trip.voidable) return;

    this.trip.set(trip);
    this.reason.set('');
    this.error.set(null);
  }

  setReason(value: string): void {
    this.reason.set(value.slice(0, VOID_REASON_MAX));
  }

  cancel(): void {
    this.trip.set(null);
    this.reason.set('');
    this.saving.set(false);
    this.error.set(null);
  }

  confirm(): void {
    const organizationId = this.context.activeOrganizationId();
    const trip = this.trip();

    if (!organizationId || !trip || this.saving()) return;

    const reason = this.reason().trim();

    this.saving.set(true);
    this.error.set(null);
    this.repository.voidTrip(organizationId, trip.id, { ...(reason ? { reason } : {}), expectedVersion: trip.correctionVersion }).subscribe({
      next: (outcome) => {
        const message = outcome.alreadyVoided ? 'Este viaje ya estaba anulado.' : 'Viaje anulado. Ya no cuenta en tus emisiones.';

        this.cancel();
        this.operations.detail.replace(outcome.trip);
        this.operations.reload();
        this.toast.success(message);
        this.announcement.set(message);
      },
      error: (error: unknown) => {
        const failure = toAppError(error);

        this.saving.set(false);
        this.error.set(failure);

        if (STALE_DETAIL_CODES.has(failure.code) && this.operations.selectedId() === trip.id) this.operations.retryDetail();
      },
    });
  }
}
