import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { MANUAL_URLS, manualOptionsDto, manualPlaceDto, manualTemplateDto, manualTripOutDto, manualVehicleDto, repeatedDataDto, routeDto } from '../../../testing/manual-trips';
import { OPERATIONS_URL, operationTripDto, operationsPageBody, tabCountsDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { toOperationTrip } from '../../infrastructure/mappers/operations.mappers';
import { OperationsFacade } from './operations.facade';
import { TripRegistrationFacade } from './trip-registration.facade';

describe('TripRegistrationFacade', () => {
  let http: HttpTestingController;
  let facade: TripRegistrationFacade;
  let ops: OperationsFacade;

  const register = (): TestRequest => http.expectOne((r) => r.url === MANUAL_URLS.register && r.method === 'POST');
  const routeCalls = (): TestRequest[] => http.match((r) => r.url === MANUAL_URLS.route);
  const listCalls = (): TestRequest[] => http.match((r) => r.url === OPERATIONS_URL && r.method === 'GET');
  const summaryCalls = (): TestRequest[] => http.match(`${OPERATIONS_URL}/summary`);

  function setup(roles: string[] = ['ORG_ANALYST']): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(TripRegistrationFacade);
    ops = TestBed.inject(OperationsFacade);
  }

  function open(): void {
    facade.show();
    http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
  }

  function pickVehicle(dto = manualVehicleDto()): void {
    facade.typeVehicle(dto.plate.slice(0, 3));
    tick(250);
    http.expectOne((r) => r.url === MANUAL_URLS.vehicles).flush({ data: [dto], meta: {} });
    facade.pickVehicle(dto.plate);
  }

  function pickPlace(kind: 'origin' | 'destination', dto = manualPlaceDto()): void {
    facade.typePlace(kind, dto.municipality.slice(0, 3));
    tick(250);
    http.expectOne((r) => r.url === MANUAL_URLS.places).flush({ data: [dto], meta: {} });
    facade.pickPlace(kind, dto.code);
  }

  /** Vehículo, origen y destino elegidos y la distancia por ruta ya resuelta. */
  function routed(route = routeDto()): void {
    pickVehicle();
    pickPlace('origin');
    routeCalls().forEach((r) => r.cancelled);
    pickPlace('destination', manualPlaceDto({ code: '11001', municipality: 'Bogotá D.C.', department: 'Bogotá D.C.', label: 'Bogotá D.C., Bogotá D.C.' }));
    const calls = routeCalls();

    calls.at(-1)!.flush({ data: route, meta: {} });
  }

  beforeEach(() => setup());
  afterEach(() => http.verify());

  it('show abre el formulario, pide solo las opciones y no rellena ni la fecha ni la energía', () => {
    open();

    expect(facade.step()).toBe('form');
    expect(facade.options.data()?.fuels.length).toBe(3);
    expect(facade.date()).toBe('');
    expect(facade.consumption()).toBe('');
    expect(facade.efficiency()).toBe('');
    expect(facade.dirty()).toBeFalse();
  });

  it('sin el permiso imports:create no se abre ni se pide nada', () => {
    TestBed.resetTestingModule();
    setup(['ORG_VIEWER']);

    facade.show();

    expect(facade.canRegister()).toBeFalse();
    expect(facade.step()).toBe('closed');
    http.expectNone(MANUAL_URLS.options);
  });

  it('el type-ahead espera 250 ms, pide solo lo último escrito y cancela la petición anterior en vuelo', fakeAsync(() => {
    open();

    facade.typeVehicle('A');
    tick(100);
    facade.typeVehicle('AB');
    tick(249);
    http.expectNone((r) => r.url === MANUAL_URLS.vehicles);
    tick(1);
    const first = http.expectOne((r) => r.url === MANUAL_URLS.vehicles);

    expect(first.request.params.get('q')).toBe('AB');
    expect(first.request.params.get('limit')).toBe('6');

    facade.typeVehicle('ABC');
    tick(250);

    expect(first.cancelled).toBeTrue();
    http.expectOne((r) => r.url === MANUAL_URLS.vehicles && r.params.get('q') === 'ABC').flush({ data: [manualVehicleDto()], meta: {} });

    expect(facade.vehicles.results().map((v) => v.plate)).toEqual(['ABC123']);
    expect(facade.vehicles.loading()).toBeFalse();
  }));

  it('al elegir un vehículo se ve su combustible; ningún valor de energía se rellena y «último rendimiento» solo se aplica con la acción explícita', fakeAsync(() => {
    open();
    pickVehicle();

    expect(facade.vehicle()?.plate).toBe('ABC123');
    expect(facade.fuelCode()).toBe('DIESEL');
    expect(facade.needsFuel()).toBeFalse();
    expect(facade.consumptionUnits().map((u) => u.value)).toEqual(['gal', 'l']);
    expect(facade.efficiency()).toBe('');
    expect(facade.efficiencyUnit()).toBe('');

    facade.useLastEfficiency();

    expect(facade.mode()).toBe('ESTIMATED');
    expect(facade.efficiency()).toBe('8.5');
    expect(facade.efficiencyUnit()).toBe('km/gal');
    expect(facade.consumption()).toBe('');
    expect(facade.announcement()).toContain('último viaje');
  }));

  it('«rendimiento del vehículo» solo se aplica con la acción explícita: cambia al modo estimado y escribe el valor y la unidad a la vista', fakeAsync(() => {
    open();
    pickVehicle(manualVehicleDto({ vehicle_efficiency: { value: '6.9000', unit: 'km/gal', origin: 'DECLARED', basis: null, declared_at: '2026-11-20T15:00:00Z' } }));

    expect(facade.efficiency()).toBe('');
    expect(facade.mode()).toBe('REAL');

    facade.useVehicleEfficiency();

    expect(facade.mode()).toBe('ESTIMATED');
    expect(facade.efficiency()).toBe('6.9');
    expect(facade.efficiencyUnit()).toBe('km/gal');
    expect(facade.announcement()).toContain('rendimiento del vehículo');
  }));

  it('sin rendimiento del vehículo la acción no hace nada', fakeAsync(() => {
    open();
    pickVehicle();
    facade.useVehicleEfficiency();

    expect(facade.mode()).toBe('REAL');
    expect(facade.efficiency()).toBe('');
  }));

  it('escribir otra placa tras elegir un vehículo descarta la selección (y su combustible y unidades)', fakeAsync(() => {
    open();
    pickVehicle();
    facade.setUnit('gal');

    facade.typeVehicle('ABD');
    tick(250);
    http.expectOne((r) => r.url === MANUAL_URLS.vehicles).flush({ data: [], meta: {} });

    expect(facade.vehicle()).toBeNull();
    expect(facade.fuelCode()).toBeNull();
    expect(facade.consumptionUnit()).toBe('');
  }));

  it('al enfocar el campo de vehículo sin sugerencias se piden las primeras sin esperar', fakeAsync(() => {
    open();

    facade.openVehicles();
    tick(0);

    expect(http.expectOne((r) => r.url === MANUAL_URLS.vehicles).request.params.has('q')).toBeFalse();
  }));

  it('distancia por ruta: sin ambos municipios no se pide; al tener los dos pasa por «cargando» y queda lista; se muestra sin viajar en el cuerpo', fakeAsync(() => {
    open();
    pickVehicle();
    pickPlace('origin');

    expect(facade.route().state).toBe('idle');
    expect(routeCalls().length).toBe(0);

    pickPlace('destination', manualPlaceDto({ code: '11001', municipality: 'Bogotá D.C.', label: 'Bogotá D.C., Bogotá D.C.' }));

    expect(facade.route().state).toBe('loading');
    const [call] = routeCalls();

    expect(call.request.params.get('origin')).toBe('05001');
    expect(call.request.params.get('destination')).toBe('11001');
    call.flush({ data: routeDto(), meta: {} });

    expect(facade.route()).toEqual({ state: 'ready', km: 412.3 });
    expect(facade.distanceVisible()).toBeFalse();

    facade.setDate('2026-11-24');
    facade.save();
    const body = register().request.body as Record<string, unknown>;

    expect(Object.keys(body)).not.toContain('distance_km');
  }));

  it('distancia no disponible (sin ruta, mismo lugar o error): aparece el campo para escribirla y esa distancia es la que viaja', fakeAsync(() => {
    open();
    routed(routeDto({ available: false, distance_km: null, source: null, reason: 'NO_ROUTE' }));

    expect(facade.route()).toEqual({ state: 'unavailable', reason: 'NO_ROUTE' });
    expect(facade.distanceVisible()).toBeTrue();

    facade.setDistance('300,5');
    facade.setDate('2026-11-24');
    facade.save();

    expect((register().request.body as Record<string, unknown>)['distance_km']).toBe('300,5');
  }));

  it('un error al pedir la ruta no bloquea: se escribe la distancia', fakeAsync(() => {
    open();
    pickVehicle();
    pickPlace('origin');
    pickPlace('destination', manualPlaceDto({ code: '11001', municipality: 'Bogotá D.C.', label: 'Bogotá D.C., Bogotá D.C.' }));
    routeCalls()[0].flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Error' });

    expect(facade.route()).toEqual({ state: 'unavailable', reason: 'ERROR' });
    expect(facade.distanceVisible()).toBeTrue();
  }));

  it('escribir la distancia aunque haya una por ruta la reemplaza; volver a la de ruta descarta lo escrito', fakeAsync(() => {
    open();
    routed();

    facade.editDistance(true);
    facade.setDistance('410');

    expect(facade.distanceVisible()).toBeTrue();

    facade.editDistance(false);

    expect(facade.distance()).toBe('');
    expect(facade.distanceVisible()).toBeFalse();
  }));

  it('«⇄» intercambia origen y destino, conserva lo escrito y vuelve a pedir la ruta (la anterior se cancela)', fakeAsync(() => {
    open();
    routed();
    facade.editDistance(true);
    facade.setDistance('410');

    facade.swap();

    expect(facade.origin()?.code).toBe('11001');
    expect(facade.destination()?.code).toBe('05001');
    expect(facade.distance()).toBe('410');
    const [call] = routeCalls();

    expect(call.request.params.get('origin')).toBe('11001');
    expect(call.request.params.get('destination')).toBe('05001');
    facade.swap();

    expect(call.cancelled).toBeTrue();
    routeCalls().forEach((r) => r.flush({ data: routeDto(), meta: {} }));
  }));

  it('guardar sin los datos obligatorios no pide nada: marca cada campo y lo anuncia', fakeAsync(() => {
    open();

    facade.save();

    expect(facade.fieldErrors()).toEqual({ date: 'Elige la fecha del viaje.', vehicle: 'Elige un vehículo de la lista.', origin: 'Elige un municipio de la lista.', destination: 'Elige un municipio de la lista.' });
    expect(facade.announcement()).toContain('Revisa los campos');
    http.expectNone(MANUAL_URLS.register);
  }));

  it('un valor de energía sin unidad se marca antes de enviar; cambiar el dato quita su error', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');
    facade.setValue('40');

    facade.save();

    expect(facade.fieldErrors()).toEqual({ unit: 'Elige la unidad.' });
    http.expectNone(MANUAL_URLS.register);

    facade.setUnit('gal');

    expect(facade.fieldErrors()).toEqual({});
  }));

  it('guardar con consumo real envía solo consumo y unidad, con una Idempotency-Key válida; el resultado es el del servidor y la lista se refresca sin perder los cursores', fakeAsync(() => {
    ops.list.replace({ items: [toOperationTrip(operationTripDto())], limit: 8, nextCursor: 'cur-3', total: null });
    ops.cursors.set([null, 'cur-2']);
    open();
    routed();
    facade.setDate('2026-11-24');
    facade.setValue('40');
    facade.setUnit('gal');
    facade.setCargo(' 18 ');

    facade.save();
    const request = register();

    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(request.request.body).toEqual({ trip_date: '2026-11-24', plate: 'ABC123', origin: '05001', destination: '11001', consumption: '40', consumption_unit: 'gal', cargo_ton: '18' });
    expect(facade.saving()).toBeTrue();
    request.flush({ data: manualTripOutDto(), meta: {} }, { status: 201, statusText: 'Created' });

    expect(facade.step()).toBe('saved');
    expect(facade.outcome()?.result.kgCo2).toBe(128.4);
    expect(facade.announcement()).toBe('Viaje registrado. Emisiones del viaje: 128,4 kg CO₂');
    // La lista se vuelve a pedir con la MISMA pila de cursores y los conteos también.
    const list = listCalls();

    expect(list.length).toBe(1);
    expect(list[0].request.params.get('cursor')).toBe('cur-2');
    expect(ops.cursors()).toEqual([null, 'cur-2']);
    list[0].flush(operationsPageBody([operationTripDto()], { next: 'cur-3' }));
    summaryCalls().forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));
  }));

  it('en modo estimado solo viaja el rendimiento; la energía vacía no se envía y el viaje queda por completar según el servidor', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');
    facade.setMode('ESTIMATED');

    facade.save();
    const request = register();

    expect(request.request.body).toEqual({ trip_date: '2026-11-24', plate: 'ABC123', origin: '05001', destination: '11001' });
    request.flush({ data: manualTripOutDto({ result: { status: 'PENDING', reason: 'MISSING_EFFICIENCY', reason_label: 'Falta el rendimiento', method_label: null, kg_co2: null, counted: false, counted_note: null, completable: true, missing_fields: ['efficiency.value'] } }), meta: {} }, { status: 201, statusText: 'Created' });
    listCalls().forEach((r) => r.flush(operationsPageBody([])));
    summaryCalls().forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));

    expect(facade.outcome()?.result.completable).toBeTrue();
    expect(facade.announcement()).toBe('Viaje registrado. Por completar: Falta el rendimiento');
  }));

  it('un vehículo sin combustible pide elegirlo y el combustible viaja en el cuerpo', fakeAsync(() => {
    open();
    pickVehicle(manualVehicleDto({ plate: 'NOF123', fuel_type: null, fuel_label: null, last_efficiency: null }));
    pickPlace('origin');
    pickPlace('destination', manualPlaceDto({ code: '11001', municipality: 'Bogotá D.C.', label: 'Bogotá D.C., Bogotá D.C.' }));
    routeCalls().forEach((r) => r.flush({ data: routeDto(), meta: {} }));
    facade.setDate('2026-11-24');

    expect(facade.needsFuel()).toBeTrue();
    facade.save();

    expect(facade.fieldErrors()).toEqual({ fuel: 'Elige el combustible del viaje.' });
    facade.setFuel('GASOLINE');
    facade.save();

    expect((register().request.body as Record<string, unknown>)['fuel_type']).toBe('GASOLINE');
  }));

  it('409 MANUAL_TRIP_REPEATED muestra los candidatos; «Es otro viaje distinto» reenvía confirm_distinct con la MISMA clave', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');

    facade.save();
    const first = register();
    const key = first.request.headers.get('Idempotency-Key');

    first.flush({ error: { code: 'MANUAL_TRIP_REPEATED', message: 'x' }, data: repeatedDataDto() }, { status: 409, statusText: 'Conflict' });

    expect(facade.step()).toBe('repeated');
    expect(facade.candidates().map((c) => c.tripId)).toEqual(['M-000099']);

    facade.confirmDistinct();
    const second = register();

    expect(second.request.headers.get('Idempotency-Key')).toBe(key);
    expect((second.request.body as Record<string, unknown>)['confirm_distinct']).toBeTrue();
    second.flush({ data: manualTripOutDto() }, { status: 201, statusText: 'Created' });
    listCalls().forEach((r) => r.flush(operationsPageBody([])));
    summaryCalls().forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));

    expect(facade.step()).toBe('saved');
  }));

  it('«Guardar y registrar otro» que cae en «viaje repetido» y se confirma termina en el formulario reiniciado, no en el resultado', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');

    facade.save(true);
    register().flush({ error: { code: 'MANUAL_TRIP_REPEATED' }, data: repeatedDataDto() }, { status: 409, statusText: 'Conflict' });
    facade.confirmDistinct();
    register().flush({ data: manualTripOutDto() }, { status: 201, statusText: 'Created' });
    listCalls().forEach((r) => r.flush(operationsPageBody([])));
    summaryCalls().forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));

    expect(facade.step()).toBe('form');
    expect(facade.date()).toBe('');
    expect(facade.vehicle()?.plate).toBe('ABC123');
    expect(facade.lastSaved()).not.toBeNull();
  }));

  it('«Volver al formulario» desde el aviso de repetido conserva todo lo escrito', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');
    facade.save();
    register().flush({ error: { code: 'MANUAL_TRIP_REPEATED' }, data: repeatedDataDto() }, { status: 409, statusText: 'Conflict' });

    facade.backToForm();

    expect(facade.step()).toBe('form');
    expect(facade.date()).toBe('2026-11-24');
    expect(facade.vehicle()?.plate).toBe('ABC123');
    expect(facade.candidates()).toEqual([]);
  }));

  it('COMPANY_BUSY conserva lo escrito y permite reintentar con la misma clave; si se cambia un dato la clave es otra; tras guardar, otra más', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');

    facade.save();
    const busy = register();
    const key = busy.request.headers.get('Idempotency-Key');

    busy.flush({ error: { code: 'COMPANY_BUSY' } }, { status: 409, statusText: 'Conflict' });

    expect(facade.step()).toBe('form');
    expect(facade.error()?.code).toBe('COMPANY_BUSY');
    expect(facade.date()).toBe('2026-11-24');
    expect(facade.saving()).toBeFalse();

    facade.save();
    const retry = register();

    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush({ error: { code: 'COMPANY_BUSY' } }, { status: 409, statusText: 'Conflict' });

    facade.setDate('2026-11-23');
    facade.save();
    const changed = register();
    const newKey = changed.request.headers.get('Idempotency-Key');

    expect(newKey).not.toBe(key);
    changed.flush({ data: manualTripOutDto() }, { status: 201, statusText: 'Created' });
    listCalls().forEach((r) => r.flush(operationsPageBody([])));
    summaryCalls().forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));

    facade.registerAnother();
    facade.setDate('2026-11-23');
    facade.save();

    expect(register().request.headers.get('Idempotency-Key')).not.toBe(newKey);
  }));

  it('un reenvío idempotente (created false) muestra el viaje original sin crear otro', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');
    facade.save();

    register().flush({ data: manualTripOutDto({ created: false }) }, { status: 200, statusText: 'OK' });
    listCalls().forEach((r) => r.flush(operationsPageBody([])));
    summaryCalls().forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));

    expect(facade.outcome()?.created).toBeFalse();
    expect(facade.announcement()).toContain('ya estaba registrado');
  }));

  it('422 INVALID_FIELD_VALUE marca cada campo con el texto del servidor; PLATE_NOT_REGISTERED, DATE_OUT_OF_RANGE y UNIT_INCOMPATIBLE van a su campo', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');
    facade.setValue('0');
    facade.setUnit('gal');

    facade.save();
    register().flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'consumption', type: 'number', message: 'Debe ser mayor que 0' }, { field: 'cargo_ton', type: 'number', message: 'No puede superar 1000' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.fieldErrors()).toEqual({ value: 'Debe ser mayor que 0', cargo: 'No puede superar 1000' });
    expect(facade.step()).toBe('form');
    expect(facade.consumption()).toBe('0');

    facade.save();
    register().flush({ error: { code: 'PLATE_NOT_REGISTERED' } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.fieldErrors()['vehicle']).toContain('no está registrado');

    facade.save();
    register().flush({ error: { code: 'DATE_OUT_OF_RANGE' } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.fieldErrors()['date']).toContain('fecha');

    facade.save();
    register().flush({ error: { code: 'UNIT_INCOMPATIBLE', details: [{ field: 'consumption_unit', type: 'unit', message: 'Use gal o l' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.fieldErrors()).toEqual({ unit: 'Use gal o l' });
  }));

  it('«Guardar y registrar otro» conserva vehículo, origen y destino y limpia fecha y energía; la lista se actualiza y la clave siguiente es nueva', fakeAsync(() => {
    open();
    routed();
    facade.setDate('2026-11-24');
    facade.setValue('40');
    facade.setUnit('gal');
    facade.setCargo('18');

    facade.save(true);
    const first = register();
    const key = first.request.headers.get('Idempotency-Key');

    first.flush({ data: manualTripOutDto() }, { status: 201, statusText: 'Created' });
    listCalls().forEach((r) => r.flush(operationsPageBody([])));
    summaryCalls().forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));

    expect(facade.step()).toBe('form');
    expect(facade.lastSaved()?.result.kgCo2).toBe(128.4);
    expect(facade.vehicle()?.plate).toBe('ABC123');
    expect(facade.origin()?.code).toBe('05001');
    expect(facade.destination()?.code).toBe('11001');
    expect(facade.date()).toBe('');
    expect(facade.consumption()).toBe('');
    expect(facade.consumptionUnit()).toBe('');
    expect(facade.cargo()).toBe('');
    expect(facade.dirty()).toBeFalse();

    facade.setDate('2026-11-25');
    facade.save();

    expect(register().request.headers.get('Idempotency-Key')).not.toBe(key);
  }));

  it('dirty: sin cambios no pide confirmación; con algo escrito sí', fakeAsync(() => {
    open();

    expect(facade.dirty()).toBeFalse();

    facade.setDate('2026-11-24');

    expect(facade.dirty()).toBeTrue();
  }));

  it('Duplicar: abre con vehículo, ruta y unidades del viaje original SIN fecha ni valores de energía, y pide la ruta', fakeAsync(() => {
    facade.showFrom('trip-1', 'duplicate');
    http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });

    expect(facade.prefilling()).toBeTrue();
    const template = http.expectOne((r) => r.url === MANUAL_URLS.template('trip-1'));

    expect(template.request.params.get('mode')).toBe('duplicate');
    template.flush({ data: manualTemplateDto(), meta: {} });
    http.expectOne((r) => r.url === MANUAL_URLS.vehicles && r.params.get('q') === 'ABC123').flush({ data: [manualVehicleDto()], meta: {} });
    routeCalls()[0].flush({ data: routeDto(), meta: {} });

    expect(facade.prefilling()).toBeFalse();
    expect(facade.banner()).toBe('Copiado del viaje M-000123');
    expect(facade.vehicle()?.plate).toBe('ABC123');
    expect(facade.origin()).toEqual({ code: '05001', label: 'Medellín, Antioquia' });
    expect(facade.destination()?.code).toBe('11001');
    expect(facade.date()).toBe('');
    expect(facade.consumption()).toBe('');
    expect(facade.efficiency()).toBe('');
    expect(facade.consumptionUnit()).toBe('gal');
    expect(facade.efficiencyUnit()).toBe('km/gal');
    expect(facade.route().state).toBe('ready');
    expect(facade.dirty()).toBeFalse();
  }));

  it('Viaje de regreso: el aviso lo dice; un vehículo ya no registrado o un lugar sin código se avisan y se eligen de nuevo', fakeAsync(() => {
    facade.showFrom('trip-1', 'return');
    http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
    http.expectOne((r) => r.url === MANUAL_URLS.template('trip-1')).flush({ data: manualTemplateDto({ mode: 'return', plate_registered: false, origin: { code: null, label: 'BODEGA NORTE' }, destination: { code: '05001', label: 'Medellín, Antioquia' } }), meta: {} });

    expect(facade.banner()).toBe('Viaje de regreso de M-000123');
    expect(facade.vehicle()).toBeNull();
    expect(facade.origin()).toBeNull();
    expect(facade.destination()?.code).toBe('05001');
    expect(facade.notice()).toContain('ABC123 ya no está registrado');
    expect(facade.notice()).toContain('El origen del viaje original no tiene municipio');
    expect(routeCalls().length).toBe(0);
  }));

  it('un error al pedir la estructura de Duplicar deja el formulario con el error y sin datos', fakeAsync(() => {
    facade.showFrom('trip-1', 'duplicate');
    http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
    http.expectOne((r) => r.url === MANUAL_URLS.template('trip-1')).flush({ error: { code: 'TRIP_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });

    expect(facade.prefilling()).toBeFalse();
    expect(facade.error()?.code).toBe('TRIP_NOT_FOUND');
    expect(facade.vehicle()).toBeNull();
  }));

  it('close descarta todo y cancela lo que esté en vuelo', fakeAsync(() => {
    open();
    pickVehicle();
    pickPlace('origin');
    pickPlace('destination', manualPlaceDto({ code: '11001', municipality: 'Bogotá D.C.', label: 'Bogotá D.C., Bogotá D.C.' }));
    const [route] = routeCalls();

    facade.close();

    expect(route.cancelled).toBeTrue();
    expect(facade.step()).toBe('closed');
    expect(facade.vehicle()).toBeNull();
    expect(facade.origin()).toBeNull();
  }));

  it('un error al cargar las opciones se puede reintentar', () => {
    facade.show();
    http.expectOne(MANUAL_URLS.options).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Error' });

    expect(facade.options.status()).toBe('error');

    facade.retryOptions();
    http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });

    expect(facade.options.status()).toBe('ready');
  });
});
