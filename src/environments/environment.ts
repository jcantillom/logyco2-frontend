import { AppConfig } from '../app/core/config/app-config';

/** Desarrollo local: backend FastAPI en 127.0.0.1:8120. */
export const environment: AppConfig = {
  production: false,
  apiBaseUrl: 'http://127.0.0.1:8120',
  apiPrefix: '/api/v1',
  // La sesión sobrevive a recargar la pestaña (sessionStorage). Solo desarrollo: ver AppConfig.
  sessionPersistence: 'tab',
};
