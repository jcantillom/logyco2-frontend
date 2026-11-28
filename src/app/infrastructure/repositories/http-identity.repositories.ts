import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { CurrentUser, LoginCredentials } from '../../domain/models/identity';
import {
  CommercialRelationship,
  OrganizationProfileChanges,
  Organization,
  OrganizationChanges,
  OrganizationDeleted,
  OrganizationDeletionPlan,
  OrganizationListFilter,
  OrganizationTypeInfo,
} from '../../domain/models/organization';
import { Page, PageRequest } from '../../domain/models/pagination';
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
} from '../../domain/models/users';
import {
  AuthRepository,
  InvitationsRepository,
  MembershipsRepository,
  OrganizationAdminRepository,
  OrganizationsRepository,
  UsersRepository,
} from '../../domain/repositories/identity.repositories';
import {
  InvitationAcceptedDto,
  InvitationCreateDto,
  InvitationCreatedDto,
  InvitationDto,
  LoginRequestDto,
  LoginResponseDto,
  MeResponseDto,
  MembershipDto,
  OrganizationDto,
  OrganizationRelationshipDto,
  OrganizationTypeDto,
  UserSummaryDto,
} from '../dto/identity.dto';
import { ApiClient } from '../http/api-client';
import {
  toAcceptedInvitation,
  toCreatedInvitation,
  toCurrentUser,
  toInvitation,
  toManagedUser,
  toMembershipRecord,
  toOrganization,
  toOrganizationType,
  toPage,
  toRelationship,
} from '../mappers/identity.mappers';

function pageParams(request: PageRequest): { page: number; page_size: number } {
  return { page: request.page, page_size: request.pageSize };
}

@Injectable()
export class HttpAuthRepository extends AuthRepository {
  private readonly api = inject(ApiClient);

  login(credentials: LoginCredentials): Observable<void> {
    const body: LoginRequestDto = { email: credentials.email, password: credentials.password };
    // El cuerpo trae `access_token: null` (solo un cliente de API lo recibe, con `X-Client-Type: api`); la SPA nunca lo pide: la sesión es la cookie HttpOnly.
    return this.api.post<LoginResponseDto>('/auth/login', body).pipe(map(() => undefined));
  }

  logout(): Observable<void> {
    return this.api.postEmpty('/auth/logout');
  }

  getCurrentUser(): Observable<CurrentUser> {
    return this.api.get<MeResponseDto>('/auth/me').pipe(map(toCurrentUser));
  }
}

@Injectable()
export class HttpOrganizationsRepository extends OrganizationsRepository {
  private readonly api = inject(ApiClient);

  list(request: PageRequest, filter?: OrganizationListFilter): Observable<Page<Organization>> {
    return this.api
      .getPage<OrganizationDto>('/organizations', {
        ...pageParams(request),
        ...(filter?.deleted ? { deleted: true } : {}),
        search: filter?.search?.trim() || undefined,
        is_active: filter?.isActive,
        type_code: filter?.typeCode || undefined,
        attention: filter?.focus,
        sort: filter?.sort,
        order: filter?.order,
      })
      .pipe(map((response) => toPage(response, toOrganization)));
  }

  get(id: string): Observable<Organization> {
    return this.api
      .get<OrganizationDto>(`/organizations/${encodeURIComponent(id)}`)
      .pipe(map(toOrganization));
  }

  relationships(id: string): Observable<readonly CommercialRelationship[]> {
    return this.api
      .get<readonly OrganizationRelationshipDto[]>(`/organizations/${encodeURIComponent(id)}/relationships`)
      .pipe(map((rows) => rows.map(toRelationship)));
  }

  updateProfile(id: string, changes: OrganizationProfileChanges): Observable<Organization> {
    const body: Record<string, string | null> = {};
    if (changes.name !== undefined) body['name'] = changes.name;
    if (changes.contactEmail !== undefined) body['contact_email'] = changes.contactEmail;
    if (changes.contactPhone !== undefined) body['contact_phone'] = changes.contactPhone;
    if (changes.address !== undefined) body['address'] = changes.address;
    if (changes.city !== undefined) body['city'] = changes.city;
    if (changes.website !== undefined) body['website'] = changes.website;
    return this.api.patch<OrganizationDto>(`/organizations/${encodeURIComponent(id)}/profile`, body).pipe(map(toOrganization));
  }

