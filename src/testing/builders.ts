import { CurrentUser, Membership } from '../app/domain/models/identity';

export const ORG_ENVIA = { id: '11111111-1111-4111-8111-111111111111', name: 'ENVIA' };
export const ORG_COORDINADORA = { id: '22222222-2222-4222-8222-222222222222', name: 'Coordinadora' };

export function membership(
  organization: { id: string; name: string },
  roleCodes: string[] = ['ORG_ADMIN'],
): Membership {
  return {
    membershipId: `m-${organization.id.slice(0, 4)}`,
    organization,
    roles: roleCodes.map((code) => ({ code, name: code })),
  };
}

export function buildUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    fullName: 'Ana Prueba',
    email: 'ana@example.com',
    isActive: true,
    globalRoles: [],
    memberships: [membership(ORG_ENVIA), membership(ORG_COORDINADORA, ['ORG_VIEWER'])],
    ...overrides,
  };
}

export function buildSuperAdmin(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return buildUser({ fullName: 'Admin Plataforma', email: 'admin@example.com', globalRoles: [{ code: 'SUPER_ADMIN', name: 'Superadministrador' }], memberships: [], ...overrides });
}
