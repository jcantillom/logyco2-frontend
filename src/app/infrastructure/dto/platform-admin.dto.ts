/** Formas de los endpoints de administración global tal como las entrega FastAPI (snake_case). */

export interface QuotaDto {
  readonly max_active: number;
  readonly active: number;
  readonly reserved_by_invitations: number;
  readonly available: number;
  readonly limit_reached: boolean;
}

export interface SuperAdminMemberDto {
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string;
  readonly is_active: boolean;
  readonly has_global_access: boolean;
  readonly assigned_at: string | null;
  readonly assigned_by_name: string | null;
  readonly last_activity_at: string | null;
  readonly is_self: boolean;
}

export interface SuperAdminInvitationDto {
  readonly id: string;
  readonly email: string;
  readonly invitee_name: string;
  readonly status: string;
  readonly invited_by_name: string | null;
  readonly created_at: string;
  readonly expires_at: string;
  readonly accepted_at: string | null;
  readonly revoked_at: string | null;
}

export interface SuperAdminInvitationCreatedDto extends SuperAdminInvitationDto {
  readonly code: string;
}

export interface ActivityItemDto {
  readonly id: string;
  readonly occurred_at: string;
  readonly action: string;
  readonly actor_name: string | null;
  readonly target_name: string | null;
  readonly organization_name: string | null;
  readonly channel: string;
  readonly details: Record<string, unknown>;
}

export interface AuditEventDetailDto extends ActivityItemDto {
  readonly target_id: string | null;
}

export interface AuditPageDto {
  readonly data: readonly ActivityItemDto[];
  readonly meta: {
    readonly page_size: number;
    readonly has_more: boolean;
    readonly next_cursor: string | null;
    readonly total: number | null;
    readonly total_capped: boolean;
  };
}

export interface SuperAdminOverviewDto {
  readonly quota: QuotaDto;
  readonly members: readonly SuperAdminMemberDto[];
  readonly invitations: readonly SuperAdminInvitationDto[];
}

export interface SuperAdminDetailDto {
  readonly member: SuperAdminMemberDto;
  readonly invitation: SuperAdminInvitationDto | null;
  readonly activity: readonly ActivityItemDto[];
}

export interface TrendMetricsDto {
  readonly organizations_created: number;
  readonly users_registered: number;
  readonly invitations_created: number;
  readonly admins_onboarded: number;
  readonly memberships_approved: number;
  readonly super_admins_granted: number;
}

export interface TrendPointDto extends TrendMetricsDto {
  readonly bucket: string;
}

export interface PlatformTrendsDto {
  readonly period: { readonly date_from: string; readonly date_to: string; readonly granularity: string; readonly days: number };
  readonly summary: TrendMetricsDto;
  readonly points: readonly TrendPointDto[];
  readonly audit_available_since: string | null;
}

interface CountedDto<T> {
  readonly count: number;
  readonly items: readonly T[];
}

export interface PlatformAttentionDto {
  /** `has_pending_invitation` y `organizations_waiting_admin` ausentes en versiones anteriores del backend. */
  readonly organizations_without_admin: CountedDto<{ id: string; name: string; has_pending_invitation?: boolean | null }>;
  readonly organizations_waiting_admin?: number;
  readonly inactive_organizations: CountedDto<{ id: string; name: string }>;
  readonly pending_memberships: CountedDto<{ membership_id: string; organization_id: string; organization_name: string; user_name: string }>;
  readonly invitations_expiring: CountedDto<{ id: string; organization_id: string; organization_name: string; role_code: string; expires_at: string }>;
  readonly super_admins: {
    readonly active: number;
    readonly max_active: number;
    readonly reserved_by_invitations: number;
    readonly available: number;
  };
  readonly super_admin_near_limit: boolean;
  readonly expiring_within_days: number;
}

export interface RbacCatalogDto {
  readonly roles: readonly {
    readonly code: string;
    readonly name: string;
    readonly description: string | null;
    readonly scope: string;
    readonly is_active: boolean;
    readonly permissions: readonly string[];
    readonly assignments: number;
    readonly effective_assignments: number;
    readonly people: number;
  }[];
  readonly permissions: readonly { readonly code: string; readonly name: string; readonly description: string | null; readonly implementation: string }[];
}

export interface RoleAssignmentDto {
  readonly user_id: string;
  readonly user_name: string;
  readonly email: string;
  readonly is_active: boolean;
  readonly organization: { readonly id: string; readonly name: string } | null;
  readonly membership_status: string | null;
  readonly assigned_at: string | null;
}

export interface ProcessingCountsDto {
  readonly runs: number;
  readonly completed: number;
  readonly failed: number;
  readonly running: number;
  readonly records_seen: number;
  readonly inserted: number;
  readonly revised: number;
  readonly unchanged: number;
  readonly duration_p95_seconds: number | null;
  readonly duration_avg_seconds: number | null;
}

export interface PlatformOperationsDto {
  readonly period: {
    readonly date_from: string;
    readonly date_to: string;
    readonly days: number;
    readonly previous_date_from: string;
    readonly previous_date_to: string;
    readonly previous_comparable: boolean;
    readonly data_since: string | null;
  };
  readonly processing: ProcessingCountsDto;
  readonly previous: ProcessingCountsDto;
  readonly series: readonly { readonly bucket: string; readonly completed: number; readonly failed: number }[];
  readonly sources: readonly {
    readonly code: string;
    readonly name: string;
    readonly status: string;
    readonly last_attempt_at: string | null;
    readonly last_success_at: string | null;
    readonly last_error_code: string | null;
  }[];
  readonly blocked: { readonly count: number; readonly oldest_started_at: string | null };
  readonly blocked_after_minutes: number;
  readonly generated_at: string;
}
