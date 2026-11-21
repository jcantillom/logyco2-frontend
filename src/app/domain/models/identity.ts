export interface RoleRef {
  readonly code: string;
  readonly name: string;
}

export interface OrganizationRef {
  readonly id: string;
  readonly name: string;
  /** Huella corta del logo (`null` si no tiene); solo la entregan las consultas de usuarios. Ausente = no se sabe. */
  readonly logoVersion?: string | null;
}

export interface Membership {
  readonly membershipId: string;
  readonly organization: OrganizationRef;
  readonly roles: readonly RoleRef[];
}

export interface CurrentUser {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly isActive: boolean;
  readonly globalRoles: readonly RoleRef[];
  readonly memberships: readonly Membership[];
}

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export interface AuthToken {
  readonly accessToken: string;
  readonly tokenType: string;
  /** Informativo (hora de Bogotá, tal como la informa el backend). No se interpreta. */
  readonly expirationLabel: string | null;
}

/** Códigos de permiso del catálogo RBAC del backend (`src/apps/rbac/permissions.py`). */
export const PERMISSION_CODES = [
  'organizations:read',
  'organizations:manage',
  'relationships:manage',
  'memberships:read',
  'memberships:manage',
  'users:read',
  'catalogs:manage',
  'imports:create',
  'indicators:read',
  'reports:read',
  'reports:download',
  'sector_reports:read',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];
