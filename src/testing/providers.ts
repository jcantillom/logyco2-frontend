import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { Observable, NEVER } from 'rxjs';
import { APP_CONFIG } from '../app/core/config/app-config';
import { SessionStore } from '../app/core/auth/session.store';
import { CurrentUser } from '../app/domain/models/identity';
import { AuthRepository } from '../app/domain/repositories/identity.repositories';
import { provideRepositories } from '../app/infrastructure/providers';
import { buildUser } from './builders';

export class StubAuthRepository extends AuthRepository {
  login(): Observable<void> {
    return NEVER;
  }
  logout(): Observable<void> {
    return NEVER;
  }
  getCurrentUser(): Observable<CurrentUser> {
    return NEVER;
  }
}

/** Entorno de pruebas con los repositorios reales de la app (HTTP simulado). */
export function provideTestApp(options: { routes?: Routes } = {}): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter(options.routes ?? []),
    { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1' } },
    provideRepositories(),
    { provide: AuthRepository, useClass: StubAuthRepository },
  ];
}

export function signInAs(user: CurrentUser = buildUser(), session: SessionStore): void {
  session.markIdentity();
  session.setUser(user);
}
