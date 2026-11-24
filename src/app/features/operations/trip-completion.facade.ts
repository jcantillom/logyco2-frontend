import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, tap } from 'rxjs';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ToastService } from '../../core/notifications/toast.service';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { CompletionOutcome, CompletionState, TripDetail } from '../../domain/models/operations';
import { OperationsRepository } from '../../domain/repositories/operations.repositories';
import { resultMessage } from './completion.view';
import { OperationsFacade } from './operations.facade';

export type CompletionMode = 'idle' | 'form' | 'done';

/** Errores tras los cuales el detalle abierto ya no es el vigente: se vuelve a pedir. */
const STALE_DETAIL_CODES: ReadonlySet<string> = new Set(['TRIP_ALREADY_CALCULATED', 'TRIP_NOT_EDITABLE', 'TRIP_HAS_CONFIRMED_MATCH', 'TRIP_NOT_COMPLETABLE']);

/**
 * «Completar datos» de un viaje pendiente. El servidor dice qué falta (`GET …/completion`), valida y recalcula (`PATCH`); aquí solo se guarda lo escrito, nunca se pone un valor por defecto
 * y nada se calcula. Modos: `idle` (detalle normal), `form` (solo los datos que faltan) y `done` (el resultado que devolvió el servidor).
 *
 * - Guardar actualiza la fila de la lista y el detalle SIN recargar la página ni perder la pila de cursores (`OperationsFacade.applyCompleted`).
 * - `TRIP_VERSION_CONFLICT` trae el estado vigente: el formulario se refresca con él conservando lo escrito.
 * - «Guardar y siguiente» pasa al siguiente viaje por completar de la página cargada; si ninguno se puede completar, cierra con un aviso.
 */
@Injectable({ providedIn: 'root' })
export class TripCompletionFacade {
  private readonly repository = inject(OperationsRepository);
  private readonly operations = inject(OperationsFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);
  private readonly toast = inject(ToastService);

  readonly state = this.registry.track(new ScopedResource<CompletionState>());
  readonly mode = signal<CompletionMode>('idle');
  readonly tripId = signal<string | null>(null);
  /** Lo escrito por ruta con punto (`efficiency.value`…). */
  readonly values = signal<Readonly<Record<string, string>>>({});
  /** Mensajes del servidor por dato. */
  readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  readonly saving = signal(false);
  readonly error = signal<AppError | null>(null);
  /** Aviso corto tras un conflicto de versión. */
  readonly notice = signal<string | null>(null);
  readonly outcome = signal<CompletionOutcome | null>(null);
  /** Región `aria-live`. */
  readonly announcement = signal('');
  /** Por qué el viaje abierto (por completar o bloqueado) no se puede completar en pantalla: el texto del servidor. */
  readonly refusal = signal<{ readonly tripId: string; readonly message: string } | null>(null);

  readonly canComplete = computed(() => this.access.can('imports:create'));
  /** Algo escrito que enviar (lo vacío no se envía; el servidor exige al menos un dato). */
  readonly hasValues = computed(() => Object.values(this.values()).some((value) => value.trim() !== ''));
  /** El siguiente viaje por completar de la página cargada, después del abierto. */
  readonly nextPending = computed(() => this.pendingAfter(this.tripId()));

