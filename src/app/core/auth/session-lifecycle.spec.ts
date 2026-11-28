import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { buildUser } from '../../../testing/builders';
import { CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { AuthFacade } from './auth.facade';
import { SessionStore } from './session.store';

class FakeAuthRepository extends AuthRepository {
  login = jasmine.createSpy('login').and.returnValue(of(undefined) as Observable<void>);
  logout = jasmine.createSpy('logout').and.returnValue(of(undefined) as Observable<void>);
  getCurrentUser = jasmine.createSpy('me').and.returnValue(of(buildUser()) as Observable<CurrentUser>);
}

/** Ciclo de vida de la sesión con cookie HttpOnly: la aplicación nunca ve ni guarda el token. */
describe('ciclo de vida de la sesión', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthRepository, useClass: FakeAuthRepository }, { provide: Router, useValue: { navigate: () => Promise.resolve(true) } }],
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('tras iniciar sesión no hay token en memoria ni en ningún almacenamiento del navegador', () => {
    TestBed.inject(AuthFacade).login({ email: 'ana@example.com', password: 'secreto' }).subscribe();

    const session = TestBed.inject(SessionStore);
    expect(session.isAuthenticated()).toBeTrue();
    expect(Object.keys(session)).not.toContain('token');
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain('secreto');
    expect(stored).not.toContain('ana@example.com');
  });

  it('una pestaña nueva arranca vacía: la sesión se recupera preguntando al backend, no del navegador', () => {
    TestBed.inject(AuthFacade).login({ email: 'ana@example.com', password: 'secreto' }).subscribe();

    const otherTab = new SessionStore();

    expect(otherTab.hasIdentity()).toBeFalse();
    expect(otherTab.expiresAt()).toBeNull();
  });

  it('la caducidad de la sesión sale de /auth/me', () => {
    const store = new SessionStore();
    store.setUser(buildUser({ sessionExpiresAt: '2026-11-27T20:00:00Z' }));

    expect(store.expiresAt()?.toISOString()).toBe('2026-11-27T20:00:00.000Z');
  });

  it('cierre de sesión voluntario: pide al backend borrar la cookie y limpia el estado', () => {
    const facade = TestBed.inject(AuthFacade);
    const session = TestBed.inject(SessionStore);
    facade.login({ email: 'ana@example.com', password: 'secreto' }).subscribe();

    facade.logout();

    expect((TestBed.inject(AuthRepository) as FakeAuthRepository).logout).toHaveBeenCalledTimes(1);
    expect(session.hasIdentity()).toBeFalse();
    expect(session.user()).toBeNull();
  });
});
