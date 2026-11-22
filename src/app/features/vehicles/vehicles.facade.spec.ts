import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody, summaryDto, vehicleDetailDto, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { catalogDto } from '../emissions/emissions.fixtures';
import { VehiclesFacade } from './vehicles.facade';

describe('VehiclesFacade', () => {
  let facade: VehiclesFacade;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(VehiclesFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide el resumen y la lista de la empresa activa', () => {
    facade.loadSummary();
    facade.loadList();

    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles` && r.params.get('page') === '1' && r.params.get('page_size') === '10').flush(pagedBody([vehicleDto()]));

    expect(facade.summary.data()?.registered).toBe(12);
    expect(facade.list.data()?.items.length).toBe(1);
  });

  it('un filtro nuevo vuelve a la primera página; cambiar de página conserva el filtro', () => {
    facade.loadList({ page: 3 });
    http.expectOne((r) => r.params.get('page') === '3').flush(pagedBody([], 0));

    facade.loadList({ filter: { search: 'abc', status: 'INACTIVE' } });
    const filtered = http.expectOne((r) => r.params.get('search') === 'abc');
    expect(filtered.request.params.get('page')).toBe('1');
    expect(filtered.request.params.get('status')).toBe('INACTIVE');
    filtered.flush(pagedBody([], 0));

    facade.loadList({ page: 2 });
    const next = http.expectOne((r) => r.params.get('page') === '2');
    expect(next.request.params.get('search')).toBe('abc');
    next.flush(pagedBody([], 0));
  });

  it('al cambiar de empresa descarta datos, filtro y página, y descarta la respuesta tardía de la anterior', () => {
    facade.loadSummary();
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    facade.loadList({ filter: { search: 'abc' }, page: 2 });
    const late = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`);

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.summary.data()).toBeNull();
    expect(facade.list.status()).toBe('idle');
    expect(facade.filter()).toEqual({});
    expect(facade.page()).toBe(1);

    expect(late.cancelled).toBeTrue();
    expect(facade.list.data()).toBeNull();

    facade.loadSummary();
    http.expectOne(`http://api.test/api/v1/organizations/${ORG_COORDINADORA.id}/vehicles/summary`).flush({ data: summaryDto });
  });

  it('el catálogo de configuraciones sale de la guía de emisiones existente', () => {
    facade.loadCatalog();

    http.expectOne('http://api.test/api/v1/emissions/vehicles').flush({ data: catalogDto() });

    expect(facade.catalog.data()?.items.some((v) => v.code === 'C2')).toBeTrue();
  });

  it('crear refresca el resumen y la lista; editar además recarga el detalle abierto', () => {
    let created = '';
    facade.create({ plate: 'ABC123' }).subscribe((v) => (created = v.plate));
    http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` }).flush({ data: vehicleDto() });
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    expect(created).toBe('ABC123');
    expect(facade.summary.data()?.registered).toBe(12);
    expect(facade.list.data()?.total).toBe(1);

    facade.loadDetail('veh-1');
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto() });

    facade.update('veh-1', { fuelType: 'DIESEL' }).subscribe();
    http.expectOne({ method: 'PATCH', url: `${VEHICLES_ORG_URL}/vehicles/veh-1` }).flush({ data: vehicleDto() });
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    http.expectOne({ method: 'GET', url: `${VEHICLES_ORG_URL}/vehicles/veh-1` }).flush({ data: vehicleDetailDto({ model_year: 2024 }) });

    expect(facade.detail.data()?.modelYear).toBe(2024);
  });
});
