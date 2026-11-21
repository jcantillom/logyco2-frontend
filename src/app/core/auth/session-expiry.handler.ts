import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OrganizationContext } from '../org/organization-context';
import { SessionStore } from './session.store';

/** Cierra la sesión local cuando el backend responde 401 a una sesión que ya estaba activa. */
@Injectable({ providedIn: 'root' })
export class SessionExpiryHandler {
  private readonly session = inject(SessionStore);
  private readonly context = inject(OrganizationContext);
  private readonly router = inject(Router);

  handle(): void {
    // Sin usuario cargado no hay sesión que caducar (p. ej. 401 durante el propio login).
    if (!this.session.isAuthenticated()) return;

    const returnUrl = this.router.url;
    this.session.clear();
    this.context.clear();
    void this.router.navigate(['/login'], { queryParams: { reason: 'expired', returnUrl } });
  }
}
