import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { VehicleCandidate, VehicleCandidateKind, VehicleDecisionRequest, VehicleDecisionResult } from '../../domain/models/imports';
import { Page } from '../../domain/models/pagination';
import { ImportsRepository } from '../../domain/repositories/imports.repositories';

export const VEHICLES_PAGE_SIZE = 10;

/** Pestañas de la sección: las que se pueden decidir. «Sin cambios» solo se cuenta. */
export type DetectedTab = Extract<VehicleCandidateKind, 'NEW' | 'CHANGED'>;

/**
 * Vehículos que propone la carga abierta en la revisión: lista por tipo y página, y las decisiones del administrador.
 * Es de la empresa activa y se descarta al cambiar de empresa.
 */
@Injectable({ providedIn: 'root' })
export class ImportVehiclesFacade {
  private readonly repository = inject(ImportsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);

  readonly list = this.registry.track(new ScopedResource<Page<VehicleCandidate>>());
  readonly tab = signal<DetectedTab>('NEW');
  readonly page = signal(1);
  readonly deciding = signal(false);
  readonly decisionError = signal<AppError | null>(null);
  /** El resultado de la última decisión, para mostrarlo con sus conteos. */
  readonly result = signal<VehicleDecisionResult | null>(null);

  private importId: string | null = null;

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  /** Carga una pestaña y página de la carga indicada; cambiar de carga limpia el resultado anterior. */
  load(importId: string, tab: DetectedTab = this.tab(), page = 1): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) return this.clear();

    const sameView = importId === this.importId && tab === this.tab();

    if (importId !== this.importId) this.result.set(null);

    this.importId = importId;
    this.tab.set(tab);
    this.page.set(page);
    this.decisionError.set(null);
    this.list.load(this.repository.vehicleCandidates(organizationId, importId, tab, { page, pageSize: VEHICLES_PAGE_SIZE }), { keepData: sameView });
  }

  /** Vuelve a pedir la primera página de la pestaña abierta sin tocar el resultado ni el error de la última decisión (tras decidir, con éxito o con error). */
  refreshList(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.importId) return;

    this.page.set(1);
    this.list.load(this.repository.vehicleCandidates(organizationId, this.importId, this.tab(), { page: 1, pageSize: VEHICLES_PAGE_SIZE }), { keepData: true });
  }

  reload(): void {
    if (this.importId) this.load(this.importId, this.tab(), this.page());
  }

  /**
 * Decide sobre candidatos y deja el resultado; quien llama recarga lo que dependa de él. Por tipo (`kind`) es UNA sola petición sin importar cuántos
 * sean (el servidor los procesa en lotes); por ids, hasta 500 (acciones por fila o selección).
 */
  decide(importId: string, request: VehicleDecisionRequest): Observable<VehicleDecisionResult> {
    const organizationId = this.requireOrganization();

    return this.track(this.repository.decideVehicles(organizationId, importId, request));
  }

  private track(call$: Observable<VehicleDecisionResult>): Observable<VehicleDecisionResult> {
    this.deciding.set(true);
    this.decisionError.set(null);

    return call$.pipe(
      tap({
        next: (result) => {
          this.deciding.set(false);
          this.result.set(result);
        },
        error: (error: unknown) => {
          this.deciding.set(false);
          this.decisionError.set(toAppError(error));
        },
      }),
    );
  }

  private requireOrganization(): string {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) throw new Error('No hay una empresa activa.');

    return organizationId;
  }

  clear(): void {
    this.importId = null;
    this.list.reset();
    this.tab.set('NEW');
    this.page.set(1);
    this.deciding.set(false);
    this.decisionError.set(null);
    this.result.set(null);
  }
}
