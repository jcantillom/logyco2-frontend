import { Injectable, computed, inject } from '@angular/core';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { Organization } from '../../domain/models/organization';
import { OrganizationsRepository } from '../../domain/repositories/identity.repositories';
import { BellAlert } from '../../shared/layouts/actions-bell.component';
import { LinksFacade } from '../organizations/links.facade';

/** Datos reales de la empresa activa para su Resumen y para la campana de acciones pendientes. */
@Injectable({ providedIn: 'root' })
export class HomeFacade {
  private readonly organizations = inject(OrganizationsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);
  private readonly links = inject(LinksFacade);
  /** Empresa para la que ya se pidió: el menú y el Resumen cargan a la vez sin duplicar la petición. */
  private requestedFor: string | null = null;

  readonly organization = this.registry.track(new ScopedResource<Organization>());

  /** Lo que hoy requiere atención del administrador y se puede resolver en la plataforma. */
  readonly actions = computed<readonly BellAlert[]>(() => {
    const org = this.organization.data();

    if (!org) return [];

    const own = '/mi-empresa';
    const requests = this.links.summary.data()?.pendingReceived ?? 0;
    const missing = [org.legalName, org.taxId].filter((value) => !value).length;

    return [
      // La solicitud pendiente ES la notificación: se ve aquí y en el Resumen hasta que se responda.
      { label: 'Solicitudes de vinculación', hint: 'Empresas que quieren vincularse contigo esperan tu respuesta.', count: requests, path: '/mi-empresa', query: { tab: 'links', sub: 'solicitudes', view: 'received' } },
      { label: 'Invitaciones pendientes', hint: 'Invitaciones enviadas que esperan aceptación.', count: org.pendingInvitations ?? 0, path: '/usuarios', query: { tab: 'invitaciones' } },
      { label: 'Datos de la empresa incompletos', hint: 'Falta la razón social o el NIT; un administrador de la plataforma debe completarlos.', count: missing, path: own },
      { label: 'Empresa sin tipo de actividad', hint: 'Indica a qué se dedica para habilitar su medición.', count: org.types.length === 0 ? 1 : 0, path: own },
    ].filter((item) => item.count > 0);
  });
  readonly pending = computed(() => this.actions().reduce((total, item) => total + item.count, 0));

  constructor() {
    this.registry.track({ reset: () => (this.requestedFor = null) });
  }

  load(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) {
      this.requestedFor = null;
      this.organization.reset();

      return;
    }

    if (this.requestedFor === organizationId) return;

    this.requestedFor = organizationId;
    this.organization.load(this.organizations.get(organizationId));
    this.links.loadSummary();
  }

  /** Reintento manual tras un error. */
  reload(): void {
    this.requestedFor = null;
    this.load();
  }
}
