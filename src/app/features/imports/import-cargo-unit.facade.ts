import { Injectable, inject, signal } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { CargoUnit, CargoUnitResult } from '../../domain/models/imports';
import { ImportsRepository } from '../../domain/repositories/imports.repositories';
import { ImportsFacade } from './imports.facade';

/** Lo que se confirmó en esta sesión sobre una carga y la unidad elegida, para dar el resultado sin esperar a la recarga. */
export interface CargoUnitOutcome {
  readonly importId: string;
  readonly unit: CargoUnit;
  readonly result: CargoUnitResult;
}

/**
 * Confirmación de la unidad de la carga («Usar kilogramos y convertir a toneladas» o «Mantener como está»). La pantalla no decide si la conversión
 * procede: el servidor propone (`cargo_unit_proposal`) y valida; aquí solo se envía la elección. Repetir la misma elección es idempotente
 * (`unchanged`). Con éxito o con error se vuelve a pedir la carga: la propuesta y los totales nunca quedan viejos.
 */
@Injectable({ providedIn: 'root' })
export class ImportCargoUnitFacade {
  private readonly repository = inject(ImportsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly imports = inject(ImportsFacade);
  private readonly registry = inject(ContextResetRegistry);

  readonly busy = signal<CargoUnit | null>(null);
  readonly error = signal<AppError | null>(null);
  readonly outcome = signal<CargoUnitOutcome | null>(null);

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  confirm(importId: string, unit: CargoUnit): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy()) return;

    this.busy.set(unit);
    this.error.set(null);
    this.repository.confirmCargoUnit(organizationId, importId, unit).subscribe({
      next: (result) => {
        this.busy.set(null);
        this.outcome.set({ importId, unit, result });
        this.imports.reloadImport(importId);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.error.set(toAppError(error));
        this.imports.reloadImport(importId);
      },
    });
  }

  clear(): void {
    this.busy.set(null);
    this.error.set(null);
    this.outcome.set(null);
  }
}
