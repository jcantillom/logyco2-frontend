import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { SessionStore } from '../auth/session.store';
import { authGuard, guestGuard, permissionGuard, tokenGuard } from './auth.guards';

const route = {} as ActivatedRouteSnapshot;
const state = { url: '/reportes' } as RouterStateSnapshot;

function run(guard: ReturnType<typeof permissionGuard>): boolean | UrlTree {
  return TestBed.runInInjectionContext(() => guard(route, state)) as boolean | UrlTree;
}

describe('guards de rutas', () => {
  let session: SessionStore;
  let router: Router;

  beforeEach(() => {
    session = TestBed.inject(SessionStore);
    router = TestBed.inject(Router);
  });

  it('authGuard: sin sesión redirige a /login conservando returnUrl', () => {
    const result = run(authGuard) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/login?returnUrl=%2Freportes');
  });

  it('authGuard: con sesión completa permite', () => {
    session.markIdentity();
    session.setUser(buildUser());
    expect(run(authGuard)).toBeTrue();
  });

  it('authGuard: token sin usuario local lleva al flujo de invitación', () => {
    session.markIdentity();
    expect(router.serializeUrl(run(authGuard) as UrlTree)).toBe('/aceptar-invitacion');
  });

  it('guestGuard: con sesión envía al destino por defecto; sin sesión permite el login', () => {
    expect(run(guestGuard)).toBeTrue();
    session.markIdentity();
    session.setUser(buildUser());
    expect(router.serializeUrl(run(guestGuard) as UrlTree)).toBe('/resumen');
  });

  it('tokenGuard: exige token', () => {
    expect(router.serializeUrl(run(tokenGuard) as UrlTree)).toBe('/login');
    session.markIdentity();
    expect(run(tokenGuard)).toBeTrue();
  });

  describe('permissionGuard', () => {
    it('permite con el permiso requerido', () => {
      session.markIdentity();
      session.setUser(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ANALYST'])] }));
      expect(run(permissionGuard('imports:create'))).toBeTrue();
    });

    it('redirige a /acceso-denegado sin el permiso', () => {
      session.markIdentity();
      session.setUser(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }));
      expect(router.serializeUrl(run(permissionGuard('imports:create')) as UrlTree)).toBe('/acceso-denegado');
    });

    it('vehicles:read: la ven los roles de la empresa y no el SUPER_ADMIN', () => {
      session.markIdentity();
      session.setUser(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }));
      expect(run(permissionGuard('vehicles:read'))).toBeTrue();

      session.setUser(buildUser({ globalRoles: [{ code: 'SUPER_ADMIN', name: 'x' }], memberships: [] }));
      expect(router.serializeUrl(run(permissionGuard('vehicles:read')) as UrlTree)).toBe('/acceso-denegado');
    });

    it('organizations:manage («Cálculo de emisiones» de la empresa): lo pasa ORG_ADMIN y se niega a ORG_ANALYST, ORG_VIEWER y GUILD_VIEWER', () => {
      session.markIdentity();
      session.setUser(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }));
      expect(run(permissionGuard('organizations:manage'))).toBeTrue();

      for (const role of ['ORG_ANALYST', 'ORG_VIEWER', 'GUILD_VIEWER']) {
        session.setUser(buildUser({ memberships: [membership(ORG_ENVIA, [role])] }));
        expect(router.serializeUrl(run(permissionGuard('organizations:manage')) as UrlTree)).withContext(role).toBe('/acceso-denegado');
      }
    });

    it('acepta cualquiera de varios permisos', () => {
      session.markIdentity();
      session.setUser(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }));
      expect(run(permissionGuard('users:read', 'memberships:manage'))).toBeTrue();
    });
  });
});
