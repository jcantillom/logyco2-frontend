import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { SessionExpiryHandler } from '../auth/session-expiry.handler';
import { toAppError } from '../errors/http-error-mapper';
import { OrganizationContext } from '../org/organization-context';

const ORGANIZATION_PATH = /\/organizations\/([0-9a-fA-F-]{36})(?:[/?]|$)/;
const ACCESS_LOST_CODES: ReadonlySet<string> = new Set([
  'ORGANIZATION_ACCESS_DENIED',
  'ORGANIZATION_INACTIVE',
]);

/**
 * Punto único de interpretación de errores HTTP:
 * - convierte toda falla en `AppError` (mensaje del catálogo central);
 * - 401 con sesión activa → cierra la sesión local (sesión caducada);
 * - 403 por acceso/estado de la empresa → marca el acceso como perdido.
 * El 403 y el 404 nunca se reinterpretan: el backend manda.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  // inject() solo es válido de forma síncrona: se resuelve antes del callback asíncrono.
  const expiry = inject(SessionExpiryHandler);
  const context = inject(OrganizationContext);

  return next(request).pipe(
    catchError((error: unknown) => {
      const appError = toAppError(error);

      if (appError.status === 401) {
        expiry.handle();
      } else if (appError.status === 403 && ACCESS_LOST_CODES.has(appError.code)) {
        const organizationId = ORGANIZATION_PATH.exec(request.url)?.[1];
        if (organizationId) context.markAccessLost(organizationId);
      }

      return throwError(() => appError);
    }),
  );
};
