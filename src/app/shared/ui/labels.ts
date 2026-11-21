import { InvitationStatus, MembershipStatus } from '../../domain/models/users';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export interface Label {
  readonly text: string;
  readonly tone: Tone;
}

export const MEMBERSHIP_LABELS: Record<MembershipStatus, Label> = {
  PENDING: { text: 'Pendiente de aprobación', tone: 'warning' },
  ACTIVE: { text: 'Activa', tone: 'success' },
  SUSPENDED: { text: 'Suspendida', tone: 'warning' },
  REVOKED: { text: 'Revocada', tone: 'danger' },
};

export const INVITATION_LABELS: Record<InvitationStatus, Label> = {
  PENDING: { text: 'Pendiente', tone: 'warning' },
  ACCEPTED: { text: 'Aceptada', tone: 'success' },
  REVOKED: { text: 'Revocada', tone: 'danger' },
  EXPIRED: { text: 'Expirada', tone: 'neutral' },
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Superadministrador',
  ORG_ADMIN: 'Administrador de empresa',
  ORG_ANALYST: 'Analista',
  ORG_OPERATOR: 'Operador',
  ORG_VIEWER: 'Consulta',
  GUILD_VIEWER: 'Consulta sectorial',
};

/** Nombre de cada permiso en el lenguaje del negocio (los códigos `recurso:acción` solo se muestran como referencia técnica). */
export const PERMISSION_LABELS: Record<string, string> = {
  'organizations:read': 'Consultar empresas',
  'organizations:manage': 'Administrar empresas',
  'memberships:read': 'Consultar los accesos de los usuarios',
  'memberships:manage': 'Administrar los accesos de los usuarios',
  'users:read': 'Consultar usuarios',
  'catalogs:manage': 'Administrar catálogos',
  'imports:create': 'Cargar información operativa',
  'indicators:read': 'Consultar indicadores de emisiones',
  'reports:read': 'Consultar reportes',
  'reports:download': 'Descargar reportes',
  'sector_reports:read': 'Consultar estadísticas sectoriales',
};

/** Con un permiso nuevo aún sin traducir se usa el nombre que informa el backend. */
export function permissionLabel(code: string, fallback: string): string {
  return PERMISSION_LABELS[code] ?? fallback;
}

export function roleLabel(code: string): string {
  return ROLE_LABELS[code] ?? code;
}
