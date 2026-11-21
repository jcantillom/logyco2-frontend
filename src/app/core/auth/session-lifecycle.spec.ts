import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { buildUser, FAKE_TOKEN } from '../../../testing/builders';
import { AuthToken, CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { authGuard } from '../guards/auth.guards';
import { AuthFacade } from './auth.facade';
import { SessionStore } from './session.store';

class FakeAuthRepository extends AuthRepository {
  login = jasmine.createSpy('login').and.returnValue(of(FAKE_TOKEN) as Observable<AuthToken>);
  getCurrentUser = jasmine.createSpy('me').and.returnValue(of(buildUser()) as Observable<CurrentUser>);
}

/**
 * Documenta con pruebas el ciclo de vida REAL de la sesión con el backend actual:
 * el Bearer token vive solo en memoria (no hay cookie HttpOnly ni refresh token).
 */
describe('ciclo de vida de la sesión', () => {
  const state = { url: '/reportes' } as RouterStateSnapshot;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthRepository, useClass: FakeAuthRepository }, { provide: Router, useValue: { createUrlTree: (c: unknown[], e?: object) => ({ c, e }), serializeUrl: () => '', navigate: () => Promise.resolve(true) } }],
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('tras iniciar sesión el token NO se escribe en ningún almacenamiento del navegador', () => {
    TestBed.inject(AuthFacade).login({ email: 'ana@example.com', password: 'secreto' }).subscribe();

    expect(TestBed.inject(SessionStore).authorizationHeader()).toBe('Bearer token-de-prueba');
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain('token-de-prueba');
    expect(stored).not.toContain('secreto');
  });

  it('recargar la página: la aplicación arranca sin sesión y el guard conserva la ruta pedida', () => {
    TestBed.inject(AuthFacade).login({ email: 'ana@example.com', password: 'secreto' }).subscribe();
    expect(TestBed.inject(SessionStore).isAuthenticated()).toBeTrue();

    // Una recarga destruye el árbol de inyección y crea uno nuevo (estado en memoria perdido).
    const reloaded = Injector.create({ providers: [{ provide: SessionStore, useClass: SessionStore }, { provide: Router, useValue: TestBed.inject(Router) }], parent: undefined });
    const result = runInInjectionContext(reloaded, () => authGuard({} as ActivatedRouteSnapshot, state));

    expect(runInInjectionContext(reloaded, () => reloaded.get(SessionStore).hasToken())).toBeFalse();
    expect(result as unknown as { c: unknown[]; e: { queryParams: { returnUrl: string } } }).toEqual(
      jasmine.objectContaining({ c: ['/login'], e: { queryParams: { returnUrl: '/reportes' } } }),
    );
    expect(result instanceof UrlTree).toBeFalse(); // el Router de prueba devuelve un marcador, no un UrlTree real
  });

  it('una pestaña nueva tiene su propio estado: no hereda la sesión de otra', () => {
    TestBed.inject(AuthFacade).login({ email: 'ana@example.com', password: 'secreto' }).subscribe();
    const otherTab = new SessionStore();
    expect(otherTab.hasToken()).toBeFalse();
  });

  it('cierre de sesión voluntario: borra token y usuario', () => {
    const facade = TestBed.inject(AuthFacade);
    const session = TestBed.inject(SessionStore);
    facade.login({ email: 'ana@example.com', password: 'secreto' }).subscribe();

    facade.logout();

    expect(session.hasToken()).toBeFalse();
    expect(session.user()).toBeNull();
    expect(session.authorizationHeader()).toBeNull();
  });
});
