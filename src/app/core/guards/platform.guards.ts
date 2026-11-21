import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthFacade } from '../auth/auth.facade';
import { PlatformAccess, hasSuperAdminRole } from '../auth/platform-access';
import { SessionStore } from '../auth/session.store';

const DENIED = ['/acceso-denegado'];

/**
 * Primer filtro, síncrono: evita descargar el código de la consola a quien ya
 * se sabe sin rol global. Sin sesión deja pasar para que `authGuard` redirija
 * al login conservando la ruta.
 */
export const platformMatch: CanMatchFn = () => {
  const router = inject(Router);
  if (!inject(SessionStore).isAuthenticated()) return true;
  return inject(PlatformAccess).isSuperAdmin() ? true : router.createUrlTree(DENIED);
};

/**
 * Confirmación real: vuelve a consultar `/auth/me` al entrar al área global.
 * Cualquier fallo (red, 401, 5xx, respuesta sin el rol) se interpreta como
 * DENEGADO: una respuesta incompleta nunca concede acceso.
 */
export const platformGuard: CanActivateFn = () => {
  const router = inject(Router);
  const denied = router.createUrlTree(DENIED);
  return inject(AuthFacade)
    .refreshUser()
    .pipe(
      map((user) => (hasSuperAdminRole(user) ? true : denied)),
      catchError(() => of(denied)),
    );
};
