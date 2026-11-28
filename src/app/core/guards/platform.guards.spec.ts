import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, CanMatchFn, Route, Router, RouterStateSnapshot, UrlSegment, UrlTree } from '@angular/router';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { buildSuperAdmin, buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { AppError } from '../errors/app-error';
import { SessionStore } from '../auth/session.store';
import { platformGuard, platformMatch } from './platform.guards';

class FakeAuthRepository extends AuthRepository {
  me = jasmine.createSpy('me').and.returnValue(of(buildSuperAdmin()) as Observable<CurrentUser>);
  login(): Observable<void> { return of(undefined); }
  logout(): Observable<void> { return of(undefined); }
  getCurrentUser(): Observable<CurrentUser> { return this.me(); }
}

describe('guards de la consola de plataforma', () => {
  let repo: FakeAuthRepository;
  let router: Router;
  let session: SessionStore;

  const runMatch = (): boolean | UrlTree =>
    TestBed.runInInjectionContext(() => (platformMatch as CanMatchFn)({} as Route, [] as UrlSegment[])) as boolean | UrlTree;
  const runGuard = async (): Promise<boolean | UrlTree> => {
    const result = TestBed.runInInjectionContext(() => (platformGuard as CanActivateFn)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    return isObservable(result) ? firstValueFrom(result as Observable<boolean | UrlTree>) : (result as boolean | UrlTree);
  };
  const url = (tree: boolean | UrlTree): string => router.serializeUrl(tree as UrlTree);

  beforeEach(() => {
    repo = new FakeAuthRepository();
    TestBed.configureTestingModule({ providers: [{ provide: AuthRepository, useValue: repo }] });
    router = TestBed.inject(Router);
    session = TestBed.inject(SessionStore);
    session.markIdentity();
  });

  describe('platformMatch (filtro síncrono)', () => {
    it('sin sesión deja pasar para que authGuard redirija al login con la ruta', () => {
      session.clear();
      expect(runMatch()).toBeTrue();
    });
    it('un ORG_ADMIN con roles por empresa NO obtiene acceso global', () => {
      session.setUser(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }));
      expect(url(runMatch())).toBe('/acceso-denegado');
    });
    it('un SUPER_ADMIN informado por /auth/me pasa el filtro', () => {
      session.setUser(buildSuperAdmin());
      expect(runMatch()).toBeTrue();
    });
    it('un usuario inactivo con el rol no pasa', () => {
      session.setUser(buildSuperAdmin({ isActive: false }));
      expect(url(runMatch())).toBe('/acceso-denegado');
    });
  });

  describe('platformGuard (confirmación real con /auth/me)', () => {
    it('concede el acceso solo si la consulta fresca confirma SUPER_ADMIN', async () => {
      session.setUser(buildSuperAdmin());
      expect(await runGuard()).toBeTrue();
      expect(repo.me).toHaveBeenCalledTimes(1);
    });

    it('si el rol fue revocado en el servidor, deniega aunque la sesión local lo tuviera', async () => {
      session.setUser(buildSuperAdmin());
      repo.me.and.returnValue(of(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] })));
      expect(url(await runGuard())).toBe('/acceso-denegado');
    });

    it('un fallo de red o servidor NO se interpreta como autorización', async () => {
      session.setUser(buildSuperAdmin());
      repo.me.and.returnValue(throwError(() => new AppError('server', 'INTERNAL_ERROR', 500, 'x')));
      expect(url(await runGuard())).toBe('/acceso-denegado');
    });

    it('un 401 (sesión caducada) deniega', async () => {
      session.setUser(buildSuperAdmin());
      repo.me.and.returnValue(throwError(() => new AppError('unauthenticated', 'INVALID_TOKEN', 401, 'x')));
      expect(url(await runGuard())).toBe('/acceso-denegado');
    });

    it('una respuesta sin roles globales (incompleta) deniega', async () => {
      repo.me.and.returnValue(of(buildUser({ globalRoles: [] })));
      expect(url(await runGuard())).toBe('/acceso-denegado');
    });

    it('un usuario inactivo con rol SUPER_ADMIN en la respuesta deniega', async () => {
      repo.me.and.returnValue(of(buildSuperAdmin({ isActive: false })));
      expect(url(await runGuard())).toBe('/acceso-denegado');
    });

    it('usuario no registrado localmente (USER_NOT_REGISTERED) deniega', async () => {
      repo.me.and.returnValue(throwError(() => new AppError('forbidden', 'USER_NOT_REGISTERED', 403, 'x')));
      expect(url(await runGuard())).toBe('/acceso-denegado');
    });
  });
});
