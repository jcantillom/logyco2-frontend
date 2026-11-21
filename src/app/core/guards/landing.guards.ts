import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LandingPolicy } from '../auth/landing-policy';

/** Portada (`/`): no tiene contenido propio; envía a cada usuario a su contexto por defecto. */
export const homeGuard: CanActivateFn = () => {
  const router = inject(Router);
  return router.parseUrl(inject(LandingPolicy).home());
};

/**
 * `/resumen` es el espacio de ORGANIZACIÓN. Quien no tiene membresía (p. ej. un SUPER_ADMIN sin ellas)
 * no debe aterrizar ahí: se le envía a su destino real. Con membresía pasa, también un SUPER_ADMIN
 * que eligió ese contexto de forma explícita. Nunca devuelve `/resumen`, así que no genera bucles.
 */
export const workspaceGuard: CanActivateFn = () => {
  const router = inject(Router);
  const landing = inject(LandingPolicy);
  return landing.canEnterWorkspace() ? true : router.parseUrl(landing.home());
};
