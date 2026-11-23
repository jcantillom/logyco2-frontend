import { Injectable, computed, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { ImportCounts, ImportPeriod } from '../../domain/models/imports';
import { PeriodRange } from '../../domain/models/period';
import { ImportsRepository } from '../../domain/repositories/imports.repositories';

/** Qué periodo ve el Resumen: todos (sin filtro) o uno concreto de los cargados. */
export type PeriodSelection = 'ALL' | PeriodRange;

export const samePeriod = (a: PeriodRange, b: PeriodRange): boolean => a.from === b.from && a.to === b.to;

/**
 * Periodos cargados y conteos de las cargas de la empresa activa para el Resumen. Se piden al entrar y al cambiar de empresa, sin sondeo.
 * La selección por defecto es el periodo más reciente (o «todos» si no hay); elegir otro vuelve a pedir los conteos con ese periodo, que
 * solo acota las sumas de filas. Si la lista cambia y el periodo elegido ya no existe, se vuelve al más reciente.
 */
@Injectable({ providedIn: 'root' })
export class ImportsOverviewFacade {
  private readonly repository = inject(ImportsRepository);
  private readonly context = inject(OrganizationContext);

  readonly periods = inject(ContextResetRegistry).track(new ScopedResource<ImportPeriod[]>());
  readonly counts = inject(ContextResetRegistry).track(new ScopedResource<ImportCounts>());
  /** `null` mientras nadie ha elegido y no se conoce la lista: se comporta como «todos». */
  private readonly chosen = signal<PeriodSelection | null>(null);
  readonly selection = computed<PeriodSelection>(() => this.chosen() ?? 'ALL');

  constructor() {
    inject(ContextResetRegistry).track({ reset: () => this.chosen.set(null) });
  }

  /** Pide la lista de periodos y, con la selección resuelta, los conteos. Con `background` los conteos se renuevan sin pasar por «cargando». */
  load(options: { background?: boolean } = {}): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) {
      this.periods.reset();

      return this.counts.reset();
    }

    this.periods.load(
      this.repository.periods(organizationId).pipe(
        tap({
          next: (list) => {
            this.reconcile(list);
            this.reloadCounts(options);
          },
          // Sin la lista de periodos las tarjetas igual deben mostrar algo: todos los periodos.
          error: () => this.reloadCounts(options),
        }),
      ),
      { keepData: true },
    );
  }

  /** Cambia el periodo visto y vuelve a pedir los conteos con ese filtro. */
  select(selection: PeriodSelection): void {
    this.chosen.set(selection);
    this.reloadCounts();
  }

  /** Vuelve a pedir solo los conteos (con la selección vigente). */
  reloadCounts(options: { background?: boolean } = {}): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) return this.counts.reset();

    const selection = this.selection();

    this.counts.load(this.repository.counts(organizationId, selection === 'ALL' ? undefined : selection), { keepData: options.background });
  }

  private reconcile(list: readonly ImportPeriod[]): void {
    const current = this.chosen();

    if (current === 'ALL' || (current && list.some((p) => samePeriod(p, current)))) return;

    this.chosen.set(list[0] ? { from: list[0].from, to: list[0].to } : null);
  }
}
