import { Injectable, inject } from '@angular/core';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { Footprint } from '../../domain/models/footprint';
import { FootprintRepository } from '../../domain/repositories/footprint.repositories';
import { PeriodSelection } from './imports-overview.facade';

/**
 * Huella de CO₂ de la empresa activa para el periodo que ve el Resumen. «Todos» pide sin `from`/`to`; un periodo envía los dos. Con `background`
 * se vuelve a pedir sin pasar por «cargando» (los datos se reemplazan al llegar), para refrescar al terminar una carga sin parpadeo.
 */
@Injectable({ providedIn: 'root' })
export class FootprintFacade {
  private readonly repository = inject(FootprintRepository);
  private readonly context = inject(OrganizationContext);

  readonly footprint = inject(ContextResetRegistry).track(new ScopedResource<Footprint>());
  private last: PeriodSelection = 'ALL';

  load(selection: PeriodSelection, options: { background?: boolean } = {}): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) return this.footprint.reset();

    this.last = selection;
    this.footprint.load(this.repository.footprint(organizationId, selection === 'ALL' ? undefined : selection), { keepData: options.background });
  }

  /** Vuelve a pedir la huella con el último periodo pedido. */
  reload(options: { background?: boolean } = {}): void {
    this.load(this.last, options);
  }
}
