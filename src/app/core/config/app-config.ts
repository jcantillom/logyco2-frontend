import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Origen del backend FastAPI, sin barra final ni prefijo de versión. */
  readonly apiBaseUrl: string;
  /** Prefijo de versión de la API. */
  readonly apiPrefix: string;
  /**
   * Cómo sobrevive la sesión a recargar la página:
   * - `memory` (por defecto): solo en memoria; recargar exige iniciar sesión.
   * - `tab`: el token se guarda en `sessionStorage` (solo esa pestaña; se borra al cerrarla) y se
   *   revalida con `GET /auth/me` al arrancar. El token queda al alcance de un XSS: úselo solo en
   *   desarrollo hasta que el backend entregue el token en cookie HttpOnly.
   */
  readonly sessionPersistence?: 'memory' | 'tab';
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
