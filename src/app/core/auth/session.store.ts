import { Injectable, computed, signal } from '@angular/core';
import { AuthToken, CurrentUser } from '../../domain/models/identity';

/**
 * Estado de sesión SOLO EN MEMORIA.
 *
 * El backend entrega un Bearer token al JavaScript del navegador y no ofrece
 * refresh token ni cookie HttpOnly. Persistirlo en localStorage/sessionStorage
 * lo expondría a cualquier XSS, así que por defecto no se persiste: recargar la
 * pestaña exige iniciar sesión de nuevo. `SessionPersistence` (solo si el entorno
 * lo habilita, p. ej. desarrollo) la conserva en `sessionStorage`. Nunca se
 * registra en logs.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly tokenState = signal<AuthToken | null>(null);
  private readonly userState = signal<CurrentUser | null>(null);

  readonly user = this.userState.asReadonly();
  /** Solo para `SessionPersistence`; el resto de la app usa `authorizationHeader()`. */
  readonly token = this.tokenState.asReadonly();
  readonly hasToken = computed(() => this.tokenState() !== null);
  readonly isAuthenticated = computed(() => this.tokenState() !== null && this.userState() !== null);
  readonly expirationLabel = computed(() => this.tokenState()?.expirationLabel ?? null);

  /** Valor del header `Authorization`, o `null` sin sesión. */
  authorizationHeader(): string | null {
    const token = this.tokenState();
    return token ? `Bearer ${token.accessToken}` : null;
  }

  setToken(token: AuthToken): void {
    this.tokenState.set(token);
  }

  setUser(user: CurrentUser): void {
    this.userState.set(user);
  }

  clear(): void {
    this.tokenState.set(null);
    this.userState.set(null);
  }
}
