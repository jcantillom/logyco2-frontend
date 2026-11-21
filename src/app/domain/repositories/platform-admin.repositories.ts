import { Observable } from 'rxjs';
import { Page, PageRequest } from '../models/pagination';
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
  PlatformOperations,
  PlatformTrends,
  RbacCatalog,
  RoleAssignment,
  SuperAdminDetail,
  SuperAdminInvitation,
  SuperAdminOverview,
  SuperAdminRevocation,
  TrendRange,
} from '../models/platform-admin';

/** Administración de superadministradores: el máximo de 5 activos lo impone el backend. */
export abstract class SuperAdminsRepository {
  abstract overview(): Observable<SuperAdminOverview>;
  abstract detail(userId: string): Observable<SuperAdminDetail>;
  abstract invite(invitation: NewSuperAdminInvitation): Observable<CreatedSuperAdminInvitation>;
  abstract revokeInvitation(invitationId: string): Observable<SuperAdminInvitation>;
  abstract revoke(userId: string): Observable<SuperAdminRevocation>;
  /** Con la identidad autenticada del portador del token (no exige usuario local previo). */
  abstract accept(code: string): Observable<AcceptedSuperAdmin>;
}

/** Tendencias, acciones pendientes y actividad: agregadas por el backend. */
export abstract class InsightsRepository {
  abstract trends(range: TrendRange): Observable<PlatformTrends>;
  abstract attention(): Observable<PlatformAttention>;
  /** Funcionamiento de los trabajos de la plataforma en los últimos `days` días frente al período anterior de igual duración. */
  abstract operations(days: number): Observable<PlatformOperations>;
  abstract activity(options: { limit: number; days?: number; organizationId?: string }): Observable<readonly ActivityItem[]>;
  /** Auditoría completa, paginada y filtrada en el servidor (la lista de `activity` está acotada a 50). */
  abstract audit(request: AuditPageRequest, filter: AuditFilter): Observable<AuditPage>;
  abstract auditEvent(id: string): Observable<AuditEventDetail>;
}

export abstract class RbacRepository {
  abstract catalog(): Observable<RbacCatalog>;
  abstract assignments(roleCode: string, request: PageRequest): Observable<Page<RoleAssignment>>;
}