  logo(id: string): Observable<Blob | null> {
    return this.api.getBlob(`/organizations/${encodeURIComponent(id)}/logo`).pipe(
      catchError((error: { status?: number }) => (error.status === 404 ? of(null) : throwError(() => error))),
    );
  }

  uploadLogo(id: string, file: Blob): Observable<void> {
    return this.api.putBinary<unknown>(`/organizations/${encodeURIComponent(id)}/logo`, file, file.type || 'application/octet-stream').pipe(map(() => undefined));
  }

  removeLogo(id: string): Observable<void> {
    return this.api.delete(`/organizations/${encodeURIComponent(id)}/logo`);
  }
}

@Injectable()
export class HttpUsersRepository extends UsersRepository {
  private readonly api = inject(ApiClient);

  list(request: PageRequest, filter?: UserListFilter): Observable<Page<ManagedUser>> {
    return this.api
      .getPage<UserSummaryDto>('/users', {
        ...pageParams(request),
        search: filter?.search?.trim() || undefined,
        organization_id: filter?.organizationId || undefined,
        membership_status: filter?.membershipStatus,
        role: filter?.role || undefined,
        classification: filter?.personType,
        has_global_role: filter?.hasGlobalRole,
        status: filter?.isActive === undefined ? undefined : filter.isActive ? 'active' : 'inactive',
      })
      .pipe(map((response) => toPage(response, toManagedUser)));
  }

  get(id: string): Observable<ManagedUser> {
    return this.api
      .get<UserSummaryDto>(`/users/${encodeURIComponent(id)}`)
      .pipe(map(toManagedUser));
  }

  update(id: string, changes: UserUpdate): Observable<ManagedUser> {
    return this.api
      .patch<UserSummaryDto>(`/users/${encodeURIComponent(id)}`, { full_name: changes.fullName, email: changes.email })
      .pipe(map(toManagedUser));
  }
}

@Injectable()
export class HttpInvitationsRepository extends InvitationsRepository {
  private readonly api = inject(ApiClient);

  list(request: PageRequest, filter?: InvitationFilter): Observable<Page<Invitation>> {
    return this.api
      .getPage<InvitationDto>('/users/invitations', {
        ...pageParams(request),
        organization_id: filter?.organizationId,
        status: filter?.status,
      })
      .pipe(map((response) => toPage(response, toInvitation)));
  }

  create(invitation: NewInvitation): Observable<CreatedInvitation> {
    const body: InvitationCreateDto = {
      organization_id: invitation.organizationId,
      email: invitation.email,
      role_code: invitation.roleCode,
      ...(invitation.inviteeName ? { invitee_name: invitation.inviteeName } : {}),
      ...(invitation.expiresInDays ? { expires_in_days: invitation.expiresInDays } : {}),
    };
    return this.api
      .post<InvitationCreatedDto>('/users/invitations', body)
      .pipe(map(toCreatedInvitation));
  }

  revoke(invitationId: string): Observable<Invitation> {
    return this.api
      .post<InvitationDto>(`/users/invitations/${encodeURIComponent(invitationId)}/revoke`, {})
      .pipe(map(toInvitation));
  }

  accept(code: string): Observable<AcceptedInvitation> {
    return this.api
      .post<InvitationAcceptedDto>('/users/invitations/accept', { code })
      .pipe(map(toAcceptedInvitation));
  }
}

@Injectable()
export class HttpMembershipsRepository extends MembershipsRepository {
  private readonly api = inject(ApiClient);

  changeStatus(
    organizationId: string,
    membershipId: string,
    status: MembershipTargetStatus,
  ): Observable<MembershipRecord> {
    return this.api
      .patch<MembershipDto>(
        `/organizations/${encodeURIComponent(organizationId)}/memberships/${encodeURIComponent(membershipId)}`,
        { status },
      )
      .pipe(map(toMembershipRecord));
  }

