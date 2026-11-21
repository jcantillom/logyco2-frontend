import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { buildSuperAdmin, buildUser, FAKE_TOKEN, membership, ORG_ENVIA } from '../../../testing/builders';
import { CurrentUser } from '../../domain/models/identity';
import { SessionStore } from '../auth/session.store';
import { guestGuard } from './auth.guards';
import { homeGuard, workspaceGuard } from './landing.guards';

describe('guards de aterrizaje', () => {
  let router: Router;
  const as = (user: CurrentUser): void => {
    const session = TestBed.inject(SessionStore);
    session.setToken(FAKE_TOKEN);
    session.setUser(user);
  };
  const run = (guard: CanActivateFn): string | true => {
    const result = TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as boolean | UrlTree;
    return result === true ? true : router.serializeUrl(result as UrlTree);
  };

  beforeEach(() => {
    router = TestBed.inject(Router);
  });

  it('homeGuard: SUPER_ADMIN sin membresías → /plataforma/resumen', () => {
    as(buildSuperAdmin());
    expect(run(homeGuard)).toBe('/plataforma/resumen');
  });
  it('homeGuard: ORG_ADMIN → /inicio', () => {
    as(buildUser());
    expect(run(homeGuard)).toBe('/resumen');
  });
  it('homeGuard: sin roles ni membresías → /acceso-pendiente', () => {
    as(buildUser({ memberships: [] }));
    expect(run(homeGuard)).toBe('/acceso-pendiente');
  });
  it('workspaceGuard: SUPER_ADMIN sin membresías es redirigido a /plataforma/resumen', () => {
    as(buildSuperAdmin());
    expect(run(workspaceGuard)).toBe('/plataforma/resumen');
  });
  it('workspaceGuard: SUPER_ADMIN con membresía puede entrar al espacio de forma explícita', () => {
    as(buildSuperAdmin({ memberships: [membership(ORG_ENVIA)] }));
    expect(run(workspaceGuard)).toBe(true);
  });
  it('workspaceGuard: usuario sin roles ni membresías → /acceso-pendiente (sin bucle)', () => {
    as(buildUser({ memberships: [] }));
    expect(run(workspaceGuard)).toBe('/acceso-pendiente');
  });
  it('guestGuard: con sesión de SUPER_ADMIN, /login lleva a la consola global', () => {
    as(buildSuperAdmin());
    expect(run(guestGuard)).toBe('/plataforma/resumen');
  });
});
