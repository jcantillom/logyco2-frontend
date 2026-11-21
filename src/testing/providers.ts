import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { Observable, NEVER } from 'rxjs';
import { APP_CONFIG } from '../app/core/config/app-config';
import { SessionStore } from '../app/core/auth/session.store';
import { AuthToken, CurrentUser } from '../app/domain/models/identity';
import { AuthRepository } from '../app/domain/repositories/identity.repositories';
import { provideRepositories } from '../app/infrastructure/providers';
import { buildUser, FAKE_TOKEN } from './builders';

export class StubAuthRepository extends AuthRepository {
  login(): Observable<AuthToken> {
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
    { provide: APP_CONFIG, useValue: { production: false, apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1' } },
    provideRepositories(),
    { provide: AuthRepository, useClass: StubAuthRepository },
  ];
}

export function signInAs(user: CurrentUser = buildUser(), session: SessionStore): void {
  session.setToken(FAKE_TOKEN);
  session.setUser(user);
}
