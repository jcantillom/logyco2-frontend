import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Page, PageRequest } from '../../domain/models/pagination';
import {
  AcceptedSuperAdmin,
  ActivityItem,
  AuditEventDetail,
  AuditFilter,
  AuditPage,
  AuditPageRequest,
  CreatedSuperAdminInvitation,
  NewSuperAdminInvitation,
  PlatformAttention,
  PlatformTrends,
  RbacCatalog,
  RoleAssignment,
  PlatformOperations,
  SuperAdminDetail,
  SuperAdminInvitation,
  SuperAdminOverview,
  SuperAdminRevocation,
  TrendRange,
} from '../../domain/models/platform-admin';
import {
  InsightsRepository,
  RbacRepository,
  SuperAdminsRepository,
} from '../../domain/repositories/platform-admin.repositories';
import {
  ActivityItemDto,
  AuditEventDetailDto,
  AuditPageDto,
  PlatformAttentionDto,
  PlatformTrendsDto,
  RbacCatalogDto,
  RoleAssignmentDto,
  PlatformOperationsDto,
  SuperAdminDetailDto,
  SuperAdminInvitationCreatedDto,
  SuperAdminInvitationDto,
  SuperAdminOverviewDto,
} from '../dto/platform-admin.dto';
import { ApiClient } from '../http/api-client';
import { toPage } from '../mappers/identity.mappers';
import {
  toAcceptedSuperAdmin,
  toActivityItem,
  toCreatedSuperAdminInvitation,
  toPlatformAttention,
  toPlatformTrends,
  toRbacCatalog,
  toRoleAssignment,
  toPlatformOperations,
  toSuperAdminDetail,
  toSuperAdminInvitation,
  toSuperAdminOverview,
  toAuditEventDetail,
  toAuditPage,
} from '../mappers/platform-admin.mappers';

const BASE = '/platform/super-admins';

@Injectable()
export class HttpSuperAdminsRepository extends SuperAdminsRepository {
  private readonly api = inject(ApiClient);

  overview(): Observable<SuperAdminOverview> {
    return this.api.get<SuperAdminOverviewDto>(BASE).pipe(map(toSuperAdminOverview));
  }

  detail(userId: string): Observable<SuperAdminDetail> {
    return this.api.get<SuperAdminDetailDto>(`${BASE}/${encodeURIComponent(userId)}`).pipe(map(toSuperAdminDetail));
  }

  /** La confirmación explícita es parte del contrato: el backend la exige (422 sin ella). */
  invite(invitation: NewSuperAdminInvitation): Observable<CreatedSuperAdminInvitation> {
    return this.api
      .post<SuperAdminInvitationCreatedDto>(`${BASE}/invitations`, {
        full_name: invitation.fullName,
        email: invitation.email,
        expires_in_days: invitation.expiresInDays,
        confirm: true,
      })
      .pipe(map(toCreatedSuperAdminInvitation));
  }

  revokeInvitation(invitationId: string): Observable<SuperAdminInvitation> {
    return this.api
      .post<SuperAdminInvitationDto>(`${BASE}/invitations/${encodeURIComponent(invitationId)}/revoke`, {})
      .pipe(map(toSuperAdminInvitation));
  }

  revoke(userId: string): Observable<SuperAdminRevocation> {
    return this.api
      .post<{ user_id: string; revoked: boolean; remaining_active: number }>(
        `${BASE}/${encodeURIComponent(userId)}/revoke`,
        { confirm: true },
      )
      .pipe(map((dto) => ({ userId: dto.user_id, revoked: dto.revoked, remainingActive: dto.remaining_active })));
  }

  accept(code: string): Observable<AcceptedSuperAdmin> {
    return this.api
      .post<{ user_id: string; role_code: string; already_member: boolean }>(`${BASE}/invitations/accept`, { code })
      .pipe(map(toAcceptedSuperAdmin));
  }
}

@Injectable()
export class HttpInsightsRepository extends InsightsRepository {
  private readonly api = inject(ApiClient);

  trends(range: TrendRange): Observable<PlatformTrends> {
    const params = range.kind === 'days' ? { days: range.days } : { date_from: range.from, date_to: range.to };

    return this.api.get<PlatformTrendsDto>('/platform/metrics/trends', params).pipe(map(toPlatformTrends));
  }

  operations(days: number): Observable<PlatformOperations> {
    return this.api.get<PlatformOperationsDto>('/platform/operations', { days }).pipe(map(toPlatformOperations));
  }

  attention(): Observable<PlatformAttention> {
    return this.api.get<PlatformAttentionDto>('/platform/attention').pipe(map(toPlatformAttention));
  }

  activity(options: { limit: number; days?: number; organizationId?: string }): Observable<readonly ActivityItem[]> {
    return this.api
      .get<{ items: readonly ActivityItemDto[] }>('/platform/activity', {
        limit: options.limit,
        days: options.days,
        organization_id: options.organizationId,
      })
      .pipe(map((response) => response.items.map(toActivityItem)));
  }

  audit(request: AuditPageRequest, filter: AuditFilter): Observable<AuditPage> {
    return this.api
      .getBody<AuditPageDto>('/platform/audit', {
        page_size: request.pageSize,
        cursor: request.cursor || undefined,
        days: filter.days,
        date_from: filter.dateFrom || undefined,
        date_to: filter.dateTo || undefined,
        organization_id: filter.organizationId || undefined,
        category: filter.category,
        channel: filter.channel,
        q: filter.query?.trim() || undefined,
      })
      .pipe(map(toAuditPage));
  }

  auditEvent(id: string): Observable<AuditEventDetail> {
    return this.api.get<AuditEventDetailDto>(`/platform/audit/${encodeURIComponent(id)}`).pipe(map(toAuditEventDetail));
  }
}

@Injectable()
export class HttpRbacRepository extends RbacRepository {
  private readonly api = inject(ApiClient);

  catalog(): Observable<RbacCatalog> {
    return this.api.get<RbacCatalogDto>('/rbac/catalog').pipe(map(toRbacCatalog));
  }

  assignments(roleCode: string, request: PageRequest): Observable<Page<RoleAssignment>> {
    return this.api
      .getPage<RoleAssignmentDto>(`/rbac/roles/${encodeURIComponent(roleCode)}/assignments`, {
        page: request.page,
        page_size: request.pageSize,
      })
      .pipe(map((response) => toPage(response, toRoleAssignment)));
  }
}
