import {
  AcceptedSuperAdmin,
  ActivityItem,
  CreatedSuperAdminInvitation,
  PlatformAttention,
  PlatformTrends,
  RbacCatalog,
  RoleAssignment,
  RoleScopeKind,
  SuperAdminDetail,
  SuperAdminInvitation,
  SuperAdminMember,
  SuperAdminOverview,
  SuperAdminQuota,
  TrendGranularity,
  TrendMetrics,
  PermissionImplementation,
  PlatformOperations,
  ProcessingCounts,
  SourceStatus,
  AuditEventDetail,
  AuditPage,
} from '../../domain/models/platform-admin';
import { InvitationStatus } from '../../domain/models/users';
import {
  ActivityItemDto,
  AuditEventDetailDto,
  AuditPageDto,
  PlatformAttentionDto,
  PlatformTrendsDto,
  QuotaDto,
  RbacCatalogDto,
  RoleAssignmentDto,
  SuperAdminDetailDto,
  SuperAdminInvitationCreatedDto,
  SuperAdminInvitationDto,
  SuperAdminMemberDto,
  SuperAdminOverviewDto,
  TrendMetricsDto,
  PlatformOperationsDto,
  ProcessingCountsDto,
} from '../dto/platform-admin.dto';

const INVITATION_STATUSES: readonly InvitationStatus[] = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'];
const date = (value: string | null): Date | null => (value ? new Date(value) : null);

/** Un estado fuera del catálogo conocido se trata como el más restrictivo, nunca como pendiente. */
function invitationStatus(value: string): InvitationStatus {
  return INVITATION_STATUSES.find((status) => status === value) ?? 'EXPIRED';
}

export function toQuota(dto: QuotaDto): SuperAdminQuota {
  return {
    maxActive: dto.max_active,
    active: dto.active,
    reservedByInvitations: dto.reserved_by_invitations,
    available: dto.available,
    limitReached: dto.limit_reached,
  };
}

export function toSuperAdminMember(dto: SuperAdminMemberDto): SuperAdminMember {
  return {
    userId: dto.user_id,
    fullName: dto.full_name,
    email: dto.email,
    isActive: dto.is_active,
    hasGlobalAccess: dto.has_global_access,
    assignedAt: date(dto.assigned_at),
    assignedByName: dto.assigned_by_name,
    lastActivityAt: date(dto.last_activity_at),
    isSelf: dto.is_self,
  };
}

export function toSuperAdminInvitation(dto: SuperAdminInvitationDto): SuperAdminInvitation {
  return {
    id: dto.id,
    email: dto.email,
    inviteeName: dto.invitee_name,
    status: invitationStatus(dto.status),
    invitedByName: dto.invited_by_name,
    createdAt: new Date(dto.created_at),
    expiresAt: new Date(dto.expires_at),
    acceptedAt: date(dto.accepted_at),
    revokedAt: date(dto.revoked_at),
  };
}

export function toCreatedSuperAdminInvitation(dto: SuperAdminInvitationCreatedDto): CreatedSuperAdminInvitation {
  return { ...toSuperAdminInvitation(dto), code: dto.code };
}

export function toActivityItem(dto: ActivityItemDto): ActivityItem {
  return {
    id: dto.id,
    occurredAt: new Date(dto.occurred_at),
    action: dto.action,
    actorName: dto.actor_name,
    targetName: dto.target_name,
    organizationName: dto.organization_name,
    channel: dto.channel,
    details: dto.details,
  };
}

export function toAuditPage(dto: AuditPageDto): AuditPage {
  return {
    items: dto.data.map(toActivityItem),
    pageSize: dto.meta.page_size,
    hasMore: dto.meta.has_more,
    nextCursor: dto.meta.next_cursor,
    total: dto.meta.total,
    totalCapped: dto.meta.total_capped,
  };
}

export function toAuditEventDetail(dto: AuditEventDetailDto): AuditEventDetail {
  return { ...toActivityItem(dto), targetId: dto.target_id };
}

export function toSuperAdminOverview(dto: SuperAdminOverviewDto): SuperAdminOverview {
  return {
    quota: toQuota(dto.quota),
    members: dto.members.map(toSuperAdminMember),
    invitations: dto.invitations.map(toSuperAdminInvitation),
  };
}

export function toSuperAdminDetail(dto: SuperAdminDetailDto): SuperAdminDetail {
  return {
    member: toSuperAdminMember(dto.member),
    invitation: dto.invitation ? toSuperAdminInvitation(dto.invitation) : null,
    activity: dto.activity.map(toActivityItem),
  };
}

export function toAcceptedSuperAdmin(dto: { user_id: string; role_code: string; already_member: boolean }): AcceptedSuperAdmin {
  return { userId: dto.user_id, roleCode: dto.role_code, alreadyMember: dto.already_member };
}

function toTrendMetrics(dto: TrendMetricsDto): TrendMetrics {
  return {
    organizationsCreated: dto.organizations_created,
    usersRegistered: dto.users_registered,
    invitationsCreated: dto.invitations_created,
    adminsOnboarded: dto.admins_onboarded,
    membershipsApproved: dto.memberships_approved,
    superAdminsGranted: dto.super_admins_granted,
  };
}

