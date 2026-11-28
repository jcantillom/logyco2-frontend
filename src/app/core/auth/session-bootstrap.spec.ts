import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, NEVER, of, throwError } from 'rxjs';
import { buildUser } from '../../../testing/builders';
import { CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { AppError } from '../errors/app-error';
import { AuthFacade } from './auth.facade';
import { CrossTabSession, SessionSignal } from './cross-tab-session';
import { SessionBootstrap } from './session-bootstrap';
import { SessionStore } from './session.store';

class FakeAuthRepository extends AuthRepository {
  login = jasmine.createSpy('login').and.returnValue(of(undefined) as Observable<void>);
  logout = jasmine.createSpy('logout').and.returnValue(of(undefined) as Observable<void>);
  getCurrentUser = jasmine.createSpy('me').and.callFake((): Observable<CurrentUser> => of(buildUser()));
}

describe('SessionBootstrap', () => {
  let repo: FakeAuthRepository;
  let router: jasmine.SpyObj<Router>;
  let remote: (signal: SessionSignal) => void;
  let session: SessionStore;

  beforeEach(() => {
    repo = new FakeAuthRepository();
    router = jasmine.createSpyObj<Router>('Router', ['navigate', 'navigateByUrl'], { url: '/login' });
    router.navigate.and.resolveTo(true);
    router.navigateByUrl.and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [{ provide: AuthRepository, useValue: repo }, { provide: Router, useValue: router }] });
    spyOn(TestBed.inject(CrossTabSession), 'listen').and.callFake((handler) => (remote = handler));
    session = TestBed.inject(SessionStore);
  });

  it('restaura la sesión desde /auth/me (cookie) sin tocar ningún almacenamiento', async () => {
    await TestBed.inject(SessionBootstrap).restore();

    expect(repo.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(session.isAuthenticated()).toBeTrue();
    expect(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).not.toContain('Ana');
  });

  it('sin sesión (401): arranca sin sesión y no lanza', async () => {
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('unauthenticated', 'MISSING_TOKEN', 401, 'x')));

    await expectAsync(TestBed.inject(SessionBootstrap).restore()).toBeResolved();

    expect(session.hasIdentity()).toBeFalse();
  });

  it('identidad válida sin usuario local: conserva la identidad para aceptar la invitación', async () => {
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('forbidden', 'USER_NOT_REGISTERED', 403, 'x')));

    await TestBed.inject(SessionBootstrap).restore();

    expect(session.hasIdentity()).toBeTrue();
    expect(session.isAuthenticated()).toBeFalse();
    expect(TestBed.inject(AuthFacade).pendingRegistration()).toBeTrue();
  });

  it('error de red o 5xx: arranca sin sesión', async () => {
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('server', 'INTERNAL_ERROR', 500, 'x')));

    await expectAsync(TestBed.inject(SessionBootstrap).restore()).toBeResolved();

    expect(session.isAuthenticated()).toBeFalse();
  });

  it('si el backend no responde, el arranque no se bloquea (tiempo agotado)', async () => {
    jasmine.clock().install();
    repo.getCurrentUser.and.returnValue(NEVER);

    const restored = TestBed.inject(SessionBootstrap).restore();
    jasmine.clock().tick(5001);
    await expectAsync(restored).toBeResolved();

    jasmine.clock().uninstall();
    expect(session.isAuthenticated()).toBeFalse();
  });

  describe('sincronización entre pestañas', () => {
    beforeEach(async () => {
      await TestBed.inject(SessionBootstrap).restore();
    });

    it('logout en otra pestaña: esta pestaña limpia su sesión y va a /login', () => {
      expect(session.isAuthenticated()).toBeTrue();

      remote('logout');

      expect(session.hasIdentity()).toBeFalse();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      expect(repo.logout).not.toHaveBeenCalled();
    });

    it('login en otra pestaña: una pestaña en /login recupera la sesión y entra', () => {
      session.clear();
      repo.getCurrentUser.calls.reset();

      remote('login');

      expect(repo.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(session.isAuthenticated()).toBeTrue();
      expect(router.navigateByUrl).toHaveBeenCalled();
    });

    it('login en otra pestaña con sesión ya activa: no hace nada', () => {
      repo.getCurrentUser.calls.reset();

      remote('login');

      expect(repo.getCurrentUser).not.toHaveBeenCalled();
    });

    it('logout remoto sin sesión local: no navega', () => {
      session.clear();

      remote('logout');

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
