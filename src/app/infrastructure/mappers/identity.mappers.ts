import { PaginatedResponseDto } from '../../core/http/api-envelope';
import { AuthToken, CurrentUser } from '../../domain/models/identity';
import { CommercialRelationship, Organization, OrganizationTypeInfo } from '../../domain/models/organization';
import { PlatformAdminMetrics } from '../../domain/models/platform';
import { Page } from '../../domain/models/pagination';
import {
  AcceptedInvitation,
  CreatedInvitation,
  Invitation,
  InvitationStatus,
  ManagedUser,
  MembershipRecord,
  MembershipStatus,
} from '../../domain/models/users';
import {
  InvitationAcceptedDto,
  InvitationCreatedDto,
  InvitationDto,
  LoginResponseDto,
  MeResponseDto,
  MembershipDto,
  OrganizationDto,
  OrganizationRelationshipDto,
  OrganizationTypeDto,
  PlatformMetricsDto,
  UserSummaryDto,
} from '../dto/identity.dto';

const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
];
const INVITATION_STATUSES: readonly InvitationStatus[] = [
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED',
];

/** Estados fuera del catálogo conocido se tratan como el más restrictivo, nunca como activos. */
function membershipStatus(value: string): MembershipStatus {
  return MEMBERSHIP_STATUSES.find((status) => status === value) ?? 'REVOKED';
}

function invitationStatus(value: string): InvitationStatus {
  return INVITATION_STATUSES.find((status) => status === value) ?? 'EXPIRED';
}

export function toPage<D, T>(
  response: PaginatedResponseDto<D>,
  mapItem: (dto: D) => T,
): Page<T> {
  const { pagination } = response.meta;
  return {
    items: response.data.map(mapItem),
    page: pagination.page,
    pageSize: pagination.page_size,
    total: pagination.total,
    totalPages: pagination.total_pages,
    hasNext: pagination.has_next,
    hasPrevious: pagination.has_previous,
  };
}

export function toAuthToken(dto: LoginResponseDto): AuthToken {
  return {
    accessToken: dto.access_token,
    tokenType: dto.token_type,
    expirationLabel: dto.expiration_time_utc_bogota,
  };
}

export function toCurrentUser(dto: MeResponseDto): CurrentUser {
  return {
    id: dto.id,
    fullName: dto.full_name,
    email: dto.email,
    isActive: dto.is_active,
    globalRoles: dto.global_roles.map((role) => ({ code: role.code, name: role.name })),
    memberships: dto.memberships.map((membership) => ({
      membershipId: membership.membership_id,
      organization: { id: membership.organization.id, name: membership.organization.name },
      roles: membership.roles.map((role) => ({ code: role.code, name: role.name })),
    })),
  };
}

export function toOrganization(dto: OrganizationDto): Organization {
  return {
    id: dto.id,
    name: dto.name,
    legalName: dto.legal_name,
    taxId: dto.tax_id,
    contactEmail: dto.contact_email ?? null,
    contactPhone: dto.contact_phone ?? null,
    address: dto.address ?? null,
    city: dto.city ?? null,
    website: dto.website ?? null,
    logoVersion: dto.logo_version ?? null,
    isActive: dto.is_active,
    createdAt: new Date(dto.created_at),
    updatedAt: new Date(dto.updated_at),
    deletedAt: dto.deleted_at ? new Date(dto.deleted_at) : null,
    types: (dto.types ?? []).map((type) => ({ code: type.code, name: type.name })),
    activeAdmins: dto.active_admins ?? null,
    pendingInvitations: dto.pending_invitations ?? null,
  };
}

export function toOrganizationType(dto: OrganizationTypeDto): OrganizationTypeInfo {
  return { code: dto.code, name: dto.name, description: dto.description };
}

export function toRelationship(dto: OrganizationRelationshipDto): CommercialRelationship {
  return {
    id: dto.id,
    counterpart: { id: dto.counterpart.id, name: dto.counterpart.name },
    role: dto.role,
    relationshipType: dto.relationship_type,
    startDate: dto.start_date ? new Date(dto.start_date) : null,
    endDate: dto.end_date ? new Date(dto.end_date) : null,
    isActive: dto.is_active,
  };
}

export function toPlatformMetrics(dto: PlatformMetricsDto): PlatformAdminMetrics {
  return {
    organizations: {
      total: dto.organizations.total,
      active: dto.organizations.active,
      inactive: dto.organizations.inactive,
      withoutActiveAdmin: dto.organizations.without_active_admin,
      withoutType: dto.organizations.without_type,
      withPendingInvitations: dto.organizations.with_pending_invitations ?? 0,
      deleted: dto.organizations.deleted ?? 0,
      byType: dto.organizations.by_type.map((t) => ({ code: t.code, name: t.name, count: t.count })),
    },
    users: { ...dto.users },
    memberships: { ...dto.memberships },
    invitations: { ...dto.invitations },
    superAdmins: {
      active: dto.super_admins?.active ?? 0,
      maxActive: dto.super_admins?.max_active ?? 5,
      reservedByInvitations: dto.super_admins?.reserved_by_invitations ?? 0,
      available: dto.super_admins?.available ?? 0,
    },
    generatedAt: new Date(dto.generated_at),
  };
}

export function toManagedUser(dto: UserSummaryDto): ManagedUser {
  return {
    id: dto.id,
    fullName: dto.full_name,
    email: dto.email,
    isActive: dto.is_active,
    lastLoginAt: dto.last_login_at ?? null,
    globalRoles: [...(dto.global_roles ?? [])],
    memberships: dto.memberships.map((membership) => ({
      membershipId: membership.membership_id,
      organization: { id: membership.organization.id, name: membership.organization.name, logoVersion: membership.organization.logo_version ?? null },
      status: membershipStatus(membership.status),
      roles: [...membership.roles],
    })),
  };
}

export function toInvitation(dto: InvitationDto): Invitation {
  return {
    id: dto.id,
    organization: { id: dto.organization.id, name: dto.organization.name },
    email: dto.email,
    inviteeName: dto.invitee_name,
    roleCode: dto.role_code,
    status: invitationStatus(dto.status),
    expiresAt: new Date(dto.expires_at),
    createdAt: new Date(dto.created_at),
    acceptedAt: dto.accepted_at ? new Date(dto.accepted_at) : null,
  };
}

export function toCreatedInvitation(dto: InvitationCreatedDto): CreatedInvitation {
  return { ...toInvitation(dto), code: dto.code };
}

export function toAcceptedInvitation(dto: InvitationAcceptedDto): AcceptedInvitation {
  return {
    membershipId: dto.membership_id,
    organization: { id: dto.organization.id, name: dto.organization.name },
    roleCode: dto.role_code,
    status: membershipStatus(dto.status),
  };
}

export function toMembershipRecord(dto: MembershipDto): MembershipRecord {
  return {
    id: dto.id,
    userId: dto.user_id,
    organizationId: dto.organization_id,
    status: membershipStatus(dto.status),
  };
}
