import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Origen del backend FastAPI, sin barra final ni prefijo de versión. */
  readonly apiBaseUrl: string;
  /** Prefijo de versión de la API. */
  readonly apiPrefix: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
