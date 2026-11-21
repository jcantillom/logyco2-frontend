import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import {
  HttpAuthRepository,
  HttpInvitationsRepository,
  HttpMembershipsRepository,
  HttpOrganizationsRepository,
  HttpUsersRepository,
} from './http-identity.repositories';

const API = 'http://api.test/api/v1';

describe('repositorios HTTP de identidad', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { production: false, apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1' } },
        HttpAuthRepository, HttpOrganizationsRepository, HttpUsersRepository, HttpInvitationsRepository, HttpMembershipsRepository,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login: POST /auth/login con email y password y desenvuelve {data}', () => {
    let result: unknown;
    TestBed.inject(HttpAuthRepository).login({ email: 'a@b.co', password: 's3cret' }).subscribe((r) => (result = r));

    const req = http.expectOne(`${API}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'a@b.co', password: 's3cret' });
    req.flush({ data: { access_token: 'tok', token_type: 'Bearer', expiration_time_utc_bogota: null }, meta: { request_id: 'r' } });

    expect(result).toEqual({ accessToken: 'tok', tokenType: 'Bearer', expirationLabel: null });
  });

  it('getCurrentUser: GET /auth/me', () => {
    let name = '';
    TestBed.inject(HttpAuthRepository).getCurrentUser().subscribe((u) => (name = u.fullName));

    http.expectOne(`${API}/auth/me`).flush({
      data: { id: 'u', full_name: 'Ana', email: 'a@b.co', is_active: true, global_roles: [], memberships: [] },
      meta: {},
    });
    expect(name).toBe('Ana');
  });

  it('empresas: lista paginada con page y page_size', () => {
    let total = -1;
    TestBed.inject(HttpOrganizationsRepository).list({ page: 2, pageSize: 10 }).subscribe((p) => (total = p.total));

    const req = http.expectOne((r) => r.url === `${API}/organizations`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('page_size')).toBe('10');
    req.flush({ data: [], meta: { pagination: { page: 2, page_size: 10, total: 11, total_pages: 2, has_next: false, has_previous: true } } });
    expect(total).toBe(11);
  });

  it('empresas: detalle por id', () => {
    TestBed.inject(HttpOrganizationsRepository).get('abc').subscribe();
    const req = http.expectOne(`${API}/organizations/abc`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: { id: 'abc', name: 'N', legal_name: null, tax_id: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }, meta: {} });
  });

  it('usuarios: GET /users paginado', () => {
    let total = -1;
    TestBed.inject(HttpUsersRepository).list({ page: 1, pageSize: 20 }).subscribe((p) => (total = p.total));
    const req = http.expectOne((r) => r.url === `${API}/users`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], meta: { pagination: { page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false, has_previous: false } } });
    expect(total).toBe(0);
  });

  it('usuarios: los criterios viajan en snake_case y los vacíos se omiten', () => {
    TestBed.inject(HttpUsersRepository)
      .list({ page: 2, pageSize: 50 }, { search: ' ana ', organizationId: 'o1', membershipStatus: 'PENDING', role: '', personType: 'org_admin', isActive: false })
      .subscribe();
    const { params } = http.expectOne((r) => r.url === `${API}/users`).request;
    expect(params.get('page')).toBe('2');
    expect(params.get('search')).toBe('ana');
    expect(params.get('organization_id')).toBe('o1');
    expect(params.get('membership_status')).toBe('PENDING');
    expect(params.get('classification')).toBe('org_admin');
    expect(params.get('status')).toBe('inactive');
    expect(params.has('role')).toBeFalse();
  });

  it('invitaciones: crear envía snake_case y omite opcionales vacíos', () => {
    let code = '';
    TestBed.inject(HttpInvitationsRepository)
      .create({ organizationId: 'o1', email: 'x@y.co', roleCode: 'ORG_VIEWER' })
      .subscribe((created) => (code = created.code));

    const req = http.expectOne(`${API}/users/invitations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ organization_id: 'o1', email: 'x@y.co', role_code: 'ORG_VIEWER' });
    req.flush({
      data: { id: 'i1', organization: { id: 'o1', name: 'O' }, email: 'x@y.co', invitee_name: null, role_code: 'ORG_VIEWER', status: 'PENDING', expires_at: '2026-12-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', accepted_at: null, code: 'CODIGO-UNICO' },
      meta: {},
    });
    expect(code).toBe('CODIGO-UNICO');
  });

  it('invitaciones: listar filtra por estado y empresa', () => {
    TestBed.inject(HttpInvitationsRepository).list({ page: 1, pageSize: 20 }, { organizationId: 'o1', status: 'PENDING' }).subscribe();
    const req = http.expectOne((r) => r.url === `${API}/users/invitations`);
    expect(req.request.params.get('organization_id')).toBe('o1');
    expect(req.request.params.get('status')).toBe('PENDING');
    req.flush({ data: [], meta: { pagination: { page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false, has_previous: false } } });
  });

  it('invitaciones: revocar y aceptar usan los endpoints del backend', () => {
    const repo = TestBed.inject(HttpInvitationsRepository);
    repo.revoke('inv-1').subscribe();
    expect(http.expectOne(`${API}/users/invitations/inv-1/revoke`).request.method).toBe('POST');

    repo.accept('codigo-de-invitacion-0123456789').subscribe();
    const accept = http.expectOne(`${API}/users/invitations/accept`);
    expect(accept.request.body).toEqual({ code: 'codigo-de-invitacion-0123456789' });
  });

  it('membresías: PATCH con el nuevo estado', () => {
    TestBed.inject(HttpMembershipsRepository).changeStatus('org-1', 'mem-1', 'SUSPENDED').subscribe();
    const req = http.expectOne(`${API}/organizations/org-1/memberships/mem-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'SUSPENDED' });
  });
});
