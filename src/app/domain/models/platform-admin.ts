/** Modelos de la administración global: superadministradores, actividad, tendencias y catálogo RBAC. */
import { InvitationStatus } from './users';
import { SuperAdminQuotaSummary } from './platform';

// ── Superadministradores ──
export interface SuperAdminQuota extends SuperAdminQuotaSummary {
  readonly limitReached: boolean;
}

export interface SuperAdminMember {
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  /** Estado de la cuenta; una cuenta inactiva no tiene acceso ni ocupa cupo. */
  readonly isActive: boolean;
  readonly hasGlobalAccess: boolean;
  /** `null` si la asignación es anterior al registro de la concesión: no se inventa. */
  readonly assignedAt: Date | null;
  readonly assignedByName: string | null;
  /** Solo si existen eventos administrativos reales de esta persona. */
  readonly lastActivityAt: Date | null;
  readonly isSelf: boolean;
}

export interface SuperAdminInvitation {
  readonly id: string;
  readonly email: string;
  readonly inviteeName: string;
  readonly status: InvitationStatus;
  readonly invitedByName: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}

/** Respuesta de creación: el código de un solo uso solo existe en esta respuesta. */
export interface CreatedSuperAdminInvitation extends SuperAdminInvitation {
  readonly code: string;
}

export interface NewSuperAdminInvitation {
  readonly fullName: string;
  readonly email: string;
  readonly expiresInDays: number;
}

export interface SuperAdminOverview {
  readonly quota: SuperAdminQuota;
  readonly members: readonly SuperAdminMember[];
  readonly invitations: readonly SuperAdminInvitation[];
}

export interface SuperAdminDetail {
  readonly member: SuperAdminMember;
  readonly invitation: SuperAdminInvitation | null;
  readonly activity: readonly ActivityItem[];
}

export interface AcceptedSuperAdmin {
  readonly userId: string;
  readonly roleCode: string;
  readonly alreadyMember: boolean;
}

export interface SuperAdminRevocation {
  readonly userId: string;
  readonly revoked: boolean;
  readonly remainingActive: number;
}

