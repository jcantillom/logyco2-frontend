import { Injectable, computed, inject } from '@angular/core';
import { CurrentUser } from '../../domain/models/identity';
import { SessionStore } from './session.store';

/** Código del rol GLOBAL de administración de la plataforma (catálogo RBAC del backend). */
export const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

/**
 * Un usuario es administrador de plataforma solo si `GET /auth/me` lo informa
 * activo y con el rol GLOBAL `SUPER_ADMIN` en `global_roles`. Un rol por
 * empresa (p. ej. `ORG_ADMIN`) nunca cuenta. Ausencia de dato = sin acceso.
 */
export function hasSuperAdminRole(user: CurrentUser | null | undefined): boolean {
  return !!user && user.isActive && user.globalRoles.some((role) => role.code === SUPER_ADMIN_ROLE);
}

/**
 * Pista de interfaz (menú, enlaces de contexto). NO autoriza: el acceso real al
 * área lo confirma `platformGuard` con una consulta fresca a `/auth/me` y cada
 * endpoint lo vuelve a validar en FastAPI.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAccess {
  private readonly session = inject(SessionStore);
  readonly isSuperAdmin = computed(() => hasSuperAdminRole(this.session.user()));
}