export function toPlatformTrends(dto: PlatformTrendsDto): PlatformTrends {
  const granularity: TrendGranularity = dto.period.granularity === 'month' ? 'month' : 'day';

  return {
    period: { dateFrom: dto.period.date_from, dateTo: dto.period.date_to, granularity, days: dto.period.days },
    summary: toTrendMetrics(dto.summary),
    points: dto.points.map((point) => ({ bucket: point.bucket, ...toTrendMetrics(point) })),
    auditAvailableSince: date(dto.audit_available_since),
  };
}

export function toPlatformAttention(dto: PlatformAttentionDto): PlatformAttention {
  return {
    organizationsWithoutAdmin: {
      count: dto.organizations_without_admin.count,
      items: dto.organizations_without_admin.items.map((o) => ({ id: o.id, name: o.name, hasPendingInvitation: o.has_pending_invitation ?? false })),
    },
    organizationsWaitingAdmin: dto.organizations_waiting_admin ?? 0,
    inactiveOrganizations: { count: dto.inactive_organizations.count, items: dto.inactive_organizations.items },
    pendingMemberships: {
      count: dto.pending_memberships.count,
      items: dto.pending_memberships.items.map((m) => ({
        membershipId: m.membership_id,
        organizationId: m.organization_id,
        organizationName: m.organization_name,
        userName: m.user_name,
      })),
    },
    invitationsExpiring: {
      count: dto.invitations_expiring.count,
      items: dto.invitations_expiring.items.map((i) => ({
        id: i.id,
        organizationId: i.organization_id,
        organizationName: i.organization_name,
        roleCode: i.role_code,
        expiresAt: new Date(i.expires_at),
      })),
    },
    superAdmins: {
      active: dto.super_admins.active,
      maxActive: dto.super_admins.max_active,
      reservedByInvitations: dto.super_admins.reserved_by_invitations,
      available: dto.super_admins.available,
    },
    superAdminNearLimit: dto.super_admin_near_limit,
    expiringWithinDays: dto.expiring_within_days,
  };
}

function scope(value: string): RoleScopeKind {
  return value === 'GLOBAL' ? 'GLOBAL' : 'ORGANIZATION';
}

/** Un valor desconocido se trata como «previsto»: nunca se presenta como función activa sin que el backend lo diga. */
function implementation(value: string): PermissionImplementation {
  return value === 'active' || value === 'complementary' ? value : 'planned';
}

export function toRbacCatalog(dto: RbacCatalogDto): RbacCatalog {
  return {
    roles: dto.roles.map((role) => ({
      code: role.code,
      name: role.name,
      description: role.description,
      scope: scope(role.scope),
      isActive: role.is_active,
      permissions: role.permissions,
      assignments: role.assignments,
      effectiveAssignments: role.effective_assignments,
      people: role.people,
    })),
    permissions: dto.permissions.map((p) => ({ code: p.code, name: p.name, description: p.description, implementation: implementation(p.implementation) })),
  };
}

export function toRoleAssignment(dto: RoleAssignmentDto): RoleAssignment {
  return {
    userId: dto.user_id,
    userName: dto.user_name,
    email: dto.email,
    isActive: dto.is_active,
    organization: dto.organization,
    membershipStatus: dto.membership_status,
    assignedAt: date(dto.assigned_at),
  };
}

function counts(dto: ProcessingCountsDto): ProcessingCounts {
  return {
    runs: dto.runs, completed: dto.completed, failed: dto.failed, running: dto.running,
    recordsSeen: dto.records_seen, inserted: dto.inserted, revised: dto.revised, unchanged: dto.unchanged,
    durationP95Seconds: dto.duration_p95_seconds, durationAvgSeconds: dto.duration_avg_seconds,
  };
}

function sourceStatus(value: string): SourceStatus {
  return value === 'OK' || value === 'FAILING' ? value : 'NEVER_RUN';
}

export function toPlatformOperations(dto: PlatformOperationsDto): PlatformOperations {
  return {
    period: {
      dateFrom: dto.period.date_from, dateTo: dto.period.date_to, days: dto.period.days,
      previousDateFrom: dto.period.previous_date_from, previousDateTo: dto.period.previous_date_to,
      previousComparable: dto.period.previous_comparable, dataSince: date(dto.period.data_since),
    },
    processing: counts(dto.processing),
    previous: counts(dto.previous),
    series: dto.series.map((p) => ({ bucket: p.bucket, completed: p.completed, failed: p.failed })),
    sources: dto.sources.map((s) => ({
      code: s.code, name: s.name, status: sourceStatus(s.status),
      lastAttemptAt: date(s.last_attempt_at), lastSuccessAt: date(s.last_success_at), lastErrorCode: s.last_error_code,
    })),
    blocked: { count: dto.blocked.count, oldestStartedAt: date(dto.blocked.oldest_started_at) },
    blockedAfterMinutes: dto.blocked_after_minutes,
    generatedAt: new Date(dto.generated_at),
  };
}
