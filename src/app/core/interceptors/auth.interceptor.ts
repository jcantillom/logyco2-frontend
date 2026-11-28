import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';

/** Cabecera y valor que el backend exige en las peticiones que cambian estado con cookie de sesión (protección CSRF). */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'LoGyCO2';
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Sesión por cookie HttpOnly: solo las peticiones a la API de LoGyCO₂ viajan con credenciales
 * (`withCredentials`, necesario cuando el frontend y la API son orígenes distintos) y, si cambian
 * estado, con la cabecera anti-CSRF. Las peticiones a terceros no reciben ni cookie ni cabecera.
 * No hay token que adjuntar: la aplicación nunca lo ve.
 */
/** La URL pertenece a la API si es la raíz o continúa con `/`, `?` o `#` (no basta el prefijo: `/api/v1evil`). */
function isApiUrl(url: string, apiRoot: string): boolean {
  return url.startsWith(apiRoot) && (url.length === apiRoot.length || '/?#'.includes(url[apiRoot.length]));
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(APP_CONFIG);
  const apiRoot = `${config.apiBaseUrl}${config.apiPrefix}`;

  if (!isApiUrl(request.url, apiRoot)) return next(request);

  return next(
    request.clone({
      withCredentials: true,
      ...(SAFE_METHODS.has(request.method.toUpperCase()) ? {} : { setHeaders: { [CSRF_HEADER]: CSRF_VALUE } }),
    }),
  );
};
