import { Observable } from 'rxjs';
import { AuthToken, CurrentUser, LoginCredentials } from '../models/identity';
import { CommercialRelationship, OrganizationProfileChanges, Organization, OrganizationChanges, OrganizationDeleted, OrganizationDeletionPlan, OrganizationListFilter, OrganizationTypeInfo } from '../models/organization';
import { Page, PageRequest } from '../models/pagination';
import {
  AcceptedInvitation,
  CreatedInvitation,
  Invitation,
  InvitationFilter,
  ManagedUser,
  MembershipRecord,
  MembershipTargetStatus,
  NewInvitation,
  UserListFilter,
  UserUpdate,
} from '../models/users';

/**
 * Los contratos son clases abstractas: sirven a la vez como tipo y como token
 * de inyección, sin depender de implementaciones HTTP.
 */
export abstract class AuthRepository {
  abstract login(credentials: LoginCredentials): Observable<AuthToken>;
  abstract getCurrentUser(): Observable<CurrentUser>;
}

export abstract class OrganizationsRepository {
  abstract list(request: PageRequest, filter?: OrganizationListFilter): Observable<Page<Organization>>;
  abstract get(id: string): Observable<Organization>;
  /** Relaciones comerciales de una empresa a la que se tiene acceso (solo lectura). */
  abstract relationships(id: string): Observable<readonly CommercialRelationship[]>;
  /** Nombre y contacto de la empresa (administrador de la empresa). Razón social, NIT, estado y tipos NO van por aquí. */
  abstract updateProfile(id: string, changes: OrganizationProfileChanges): Observable<Organization>;
  /** Logo de la empresa; `null` si no tiene. */
  abstract logo(id: string): Observable<Blob | null>;
  abstract uploadLogo(id: string, file: Blob): Observable<void>;
  abstract removeLogo(id: string): Observable<void>;
}

export abstract class UsersRepository {
  abstract list(request: PageRequest, filter?: UserListFilter): Observable<Page<ManagedUser>>;
  abstract get(id: string): Observable<ManagedUser>;
  abstract update(id: string, changes: UserUpdate): Observable<ManagedUser>;
}

export abstract class InvitationsRepository {
  abstract list(request: PageRequest, filter?: InvitationFilter): Observable<Page<Invitation>>;
  abstract create(invitation: NewInvitation): Observable<CreatedInvitation>;
  abstract revoke(invitationId: string): Observable<Invitation>;
  abstract accept(code: string): Observable<AcceptedInvitation>;
}

export abstract class MembershipsRepository {
  abstract changeStatus(
    organizationId: string,
    membershipId: string,
    status: MembershipTargetStatus,
  ): Observable<MembershipRecord>;
  /** Quita de la empresa una membresía ya REVOCADA (la cuenta de la persona se conserva). */
  abstract remove(organizationId: string, membershipId: string): Observable<void>;
}

/** Administración de empresas: SOLO administradores de la plataforma (el backend lo exige con rol global). */
export abstract class OrganizationAdminRepository {
  abstract listTypes(): Observable<readonly OrganizationTypeInfo[]>;
  abstract update(id: string, changes: OrganizationChanges): Observable<Organization>;
  abstract setActive(id: string, isActive: boolean): Observable<Organization>;
  abstract setTypes(id: string, typeCodes: readonly string[]): Observable<Organization>;
  abstract relationships(id: string): Observable<readonly CommercialRelationship[]>;
  abstract deletionPreview(id: string): Observable<OrganizationDeletionPlan>;
  /** Eliminación LÓGICA de una empresa desactivada (restaurable); exige el nombre exacto. */
  abstract delete(id: string, confirmName: string): Observable<OrganizationDeleted>;
  abstract restore(id: string): Observable<Organization>;
  /** Eliminación DEFINITIVA e irreversible de una empresa ya eliminada; exige el nombre exacto. */
  abstract purge(id: string, confirmName: string): Observable<OrganizationDeleted>;
}
