import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buildUser } from '../../../testing/builders';
import { CurrentUser, LoginCredentials } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { AppError } from '../errors/app-error';
import { OrganizationContext } from '../org/organization-context';
import { AuthFacade } from './auth.facade';
import { CrossTabSession } from './cross-tab-session';
import { SessionStore } from './session.store';

class FakeAuthRepository extends AuthRepository {
  login = jasmine.createSpy('login').and.callFake((): Observable<void> => of(undefined));
  logout = jasmine.createSpy('logout').and.callFake((): Observable<void> => of(undefined));
  getCurrentUser = jasmine.createSpy('me').and.callFake((): Observable<CurrentUser> => of(buildUser()));
}

describe('AuthFacade', () => {
  let repo: FakeAuthRepository;
  let facade: AuthFacade;
  let session: SessionStore;
  let router: jasmine.SpyObj<Router>;
  const credentials: LoginCredentials = { email: 'ana@example.com', password: 'secreto' };

  beforeEach(() => {
    repo = new FakeAuthRepository();
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthRepository, useValue: repo }, { provide: Router, useValue: router }],
    });
    facade = TestBed.inject(AuthFacade);
    session = TestBed.inject(SessionStore);
  });

  it('login correcto: guarda token, carga /me y deja la sesión autenticada', () => {
    let user: CurrentUser | undefined;
    facade.login(credentials).subscribe((u) => (user = u));

    expect(repo.login).toHaveBeenCalledWith(credentials);
    expect(session.isAuthenticated()).toBeTrue();
    expect(session.hasIdentity()).toBeTrue();
    expect(user?.memberships.length).toBe(2);
    expect(facade.loading()).toBeFalse();
  });

  it('credenciales incorrectas: propaga el error y no deja sesión', () => {
    repo.login.and.returnValue(throwError(() => new AppError('unauthenticated', 'INVALID_CREDENTIALS', 401, 'x')));
    let error: AppError | undefined;
    facade.login(credentials).subscribe({ error: (e) => (error = e) });

    expect(error?.code).toBe('INVALID_CREDENTIALS');
    expect(session.hasIdentity()).toBeFalse();
    expect(facade.loading()).toBeFalse();
  });

  it('identidad válida sin usuario local: conserva el token solo para aceptar invitación', () => {
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('forbidden', 'USER_NOT_REGISTERED', 403, 'x')));
    facade.login(credentials).subscribe({ error: () => undefined });

    expect(facade.pendingRegistration()).toBeTrue();
    expect(session.hasIdentity()).toBeTrue();
    expect(session.isAuthenticated()).toBeFalse();
  });

  it('si /me falla por otra causa, descarta el token', () => {
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('server', 'INTERNAL_ERROR', 500, 'x')));
    facade.login(credentials).subscribe({ error: () => undefined });

    expect(session.hasIdentity()).toBeFalse();
    expect(facade.pendingRegistration()).toBeFalse();
  });

  it('logout: limpia sesión y contexto de empresa y vuelve a /login', () => {
    facade.login(credentials).subscribe();
    const context = TestBed.inject(OrganizationContext);
    expect(context.activeOrganizationId()).not.toBeNull();

    facade.logout();

    expect(session.hasIdentity()).toBeFalse();
    expect(session.user()).toBeNull();
    expect(context.activeOrganizationId()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('login correcto pero /auth/me responde 401: explica que el navegador rechazó la cookie y no deja sesión', () => {
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('unauthenticated', 'MISSING_TOKEN', 401, 'x')));
    let error: AppError | undefined;

    facade.login(credentials).subscribe({ error: (e) => (error = e) });

    expect(error?.code).toBe('SESSION_NOT_SAVED');
    expect(error?.message).toContain('La sesión no se guardó');
    expect(session.hasIdentity()).toBeFalse();
    expect(facade.loading()).toBeFalse();
  });

  it('logout: aunque el backend falle, el estado local se limpia', () => {
    repo.logout.and.returnValue(throwError(() => new AppError('server', 'INTERNAL_ERROR', 500, 'x')));
    facade.login(credentials).subscribe();

    facade.logout();

    expect(repo.logout).toHaveBeenCalled();
    expect(session.hasIdentity()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('cierre remoto (otra pestaña): limpia y va a /login sin volver a llamar al backend', () => {
    facade.login(credentials).subscribe();

    facade.applyRemoteLogout();

    expect(repo.logout).not.toHaveBeenCalled();
    expect(session.hasIdentity()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('login y logout avisan a las demás pestañas', () => {
    const crossTab = TestBed.inject(CrossTabSession);
    const publish = spyOn(crossTab, 'publish');

    facade.login(credentials).subscribe();
    facade.logout();

    expect(publish.calls.allArgs()).toEqual([['login'], ['logout']]);
  });

  it('un login nuevo reemplaza la empresa seleccionada por el usuario anterior', () => {
    facade.login(credentials).subscribe();
    const context = TestBed.inject(OrganizationContext);
    const second = context.memberships()[1].organization.id;
    context.select(second);
    expect(context.activeOrganizationId()).toBe(second);

    facade.login(credentials).subscribe();

    expect(context.activeOrganizationId()).toBe(context.memberships()[0].organization.id);
  });
});
