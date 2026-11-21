import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { buildUser, FAKE_TOKEN } from '../../../testing/builders';
import { AuthToken, CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { AppError } from '../errors/app-error';
import { APP_CONFIG } from '../config/app-config';
import { AuthFacade } from './auth.facade';
import { RESTORE_TIMEOUT_MS, SessionPersistence } from './session-persistence';
import { SessionStore } from './session.store';

const KEY = 'logyco2.session';

class FakeAuthRepository extends AuthRepository {
  login = jasmine.createSpy('login').and.returnValue(of(FAKE_TOKEN) as Observable<AuthToken>);
  getCurrentUser = jasmine.createSpy('me').and.returnValue(of(buildUser()) as Observable<CurrentUser>);
}

describe('persistencia de sesión por pestaña', () => {
  let repo: FakeAuthRepository;

  function setup(mode?: 'memory' | 'tab'): SessionPersistence {
    repo = new FakeAuthRepository();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthRepository, useValue: repo },
        { provide: APP_CONFIG, useValue: { production: false, apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', sessionPersistence: mode } },
      ],
    });

    return TestBed.inject(SessionPersistence);
  }
  const stored = (): string | null => sessionStorage.getItem(KEY);
  const seed = (): void => sessionStorage.setItem(KEY, JSON.stringify(FAKE_TOKEN));

  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
  afterEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('por defecto (memory) no guarda nada y no restaura aunque haya algo almacenado', async () => {
    const persistence = setup();
    seed();

    TestBed.inject(SessionStore).setToken(FAKE_TOKEN);
    TestBed.tick();
    await persistence.restore();

    expect(persistence.enabled).toBeFalse();
    expect(TestBed.inject(SessionStore).isAuthenticated()).toBeFalse();
    expect(repo.getCurrentUser).not.toHaveBeenCalled();
  });

  it('con `tab` guarda SOLO el token, en sessionStorage y nunca en localStorage', () => {
    setup('tab');

    TestBed.inject(AuthFacade).login({ email: 'ana@example.com', password: 'secreto' }).subscribe();
    TestBed.tick();

    expect(Object.keys(JSON.parse(stored()!)).sort()).toEqual(['accessToken', 'expirationLabel', 'tokenType']);
    expect(stored()).not.toContain('secreto');
    expect(stored()).not.toContain('ana@example.com');
    expect(localStorage.length).toBe(0);
  });

  it('al recargar restaura la sesión revalidándola con /auth/me', async () => {
    const persistence = setup('tab');
    seed();

    await persistence.restore();

    const session = TestBed.inject(SessionStore);
    expect(repo.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(session.isAuthenticated()).toBeTrue();
    expect(session.authorizationHeader()).toBe('Bearer token-de-prueba');
    expect(session.user()?.email).toBe(buildUser().email); // el usuario sale del backend, no del almacenamiento
  });

  it('un token rechazado por el backend (401) se descarta y se borra del almacenamiento', async () => {
    const persistence = setup('tab');
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('unauthenticated', 'INVALID_TOKEN', 401, 'x')));
    seed();

    await persistence.restore();
    TestBed.tick();

    expect(TestBed.inject(SessionStore).hasToken()).toBeFalse();
    expect(stored()).toBeNull();
  });

  it('identidad válida sin usuario local conserva el token para aceptar la invitación', async () => {
    const persistence = setup('tab');
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('forbidden', 'USER_NOT_REGISTERED', 403, 'x')));
    seed();

    await persistence.restore();
    TestBed.tick();

    const session = TestBed.inject(SessionStore);
    expect(session.hasToken()).toBeTrue();
    expect(session.isAuthenticated()).toBeFalse();
    expect(TestBed.inject(AuthFacade).pendingRegistration()).toBeTrue();
    expect(stored()).not.toBeNull();
  });

  it('si el backend no responde a tiempo se descarta la sesión en lugar de bloquear el arranque', fakeAsync(() => {
    const persistence = setup('tab');
    repo.getCurrentUser.and.returnValue(NEVER);
    seed();

    let done = false;
    void persistence.restore().then(() => (done = true));
    tick(RESTORE_TIMEOUT_MS + 10);
    TestBed.tick();

    expect(done).toBeTrue();
    expect(TestBed.inject(SessionStore).hasToken()).toBeFalse();
    expect(stored()).toBeNull();
  }));

  it('un valor almacenado corrupto o con otra forma se ignora y se elimina', async () => {
    for (const bad of ['no-es-json', '{"accessToken":""}', '{"accessToken":1,"tokenType":"Bearer"}', '[]', 'null']) {
      TestBed.resetTestingModule();
      sessionStorage.setItem(KEY, bad);
      const persistence = setup('tab');

      await persistence.restore();

      expect(TestBed.inject(SessionStore).hasToken()).withContext(bad).toBeFalse();
      expect(stored()).withContext(bad).toBeNull();
    }
  });

  it('sin nada almacenado no hay petición ni sesión', async () => {
    const persistence = setup('tab');

    await persistence.restore();

    expect(repo.getCurrentUser).not.toHaveBeenCalled();
    expect(TestBed.inject(SessionStore).hasToken()).toBeFalse();
  });

  it('cerrar sesión borra el token del almacenamiento', () => {
    setup('tab');
    const facade = TestBed.inject(AuthFacade);
    facade.login({ email: 'ana@example.com', password: 'secreto' }).subscribe();
    TestBed.tick();
    expect(stored()).not.toBeNull();

    facade.logout();
    TestBed.tick();

    expect(stored()).toBeNull();
  });
});
