import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MANUAL_URLS, manualOptionsDto, manualPlaceDto, manualTemplateDto, manualTripOutDto, manualVehicleDto, repeatedDataDto, routeDto, voidOutDto } from '../../../testing/manual-trips';
import { ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ManualOptions, ManualTripInput, ManualTripOutcome } from '../../domain/models/manual-trips';
import { ManualTripsRepository } from '../../domain/repositories/manual-trips.repositories';
import { toManualTripBody } from '../mappers/manual-trips.mappers';

const INPUT: ManualTripInput = { tripDate: '2026-11-24', plate: 'ABC123', origin: '05001', destination: '11001', efficiency: { value: '8,5', unit: 'km/gal' } };

describe('HttpManualTripsRepository', () => {
  let http: HttpTestingController;
  let repository: ManualTripsRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(ManualTripsRepository);
  });
  afterEach(() => http.verify());

  it('GET manual/options entrega las fechas y los combustibles con sus unidades y si hay factor', () => {
    let result: ManualOptions | null = null;

    repository.options(ORG_ENVIA.id).subscribe((o) => (result = o));
    http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });

    expect(result).toEqual(jasmine.objectContaining({ minDate: '2000-01-01', maxDate: '2026-11-25' }));
    expect(result!.fuels.map((f) => [f.value, f.hasFactor])).toEqual([['DIESEL', true], ['GASOLINE', true], ['ELECTRIC', false]]);
  });

  it('GET manual/vehicles envía q y limit y entrega placa, configuración, combustible, estado y la sugerencia de último rendimiento', () => {
    let items: readonly { plate: string; active: boolean; fuelType: string | null; lastEfficiency: { value: string; unit: string } | null }[] = [];

    repository.vehicles(ORG_ENVIA.id, 'AB', 6).subscribe((v) => (items = v));
    const request = http.expectOne((r) => r.url === MANUAL_URLS.vehicles);

    expect(request.request.params.get('q')).toBe('AB');
    expect(request.request.params.get('limit')).toBe('6');
    request.flush({ data: [manualVehicleDto(), manualVehicleDto({ plate: 'XYZ987', status: 'INACTIVE', fuel_type: null, fuel_label: null, last_efficiency: null })], meta: {} });

    expect(items.map((v) => [v.plate, v.active, v.fuelType])).toEqual([['ABC123', true, 'DIESEL'], ['XYZ987', false, null]]);
    expect(items[0].lastEfficiency).toEqual(jasmine.objectContaining({ value: '8.5000', unit: 'km/gal' }));
    expect(items[1].lastEfficiency).toBeNull();
  });

  it('GET manual/vehicles trae el rendimiento vigente del vehículo (primero a sugerir); uno desconocido es «declarado» y sin registro es null', () => {
    let items: readonly { vehicleEfficiency: { value: string; unit: string; origin: string; basis: string | null } | null }[] = [];

    repository.vehicles(ORG_ENVIA.id, 'AB', 6).subscribe((v) => (items = v));
    http.expectOne((r) => r.url === MANUAL_URLS.vehicles).flush({
      data: [
        manualVehicleDto({ vehicle_efficiency: { value: '7.2500', unit: 'km/l', origin: 'MEASURED', basis: 'REAL', declared_at: '2026-11-20T15:00:00Z' } }),
        manualVehicleDto({ plate: 'DEF456', vehicle_efficiency: { value: '6.9000', unit: 'km/gal', origin: 'OTRO', basis: 'OTRA', declared_at: '2026-11-20T15:00:00Z' } }),
        manualVehicleDto({ plate: 'GHI789' }),
      ],
      meta: {},
    });

    expect(items[0].vehicleEfficiency).toEqual(jasmine.objectContaining({ value: '7.2500', unit: 'km/l', origin: 'MEASURED', basis: 'REAL' }));
    expect(items[1].vehicleEfficiency).toEqual(jasmine.objectContaining({ origin: 'DECLARED', basis: null }));
    expect(items[2].vehicleEfficiency).toBeNull();
  });

  it('GET manual/places envía q y limit y entrega el código y la etiqueta «Municipio, Departamento»', () => {
    let items: readonly { code: string; label: string }[] = [];

    repository.places(ORG_ENVIA.id, 'cali', 6).subscribe((p) => (items = p));
    const request = http.expectOne((r) => r.url === MANUAL_URLS.places);

    expect(request.request.params.get('q')).toBe('cali');
    request.flush({ data: [manualPlaceDto({ code: '76001', label: 'Cali, Valle del Cauca' })], meta: {} });

    expect(items).toEqual([{ code: '76001', label: 'Cali, Valle del Cauca' }]);
  });

  it('GET manual/route-distance envía los dos códigos: con ruta entrega los km y sin ruta entrega el motivo (nunca falla)', () => {
    const answers: { available: boolean; distanceKm: number | null; reason: string | null }[] = [];

    repository.routeDistance(ORG_ENVIA.id, '05001', '11001').subscribe((r) => answers.push(r));
    const first = http.expectOne((r) => r.url === MANUAL_URLS.route);

    expect(first.request.params.get('origin')).toBe('05001');
    expect(first.request.params.get('destination')).toBe('11001');
    first.flush({ data: routeDto(), meta: {} });

    repository.routeDistance(ORG_ENVIA.id, '05001', '05001').subscribe((r) => answers.push(r));
    http.expectOne((r) => r.url === MANUAL_URLS.route).flush({ data: routeDto({ available: false, distance_km: null, source: null, reason: 'SAME_PLACE' }), meta: {} });

    expect(answers).toEqual([{ available: true, distanceKm: 412.3, reason: null }, { available: false, distanceKm: null, reason: 'SAME_PLACE' }]);
  });

  it('POST trips lleva la cabecera Idempotency-Key y un cuerpo con solo lo escrito (sin distancia si no se escribió)', () => {
    let created: boolean | null = null;

    repository.register(ORG_ENVIA.id, INPUT, 'key-12345678').subscribe((o) => (created = o.created));
    const request = http.expectOne(MANUAL_URLS.register);

    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('key-12345678');
    expect(request.request.body).toEqual({ trip_date: '2026-11-24', plate: 'ABC123', origin: '05001', destination: '11001', efficiency: '8,5', efficiency_unit: 'km/gal' });
    request.flush({ data: manualTripOutDto(), meta: {} }, { status: 201, statusText: 'Created' });

    expect(created!).toBeTrue();
  });

  it('el resultado del registro trae lo que calculó el servidor y el detalle con su origen manual', () => {
    let outcome: ManualTripOutcome | null = null;

    repository.register(ORG_ENVIA.id, INPUT, 'key-12345678').subscribe((o) => (outcome = o));
    http.expectOne(MANUAL_URLS.register).flush({ data: manualTripOutDto({ created: false }), meta: {} });
    const o = outcome!;

    expect(o.created).toBeFalse();
    expect(o.result).toEqual(jasmine.objectContaining({ status: 'CALCULATED', kgCo2: 128.4, methodLabel: 'Estimado', counted: true, completable: false }));
    expect(o.trip).toEqual(jasmine.objectContaining({ source: 'MANUAL', registeredByName: 'Laura Gómez', voidable: true, tripId: 'M-000123' }));
  });

  it('toManualTripBody: cada dato viaja solo si existe; el modo real manda consumo y unidad; confirm_distinct solo si es true', () => {
    expect(toManualTripBody({ tripDate: '2026-11-24', plate: 'ABC123', origin: '05001', destination: '11001', consumption: { value: '40', unit: 'gal' }, distanceKm: '300', fuelType: 'DIESEL', cargoTon: '18', confirmDistinct: true })).toEqual({
      trip_date: '2026-11-24', plate: 'ABC123', origin: '05001', destination: '11001', distance_km: '300', consumption: '40', consumption_unit: 'gal', fuel_type: 'DIESEL', cargo_ton: '18', confirm_distinct: true,
    });
    expect(Object.keys(toManualTripBody({ tripDate: 'd', plate: 'p', origin: 'o', destination: 'x', confirmDistinct: false }))).toEqual(['trip_date', 'plate', 'origin', 'destination']);
  });

  it('409 MANUAL_TRIP_REPEATED conserva los candidatos en AppError.data, ya como dominio, y el mensaje del catálogo', () => {
    let failure: AppError | null = null;

    repository.register(ORG_ENVIA.id, INPUT, 'key-12345678').subscribe({ error: (e: unknown) => (failure = toAppError(e)) });
    http.expectOne(MANUAL_URLS.register).flush({ error: { code: 'MANUAL_TRIP_REPEATED', message: 'texto crudo', request_id: 'r-1' }, data: repeatedDataDto() }, { status: 409, statusText: 'Conflict' });

    expect(failure!.code).toBe('MANUAL_TRIP_REPEATED');
    expect(failure!.status).toBe(409);
    expect(failure!.message).not.toContain('texto crudo');
    expect(failure!.data).toEqual([jasmine.objectContaining({ id: 'trip-9', tripId: 'M-000099', source: 'MANUAL', stateLabel: 'Calculado', kgCo2: 100, plate: 'ABC123' })]);
  });

  it('422 INVALID_FIELD_VALUE conserva el texto por campo; UNIT_INCOMPATIBLE conserva el de las unidades compatibles', () => {
    const failures: AppError[] = [];

    repository.register(ORG_ENVIA.id, INPUT, 'key-12345678').subscribe({ error: (e: unknown) => failures.push(toAppError(e)) });
    http.expectOne(MANUAL_URLS.register).flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'efficiency', type: 'number', message: 'Debe ser mayor que 0' }] } }, { status: 422, statusText: 'Unprocessable' });
    repository.register(ORG_ENVIA.id, INPUT, 'key-12345678').subscribe({ error: (e: unknown) => failures.push(toAppError(e)) });
    http.expectOne(MANUAL_URLS.register).flush({ error: { code: 'UNIT_INCOMPATIBLE', details: [{ field: 'efficiency_unit', type: 'unit', message: 'Use km/gal o km/l' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(failures[0].details).toEqual([{ field: 'efficiency', type: 'number', message: 'Debe ser mayor que 0' }]);
    expect(failures[1].details[0].message).toBe('Use km/gal o km/l');
  });

  it('los códigos nuevos tienen mensaje en español del catálogo (nunca el crudo del servidor)', () => {
    const codes = ['MANUAL_TRIP_REPEATED', 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_INVALID', 'TRIP_NOT_MANUAL', 'PLATE_NOT_REGISTERED', 'VEHICLE_FUEL_MISSING', 'FUEL_MISMATCH', 'UNIT_INCOMPATIBLE', 'DATE_OUT_OF_RANGE', 'INVALID_FIELD_VALUE', 'VALIDATION_ERROR', 'COMPANY_BUSY', 'TRIP_HAS_CONFIRMED_MATCH', 'TRIP_VERSION_CONFLICT'];

    for (const code of codes) {
      repository.register(ORG_ENVIA.id, INPUT, 'key-12345678').subscribe({ error: (e: unknown) => expect(toAppError(e).message).withContext(code).toMatch(/^[A-ZÁÉÍÓÚ¿«]/) });
      http.expectOne(MANUAL_URLS.register).flush({ error: { code, message: 'crudo del servidor' } }, { status: 422, statusText: 'x' });
    }
  });

  it('POST trips/{id}/void envía el motivo y la versión, y entrega el viaje anulado con lo que dejó de sumar', () => {
    let result: { alreadyVoided: boolean; kgCo2Removed: number | null; trip: { stateLabel: string; voidable: boolean } } | null = null;

    repository.voidTrip(ORG_ENVIA.id, 'trip-m1', { reason: 'Se registró dos veces', expectedVersion: 2 }).subscribe((r) => (result = r));
    const request = http.expectOne(MANUAL_URLS.voidOf('trip-m1'));

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Se registró dos veces', expected_version: 2 });
    request.flush({ data: voidOutDto(), meta: {} });

    expect(result!.alreadyVoided).toBeFalse();
    expect(result!.kgCo2Removed).toBe(100);
    expect(result!.trip).toEqual(jasmine.objectContaining({ stateLabel: 'Anulado', voidable: false }));
  });

  it('anular sin motivo envía un cuerpo vacío; los 409 TRIP_NOT_MANUAL y TRIP_HAS_CONFIRMED_MATCH llegan con su código', () => {
    const codes: string[] = [];

    repository.voidTrip(ORG_ENVIA.id, 'trip-1', {}).subscribe({ error: (e: unknown) => codes.push(toAppError(e).code) });
    const first = http.expectOne(MANUAL_URLS.voidOf('trip-1'));

    expect(first.request.body).toEqual({});
    first.flush({ error: { code: 'TRIP_NOT_MANUAL' } }, { status: 409, statusText: 'Conflict' });
    repository.voidTrip(ORG_ENVIA.id, 'trip-2', {}).subscribe({ error: (e: unknown) => codes.push(toAppError(e).code) });
    http.expectOne(MANUAL_URLS.voidOf('trip-2')).flush({ error: { code: 'TRIP_HAS_CONFIRMED_MATCH' } }, { status: 409, statusText: 'Conflict' });

    expect(codes).toEqual(['TRIP_NOT_MANUAL', 'TRIP_HAS_CONFIRMED_MATCH']);
  });

  it('GET manual/trips/{id}/template envía el modo y entrega la estructura sin fecha ni energía', () => {
    let template: { sourceTripRef: string | null; plateRegistered: boolean; origin: { code: string | null } } | null = null;

    repository.template(ORG_ENVIA.id, 'trip-1', 'return').subscribe((t) => (template = t));
    const request = http.expectOne((r) => r.url === MANUAL_URLS.template('trip-1'));

    expect(request.request.params.get('mode')).toBe('return');
    request.flush({ data: manualTemplateDto({ mode: 'return' }), meta: {} });

    expect(template!).toEqual(jasmine.objectContaining({ sourceTripRef: 'M-000123', plateRegistered: true }));
    expect(Object.keys(template!)).not.toContain('date');
    expect(Object.keys(template!)).not.toContain('distanceKm');
  });
});
