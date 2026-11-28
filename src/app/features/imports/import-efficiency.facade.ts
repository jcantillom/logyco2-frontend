import { Injectable, inject, signal } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { EfficiencyConsentResult } from '../../domain/models/imports';
import { ImportsRepository } from '../../domain/repositories/imports.repositories';
import { ImportsFacade } from './imports.facade';

export interface ConsentOutcome {
  readonly importId: string;
  readonly result: EfficiencyConsentResult;
}

/**
 * Consentimiento de estimar el rendimiento de los vehículos de una carga (modo ASK). La pantalla no estima ni decide: envía el «sí» o el «no» y
 * muestra los números del servidor. Idempotente; nunca toca un rendimiento declarado o medido ni un viaje ya calculado. Con éxito o con error se
 * vuelve a pedir la carga para que la cobertura no quede vieja.
 */
@Injectable({ providedIn: 'root' })
export class ImportEfficiencyFacade {
  private readonly repository = inject(ImportsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly imports = inject(ImportsFacade);
  private readonly registry = inject(ContextResetRegistry);

  /** Qué elección se está enviando; `null` si ninguna. */
  readonly busy = signal<boolean | null>(null);
  readonly error = signal<AppError | null>(null);
  readonly outcome = signal<ConsentOutcome | null>(null);

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  consent(importId: string, estimate: boolean): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy() !== null) return;

    this.busy.set(estimate);
    this.error.set(null);
    this.repository.consentEfficiencyEstimation(organizationId, importId, estimate).subscribe({
      next: (result) => {
        this.busy.set(null);
        this.outcome.set({ importId, result });
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
