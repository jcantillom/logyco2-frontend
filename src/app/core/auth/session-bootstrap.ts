import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthFacade } from './auth.facade';
import { CrossTabSession } from './cross-tab-session';
import { LandingPolicy } from './landing-policy';
import { SessionStore } from './session.store';

/** Si el backend no responde, se arranca sin sesión en lugar de bloquear la aplicación. */
export const RESTORE_TIMEOUT_MS = 5000;

/**
 * Restaura la sesión al arrancar y la mantiene sincronizada entre pestañas.
 *
 * La sesión es una cookie HttpOnly que el navegador envía sola: aquí no se lee ningún token, se
 * pregunta al backend quién es (`GET /auth/me`). Como se ejecuta como inicializador de la
 * aplicación, las rutas no se evalúan hasta que termina: los guards ven la sesión ya resuelta y no
 * hay destello del login. Un 401, un error o un tiempo agotado equivalen a «sin sesión».
 */
@Injectable({ providedIn: 'root' })
export class SessionBootstrap {
  private readonly auth = inject(AuthFacade);
  private readonly session = inject(SessionStore);
  private readonly crossTab = inject(CrossTabSession);
  private readonly router = inject(Router);
  private readonly landing = inject(LandingPolicy);

  /** Nunca lanza: en caso de duda la persona queda sin sesión y el guard la lleva a `/login`. */
  async restore(): Promise<void> {
    this.crossTab.listen((signal) => this.onRemoteSignal(signal));

    try {
      await firstValueFrom(this.auth.refreshUser().pipe(timeout(RESTORE_TIMEOUT_MS)));
    } catch {
      // `AuthFacade` ya dejó el estado coherente (sin sesión, o identidad pendiente de invitación).
    }
  }

  private onRemoteSignal(signal: 'login' | 'logout'): void {
    if (signal === 'logout') {
      if (this.session.hasIdentity()) this.auth.applyRemoteLogout();
      return;
    }

    if (this.session.isAuthenticated()) return;

    this.auth.refreshUser().subscribe({
      next: () => {
        if (this.router.url.startsWith('/login')) void this.router.navigateByUrl(this.landing.home());
      },
      error: () => undefined,
    });
  }
}
