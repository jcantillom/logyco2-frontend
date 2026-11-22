import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { pagedBody, summaryDto, vehicleDetailDto, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { PlatformVehiclesRepository, VehiclesRepository } from '../../domain/repositories/vehicles.repositories';

const ORG = ORG_ENVIA.id;

describe('HttpVehiclesRepository', () => {
  let repo: VehiclesRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(VehiclesRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('el origen IMPORT se conserva y uno desconocido se trata como registro manual', () => {
    const sources: string[] = [];
    repo.get(ORG, 'a').subscribe((v) => sources.push(v.source));
    repo.get(ORG, 'b').subscribe((v) => sources.push(v.source));

    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/a`).flush({ data: vehicleDetailDto({ source: 'IMPORT' }) });
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/b`).flush({ data: vehicleDetailDto({ source: 'OTRO' }) });

    expect(sources).toEqual(['IMPORT', 'MANUAL']);
  });

  it('summary: GET con la empresa en la ruta', () => {
    let result: unknown;
    repo.summary(ORG).subscribe((v) => (result = v));

    const req = http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: summaryDto });

    expect(result).toEqual({ registered: 12, inactive: 1 });
  });

  it('list: envía página, tamaño y filtros; omite los vacíos y mapea la página', () => {
    let total = 0;
    repo.list(ORG, { page: 2, pageSize: 10 }, { search: ' abc ', status: 'ACTIVE', configuration: 'C2', fuel: '' }).subscribe((p) => (total = p.total));

    const req = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('page_size')).toBe('10');
    expect(req.request.params.get('search')).toBe('abc');
    expect(req.request.params.get('status')).toBe('ACTIVE');
    expect(req.request.params.get('configuration')).toBe('C2');
    expect(req.request.params.has('fuel')).toBeFalse();
    req.flush(pagedBody([vehicleDto()], 21, 10, 2));

    expect(total).toBe(21);
  });

  it('get: detalle con historial y archivos', () => {
    let history = 0;
    repo.get(ORG, 'veh-1').subscribe((d) => (history = d.history.length));

    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto() });

    expect(history).toBe(2);
  });

  it('create: POST /vehicles con el cuerpo del contrato', () => {
    repo.create(ORG, { plate: ' abc123 ', configurationCode: 'C2', capacityTons: 8 }).subscribe();

    const req = http.expectOne(`${VEHICLES_ORG_URL}/vehicles`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ plate: 'abc123', configuration_code: 'C2', capacity_tons: 8 });
    req.flush({ data: vehicleDto() });
  });

  it('update: PATCH con confirm_structural', () => {
    repo.update(ORG, 'veh-1', { configurationCode: 'C3', confirmStructural: true }).subscribe();

    const req = http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ configuration_code: 'C3', confirm_structural: true });
    req.flush({ data: vehicleDto() });
  });

  it('el identificador de la empresa se codifica en la ruta', () => {
    let registered = 0;
    repo.summary('a/b').subscribe((summary) => (registered = summary.registered));

    http.expectOne('http://api.test/api/v1/organizations/a%2Fb/vehicles/summary').flush({ data: summaryDto });
    expect(registered).toBe(12);
  });
});

describe('HttpPlatformVehiclesRepository', () => {
  let repo: PlatformVehiclesRepository;
  let http: HttpTestingController;
  const BASE = `http://api.test/api/v1/platform/organizations/${ORG}/vehicles`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(PlatformVehiclesRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('summary: GET /platform/organizations/{id}/vehicles/summary', () => {
    let result: unknown;
    repo.summary(ORG).subscribe((v) => (result = v));

    const req = http.expectOne(`${BASE}/summary`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: summaryDto });
    expect(result).toEqual({ registered: 12, inactive: 1 });
  });

  it('list: la empresa va en la ruta y se envían página, tamaño y filtros', () => {
    let total = 0;
    repo.list(ORG, { page: 3, pageSize: 10 }, { search: ' abc ', status: 'INACTIVE', configuration: 'C2', fuel: 'DIESEL' }).subscribe((p) => (total = p.total));

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('page_size')).toBe('10');
    expect(req.request.params.get('search')).toBe('abc');
    expect(req.request.params.get('status')).toBe('INACTIVE');
    expect(req.request.params.get('configuration')).toBe('C2');
    expect(req.request.params.get('fuel')).toBe('DIESEL');
    req.flush(pagedBody([vehicleDto()], 21, 10, 3));
    expect(total).toBe(21);
  });

  it('get: detalle con historial y archivos', () => {
    let entries = 0;
    repo.get(ORG, 'veh-1').subscribe((d) => (entries = d.history.length));

    http.expectOne(`${BASE}/veh-1`).flush({ data: vehicleDetailDto() });
    expect(entries).toBe(2);
  });

  it('solo lee: no expone creación ni edición', () => {
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter((n) => n !== 'constructor').sort()).toEqual(['get', 'list', 'summary']);
  });
});
