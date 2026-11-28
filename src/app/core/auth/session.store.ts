import { Injectable, computed, signal } from '@angular/core';
import { CurrentUser } from '../../domain/models/identity';

/**
 * Estado de sesión en memoria. NO contiene el token.
 *
 * La credencial vive en una cookie HttpOnly que el backend fija y el navegador envía solo: el
 * JavaScript de la aplicación nunca la lee, así que un XSS no puede robarla y la sesión sobrevive a
 * recargas y pestañas nuevas (se restaura al arrancar con `SessionBootstrap`). Aquí solo se guarda
 * quién es la persona (`user`) y si hay una identidad corporativa válida, aunque todavía no tenga
 * usuario local (flujo de invitación). Nada de esto se persiste en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly identityState = signal(false);
  private readonly userState = signal<CurrentUser | null>(null);

  readonly user = this.userState.asReadonly();
  /** Hay una identidad corporativa válida (con o sin usuario local). */
  readonly hasIdentity = computed(() => this.identityState() || this.userState() !== null);
  readonly isAuthenticated = computed(() => this.userState() !== null);
  /** Instante en que caduca la sesión (el `exp` del token), o `null` si no se conoce. */
  readonly expiresAt = computed(() => {
    const value = this.userState()?.sessionExpiresAt;
    return value ? new Date(value) : null;
  });

  /** El backend confirmó una identidad válida (login o restauración) aunque aún no haya usuario local. */
  markIdentity(): void {
    this.identityState.set(true);
  }

  setUser(user: CurrentUser): void {
    this.userState.set(user);
  }

  clear(): void {
    this.identityState.set(false);
    this.userState.set(null);
  }
}
