import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { PlatformAttention } from '../../domain/models/platform-admin';
import { HttpInsightsRepository, HttpRbacRepository, HttpSuperAdminsRepository } from './http-platform-admin.repositories';

const API = 'http://api.test/api/v1';

describe('repositorios HTTP de administración global (superadministradores, tendencias, RBAC)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1' } },
        HttpSuperAdminsRepository, HttpInsightsRepository, HttpRbacRepository,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const member = { user_id: 'u1', full_name: 'Ana', email: 'a@x.co', is_active: true, has_global_access: true, assigned_at: null, assigned_by_name: null, last_activity_at: null, is_self: true };
  const invitation = { id: 'i1', email: 'b@x.co', invitee_name: 'Beto', status: 'PENDING', invited_by_name: 'Ana', created_at: '2026-11-01T00:00:00Z', expires_at: '2026-11-08T00:00:00Z', accepted_at: null, revoked_at: null };

  it('superadministradores: GET /platform/super-admins y conversión (sin inventar fechas)', () => {
    let result: unknown;
    TestBed.inject(HttpSuperAdminsRepository).overview().subscribe((r) => (result = r));
    http.expectOne(`${API}/platform/super-admins`).flush({ data: { quota: { max_active: 5, active: 1, reserved_by_invitations: 0, available: 4, limit_reached: false }, members: [member], invitations: [invitation] } });

    const overview = result as { quota: { limitReached: boolean }; members: { assignedAt: Date | null; lastActivityAt: Date | null; isSelf: boolean }[]; invitations: { status: string; expiresAt: Date }[] };
    expect(overview.quota.limitReached).toBeFalse();
    expect(overview.members[0].assignedAt).toBeNull();
    expect(overview.members[0].lastActivityAt).toBeNull();
    expect(overview.invitations[0].expiresAt).toEqual(new Date('2026-11-08T00:00:00Z'));
  });

  it('un estado de invitación desconocido se trata como vencido, nunca como pendiente', () => {
    let status = '';
    TestBed.inject(HttpSuperAdminsRepository).revokeInvitation('i1').subscribe((r) => (status = r.status));
    http.expectOne(`${API}/platform/super-admins/invitations/i1/revoke`).flush({ data: { ...invitation, status: 'RARO' } });

    expect(status).toBe('EXPIRED');
  });

  it('invitar: POST con la confirmación explícita y devuelve el código una sola vez', () => {
    let code = '';
    TestBed.inject(HttpSuperAdminsRepository).invite({ fullName: 'Beto', email: 'b@x.co', expiresInDays: 7 }).subscribe((r) => (code = r.code));
    const request = http.expectOne(`${API}/platform/super-admins/invitations`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ full_name: 'Beto', email: 'b@x.co', expires_in_days: 7, confirm: true });
    request.flush({ data: { ...invitation, code: 'sa_abc' } });
    expect(code).toBe('sa_abc');
  });

  it('revocar el rol global: POST con confirm:true; aceptar: POST con el código', () => {
    const repo = TestBed.inject(HttpSuperAdminsRepository);
    let remaining = -1;
    repo.revoke('u 2').subscribe((r) => (remaining = r.remainingActive));
    const revoke = http.expectOne(`${API}/platform/super-admins/u%202/revoke`);
    expect(revoke.request.body).toEqual({ confirm: true });
    revoke.flush({ data: { user_id: 'u 2', role_code: 'SUPER_ADMIN', revoked: true, remaining_active: 3 } });
    expect(remaining).toBe(3);

    repo.accept('sa_xyz').subscribe();
    const accept = http.expectOne(`${API}/platform/super-admins/invitations/accept`);
    expect(accept.request.body).toEqual({ code: 'sa_xyz' });
    accept.flush({ data: { user_id: 'u3', role_code: 'SUPER_ADMIN', already_member: false } });
  });

  it('tendencias: usa `days` para ventanas fijas y date_from/date_to para un rango', () => {
    const repo = TestBed.inject(HttpInsightsRepository);
    const body = { period: { date_from: '2026-11-01', date_to: '2026-11-02', granularity: 'day', days: 2 }, summary: { organizations_created: 1, users_registered: 0, invitations_created: 0, admins_onboarded: 0, memberships_approved: 0, super_admins_granted: 0 }, points: [], audit_available_since: null };

    repo.trends({ kind: 'days', days: 7 }).subscribe();
    const fixed = http.expectOne((r) => r.url === `${API}/platform/metrics/trends`);
    expect([fixed.request.params.get('days'), fixed.request.params.get('date_from')]).toEqual(['7', null]);
    fixed.flush({ data: body });

    let granularity = '';
    repo.trends({ kind: 'custom', from: '2026-11-01', to: '2026-11-02' }).subscribe((t) => (granularity = t.period.granularity));
    const custom = http.expectOne((r) => r.url === `${API}/platform/metrics/trends`);
    expect([custom.request.params.get('date_from'), custom.request.params.get('date_to'), custom.request.params.get('days')]).toEqual(['2026-11-01', '2026-11-02', null]);
    custom.flush({ data: body });
    expect(granularity).toBe('day');
  });

  it('un backend anterior sin «has_pending_invitation» ni «organizations_waiting_admin»: ninguna se da por en espera', () => {
    const repo = TestBed.inject(HttpInsightsRepository);
    let attention: PlatformAttention | undefined;
    repo.attention().subscribe((a) => (attention = a));
    http.expectOne(`${API}/platform/attention`).flush({ data: {
      organizations_without_admin: { count: 1, items: [{ id: 'o1', name: 'ENVIA' }] }, inactive_organizations: { count: 0, items: [] },
      pending_memberships: { count: 0, items: [] }, invitations_expiring: { count: 0, items: [] },
      super_admins: { active: 1, max_active: 5, reserved_by_invitations: 0, available: 4 }, super_admin_near_limit: false, expiring_within_days: 3,
    } });

    expect(attention!.organizationsWithoutAdmin.items[0].hasPendingInvitation).toBeFalse(); // sin dato se asume que requiere acción
    expect(attention!.organizationsWaitingAdmin).toBe(0);
  });

  it('acciones pendientes y actividad se convierten a camelCase', () => {
    const repo = TestBed.inject(HttpInsightsRepository);
    let attention: PlatformAttention | undefined;
    repo.attention().subscribe((a) => (attention = a));
    http.expectOne(`${API}/platform/attention`).flush({ data: {
      organizations_without_admin: { count: 2, items: [{ id: 'o1', name: 'ENVIA', has_pending_invitation: false }, { id: 'o2', name: 'Coordinadora', has_pending_invitation: true }] },
      organizations_waiting_admin: 1, inactive_organizations: { count: 0, items: [] },
      pending_memberships: { count: 1, items: [{ membership_id: 'm', organization_id: 'o', organization_name: 'ENVIA', user_name: 'Luis' }] },
      invitations_expiring: { count: 0, items: [] }, super_admins: { active: 4, max_active: 5, reserved_by_invitations: 0, available: 1 },
      super_admin_near_limit: true, expiring_within_days: 3,
    } });
    expect(attention!.pendingMemberships.items[0].userName).toBe('Luis');
    expect(attention!.organizationsWithoutAdmin.items.map((o) => o.hasPendingInvitation)).toEqual([false, true]);
    expect(attention!.organizationsWaitingAdmin).toBe(1);
    expect(attention!.superAdminNearLimit).toBeTrue();

    let actor = '';
    repo.activity({ limit: 5, days: 30, organizationId: 'o1' }).subscribe((items) => (actor = items[0].actorName ?? ''));
    const request = http.expectOne((r) => r.url === `${API}/platform/activity`);
    expect([request.request.params.get('limit'), request.request.params.get('days'), request.request.params.get('organization_id')]).toEqual(['5', '30', 'o1']);
    request.flush({ data: { items: [{ id: 'e', occurred_at: '2026-11-14T00:00:00Z', action: 'organization.create', actor_name: 'Ana', target_name: null, organization_name: 'ENVIA', channel: 'api', details: {} }] } });
    expect(actor).toBe('Ana');
  });

  it('audit() pide una página por cursor con sus filtros y omite los vacíos', () => {
    const repo = TestBed.inject(HttpInsightsRepository);
    let result: { total: number | null; capped: boolean; next: string | null; first: string } | undefined;
    repo.audit({ pageSize: 50, cursor: 'c-1' }, { days: 30, category: 'access', channel: 'operator', query: ' ana ', organizationId: 'o1' }).subscribe((r) => (result = { total: r.total, capped: r.totalCapped, next: r.nextCursor, first: r.items[0].action }));
    const request = http.expectOne((r) => r.url === `${API}/platform/audit`);
    const params = request.request.params;

    expect(['page_size', 'cursor', 'days', 'category', 'channel', 'q', 'organization_id'].map((key) => params.get(key))).toEqual(['50', 'c-1', '30', 'access', 'operator', 'ana', 'o1']);
    expect(['page', 'date_from', 'date_to'].some((key) => params.has(key))).toBeFalse();
    request.flush({
      data: [{ id: 'e', occurred_at: '2026-11-14T00:00:00Z', action: 'user.update', actor_name: 'Ana', target_name: null, organization_name: null, channel: 'api', details: {} }],
      meta: { page_size: 50, has_more: true, next_cursor: 'c-2', total: 10000, total_capped: true },
    });
    expect(result).toEqual({ total: 10000, capped: true, next: 'c-2', first: 'user.update' });

    repo.audit({ pageSize: 25 }, { dateFrom: '2026-11-01', dateTo: '2026-11-15' }).subscribe();
    const range = http.expectOne((r) => r.url === `${API}/platform/audit`);
    expect([range.request.params.get('date_from'), range.request.params.get('date_to')]).toEqual(['2026-11-01', '2026-11-15']);
    expect(['cursor', 'days', 'q'].some((key) => range.request.params.has(key))).toBeFalse();
    range.flush({ data: [], meta: { page_size: 25, has_more: false, next_cursor: null, total: 0, total_capped: false } });
  });

  it('auditEvent() pide el detalle de un evento y lo convierte', () => {
    const repo = TestBed.inject(HttpInsightsRepository);
    let detail: { target: string | null; role: unknown } | undefined;
    repo.auditEvent('e 1').subscribe((d) => (detail = { target: d.targetId, role: d.details['role'] }));
    http.expectOne(`${API}/platform/audit/e%201`).flush({
      data: { id: 'e 1', occurred_at: '2026-11-14T00:00:00Z', action: 'invitation.create', actor_name: 'Ana', target_name: null, organization_name: 'ENVIA', channel: 'api', details: { role: 'ADMIN' }, target_id: 't1' },
      meta: {},
    });
    expect(detail).toEqual({ target: 't1', role: 'ADMIN' });
  });

  it('RBAC: catálogo de solo lectura y asignaciones paginadas', () => {
    const repo = TestBed.inject(HttpRbacRepository);
    let permissions: readonly string[] = [];
    repo.catalog().subscribe((c) => (permissions = c.roles[0].permissions));
    http.expectOne(`${API}/rbac/catalog`).flush({ data: { roles: [{ code: 'ORG_ADMIN', name: 'Admin', description: null, scope: 'ORGANIZATION', is_active: true, permissions: ['users:read'], assignments: 2, effective_assignments: 1 }], permissions: [] } });
    expect(permissions).toEqual(['users:read']);

    let total = 0;
    repo.assignments('ORG_ADMIN', { page: 2, pageSize: 10 }).subscribe((p) => (total = p.total));
    const request = http.expectOne((r) => r.url === `${API}/rbac/roles/ORG_ADMIN/assignments`);
    expect([request.request.params.get('page'), request.request.params.get('page_size')]).toEqual(['2', '10']);
    request.flush({ data: [], meta: { pagination: { page: 2, page_size: 10, total: 11, total_pages: 2, has_next: false, has_previous: true } } });
    expect(total).toBe(11);
  });
});
