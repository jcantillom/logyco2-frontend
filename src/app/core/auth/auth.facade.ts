import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, switchMap, tap, throwError } from 'rxjs';
import { CurrentUser, LoginCredentials } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { toAppError } from '../errors/http-error-mapper';
import { OrganizationContext } from '../org/organization-context';
import { SessionStore } from './session.store';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly repository = inject(AuthRepository);
  private readonly session = inject(SessionStore);
  private readonly context = inject(OrganizationContext);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  /**
   * Identidad corporativa válida pero sin usuario local: la persona debe
   * aceptar una invitación antes de operar. El token se conserva solo para eso.
   */
  readonly pendingRegistration = signal(false);

  login(credentials: LoginCredentials): Observable<CurrentUser> {
    this.loading.set(true);
    this.pendingRegistration.set(false);

    return this.repository.login(credentials).pipe(
      tap((token) => {
        this.session.clear();
        this.context.clear();
        this.session.setToken(token);
      }),
      switchMap(() => this.loadUser()),
      finalize(() => this.loading.set(false)),
    );
  }

  /** Vuelve a consultar `/auth/me` (p. ej. tras aceptar una invitación). */
  refreshUser(): Observable<CurrentUser> {
    return this.loadUser();
  }

  logout(): void {
    this.session.clear();
    this.context.clear();
    this.pendingRegistration.set(false);
    void this.router.navigate(['/login']);
  }

  private loadUser(): Observable<CurrentUser> {
    return this.repository.getCurrentUser().pipe(
      tap((user) => {
        this.session.setUser(user);
        this.pendingRegistration.set(false);
      }),
      catchError((error: unknown) => {
        const appError = toAppError(error);
        if (appError.code === 'USER_NOT_REGISTERED') {
          this.pendingRegistration.set(true);
        } else if (!this.session.isAuthenticated()) {
          this.session.clear();
        }
        return throwError(() => appError);
      }),
    );
  }
}
