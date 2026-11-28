import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, of, switchMap, tap, throwError } from 'rxjs';
import { CurrentUser, LoginCredentials } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { AppError } from '../errors/app-error';
import { ERROR_MESSAGES } from '../errors/error-catalog';
import { toAppError } from '../errors/http-error-mapper';
import { OrganizationContext } from '../org/organization-context';
import { CrossTabSession } from './cross-tab-session';
import { SessionStore } from './session.store';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly repository = inject(AuthRepository);
  private readonly session = inject(SessionStore);
  private readonly context = inject(OrganizationContext);
  private readonly router = inject(Router);
  private readonly crossTab = inject(CrossTabSession);

  readonly loading = signal(false);
  /**
   * Identidad corporativa válida pero sin usuario local: la persona debe
   * aceptar una invitación antes de operar. La cookie de sesión se conserva solo para eso.
   */
  readonly pendingRegistration = signal(false);

  login(credentials: LoginCredentials): Observable<CurrentUser> {
    this.loading.set(true);
    this.pendingRegistration.set(false);

    return this.repository.login(credentials).pipe(
      tap(() => {
        // El backend ya fijó la cookie HttpOnly: aquí solo se reinicia el estado local.
        this.session.clear();
        this.context.clear();
        this.session.markIdentity();
      }),
      switchMap(() => this.loadUser().pipe(catchError((error: unknown) => throwError(() => this.explainRejectedCookie(error))))),
      tap(() => this.crossTab.publish('login')),
      finalize(() => this.loading.set(false)),
    );
  }

  /** Vuelve a consultar `/auth/me` (restaurar al arrancar, o tras aceptar una invitación). */
  refreshUser(): Observable<CurrentUser> {
    return this.loadUser();
  }

  /** Cierra la sesión: el backend borra la cookie; el estado local se limpia aunque la llamada falle. */
  logout(): void {
    this.repository
      .logout()
      .pipe(
        catchError(() => of(undefined)),
        finalize(() => {
          this.endLocalSession();
          this.crossTab.publish('logout');
        }),
      )
      .subscribe();
  }

  /** Otra pestaña cerró la sesión: se limpia el estado local sin volver a llamar al backend. */
  applyRemoteLogout(): void {
    this.endLocalSession();
  }

  /**
   * Login correcto seguido de 401 en `/auth/me`: el navegador no devolvió la cookie (Secure sobre http,
   * host distinto, cookies de terceros bloqueadas). Se explica en lugar de dejar un bucle de login.
   */
  private explainRejectedCookie(error: unknown): unknown {
    if (error instanceof AppError && error.status === 401) {
      return new AppError('unauthenticated', 'SESSION_NOT_SAVED', 401, ERROR_MESSAGES['SESSION_NOT_SAVED'], error.requestId);
    }
    return error;
  }

  private endLocalSession(): void {
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
          this.session.markIdentity();
          this.pendingRegistration.set(true);
        } else if (!this.session.isAuthenticated()) {
          this.session.clear();
        }
        return throwError(() => appError);
      }),
    );
  }
}
