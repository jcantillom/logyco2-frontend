import { Injectable, computed, inject } from '@angular/core';
import { PermissionCode } from '../../domain/models/identity';
import { OrganizationContext } from '../org/organization-context';
import { SessionStore } from './session.store';

/**
 * Espejo de la matriz rol → permiso sembrada en el backend
 * (`migrations/.../seed_initial_rbac_catalog.py`).
 *
 * IMPORTANTE: `GET /auth/me` solo devuelve CÓDIGOS DE ROL, no permisos. Esta
 * tabla se usa únicamente para decidir qué mostrar (menú, botones, guards de
 * navegación). NO es autorización: el backend aplica las restricciones reales
 * en cada petición y su respuesta 403/404 prevalece sobre esta política.
 */
const GLOBAL_ROLE_PERMISSIONS: Readonly<Record<string, readonly PermissionCode[]>> = {
  SUPER_ADMIN: [
    'organizations:read',
    'organizations:manage',
    'memberships:read',
    'memberships:manage',
    'users:read',
    'catalogs:manage',
    'sector_reports:read',
  ],
};

const ORGANIZATION_ROLE_PERMISSIONS: Readonly<Record<string, readonly PermissionCode[]>> = {
  ORG_ADMIN: [
    'organizations:read',
    'organizations:manage',
    'relationships:manage',
    'memberships:read',
    'memberships:manage',
    'imports:create',
    'indicators:read',
    'reports:read',
    'reports:download',
    'sector_reports:read',
  ],
  ORG_ANALYST: [
    'organizations:read',
    'imports:create',
    'indicators:read',
    'reports:read',
    'reports:download',
    'sector_reports:read',
  ],
  ORG_VIEWER: ['organizations:read', 'indicators:read', 'reports:read', 'sector_reports:read'],
  GUILD_VIEWER: ['sector_reports:read'],
};

@Injectable({ providedIn: 'root' })
export class AccessPolicy {
  private readonly session = inject(SessionStore);
  private readonly context = inject(OrganizationContext);

  /** Permisos efectivos para la empresa activa (roles globales + roles de la membresía activa). */
  readonly permissions = computed<ReadonlySet<PermissionCode>>(() => {
    const granted = new Set<PermissionCode>();
    const globalRoles = this.session.user()?.globalRoles ?? [];
    const orgRoles = this.context.activeMembership()?.roles ?? [];

    for (const role of globalRoles) {
      GLOBAL_ROLE_PERMISSIONS[role.code]?.forEach((code) => granted.add(code));
    }
    for (const role of orgRoles) {
      ORGANIZATION_ROLE_PERMISSIONS[role.code]?.forEach((code) => granted.add(code));
    }
    return granted;
  });

  can(code: PermissionCode): boolean {
    return this.permissions().has(code);
  }

  canAny(codes: readonly PermissionCode[]): boolean {
    return codes.length === 0 || codes.some((code) => this.can(code));
  }
}
