import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestApp } from '../../../testing/providers';
import { EmissionsRepository } from '../../domain/repositories/emissions.repositories';
import { API, catalogDto, fuelsDto, simulationDto } from '../../features/emissions/emissions.fixtures';

describe('HttpEmissionsRepository', () => {
  let http: HttpTestingController;
  let repository: EmissionsRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(EmissionsRepository);
  });
  afterEach(() => http.verify());

  it('vehicles pide GET /emissions/vehicles y entrega el modelo de dominio', () => {
    let items = 0;
    repository.vehicles().subscribe((catalog) => (items = catalog.items.length));
    const request = http.expectOne(`${API}/vehicles`);
    request.flush({ data: catalogDto(), meta: {} });

    expect(request.request.method).toBe('GET');
    expect(items).toBeGreaterThan(0);
  });

  it('fuels pide GET /emissions/reference/fuels y entrega los tres combustibles en orden', () => {
    let codes: string[] = [];
    repository.fuels().subscribe((fuels) => (codes = fuels.map((f) => f.fuelCode)));
    const request = http.expectOne(`${API}/reference/fuels`);
    request.flush({ data: fuelsDto(), meta: {} });

    expect(request.request.method).toBe('GET');
    expect(codes).toEqual(['DIESEL_B2', 'GASOLINE_MOTOR', 'NATURAL_GAS']);
  });

  it('simulate envía POST /emissions/simulate con fuel_code, distance_km y efficiency', () => {
    let volume = '';
    repository.simulate({ fuelCode: 'NATURAL_GAS', distanceKm: 300, efficiency: 10 }).subscribe((result) => (volume = result.volume));
    const request = http.expectOne(`${API}/simulate`);
    request.flush({ data: simulationDto(), meta: {} });

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ fuel_code: 'NATURAL_GAS', distance_km: 300, efficiency: 10 });
    expect(volume).toBe('30.0000');
  });
});
