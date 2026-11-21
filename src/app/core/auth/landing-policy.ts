import { Injectable, inject } from '@angular/core';
import { OrganizationContext } from '../org/organization-context';
import { PlatformAccess } from './platform-access';

export const PLATFORM_HOME = '/plataforma/resumen';
export const WORKSPACE_HOME = '/resumen';
export const PENDING_ACCESS = '/acceso-pendiente';

/**
 * Única fuente de verdad sobre DÓNDE aterriza un usuario autenticado. Separa los dos contextos:
 * GLOBAL (`/plataforma/*`, rol global SUPER_ADMIN) y ORGANIZACIÓN (`/resumen` y rutas empresariales,
 * requieren una membresía). Es una decisión de navegación (UX): el backend autoriza cada petición.
 */
@Injectable({ providedIn: 'root' })
export class LandingPolicy {
  private readonly platform = inject(PlatformAccess);
  private readonly context = inject(OrganizationContext);

  /** Destino por defecto: la consola global manda aunque exista alguna membresía. */
  home(): string {
    if (this.platform.isSuperAdmin()) return PLATFORM_HOME;
    return this.canEnterWorkspace() ? WORKSPACE_HOME : PENDING_ACCESS;
  }

  /** El espacio de empresa exige una membresía activa; el rol global por sí solo no basta. */
  canEnterWorkspace(): boolean {
    return this.context.hasOrganizations();
  }

  /**
   * Destino tras autenticarse. Una ruta solicitada solo se respeta si es interna, el usuario tiene
   * acceso a su contexto y no es simplemente la portada genérica (`/`, `/resumen`), que no expresa
   * una elección y no debe desplazar al administrador de plataforma de su consola.
   */
  resolve(requested: string | null): string {
    const path = normalize(requested);
    if (!path || path === '/' || path === WORKSPACE_HOME || path === '/inicio' || path === PENDING_ACCESS) return this.home();
    if (isPlatformPath(path)) return this.platform.isSuperAdmin() ? (requested ?? this.home()) : this.home();
    return this.canEnterWorkspace() ? (requested ?? this.home()) : this.home();
  }
}

function isPlatformPath(path: string): boolean {
  return path === '/plataforma' || path.startsWith('/plataforma/');
}

/** Acepta solo rutas internas (evita redirecciones abiertas) y devuelve su ruta sin query ni fragmento para decidir. */
function normalize(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) return null;
  const end = value.search(/[?#]/);
  const path = end === -1 ? value : value.slice(0, end);
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}
