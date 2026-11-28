import { TestBed } from '@angular/core/testing';
import { buildSuperAdmin, buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { CurrentUser } from '../../domain/models/identity';
import { LandingPolicy, PENDING_ACCESS, PLATFORM_HOME, WORKSPACE_HOME } from './landing-policy';
import { SessionStore } from './session.store';

describe('LandingPolicy', () => {
  let policy: LandingPolicy;
  const as = (user: CurrentUser): void => {
    const session = TestBed.inject(SessionStore);
    session.markIdentity();
    session.setUser(user);
  };

  beforeEach(() => {
    policy = TestBed.inject(LandingPolicy);
  });

  describe('home()', () => {
    it('SUPER_ADMIN sin membresías → consola global', () => {
      as(buildSuperAdmin());
      expect(policy.home()).toBe(PLATFORM_HOME);
    });
    it('SUPER_ADMIN con membresías → consola global por defecto', () => {
      as(buildSuperAdmin({ memberships: [membership(ORG_ENVIA)] }));
      expect(policy.home()).toBe(PLATFORM_HOME);
    });
    it('rol global revocado (solo membresías) → espacio de empresa', () => {
      as(buildUser());
      expect(policy.home()).toBe(WORKSPACE_HOME);
    });
    it('SUPER_ADMIN inactivo no cuenta como global', () => {
      as(buildSuperAdmin({ isActive: false, memberships: [] }));
      expect(policy.home()).toBe(PENDING_ACCESS);
    });
    it('sin roles ni membresías → acceso pendiente', () => {
      as(buildUser({ memberships: [] }));
      expect(policy.home()).toBe(PENDING_ACCESS);
    });
  });

  describe('resolve(returnUrl)', () => {
    it('sin returnUrl usa el destino por defecto', () => {
      as(buildSuperAdmin());
      expect(policy.resolve(null)).toBe(PLATFORM_HOME);
    });
    it('un returnUrl genérico (/inicio, /) no desplaza al SUPER_ADMIN de su consola', () => {
      as(buildSuperAdmin({ memberships: [membership(ORG_ENVIA)] }));
      expect(policy.resolve('/resumen')).toBe(PLATFORM_HOME);
      expect(policy.resolve('/')).toBe(PLATFORM_HOME);
    });
    it('respeta una ruta global autorizada, con su query', () => {
      as(buildSuperAdmin());
      expect(policy.resolve('/plataforma/usuarios?q=a')).toBe('/plataforma/usuarios?q=a');
    });
    it('un usuario sin rol global no puede aterrizar en /plataforma', () => {
      as(buildUser());
      expect(policy.resolve('/plataforma/resumen')).toBe(WORKSPACE_HOME);
    });
    it('un SUPER_ADMIN sin membresías no aterriza en una ruta empresarial', () => {
      as(buildSuperAdmin());
      expect(policy.resolve('/reportes')).toBe(PLATFORM_HOME);
    });
    it('respeta una ruta empresarial si hay membresía', () => {
      as(buildUser());
      expect(policy.resolve('/reportes')).toBe('/reportes');
    });
    it('rechaza URLs externas, protocolo relativo y /login', () => {
      as(buildUser());
      expect(policy.resolve('https://evil.example')).toBe(WORKSPACE_HOME);
      expect(policy.resolve('//evil.example')).toBe(WORKSPACE_HOME);
      for (const hostile of ['/\\evil.example', '/\\/evil.example', '/%5Cevil.example', '/%5cevil.example', '/%2F/evil.example', '/%2f%2fevil.example', '/a\\b', '/ok%0d%0aSet-Cookie', '/%E0%A4%A', '\\evil.example', '/\tevil']) {
        expect(policy.resolve(hostile)).withContext(hostile).toBe(WORKSPACE_HOME);
      }
      expect(policy.resolve('/login')).toBe(WORKSPACE_HOME);
    });
  });
});
