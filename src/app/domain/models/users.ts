import { OrganizationRef } from './identity';

export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type MembershipTargetStatus = Exclude<MembershipStatus, 'PENDING'>;
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface ManagedMembership {
  readonly membershipId: string;
  readonly organization: OrganizationRef;
  readonly status: MembershipStatus;
  readonly roles: readonly string[];
}

export type PersonType = 'super_admin' | 'org_admin' | 'company' | 'no_membership';

/** Criterios de una página de personas: se aplican SIEMPRE en el servidor y dentro del alcance de quien consulta. */
export interface UserListFilter {
  readonly search?: string;
  readonly organizationId?: string;
  /** Con empresa y/o rol, la membresía debe cumplir todos a la vez. */
  readonly membershipStatus?: MembershipStatus;
  readonly role?: string;
  readonly personType?: PersonType;
  /** `false` excluye a quienes tienen un rol global (superadministradores). */
  readonly hasGlobalRole?: boolean;
  readonly isActive?: boolean;
}

export interface ManagedUser {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly isActive: boolean;
  /** Último acceso a la plataforma (ISO); `null` si aún no se registró. */
  readonly lastLoginAt: string | null;
  /** Roles GLOBAL activos (solo visibles para administradores de plataforma). */
  readonly globalRoles: readonly string[];
  readonly memberships: readonly ManagedMembership[];
}

/** Datos editables de una persona; solo viaja lo que cambia. */
export interface UserUpdate {
  readonly fullName?: string;
  readonly email?: string;
}

export interface Invitation {
  readonly id: string;
  readonly organization: OrganizationRef;
  readonly email: string;
  readonly inviteeName: string | null;
  readonly roleCode: string;
  readonly status: InvitationStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly acceptedAt: Date | null;
}

/** Respuesta de creación: el código de un solo uso solo existe en esta respuesta. */
export interface CreatedInvitation extends Invitation {
  readonly code: string;
}

export interface NewInvitation {
  readonly organizationId: string;
  readonly email: string;
  readonly roleCode: string;
  readonly inviteeName?: string;
  readonly expiresInDays?: number;
}

export interface InvitationFilter {
  readonly organizationId?: string;
  readonly status?: InvitationStatus;
}

export interface AcceptedInvitation {
  readonly membershipId: string;
  readonly organization: OrganizationRef;
  readonly roleCode: string;
  readonly status: MembershipStatus;
}

export interface MembershipRecord {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly status: MembershipStatus;
}

/**
 * Roles organizacionales que se ofrecen al invitar. `GUILD_VIEWER` (consulta gremial) sigue en el catálogo del backend, pero
 * ya no se ofrece: Inteligencia Sectorial salió del foco del producto. Las asignaciones existentes no se alteran.
 */
export const INVITABLE_ROLES: readonly { code: string; label: string }[] = [
  { code: 'ORG_ADMIN', label: 'Administrador de empresa' },
  { code: 'ORG_ANALYST', label: 'Analista de empresa' },
  { code: 'ORG_VIEWER', label: 'Consulta de empresa' },
];

/**
 * Roles que se ofrecen al invitar a un MIEMBRO del equipo. El administrador no está: una empresa tiene uno solo y se asigna desde
 * su detalle (Empresas → Administrador y equipo). El backend también lo exige (409 `ORG_ADMIN_ALREADY_EXISTS`).
 */
export const TEAM_ROLES = INVITABLE_ROLES.filter((r) => r.code !== 'ORG_ADMIN');
export const DEFAULT_TEAM_ROLE = 'ORG_VIEWER';
