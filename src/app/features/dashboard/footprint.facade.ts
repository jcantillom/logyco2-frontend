import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap, throwError } from 'rxjs';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { Footprint } from '../../domain/models/footprint';
import { DEFAULT_GRANULARITY, GRANULARITIES, Granularity } from '../../domain/models/granularity';
import { PeriodRange } from '../../domain/models/period';
import { FootprintRepository } from '../../domain/repositories/footprint.repositories';
import { PeriodSelection } from './imports-overview.facade';

const DAY_MS = 86_400_000;

/** Días que abarca un periodo (inclusive); `null` si no son fechas válidas. */
function spanDays(range: PeriodRange | null | undefined): number | null {
  if (!range) return null;

  const days = (Date.parse(range.to) - Date.parse(range.from)) / DAY_MS + 1;

  return Number.isFinite(days) && days > 0 ? Math.round(days) : null;
}

/**
 * Huella de CO₂ de la empresa activa para el periodo y la granularidad que ve el Resumen. «Todos» pide sin `from`/`to`; un periodo envía los dos. La granularidad
 * mensual (por defecto) no se envía: la petición es la de siempre. Con `background` se vuelve a pedir sin pasar por «cargando» (los datos se reemplazan al
 * llegar), para refrescar al terminar una carga sin parpadeo.
 *
 * Cambiar de periodo o de granularidad cancela la petición anterior (`ScopedResource`). Si el servidor rechaza una granularidad por tener demasiadas cubetas
 * (`GRANULARITY_TOO_FINE`), la pantalla vuelve a la última granularidad válida (o a la siguiente más gruesa), muestra el mensaje en `notice` y recuerda desde cuántos
 * días rechazó para deshabilitar esa granularidad y las más finas: el tope lo decide el servidor, el cliente no lo conoce ni lo supone. `INVALID_PERIOD` avisa y conserva los datos.
 */
@Injectable({ providedIn: 'root' })
export class FootprintFacade {
  private readonly repository = inject(FootprintRepository);
  private readonly context = inject(OrganizationContext);

  readonly footprint = inject(ContextResetRegistry).track(new ScopedResource<Footprint>());
  /** Granularidad elegida de la serie (la URL `?gran=` y el control de la tarjeta la leen de aquí). */
  readonly granularity = signal<Granularity>(DEFAULT_GRANULARITY);
  /** Aviso del servidor cuando la granularidad pedida no se pudo usar (ya se volvió a la anterior); `null` si no hay. */
  readonly notice = signal<string | null>(null);
  /** Menor número de días de periodo con el que el servidor rechazó cada granularidad por tener demasiadas cubetas (`GRANULARITY_TOO_FINE`). */
  readonly refusedFromDays = signal<Readonly<Partial<Record<Granularity, number>>>>({});
  private readonly selection = signal<PeriodSelection>('ALL');
  /**
   * Granularidades que no están disponibles para el periodo actual: cada una que el servidor rechazó y las más finas, desde el menor periodo rechazado. Es una pista
   * aprendida de las respuestas (el tope lo decide el servidor y el cliente no lo conoce); el servidor sigue siendo la autoridad.
   */
  readonly disabledGranularities = computed<readonly Granularity[]>(() => {
    const refused = this.refusedFromDays();
    const days = this.periodDays();

    if (days === null) return [];

    return GRANULARITIES.filter((g) => (Object.keys(refused) as Granularity[]).some((r) => GRANULARITIES.indexOf(g) <= GRANULARITIES.indexOf(r) && days >= (refused[r] ?? Infinity)));
  });
  private requested = false;
  private lastValid: Granularity = DEFAULT_GRANULARITY;

  /** Cambia la granularidad y vuelve a pedir la serie (si ya se pidió algo; antes solo se recuerda para la primera petición). */
  setGranularity(granularity: Granularity): void {
    if (granularity === this.granularity()) return;

    this.granularity.set(granularity);
    this.notice.set(null);

    if (this.requested) this.reload();
  }

  load(selection: PeriodSelection, options: { background?: boolean } = {}): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) return this.footprint.reset();

    if (selection !== this.selection() && !options.background) this.notice.set(null);

    this.selection.set(selection);
    this.requested = true;
    this.footprint.load(this.request(organizationId, selection === 'ALL' ? undefined : selection, this.granularity()), { keepData: options.background });
  }

  /** Vuelve a pedir la huella con el último periodo pedido. */
  reload(options: { background?: boolean } = {}): void {
    this.load(this.selection(), options);
  }

  /** Días del periodo de la última petición (o del que devolvió el servidor con «todos»); `null` si no se conocen. */
  private periodDays(): number | null {
    const selection = this.selection();
    const served = this.footprint.data()?.period;

    return spanDays(selection !== 'ALL' ? selection : served?.from && served.to ? { from: served.from, to: served.to } : null);
  }

  private request(organizationId: string, period: PeriodRange | undefined, granularity: Granularity): Observable<Footprint> {
    const wire = (g: Granularity): Granularity | undefined => (g === DEFAULT_GRANULARITY ? undefined : g);

    return this.repository.footprint(organizationId, period, wire(granularity)).pipe(
      catchError((error: unknown) => {
        const app = toAppError(error);

        // Demasiadas cubetas: se vuelve a la última granularidad válida (si es más gruesa) o a la siguiente más gruesa, y se recuerda desde qué periodo se rechazó.
        if (app.code === 'GRANULARITY_TOO_FINE' && granularity !== 'year') {
          const days = spanDays(period) ?? this.periodDays();
          const coarser = GRANULARITIES[GRANULARITIES.indexOf(granularity) + 1];
          const fallback = GRANULARITIES.indexOf(this.lastValid) > GRANULARITIES.indexOf(granularity) ? this.lastValid : coarser;

          this.notice.set(app.message);
          if (days !== null) this.refusedFromDays.update((current) => ({ ...current, [granularity]: Math.min(current[granularity] ?? days, days) }));
          this.granularity.set(fallback);

          return this.request(organizationId, period, fallback);
        }

        // Periodo fuera de rango: se avisa y se conservan los datos anteriores (la tarjeta no se rompe).
        const previous = this.footprint.data();

        if (app.code === 'INVALID_PERIOD' && previous) {
          this.notice.set(app.message);

          return of(previous);
        }

        return throwError(() => error);
      }),
      // La última granularidad que el servidor sí entregó es a la que se vuelve ante un rechazo.
      tap((value) => (this.lastValid = value.granularity)),
    );
  }
}