  remove(organizationId: string, membershipId: string): Observable<void> {
    return this.api.delete(`/organizations/${encodeURIComponent(organizationId)}/memberships/${encodeURIComponent(membershipId)}`);
  }
}

interface DeletionPlanDto { organization_id: string; organization_name: string; is_active: boolean; deleted: boolean; users_to_delete: number; users_kept: number; memberships: number; invitations: number; relationships: number }
interface DeletedDto { permanent: boolean; organization_name: string; users_deleted: number; users_kept: number; memberships_deleted: number; invitations_deleted: number; relationships_deleted: number }

const toDeleted = (dto: DeletedDto): OrganizationDeleted => ({
  permanent: dto.permanent, organizationName: dto.organization_name, usersDeleted: dto.users_deleted, usersKept: dto.users_kept,
  membershipsDeleted: dto.memberships_deleted, invitationsDeleted: dto.invitations_deleted, relationshipsDeleted: dto.relationships_deleted,
});

@Injectable()
export class HttpOrganizationAdminRepository extends OrganizationAdminRepository {
  private readonly api = inject(ApiClient);

  listTypes(): Observable<readonly OrganizationTypeInfo[]> {
    return this.api
      .get<readonly OrganizationTypeDto[]>('/organization-types')
      .pipe(map((types) => types.map(toOrganizationType)));
  }

  /** Solo se envían los campos presentes: `null` borra el valor en el backend. */
  update(id: string, changes: OrganizationChanges): Observable<Organization> {
    const body: Record<string, string | null> = {};
    if (changes.name !== undefined) body['name'] = changes.name;
    if (changes.legalName !== undefined) body['legal_name'] = changes.legalName;
    if (changes.taxId !== undefined) body['tax_id'] = changes.taxId;
    return this.api
      .patch<OrganizationDto>(`/organizations/${encodeURIComponent(id)}`, body)
      .pipe(map(toOrganization));
  }

  deletionPreview(id: string): Observable<OrganizationDeletionPlan> {
    return this.api.get<DeletionPlanDto>(`/organizations/${encodeURIComponent(id)}/deletion-preview`).pipe(
      map((dto) => ({
        organizationId: dto.organization_id, organizationName: dto.organization_name, isActive: dto.is_active, deleted: dto.deleted, usersToDelete: dto.users_to_delete,
        usersKept: dto.users_kept, memberships: dto.memberships, invitations: dto.invitations, relationships: dto.relationships,
      })),
    );
  }

  delete(id: string, confirmName: string): Observable<OrganizationDeleted> {
    return this.api.post<DeletedDto>(`/organizations/${encodeURIComponent(id)}/delete`, { confirm_name: confirmName }).pipe(map(toDeleted));
  }

  restore(id: string): Observable<Organization> {
    return this.api.post<OrganizationDto>(`/organizations/${encodeURIComponent(id)}/restore`, {}).pipe(map(toOrganization));
  }

  purge(id: string, confirmName: string): Observable<OrganizationDeleted> {
    return this.api.post<DeletedDto>(`/organizations/${encodeURIComponent(id)}/purge`, { confirm_name: confirmName }).pipe(map(toDeleted));
  }

  setActive(id: string, isActive: boolean): Observable<Organization> {
    return this.api
      .patch<OrganizationDto>(`/organizations/${encodeURIComponent(id)}/status`, { is_active: isActive })
      .pipe(map(toOrganization));
  }

  setTypes(id: string, typeCodes: readonly string[]): Observable<Organization> {
    return this.api
      .put<OrganizationDto>(`/organizations/${encodeURIComponent(id)}/types`, { type_codes: typeCodes })
      .pipe(map(toOrganization));
  }

  relationships(id: string): Observable<readonly CommercialRelationship[]> {
    return this.api
      .get<readonly OrganizationRelationshipDto[]>(`/organizations/${encodeURIComponent(id)}/relationships`)
      .pipe(map((rows) => rows.map(toRelationship)));
  }
}