  private chaining = false;
  private refusalRequest: Subscription | null = null;

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  /** Abre el formulario del viaje: pide qué falta y qué se puede completar. Sin permiso no hace nada. */
  start(tripId: string, chain = false): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.canComplete()) return;

    this.chaining = chain;
    this.tripId.set(tripId);
    this.values.set({});
    this.fieldErrors.set({});
    this.error.set(null);
    this.notice.set(null);
    this.outcome.set(null);
    this.mode.set('form');
    this.state.load(
      this.repository.completionState(organizationId, tripId).pipe(
        tap((state) => {
          // En cadena, un viaje que no se puede completar se salta; el servidor ya dijo por qué en su estado.
          if (this.chaining && !state.completable) this.advance(tripId);
          else this.chaining = false;
        }),
      ),
    );
  }

  /** Para el detalle abierto: si es un viaje por completar o bloqueado que NO se puede completar, pide al servidor el motivo con su guía (sin formulario). */
  inspect(detail: TripDetail | null): void {
    const organizationId = this.context.activeOrganizationId();

    if (!detail || detail.completable || (detail.status !== 'PENDING' && detail.status !== 'BLOCKED') || !organizationId || !this.canComplete()) {
      this.refusalRequest?.unsubscribe();
      this.refusalRequest = null;
      this.refusal.set(null);

      return;
    }

    if (this.refusal()?.tripId === detail.id) return;

    this.refusalRequest?.unsubscribe();
    this.refusal.set(null);
    this.refusalRequest = this.repository.completionState(organizationId, detail.id).subscribe({
      next: (state) => this.refusal.set(state.refusal ? { tripId: detail.id, message: state.refusal } : null),
      error: () => this.refusal.set(null),
    });
  }

  /** Vuelve al detalle sin guardar. */
  cancel(): void {
    this.chaining = false;
    this.state.reset();
    this.mode.set('idle');
    this.error.set(null);
    this.notice.set(null);
  }

  /** Cierra el resultado y vuelve al detalle normal. */
  finish(): void {
    this.mode.set('idle');
    this.outcome.set(null);
  }

  /** Desde el resultado: el viaje sigue pendiente y se puede aportar otro dato. */
  continueEditing(): void {
    const id = this.tripId();

    if (id) this.start(id);
  }

  setValue(name: string, value: string): void {
    this.values.update((current) => ({ ...current, [name]: value }));

    if (this.fieldErrors()[name]) this.fieldErrors.update((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== name)));
  }

  /** Guarda lo escrito. `andNext`: después de guardar, abre el siguiente viaje por completar de la página. */
  save(andNext = false): void {
    const organizationId = this.context.activeOrganizationId();
    const id = this.tripId();
    const state = this.state.data();

    if (!organizationId || !id || !state?.completable || this.saving() || !this.hasValues()) return;

    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.fieldErrors.set({});

    this.repository.complete(organizationId, id, { expectedVersion: state.version, values: this.values() }).subscribe({
      next: (outcome) => {
        this.saving.set(false);
        this.outcome.set(outcome);
        this.announcement.set(resultMessage(outcome.result));
        this.operations.applyCompleted(outcome.trip);

        if (!andNext) return this.mode.set('done');

        this.chaining = true;
        this.advance(id);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.fail(toAppError(error), id);
      },
    });
  }

  private fail(failure: AppError, tripId: string): void {
    if (failure.code === 'TRIP_VERSION_CONFLICT' && failure.data) {
      const fresh = failure.data as CompletionState;
      const names = new Set(fresh.fields.map((field) => field.name));

      this.state.replace(fresh);
      this.values.update((current) => Object.fromEntries(Object.entries(current).filter(([name]) => names.has(name))));
      this.notice.set('Alguien más modificó este viaje. Revisa los datos actuales y vuelve a guardar.');
      this.announcement.set('Alguien más modificó este viaje. El formulario se actualizó.');

      if (this.operations.selectedId() === tripId) this.operations.retryDetail();

      return;
    }

    const byField = failure.details.filter((detail) => !!detail.message && (failure.code === 'INVALID_FIELD_VALUE' || failure.code === 'FIELD_NOT_EDITABLE'));

    if (byField.length > 0) {
      this.fieldErrors.set(Object.fromEntries(byField.map((detail) => [detail.field, detail.message as string])));
      this.announcement.set('Hay datos no válidos. Revisa los campos marcados.');

      return;
    }

    this.error.set(failure);

    if (STALE_DETAIL_CODES.has(failure.code) && this.operations.selectedId() === tripId) this.operations.retryDetail();
  }

  /** Pasa al siguiente viaje por completar después de `fromId`; si no hay, cierra con un aviso. */
  private advance(fromId: string): void {
    const next = this.pendingAfter(fromId);

    if (!next) {
      this.chaining = false;
      this.cancel();
      this.operations.close();
      this.toast.info('No hay más viajes por completar en esta página.');
      this.announcement.set('No hay más viajes por completar en esta página.');

      return;
    }

    this.operations.detail.reset();
    this.operations.open(next);
    this.start(next, true);
  }

  private pendingAfter(fromId: string | null): string | null {
    const items = this.operations.items();
    const at = items.findIndex((row) => row.id === fromId);

    return items.slice(at + 1).find((row) => row.status === 'PENDING')?.id ?? null;
  }

  private clear(): void {
    this.refusalRequest?.unsubscribe();
    this.refusalRequest = null;
    this.refusal.set(null);
    this.chaining = false;
    this.mode.set('idle');
    this.tripId.set(null);
    this.values.set({});
    this.fieldErrors.set({});
    this.saving.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.outcome.set(null);
    this.announcement.set('');
  }
}
