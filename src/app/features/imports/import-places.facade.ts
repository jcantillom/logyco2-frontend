import { Injectable, inject, signal } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { PlaceChoiceResult, PlaceScope } from '../../domain/models/places';
import { PlacesRepository } from '../../domain/repositories/places.repositories';
import { ImportsFacade } from './imports.facade';

/** Lo que el servidor respondió a la última decisión de un lugar en una carga, para mostrarlo sin esperar a la recarga. */
export interface PlaceOutcome {
  readonly importId: string;
  readonly placeKey: string;
  readonly result: PlaceChoiceResult;
}

export interface PlaceSelection {
  readonly importId: string;
  readonly placeKey: string;
  readonly placeText: string;
  readonly municipalityCode: string;
  readonly note: string | null;
  /** `IMPORT`: solo los viajes de esta carga; `COMPANY`: los de toda la empresa (la decisión en sí vale siempre para la empresa). */
  readonly scope: PlaceScope;
}

/**
 * Decisión de un lugar ambiguo desde la revisión de una carga. La pantalla no elige ni infiere nada: envía lo que la persona escogió y muestra lo
 * que el servidor responde. Repetir lo mismo es inocuo (`changed: false`). Con éxito se vuelve a pedir la carga para que la lista y los totales
 * nunca queden viejos; con error la elección se conserva en pantalla para reintentar.
 */
@Injectable({ providedIn: 'root' })
export class ImportPlacesFacade {
  private readonly repository = inject(PlacesRepository);
  private readonly context = inject(OrganizationContext);
  private readonly imports = inject(ImportsFacade);
  private readonly registry = inject(ContextResetRegistry);

  /** Clave del lugar que se está enviando; `null` si ninguno. */
  readonly busy = signal<string | null>(null);
  readonly error = signal<{ readonly placeKey: string; readonly error: AppError } | null>(null);
  readonly outcomes = signal<readonly PlaceOutcome[]>([]);

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  /** `done` se llama solo si el servidor aceptó la decisión (la pantalla cierra el selector y mueve el foco). */
  choose(selection: PlaceSelection, done?: () => void): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy() !== null) return;

    this.busy.set(selection.placeKey);
    this.error.set(null);
    this.repository
      .choose(organizationId, {
        placeText: selection.placeText,
        municipalityCode: selection.municipalityCode,
        note: selection.note,
        importFileId: selection.scope === 'IMPORT' ? selection.importId : null,
      })
      .subscribe({
        next: (result) => {
          this.busy.set(null);
          this.outcomes.update((all) => [...all.filter((o) => !(o.importId === selection.importId && o.placeKey === selection.placeKey)), { importId: selection.importId, placeKey: selection.placeKey, result }]);
          this.imports.reloadImport(selection.importId);
          done?.();
        },
        error: (error: unknown) => {
          this.busy.set(null);
          this.error.set({ placeKey: selection.placeKey, error: toAppError(error) });
        },
      });
  }

  clear(): void {
    this.busy.set(null);
    this.error.set(null);
    this.outcomes.set([]);
  }
}
