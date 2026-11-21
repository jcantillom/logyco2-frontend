import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessPolicy } from '../auth/access-policy';
import { LandingPolicy } from '../auth/landing-policy';
import { SessionStore } from '../auth/session.store';
import { PermissionCode } from '../../domain/models/identity';

/** Exige sesión completa. Identidad sin usuario local → flujo de invitación. */
export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);

  if (session.isAuthenticated()) return true;
  if (session.hasToken()) return router.createUrlTree(['/aceptar-invitacion']);
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Pantallas para visitantes (login): con sesión activa redirige al destino por defecto del usuario. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(SessionStore).isAuthenticated() ? router.parseUrl(inject(LandingPolicy).home()) : true;
};

/** Exige un token (aunque aún no exista usuario local): solo para aceptar invitaciones. */
export const tokenGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(SessionStore).hasToken() ? true : router.createUrlTree(['/login']);
};

/**
 * Navegación condicionada por permiso (cualquiera de la lista). Es una
 * comodidad de UX: el backend sigue siendo quien autoriza cada operación.
 */
export function permissionGuard(...codes: PermissionCode[]): CanActivateFn {
  return () => {
    const router = inject(Router);
    return inject(AccessPolicy).canAny(codes) ? true : router.createUrlTree(['/acceso-denegado']);
  };
}
