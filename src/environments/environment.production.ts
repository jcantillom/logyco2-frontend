import { AppConfig } from '../app/core/config/app-config';

/**
 * Producción: la URL del backend debe fijarse en el despliegue.
 */
export const environment: AppConfig = {
  production: true,
  apiBaseUrl: '',
  apiPrefix: '/api/v1',
  // En producción el token NO se persiste en el navegador hasta contar con cookie HttpOnly + refresh.
  sessionPersistence: 'memory',
};
