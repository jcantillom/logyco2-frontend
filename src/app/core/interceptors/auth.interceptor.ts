import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionStore } from '../auth/session.store';
import { APP_CONFIG } from '../config/app-config';

/** Adjunta el Bearer token únicamente a peticiones dirigidas a la API de LoGyCO₂. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(APP_CONFIG);
  const apiRoot = `${config.apiBaseUrl}${config.apiPrefix}`;

  if (!request.url.startsWith(apiRoot)) return next(request);

  const authorization = inject(SessionStore).authorizationHeader();
  return next(
    authorization ? request.clone({ setHeaders: { Authorization: authorization } }) : request,
  );
};
