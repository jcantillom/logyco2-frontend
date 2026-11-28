import { Injectable, inject, signal } from '@angular/core';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { Methodology } from '../../domain/models/methodology';
import { MethodologyRepository } from '../../domain/repositories/methodology.repositories';

/**
 * Declaración metodológica vigente de la empresa activa para el diálogo «Metodología y calidad del dato» del Resumen. Los dos indicadores (origen del dato y cobertura)
 * ya vienen en la huella; aquí solo se pide la declaración, y solo al abrir el diálogo (una vez; «Reintentar» la vuelve a pedir tras un error).
 */
@Injectable({ providedIn: 'root' })
export class MethodologyFacade {
  private readonly repository = inject(MethodologyRepository);
  private readonly context = inject(OrganizationContext);

  readonly methodology = inject(ContextResetRegistry).track(new ScopedResource<Methodology>());
  readonly open = signal(false);

  constructor() {
    // Al cambiar de empresa o cerrar sesión el diálogo se cierra: no queda abierto sobre datos de otra empresa.
    inject(ContextResetRegistry).track({ reset: () => this.open.set(false) });
  }

  show(): void {
    this.open.set(true);

    if (this.methodology.status() === 'idle') this.load();
  }

  hide(): void {
    this.open.set(false);
  }

  load(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) return this.methodology.reset();

    this.methodology.load(this.repository.methodology(organizationId));
  }
}
