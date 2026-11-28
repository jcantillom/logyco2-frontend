import { Injectable, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { PlaceChoice, PlaceChoiceUndoResult } from '../../domain/models/places';
import { PlacesRepository } from '../../domain/repositories/places.repositories';

/** Tope de decisiones por empresa que fija el servidor (409 `PLACE_CHOICES_LIMIT`); el contrato no lo devuelve en la lista. */
export const PLACE_CHOICES_LIMIT = 1000;

export interface UndoOutcome {
  readonly choice: PlaceChoice;
  readonly result: PlaceChoiceUndoResult;
}

/**
 * Lugares que la empresa eligió («San Pedro, Antioquia» significa San Pedro de los Milagros). Verlos y deshacerlos requiere `imports:create`
 * (el servidor autoriza). Deshacer vale para toda la empresa; con éxito se vuelve a leer la lista desde el servidor.
 */
@Injectable({ providedIn: 'root' })
export class CompanyPlaceChoicesFacade {
  private readonly repository = inject(PlacesRepository);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);

  readonly choices = this.registry.track(new ScopedResource<PlaceChoice[]>());
  /** Id de la decisión que se está deshaciendo; `null` si ninguna. */
  readonly busy = signal<string | null>(null);
  readonly error = signal<AppError | null>(null);
  readonly outcome = signal<UndoOutcome | null>(null);

  readonly canManage = computed(() => this.access.can('imports:create'));
  readonly total = computed(() => this.choices.data()?.length ?? 0);

  constructor() {
    this.registry.track({
      reset: () => {
        this.busy.set(null);
        this.error.set(null);
        this.outcome.set(null);
      },
    });
  }

  load(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.canManage()) return;

    this.choices.load(this.repository.choices(organizationId), { keepData: true });
  }

  /** `done` se llama solo si el servidor deshizo la decisión. */
  undo(choice: PlaceChoice, done?: () => void): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy() !== null) return;

    this.busy.set(choice.id);
    this.error.set(null);
    this.outcome.set(null);
    this.repository.undo(organizationId, choice.id).subscribe({
      next: (result) => {
        this.busy.set(null);
        this.outcome.set({ choice, result });
        this.load();
        done?.();
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.error.set(toAppError(error));
        this.load();
      },
    });
  }
}