// ── Actividad (auditoría persistente) ──
export interface ActivityItem {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: string;
  readonly actorName: string | null;
  readonly targetName: string | null;
  readonly organizationName: string | null;
  readonly channel: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** Agrupa las acciones de auditoría por tema (cada categoría reúne varios códigos de acción). */
export type AuditCategory = 'organizations' | 'access' | 'invitations' | 'super_admins' | 'relationships' | 'EMISSIONS';
/** Origen del evento: la consola o un operador (recuperación por línea de comandos). */
export type AuditChannel = 'console' | 'operator';

/** Criterios de la auditoría; se aplican SIEMPRE en el servidor. Las fechas son `yyyy-mm-dd` (inclusivas, hora de Bogotá). */
export interface AuditFilter {
  readonly days?: number;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly organizationId?: string;
  readonly category?: AuditCategory;
  readonly channel?: AuditChannel;
  readonly query?: string;
}

/** Una página de la auditoría por cursor: sin páginas numeradas; el total solo llega en la primera y puede estar acotado. */
export interface AuditPage {
  readonly items: readonly ActivityItem[];
  readonly pageSize: number;
  readonly hasMore: boolean;
  /** Opaco: se devuelve tal cual para pedir la página siguiente con los MISMOS filtros. */
  readonly nextCursor: string | null;
  readonly total: number | null;
  /** `true` si hay más eventos que `total` (se muestra «10.000+»). */
  readonly totalCapped: boolean;
}

export interface AuditPageRequest {
  readonly pageSize: number;
  readonly cursor?: string | null;
}

/** Un evento con los metadatos permitidos (la lista solo trae un resumen). */
export interface AuditEventDetail extends ActivityItem {
  readonly targetId: string | null;
}

// ── Tendencias de un período (no son acumulados) ──
export type TrendGranularity = 'day' | 'month';

export interface TrendMetrics {
  readonly organizationsCreated: number;
  readonly usersRegistered: number;
  readonly invitationsCreated: number;
  readonly adminsOnboarded: number;
  readonly membershipsApproved: number;
  readonly superAdminsGranted: number;
}

export interface TrendPoint extends TrendMetrics {
  readonly bucket: string; // YYYY-MM-DD
}

export interface PlatformTrends {
  readonly period: { readonly dateFrom: string; readonly dateTo: string; readonly granularity: TrendGranularity; readonly days: number };
  readonly summary: TrendMetrics;
  readonly points: readonly TrendPoint[];
  /** Aprobaciones y concesiones salen de la auditoría: solo existen desde esta fecha. */
  readonly auditAvailableSince: Date | null;
}

/** Período elegido en el dashboard: ventanas fijas o un rango personalizado. */
export type TrendRange =
  | { readonly kind: 'days'; readonly days: 7 | 30 | 90 }
  | { readonly kind: 'custom'; readonly from: string; readonly to: string };

// ── Acciones pendientes ──
export interface AttentionList<T> {
  readonly count: number;
  readonly items: readonly T[];
}

export interface PlatformAttention {
  /** Sin administrador ACTIVO; `hasPendingInvitation`: tienen una invitación de administrador vigente (solo esperan que la acepten). */
  readonly organizationsWithoutAdmin: AttentionList<{ readonly id: string; readonly name: string; readonly hasPendingInvitation: boolean }>;
  /** De las anteriores, cuántas solo esperan que su administrador acepte (el resto requiere reinvitar). */
  readonly organizationsWaitingAdmin: number;
  readonly inactiveOrganizations: AttentionList<{ readonly id: string; readonly name: string }>;
  readonly pendingMemberships: AttentionList<{
    readonly membershipId: string;
    readonly organizationId: string;
    readonly organizationName: string;
    readonly userName: string;
  }>;
  readonly invitationsExpiring: AttentionList<{
    readonly id: string;
    readonly organizationId: string;
    readonly organizationName: string;
    readonly roleCode: string;
    readonly expiresAt: Date;
  }>;
  readonly superAdmins: SuperAdminQuotaSummary;
  readonly superAdminNearLimit: boolean;
  readonly expiringWithinDays: number;
}

// ── Catálogo RBAC (solo lectura) ──
export type RoleScopeKind = 'GLOBAL' | 'ORGANIZATION';

export interface RbacRole {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly scope: RoleScopeKind;
  readonly isActive: boolean;
  readonly permissions: readonly string[];
  readonly assignments: number;
  readonly effectiveAssignments: number;
  /** Personas DISTINTAS con acceso vigente: quien tiene varias asignaciones cuenta una vez. */
  readonly people: number;
}

/** active: lo exige algún endpoint hoy · planned: función aún sin implementar · complementary: módulo fuera del foco. */
export type PermissionImplementation = 'active' | 'planned' | 'complementary';

export interface RbacPermission {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly implementation: PermissionImplementation;
}

export interface RbacCatalog {
  readonly roles: readonly RbacRole[];
  readonly permissions: readonly RbacPermission[];
}

export interface RoleAssignment {
  readonly userId: string;
  readonly userName: string;
  readonly email: string;
  readonly isActive: boolean;
  readonly organization: { readonly id: string; readonly name: string } | null;
  readonly membershipStatus: string | null;
  readonly assignedAt: Date | null;
}

// ── Operación de la plataforma (trabajos de actualización de datos de referencia) ──
export interface OperationsPeriod {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly days: number;
  readonly previousDateFrom: string;
  readonly previousDateTo: string;
  /** Solo si el período anterior está completo (los trabajos se registran desde `dataSince`) se muestran variaciones. */
  readonly previousComparable: boolean;
  readonly dataSince: Date | null;
}

export interface ProcessingCounts {
  readonly runs: number;
  readonly completed: number;
  readonly failed: number;
  readonly running: number;
  readonly recordsSeen: number;
  readonly inserted: number;
  readonly revised: number;
  readonly unchanged: number;
  readonly durationP95Seconds: number | null;
  readonly durationAvgSeconds: number | null;
}

export interface ProcessingPoint {
  readonly bucket: string; // YYYY-MM-DD
  readonly completed: number;
  readonly failed: number;
}

export type SourceStatus = 'OK' | 'FAILING' | 'NEVER_RUN';

export interface SourceHealth {
  readonly code: string;
  readonly name: string;
  readonly status: SourceStatus;
  readonly lastAttemptAt: Date | null;
  readonly lastSuccessAt: Date | null;
  readonly lastErrorCode: string | null;
}

export interface PlatformOperations {
  readonly period: OperationsPeriod;
  readonly processing: ProcessingCounts;
  readonly previous: ProcessingCounts;
  readonly series: readonly ProcessingPoint[];
  readonly sources: readonly SourceHealth[];
  readonly blocked: { readonly count: number; readonly oldestStartedAt: Date | null };
  readonly blockedAfterMinutes: number;
  readonly generatedAt: Date;
}
