import { Injectable, effect, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthToken } from '../../domain/models/identity';
import { APP_CONFIG } from '../config/app-config';
import { AuthFacade } from './auth.facade';
import { SessionStore } from './session.store';

const STORAGE_KEY = 'logyco2.session';
const MAX_TOKEN_LENGTH = 8192;
/** Si el backend no responde, se descarta la sesión guardada en lugar de bloquear el arranque. */
export const RESTORE_TIMEOUT_MS = 5000;

/**
 * Conserva la sesión al recargar la pestaña, SOLO si el entorno lo habilita
 * (`sessionPersistence: 'tab'`).
 *
 * - Guarda únicamente el token, en `sessionStorage` (no `localStorage`): vive en esa pestaña y
 *   se borra al cerrarla. Nunca guarda el usuario, la contraseña ni nada más.
 * - Al arrancar, el token no se da por bueno: se revalida con `GET /auth/me`. Un 401, un error o
 *   un tiempo agotado lo descartan; el usuario siempre se obtiene del backend.
 * - Cerrar sesión o caducar el token (401) lo borran, porque se sincroniza con `SessionStore`.
 *
 * Límite conocido: mientras esté activo, un XSS podría leer el token. Por eso en producción está
 * desactivado hasta que el backend entregue el token en una cookie HttpOnly (ver README).
 */
@Injectable({ providedIn: 'root' })
export class SessionPersistence {
  private readonly config = inject(APP_CONFIG, { optional: true });
  private readonly session = inject(SessionStore);
  private readonly auth = inject(AuthFacade);

  readonly enabled = this.config?.sessionPersistence === 'tab';

  constructor() {
    if (!this.enabled) return;

    effect(() => {
      const token = this.session.token();

      try {
        if (token) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(token));
        else sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // Almacenamiento bloqueado o lleno: la sesión sigue funcionando en memoria.
      }
    });
  }

  /** Restaura y revalida la sesión de esta pestaña. Nunca lanza: en caso de duda queda sin sesión. */
  async restore(): Promise<void> {
    if (!this.enabled) return;

    const token = this.read();

    if (!token) return;

    this.session.setToken(token);

    try {
      await firstValueFrom(this.auth.refreshUser().pipe(timeout(RESTORE_TIMEOUT_MS)));
    } catch {
      // Identidad válida pero sin usuario local: se conserva el token solo para aceptar la invitación.
      if (!this.auth.pendingRegistration()) this.session.clear();
    }
  }

  private read(): AuthToken | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);

      if (!raw) return null;

      const value: unknown = JSON.parse(raw);

      if (isStoredToken(value)) {
        return { accessToken: value.accessToken, tokenType: value.tokenType, expirationLabel: value.expirationLabel ?? null };
      }

      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // sin acceso al almacenamiento
      }
    }

    return null;
  }
}

function isStoredToken(value: unknown): value is { accessToken: string; tokenType: string; expirationLabel?: string | null } {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate['accessToken'] === 'string' &&
    candidate['accessToken'].length > 0 &&
    candidate['accessToken'].length <= MAX_TOKEN_LENGTH &&
    typeof candidate['tokenType'] === 'string' &&
    (candidate['expirationLabel'] === undefined || candidate['expirationLabel'] === null || typeof candidate['expirationLabel'] === 'string')
  );
}
