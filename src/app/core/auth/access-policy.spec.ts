import { TestBed } from '@angular/core/testing';
import { buildUser, FAKE_TOKEN, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { OrganizationContext } from '../org/organization-context';
import { AccessPolicy } from './access-policy';
import { SessionStore } from './session.store';

describe('AccessPolicy (pistas de interfaz, no autorización)', () => {
  let session: SessionStore;
  let policy: AccessPolicy;

  function signIn(overrides: Parameters<typeof buildUser>[0]): void {
    session.setToken(FAKE_TOKEN);
    session.setUser(buildUser(overrides));
  }

  beforeEach(() => {
    session = TestBed.inject(SessionStore);
    policy = TestBed.inject(AccessPolicy);
  });

  it('ORG_ADMIN puede importar, ver reportes y administrar membresías', () => {
    signIn({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] });
    expect(policy.can('imports:create')).toBeTrue();
    expect(policy.can('reports:read')).toBeTrue();
    expect(policy.can('memberships:manage')).toBeTrue();
  });

  it('ORG_VIEWER solo consulta: no importa ni administra', () => {
    signIn({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] });
    expect(policy.can('indicators:read')).toBeTrue();
    expect(policy.can('imports:create')).toBeFalse();
    expect(policy.can('memberships:manage')).toBeFalse();
    expect(policy.can('reports:download')).toBeFalse();
  });

  it('GUILD_VIEWER no ve datos de la empresa', () => {
    signIn({ memberships: [membership(ORG_ENVIA, ['GUILD_VIEWER'])] });
    expect(policy.can('indicators:read')).toBeFalse();
    expect(policy.can('organizations:read')).toBeFalse();
    expect(policy.can('sector_reports:read')).toBeTrue();
  });

  it('SUPER_ADMIN administra la plataforma pero NO obtiene datos confidenciales', () => {
    signIn({ globalRoles: [{ code: 'SUPER_ADMIN', name: 'x' }], memberships: [] });
    expect(policy.can('organizations:manage')).toBeTrue();
    expect(policy.can('users:read')).toBeTrue();
    expect(policy.can('indicators:read')).toBeFalse();
    expect(policy.can('reports:read')).toBeFalse();
    expect(policy.can('imports:create')).toBeFalse();
  });

  it('los permisos siguen a la empresa activa, no a la unión de todas', () => {
    signIn({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_VIEWER'])] });
    expect(policy.can('imports:create')).toBeTrue();

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(policy.can('imports:create')).toBeFalse();
  });

  it('sin sesión no hay permisos; una lista vacía no restringe', () => {
    expect(policy.can('organizations:read')).toBeFalse();
    expect(policy.canAny([])).toBeTrue();
  });
});
