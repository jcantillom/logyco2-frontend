import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { CommercialRelationship, Organization, OrganizationProfileChanges, OrganizationTypeInfo } from '../../domain/models/organization';
import { OrganizationAdminRepository, OrganizationsRepository } from '../../domain/repositories/identity.repositories';
import { HomeFacade } from '../dashboard/home.facade';
import { OrganizationLogoStore } from './logo.store';

/** Empresas vinculadas de la empresa activa (solo lectura). Los datos generales vienen de `HomeFacade`. */
@Injectable({ providedIn: 'root' })
export class CompanyProfileFacade {
  private readonly repository = inject(OrganizationsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly home = inject(HomeFacade);
  private readonly logo = inject(OrganizationLogoStore);
  /** Solo se usa `listTypes`: el catálogo `GET /organization-types` lo puede leer cualquier persona autenticada. */
  private readonly catalog = inject(OrganizationAdminRepository);

  readonly relationships = inject(ContextResetRegistry).track(new ScopedResource<readonly CommercialRelationship[]>());

  /** Catálogo de tipos de actividad (con su descripción). */
  readonly types = inject(ContextResetRegistry).track(new ScopedResource<readonly OrganizationTypeInfo[]>());

  load(): void {
    if (this.types.status() === 'idle') this.types.load(this.catalog.listTypes());

    const id = this.context.activeOrganizationId();

    if (!id) {
      this.relationships.reset();

      return;
    }

    this.relationships.load(this.repository.relationships(id));
  }

  /** Guarda nombre y contacto de la empresa activa y refresca lo que se muestra (Resumen, menú y esta vista). */
  saveProfile(changes: OrganizationProfileChanges): Observable<Organization> {
    const id = this.context.activeOrganizationId();

    if (!id) throw new Error('Sin empresa activa');

    return this.repository.updateProfile(id, changes).pipe(tap((organization) => this.home.organization.data.set(organization)));
  }

  /** Sube o reemplaza el logo de la empresa activa y lo muestra de inmediato. */
  saveLogo(file: Blob): Observable<void> {
    const id = this.requireId();

    return this.repository.uploadLogo(id, file).pipe(tap(() => this.logo.set(file)));
  }

  removeLogo(): Observable<void> {
    return this.repository.removeLogo(this.requireId()).pipe(tap(() => this.logo.set(null)));
  }

  private requireId(): string {
    const id = this.context.activeOrganizationId();

    if (!id) throw new Error('Sin empresa activa');

    return id;
  }
}
