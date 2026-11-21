import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { CommercialRelationship, Organization } from '../../domain/models/organization';
import { PlatformAdminMetrics } from '../../domain/models/platform';
import { HttpAdminMetricsRepository } from './http-admin-metrics.repository';
import { HttpOrganizationAdminRepository } from './http-identity.repositories';

const API = 'http://api.test/api/v1';
const ORG = {
  id: 'o-1', name: 'Acme', legal_name: 'Acme S.A.S.', tax_id: '900123456-7', is_active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', types: [{ code: 'CARRIER', name: 'Transportador' }],
};

describe('repositorios HTTP de administración de plataforma', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1' } },
        HttpOrganizationAdminRepository, HttpAdminMetricsRepository,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const repo = (): HttpOrganizationAdminRepository => TestBed.inject(HttpOrganizationAdminRepository);

  it('tipos: GET /organization-types', () => {
    let result: unknown;
    repo().listTypes().subscribe((r) => (result = r));
    http.expectOne(`${API}/organization-types`).flush({ data: [{ code: 'CARRIER', name: 'Transportador', description: null }], meta: {} });
    expect(result).toEqual([{ code: 'CARRIER', name: 'Transportador', description: null }]);
  });

  it('actualizar: PATCH solo con los campos presentes y null borra el valor', () => {
    repo().update('o-1', { taxId: null }).subscribe();
    const req = http.expectOne(`${API}/organizations/o-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ tax_id: null });
    req.flush({ data: ORG, meta: {} });
  });

  it('activar o desactivar: PATCH /status', () => {
    repo().setActive('o-1', false).subscribe();
    const req = http.expectOne(`${API}/organizations/o-1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ is_active: false });
    req.flush({ data: { ...ORG, is_active: false }, meta: {} });
  });

  it('tipos de una empresa: PUT reemplaza el conjunto completo', () => {
    repo().setTypes('o-1', ['CARRIER', 'SHIPPER']).subscribe();
    const req = http.expectOne(`${API}/organizations/o-1/types`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ type_codes: ['CARRIER', 'SHIPPER'] });
    req.flush({ data: ORG, meta: {} });
  });

  it('relaciones: GET y conversión de fechas', () => {
    let result: readonly CommercialRelationship[] = [];
    repo().relationships('o-1').subscribe((r) => (result = r));
    http.expectOne(`${API}/organizations/o-1/relationships`).flush({
      data: [{ id: 'r1', counterpart: { id: 'o-2', name: 'Beta' }, role: 'PROVIDER', relationship_type: 'TRANSPORT', start_date: '2026-03-01', end_date: null, is_active: true }],
      meta: {},
    });
    expect(result[0].role).toBe('PROVIDER');
    expect(result[0].startDate).toEqual(new Date('2026-03-01'));
    expect(result[0].endDate).toBeNull();
  });

  it('empresa sin `types` en la respuesta (backend anterior) se mapea a lista vacía', () => {
    let result: Organization | undefined;
    repo().update('o-1', { name: 'X' }).subscribe((r) => (result = r));
    const withoutTypes: Record<string, unknown> = { ...ORG };
    delete withoutTypes['types'];
    http.expectOne(`${API}/organizations/o-1`).flush({ data: withoutTypes, meta: {} });
    expect(result?.types).toEqual([]);
  });

  it('métricas: GET /platform/metrics y conversión a camelCase', () => {
    let result: PlatformAdminMetrics | undefined;
    TestBed.inject(HttpAdminMetricsRepository).get().subscribe((r) => (result = r));
    http.expectOne(`${API}/platform/metrics`).flush({
      data: {
        organizations: { total: 2, active: 1, inactive: 1, without_active_admin: 2, without_type: 0, by_type: [{ code: 'CARRIER', name: 'Transportador', count: 2 }] },
        users: { total: 1, active: 1 }, memberships: { pending: 0, active: 1 }, invitations: { pending: 3 }, generated_at: '2026-11-14T12:00:00Z',
      },
      meta: {},
    });
    expect(result?.organizations.withoutActiveAdmin).toBe(2);
    expect(result?.organizations.byType.length).toBe(1);
    expect(result?.generatedAt).toEqual(new Date('2026-11-14T12:00:00Z'));
  });
});
