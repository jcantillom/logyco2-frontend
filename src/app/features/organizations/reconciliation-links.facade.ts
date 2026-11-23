import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { ConsentChange, ReconciliationLink, RescanResult } from '../../domain/models/reconciliation';
import { ReconciliationRepository } from '../../domain/repositories/reconciliation.repositories';

/** Autorizaciones de conciliación por vínculo de la empresa activa: lo que ella permite y lo que (solo como sí/no) permite la otra. */
@Injectable({ providedIn: 'root' })
export class ReconciliationLinksFacade {
  private readonly repository = inject(ReconciliationRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);

  readonly links = this.registry.track(new ScopedResource<readonly ReconciliationLink[]>());
  /** Vínculo cuya autorización se está guardando o cuya búsqueda corre. */
  readonly busyId = signal<string | null>(null);

  constructor() {
    this.registry.track({ reset: () => this.busyId.set(null) });
  }

  load(options: { background?: boolean } = {}): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.links.reset();

    this.links.load(this.repository.listLinks(id), { keepData: options.background ?? this.links.data() !== null });
  }

  /** Cambia lo que la propia empresa permite. La respuesta trae el vínculo ya actualizado y reemplaza el de la lista. */
  changeConsent(relationshipId: string, change: ConsentChange): Observable<ReconciliationLink> {
    const id = this.requireOrganization();

    this.busyId.set(relationshipId);

    return this.repository.changeConsent(id, relationshipId, change).pipe(
      tap({
        next: (link) => {
          this.busyId.set(null);
          this.links.data.update((all) => all?.map((item) => (item.relationshipId === link.relationshipId ? link : item)) ?? all);
        },
        error: () => this.busyId.set(null),
      }),
    );
  }

  /** Busca coincidencias del vínculo tras autorizar (el servidor lo recomienda con `rescanRecommended`). */
  rescan(relationshipId: string): Observable<RescanResult> {
    const id = this.requireOrganization();

    this.busyId.set(relationshipId);

    return this.repository.rescan(id, relationshipId).pipe(tap({ next: () => this.busyId.set(null), error: () => this.busyId.set(null) }));
  }

  private requireOrganization(): string {
    const id = this.context.activeOrganizationId();

    if (!id) throw new Error('No hay una empresa activa.');

    return id;
  }
}
