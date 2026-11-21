import { TestBed } from '@angular/core/testing';
import { buildSuperAdmin, buildUser, FAKE_TOKEN, membership, ORG_ENVIA } from '../../../testing/builders';
import { PlatformAccess, hasSuperAdminRole } from './platform-access';
import { SessionStore } from './session.store';

describe('hasSuperAdminRole / PlatformAccess', () => {
  it('solo el rol GLOBAL SUPER_ADMIN activo cuenta', () => {
    expect(hasSuperAdminRole(buildSuperAdmin())).toBeTrue();
    expect(hasSuperAdminRole(buildSuperAdmin({ isActive: false }))).toBeFalse();
  });
  it('ORG_ADMIN (rol por empresa) no es administrador de plataforma', () => {
    expect(hasSuperAdminRole(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }))).toBeFalse();
  });
  it('un rol global distinto de SUPER_ADMIN no concede el acceso', () => {
    expect(hasSuperAdminRole(buildUser({ globalRoles: [{ code: 'OTRO_GLOBAL', name: 'x' }] }))).toBeFalse();
  });
  it('sin usuario (null/undefined) = sin acceso', () => {
    expect(hasSuperAdminRole(null)).toBeFalse();
    expect(hasSuperAdminRole(undefined)).toBeFalse();
  });
  it('PlatformAccess sigue a la sesión y no depende de la empresa activa', () => {
    const session = TestBed.inject(SessionStore);
    const access = TestBed.inject(PlatformAccess);
    session.setToken(FAKE_TOKEN);
    session.setUser(buildSuperAdmin());
    expect(access.isSuperAdmin()).toBeTrue();
    session.setUser(buildUser());
    expect(access.isSuperAdmin()).toBeFalse();
    session.clear();
    expect(access.isSuperAdmin()).toBeFalse();
  });
});
