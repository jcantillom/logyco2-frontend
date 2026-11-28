import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { EFFICIENCY_URL, apiError, appliedDto, declareOutDto, recordDto, viewDto } from '../../../testing/vehicle-efficiency';
import { pagedBody, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { EfficiencyDeclaration } from '../../domain/models/vehicle-efficiency';
import { VehicleEfficiencyFacade } from './vehicle-efficiency.facade';

const DECLARATION: EfficiencyDeclaration = { value: '6.9', unit: 'km/gal', origin: 'DECLARED', basis: 'THEORETICAL', note: null, measuredOn: null };

describe('VehicleEfficiencyFacade', () => {
  let facade: VehicleEfficiencyFacade;
  let http: HttpTestingController;

  function setup(roles: string[] = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(VehicleEfficiencyFacade);
    http = TestBed.inject(HttpTestingController);
  }

  const open = (view = viewDto()): void => {
    facade.open('veh-1');
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: view });
  };
  /** Tras declarar se vuelve a pedir la historia y la lista del inventario (para que muestre el valor nuevo). */
  const refreshes = (view = viewDto()): void => {
    http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'GET').flush({ data: view });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
  };
  const put = () => http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'PUT');

  afterEach(() => http.verify());

  it('abre el vehículo: pide la primera página de 5 y expone lo vigente y las unidades del servidor', () => {
    setup();
    facade.open('veh-1');
    const req = http.expectOne((r) => r.url === EFFICIENCY_URL());

    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('page_size')).toBe('5');
    req.flush({ data: viewDto() });

    expect(facade.view.data()?.compatibleUnits).toEqual(['km/gal', 'km/l']);
    expect(facade.view.data()?.current?.value).toBe(6.9);
  });

  it('cambiar de página pide esa página', () => {
    setup();
    open();
    facade.loadHistory(2);
    const req = http.expectOne((r) => r.url === EFFICIENCY_URL());

    expect(req.request.params.get('page')).toBe('2');
    req.flush({ data: viewDto() });
    expect(facade.page()).toBe(2);
  });

  it('declarar: envía la declaración, muestra lo que el servidor recalculó y refresca la historia y el inventario', () => {
    setup();
    open();
    facade.declare(DECLARATION);

    expect(facade.busy()).toBeTrue();
    const req = put();

    expect(req.request.body).toEqual({ value: '6.9', unit: 'km/gal', origin: 'DECLARED', basis: 'THEORETICAL' });
    req.flush({ data: declareOutDto({ applied_to_pending: appliedDto({ trips_recalculated: 40, still_pending: 2, stale_calculated_trips: 7 }) }) });
    refreshes();

    expect(facade.busy()).toBeFalse();
    expect(facade.outcome()).toEqual(jasmine.objectContaining({ changed: true, recalculated: 40 }));
    expect(facade.outcome()?.applied).toEqual(jasmine.objectContaining({ stillPending: 2, staleCalculatedTrips: 7, remaining: 0 }));
  });

  it('con remaining > 0 «Continuar» repite la MISMA declaración y acumula lo recalculado; changed sigue siendo el de la primera llamada', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    put().flush({ data: declareOutDto({ applied_to_pending: appliedDto({ trips_recalculated: 20000, remaining: 5000 }) }) });
    refreshes();

    expect(facade.outcome()?.applied.remaining).toBe(5000);

    facade.continue();
    const again = put();

    expect(again.request.body).toEqual({ value: '6.9', unit: 'km/gal', origin: 'DECLARED', basis: 'THEORETICAL' });
    again.flush({ data: declareOutDto({ changed: false, applied_to_pending: appliedDto({ trips_recalculated: 5000, remaining: 0 }) }) });
    refreshes();

    expect(facade.outcome()).toEqual(jasmine.objectContaining({ changed: true, recalculated: 25000 }));
    expect(facade.outcome()?.applied.remaining).toBe(0);
  });

  it('«Continuar» que no recalcula nada y deja el mismo remaining se marca como estancado (no avanza)', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    put().flush({ data: declareOutDto({ applied_to_pending: appliedDto({ trips_recalculated: 10, remaining: 500 }) }) });
    refreshes();
    expect(facade.outcome()?.stalled).toBeFalse();

    facade.continue();
    put().flush({ data: declareOutDto({ changed: false, applied_to_pending: appliedDto({ trips_recalculated: 0, remaining: 500 }) }) });
    refreshes();

    expect(facade.outcome()?.stalled).toBeTrue();
  });

  it('sin permiso de administrar no se envía ninguna declaración', () => {
    setup(['ORG_VIEWER']);
    open();
    facade.declare(DECLARATION);

    expect(facade.busy()).toBeFalse();
    http.expectNone((r) => r.method === 'PUT');
  });

  it('el mismo valor ya vigente se dice «sin cambios» (changed = false)', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    put().flush({ data: declareOutDto({ changed: false, applied_to_pending: appliedDto({ trips_recalculated: 0, still_pending: 0 }) }) });
    refreshes();

    expect(facade.outcome()?.changed).toBeFalse();
  });

  it('solo se envía una declaración a la vez', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    facade.declare(DECLARATION);

    expect(http.match((r) => r.method === 'PUT').length).toBe(1);
  });

  it('COMPANY_BUSY: muestra el aviso y «Reintentar» repite lo mismo sin pedir nada nuevo a la persona', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    put().flush(apiError('COMPANY_BUSY'), { status: 409, statusText: 'Conflict' });

    expect(facade.busy()).toBeFalse();
    expect(facade.error()?.code).toBe('COMPANY_BUSY');
    expect(facade.error()?.message).toContain('carga procesándose');
    expect(facade.outcome()).toBeNull();

    facade.retry();
    expect(facade.error()).toBeNull();
    const again = put();

    expect(again.request.body.value).toBe('6.9');
    again.flush({ data: declareOutDto() });
    refreshes();

    expect(facade.outcome()?.changed).toBeTrue();
  });

  it('EFFICIENCY_CONFLICT: recarga lo vigente para que la persona vea qué quedó', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    put().flush(apiError('EFFICIENCY_CONFLICT'), { status: 409, statusText: 'Conflict' });

    expect(facade.error()?.code).toBe('EFFICIENCY_CONFLICT');
    http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'GET').flush({ data: viewDto({}, [recordDto({ value: '8.000000' })]) });
    expect(facade.view.data()?.current?.value).toBe(8);
  });

  it('INVALID_FIELD_VALUE: deja el mensaje del servidor por campo (value, unit, note, measured_on) y no un error general', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    put().flush(apiError('INVALID_FIELD_VALUE', [{ field: 'body.value', message: 'Debe ser mayor que 0' }, { field: 'measured_on', message: 'La fecha no puede ser futura' }, { field: 'otro', message: 'ignorado' }]), { status: 422, statusText: 'x' });

    expect(facade.fieldErrors()).toEqual({ value: 'Debe ser mayor que 0', measured_on: 'La fecha no puede ser futura' });
    expect(facade.error()).toBeNull();
  });

  it('VEHICLE_FUEL_MISSING y VEHICLE_NOT_FOUND quedan como error general', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    put().flush(apiError('VEHICLE_FUEL_MISSING'), { status: 422, statusText: 'x' });

    expect(facade.error()?.code).toBe('VEHICLE_FUEL_MISSING');
  });

  it('permisos: solo ORG_ADMIN declara; analista y lector consultan', () => {
    setup(['ORG_ANALYST']);
    expect(facade.canManage()).toBeFalse();
    TestBed.resetTestingModule();

    setup(['ORG_VIEWER']);
    expect(facade.canManage()).toBeFalse();
    TestBed.resetTestingModule();

    setup(['ORG_ADMIN']);
    expect(facade.canManage()).toBeTrue();
  });

  it('cerrar descarta todo, y cambiar de empresa descarta datos, resultado y la respuesta tardía', () => {
    setup();
    open();
    facade.declare(DECLARATION);
    const late = put();

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.view.status()).toBe('idle');
    expect(facade.outcome()).toBeNull();
    expect(facade.busy()).toBeFalse();
    late.flush({ data: declareOutDto() });
    http.match((r) => r.url.includes('/vehicles'));
  });
});
