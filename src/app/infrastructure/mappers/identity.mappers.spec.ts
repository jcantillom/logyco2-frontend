import { PaginatedResponseDto } from '../../core/http/api-envelope';
import { MeResponseDto, UserSummaryDto } from '../dto/identity.dto';
import {
  toAuthToken,
  toCurrentUser,
  toInvitation,
  toManagedUser,
  toOrganization,
  toPage,
} from './identity.mappers';

describe('mapeadores de identidad (DTO → dominio)', () => {
  it('toAuthToken conserva solo lo necesario', () => {
    expect(toAuthToken({ access_token: 'abc', token_type: 'Bearer', expiration_time_utc_bogota: '2026-11-14T10:00:00' })).toEqual({
      accessToken: 'abc',
      tokenType: 'Bearer',
      expirationLabel: '2026-11-14T10:00:00',
    });
  });

  it('toCurrentUser convierte snake_case a camelCase', () => {
    const dto: MeResponseDto = {
      id: 'u1',
      full_name: 'Ana Prueba',
      email: 'ana@example.com',
      is_active: true,
      global_roles: [{ code: 'SUPER_ADMIN', name: 'Superadministrador' }],
      memberships: [{ membership_id: 'm1', organization: { id: 'o1', name: 'ENVIA' }, roles: [{ code: 'ORG_ADMIN', name: 'Admin' }] }],
    };

    const user = toCurrentUser(dto);

    expect(user.fullName).toBe('Ana Prueba');
    expect(user.globalRoles[0].code).toBe('SUPER_ADMIN');
    expect(user.memberships[0].membershipId).toBe('m1');
    expect(user.memberships[0].organization.name).toBe('ENVIA');
  });

  it('toOrganization convierte fechas ISO a Date', () => {
    const org = toOrganization({ id: 'o1', name: 'ENVIA', legal_name: null, tax_id: '900', is_active: true, created_at: '2026-11-13T10:00:00Z', updated_at: '2026-11-14T10:00:00Z' });
    expect(org.createdAt).toBeInstanceOf(Date);
    expect(org.legalName).toBeNull();
    expect(org.taxId).toBe('900');
  });

  it('un estado de membresía desconocido nunca se trata como activo', () => {
    const dto: UserSummaryDto = {
      id: 'u2', full_name: 'X', email: 'x@example.com', is_active: true,
      memberships: [{ membership_id: 'm', organization: { id: 'o', name: 'O' }, status: 'ALGO_NUEVO', roles: [] }],
    };
    expect(toManagedUser(dto).memberships[0].status).toBe('REVOKED');
  });

  it('la empresa de cada membresía trae la versión de su logo; sin ella (backend anterior) queda en null', () => {
    const dto: UserSummaryDto = {
      id: 'u3', full_name: 'Y', email: 'y@example.com', is_active: true,
      memberships: [
        { membership_id: 'm1', organization: { id: 'o1', name: 'Con logo', logo_version: 'abc123' }, status: 'ACTIVE', roles: [] },
        { membership_id: 'm2', organization: { id: 'o2', name: 'Sin logo', logo_version: null }, status: 'ACTIVE', roles: [] },
        { membership_id: 'm3', organization: { id: 'o3', name: 'Backend anterior' }, status: 'ACTIVE', roles: [] },
      ],
    };
    const [withLogo, withoutLogo, legacy] = toManagedUser(dto).memberships.map((m) => m.organization);

    expect(withLogo).toEqual({ id: 'o1', name: 'Con logo', logoVersion: 'abc123' });
    expect(withoutLogo.logoVersion).toBeNull();
    expect(legacy.logoVersion).toBeNull();
  });

  it('un estado de invitación desconocido se trata como expirado', () => {
    const invitation = toInvitation({
      id: 'i', organization: { id: 'o', name: 'O' }, email: 'a@b.co', invitee_name: null, role_code: 'ORG_VIEWER',
      status: 'RARO', expires_at: '2026-12-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', accepted_at: null,
    });
    expect(invitation.status).toBe('EXPIRED');
    expect(invitation.acceptedAt).toBeNull();
  });

  it('toPage mapea los metadatos de paginación', () => {
    const response: PaginatedResponseDto<{ id: string }> = {
      data: [{ id: 'a' }, { id: 'b' }],
      meta: { request_id: 'r', pagination: { page: 2, page_size: 20, total: 45, total_pages: 3, has_next: true, has_previous: true } },
    };

    const page = toPage(response, (dto) => dto.id.toUpperCase());

    expect(page.items).toEqual(['A', 'B']);
    expect(page).toEqual(jasmine.objectContaining({ page: 2, pageSize: 20, total: 45, totalPages: 3, hasNext: true, hasPrevious: true }));
  });
});
