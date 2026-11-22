import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { EmissionsFacade } from './emissions.facade';
import { API, catalogDto, fuelsDto, simulationDto } from './emissions.fixtures';

describe('EmissionsFacade', () => {
  let http: HttpTestingController;
  let facade: EmissionsFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    facade = TestBed.inject(EmissionsFacade);
  });
  afterEach(() => http.verify());

  it('carga el catálogo, el factor y la simulación en recursos separados', () => {
    facade.loadVehicles();
    facade.loadFuels();
    facade.simulate({ fuelCode: 'DIESEL_B2', distanceKm: 300, efficiency: 10 });
    http.expectOne(`${API}/vehicles`).flush({ data: catalogDto(), meta: {} });
    http.expectOne(`${API}/reference/fuels`).flush({ data: fuelsDto(), meta: {} });
    http.expectOne(`${API}/simulate`).flush({ data: simulationDto(), meta: {} });

    expect(facade.vehicles.status()).toBe('ready');
    expect(facade.fuels.data()!.length).toBe(3);
    expect(facade.simulation.data()!.volume).toBe('30.0000');
  });

  it('un 422 de la simulación queda como error con mensaje en español y sin datos nuevos', () => {
    facade.simulate({ fuelCode: 'DIESEL_B2', distanceKm: 300, efficiency: 10 });
    http.expectOne(`${API}/simulate`).flush({ error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 'body.distance_km', type: 'less_than_equal' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.simulation.status()).toBe('error');
    expect(facade.simulation.error()!.kind).toBe('validation');
    expect(facade.simulation.error()!.message).toBe('Revisa los datos ingresados: hay campos inválidos.');
  });

  it('el factor mostrado es el combustible elegido y, sin elección, el primero del servidor', () => {
    facade.loadFuels();
    http.expectOne(`${API}/reference/fuels`).flush({ data: fuelsDto(), meta: {} });

    expect(facade.factor()!.fuelCode).toBe('DIESEL_B2');
    facade.fuelCode.set('NATURAL_GAS');
    expect(facade.factor()!.unit).toBe('kg_CO2/m3');
    facade.fuelCode.set('NO_EXISTE');
    expect(facade.factor()!.fuelCode).toBe('DIESEL_B2');
  });
});
