import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { COMPLETIONS_URL, bulkApplyDto, bulkPreviewDto, completionOutDto, completionPlateDto, completionPlatesBody, completionStateDto, completionUrl, operationTripDto, operationsPageBody, pendingTripDetailDto, tripDetailDto } from '../../../testing/operations';
import { provideTestApp } from '../../../testing/providers';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { CompletionState } from '../../domain/models/operations';
import { OperationsRepository } from '../../domain/repositories/operations.repositories';
import { toCompletionBody } from '../mappers/operations.mappers';
import { OPERATIONS_URL } from '../../../testing/operations';

describe('HttpOperationsRepository: completar viajes pendientes', () => {
  let http: HttpTestingController;
  let repository: OperationsRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(OperationsRepository);
  });
  afterEach(() => http.verify());

  it('GET .../trips/{id}/completion entrega el estado de dominio con campos, opciones y rango del servidor', () => {
    let state: CompletionState | null = null;

    repository.completionState(ORG_ENVIA.id, 'trip-1').subscribe((s) => (state = s));
    const request = http.expectOne(completionUrl('trip-1'));

    expect(request.request.method).toBe('GET');
    request.flush({ data: completionStateDto(), meta: {} });

    expect(state!.version).toBe(0);
    expect(state!.completable).toBeTrue();
    expect(state!.refusal).toBeNull();
    expect(state!.missing).toEqual(['efficiency.value', 'efficiency.unit']);
    expect(state!.fields[0]).toEqual(jasmine.objectContaining({ name: 'efficiency.value', kind: 'number', range: { minExclusive: '0', max: '100' }, options: null }));
    expect(state!.fields[1].options).toEqual([{ value: 'km/gal', label: 'km/gal' }, { value: 'km/l', label: 'km/l' }]);
  });

  it('un viaje que no se puede completar trae el motivo del servidor y ningún campo', () => {
    let state: CompletionState | null = null;

    repository.completionState(ORG_ENVIA.id, 'trip-1').subscribe((s) => (state = s));
    http.expectOne(completionUrl('trip-1')).flush({ data: completionStateDto({ completable: false, refusal: { code: 'TRIP_NOT_COMPLETABLE', message: 'La fecha no es válida' }, missing: [], fields: [] }), meta: {} });

    expect(state!.completable).toBeFalse();
    expect(state!.refusal).toBe('La fecha no es válida');
    expect(state!.fields).toEqual([]);
  });

  it('PATCH .../completion envía expected_version y solo lo escrito, anidado; los números viajan como texto tal cual (coma decimal) y lo vacío no se envía', () => {
    repository.complete(ORG_ENVIA.id, 'trip-1', { expectedVersion: 4, values: { 'efficiency.value': ' 9,5 ', 'efficiency.unit': 'km/gal', 'consumption.quantity': '', distance_km: '' } }).subscribe();
    const request = http.expectOne(completionUrl('trip-1'));

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ expected_version: 4, efficiency: { value: '9,5', unit: 'km/gal' } });
    request.flush({ data: completionOutDto(), meta: {} });
  });

  it('arma el cuerpo completo con combustible, consumo, rendimiento y distancia', () => {
    expect(toCompletionBody({ expectedVersion: 0, values: { fuel_type: 'DIESEL', 'consumption.quantity': '10', 'consumption.unit': 'gal', 'efficiency.value': '8', 'efficiency.unit': 'km/gal', distance_km: '300' } })).toEqual({
      expected_version: 0,
      fuel_type: 'DIESEL',
      consumption: { quantity: '10', unit: 'gal' },
      efficiency: { value: '8', unit: 'km/gal' },
      distance_km: '300',
    });
    expect(toCompletionBody({ expectedVersion: 2, values: { 'consumption.unit': 'gal' } })).toEqual({ expected_version: 2, consumption: { unit: 'gal' } });
  });

  it('la respuesta del guardado trae el viaje de dominio (corregido, declarado) y el resultado del servidor', () => {
    let outcome: unknown = null;

    repository.complete(ORG_ENVIA.id, 'trip-1', { expectedVersion: 0, values: { 'efficiency.value': '8' } }).subscribe((o) => (outcome = o));
    http.expectOne(completionUrl('trip-1')).flush({ data: completionOutDto(), meta: {} });
    const result = outcome as { changed: boolean; version: number; trip: { corrected: unknown; declared: { fields: string[]; distanceKm: number } }; result: { kgCo2: number; counted: boolean; status: string } };

    expect(result.changed).toBeTrue();
    expect(result.version).toBe(1);
    expect(result.trip.corrected).toEqual({ at: '2026-11-24T10:00:00Z', byName: 'Laura Gómez' });
    expect(result.trip.declared.fields).toEqual(['efficiency.value', 'efficiency.unit']);
    expect(result.trip.declared.distanceKm).toBe(40);
    expect(result.result).toEqual(jasmine.objectContaining({ status: 'CALCULATED', kgCo2: 50.745, counted: true }));
  });

  it('TRIP_VERSION_CONFLICT llega con el estado vigente ya traducido a dominio en AppError.data', () => {
    let failure: AppError | null = null;

    repository.complete(ORG_ENVIA.id, 'trip-1', { expectedVersion: 0, values: { 'efficiency.value': '8' } }).subscribe({ error: (e: AppError) => (failure = e) });
    http.expectOne(completionUrl('trip-1')).flush({ error: { code: 'TRIP_VERSION_CONFLICT', message: 'x', details: [{ field: 'version', message: '3', type: 'current_version' }] }, data: completionStateDto({ version: 3 }) }, { status: 409, statusText: 'Conflict' });

    expect(failure!.code).toBe('TRIP_VERSION_CONFLICT');
    expect(failure!.message).toContain('Alguien más modificó');
    expect((failure!.data as CompletionState).version).toBe(3);
    expect((failure!.data as CompletionState).fields.length).toBe(2);
  });

  it('INVALID_FIELD_VALUE llega con el mensaje por campo y un 403 se interpreta como prohibido', () => {
    let invalid: AppError | null = null;
    let forbidden: AppError | null = null;

    repository.complete(ORG_ENVIA.id, 'trip-1', { expectedVersion: 0, values: { 'efficiency.value': '0' } }).subscribe({ error: (e: AppError) => (invalid = e) });
    http.expectOne(completionUrl('trip-1')).flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'efficiency.value', message: 'Debe ser mayor que 0 y no superar 100', type: 'number' }] } }, { status: 422, statusText: 'Unprocessable' });
    repository.completionState(ORG_ENVIA.id, 'trip-1').subscribe({ error: (e: unknown) => (forbidden = toAppError(e)) });
    http.expectOne(completionUrl('trip-1')).flush({ error: { code: 'FORBIDDEN' } }, { status: 403, statusText: 'Forbidden' });

    expect(invalid!.details).toEqual([{ field: 'efficiency.value', type: 'number', message: 'Debe ser mayor que 0 y no superar 100' }]);
    expect(forbidden!.kind).toBe('forbidden');
  });

  it('POST .../completions/preview envía el motivo, la carga opcional y un rendimiento explícito por placa; devuelve conteos y token', () => {
    let totals: unknown = null;
    let token = '';

    repository.previewCompletion(ORG_ENVIA.id, { importFileId: 'f-1', items: [{ plate: 'ABC123', value: ' 9,5 ', unit: 'km/gal' }] }).subscribe((p) => ((totals = p.totals), (token = p.token)));
    const request = http.expectOne(`${COMPLETIONS_URL}/preview`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'DISTANCE_WITHOUT_EFFICIENCY', import_file_id: 'f-1', items: [{ plate: 'ABC123', efficiency_value: '9,5', efficiency_unit: 'km/gal' }] });
    request.flush({ data: bulkPreviewDto(), meta: {} });

    expect(token).toBe('token-de-confirmacion-1');
    expect(totals).toEqual({ affected: 301, wouldCalculate: 280, wouldRemainPending: 21, held: 3, skippedIncompatible: 2, expectedKgCo2: 12345.678 });
  });

  it('sin carga elegida no envía import_file_id; apply repite el mismo cuerpo con el token', () => {
    let applied = 0;

    repository.previewCompletion(ORG_ENVIA.id, { importFileId: null, items: [{ plate: 'ABC123', value: '8', unit: 'km/gal' }] }).subscribe();
    expect(http.expectOne(`${COMPLETIONS_URL}/preview`).request.body).toEqual({ reason: 'DISTANCE_WITHOUT_EFFICIENCY', items: [{ plate: 'ABC123', efficiency_value: '8', efficiency_unit: 'km/gal' }] });
    repository.applyCompletion(ORG_ENVIA.id, { importFileId: null, items: [{ plate: 'ABC123', value: '8', unit: 'km/gal' }] }, 'tok-123456789').subscribe((r) => (applied = r.applied));
    const request = http.expectOne(`${COMPLETIONS_URL}/apply`);

    expect(request.request.body).toEqual({ reason: 'DISTANCE_WITHOUT_EFFICIENCY', items: [{ plate: 'ABC123', efficiency_value: '8', efficiency_unit: 'km/gal' }], token: 'tok-123456789' });
    request.flush({ data: bulkApplyDto(), meta: {} });
    expect(applied).toBe(301);
  });

  it('POST .../completions/preview sin unidad (la declarada por los viajes) no envía efficiency_unit', () => {
    repository.previewCompletion(ORG_ENVIA.id, { importFileId: null, items: [{ plate: 'ABC123', value: '8', unit: null }, { plate: 'XYZ987', value: '9', unit: 'km/l' }] }).subscribe();

    expect(http.expectOne(`${COMPLETIONS_URL}/preview`).request.body.items).toEqual([{ plate: 'ABC123', efficiency_value: '8' }, { plate: 'XYZ987', efficiency_value: '9', efficiency_unit: 'km/l' }]);
  });

  it('GET .../completions/plates envía motivo, carga, prefijo, límite y cursor (lo vacío no) y mapea placa, combustible, unidad declarada, opciones y total', () => {
    let page: unknown = null;

    repository.completionPlates(ORG_ENVIA.id, { importFileId: 'f-1', query: 'PLA', limit: 6, cursor: 'c1' }).subscribe((p) => (page = p));
    const request = http.expectOne((r) => r.url === `${COMPLETIONS_URL}/plates`);

    expect(request.request.method).toBe('GET');
    expect(Object.fromEntries(request.request.params.keys().map((key) => [key, request.request.params.get(key)]))).toEqual({ reason: 'DISTANCE_WITHOUT_EFFICIENCY', import_file_id: 'f-1', q: 'PLA', limit: '6', cursor: 'c1' });
    request.flush(completionPlatesBody([completionPlateDto(1), completionPlateDto(2, { efficiency_unit: 'km/gal', fuel_type: null, fuel_label: 'Mixto', unit_options: [] })], { next_cursor: 'c2', total_plates: { value: 1926, capped: false } }));

    expect(page).toEqual({
      items: [
        { plate: 'PLA001', trips: 31, fuelType: 'DIESEL', fuelLabel: 'Diésel', efficiencyUnit: null, unitOptions: [{ value: 'km/gal', label: 'km/gal' }, { value: 'km/l', label: 'km/l' }] },
        { plate: 'PLA002', trips: 32, fuelType: null, fuelLabel: 'Mixto', efficiencyUnit: 'km/gal', unitOptions: [] },
      ],
      nextCursor: 'c2',
      total: { value: 1926, capped: false },
    });
  });

  it('el listado de placas sin filtros no envía carga, prefijo ni cursor, y sin total en las páginas siguientes', () => {
    let page: { total: unknown; nextCursor: unknown } | null = null;

    repository.completionPlates(ORG_ENVIA.id, { importFileId: null, query: '', limit: 6, cursor: null }).subscribe((p) => (page = p));
    const request = http.expectOne((r) => r.url === `${COMPLETIONS_URL}/plates`);

    expect(request.request.params.keys().sort()).toEqual(['limit', 'reason']);
    request.flush(completionPlatesBody([completionPlateDto(1)]));
    expect(page).toEqual(jasmine.objectContaining({ total: null, nextCursor: null }));
  });

  it('el listado trae `corrected` y `reason`; el detalle trae completable, campos faltantes, corregido y declarado (nulos y falsos por omisión)', () => {
    let corrected: boolean[] = [];
    let reasons: (string | null)[] = [];

    repository.list(ORG_ENVIA.id, {}, { view: 'all', limit: 8 }).subscribe((p) => ((corrected = p.items.map((i) => i.corrected)), (reasons = p.items.map((i) => i.reason))));
    http.expectOne((r) => r.url === OPERATIONS_URL).flush(operationsPageBody([operationTripDto({ corrected: true }), operationTripDto({ id: 'trip-2', reason: 'MISSING_UNIT' })]));
    expect(corrected).toEqual([true, false]);
    expect(reasons).toEqual([null, 'MISSING_UNIT']);

    interface Seen {
      completable: boolean;
      missingFields: readonly string[];
      corrected: unknown;
      declared: unknown;
      correctionVersion: number;
    }
    let pending: Seen | null = null;
    let plain: Seen | null = null;

    repository.detail(ORG_ENVIA.id, 'trip-1').subscribe((d) => (pending = d));
    http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: pendingTripDetailDto(), meta: {} });
    repository.detail(ORG_ENVIA.id, 'trip-2').subscribe((d) => (plain = d));
    http.expectOne(`${OPERATIONS_URL}/trip-2`).flush({ data: tripDetailDto(), meta: {} });

    expect((pending as Seen | null)!.completable).toBeTrue();
    expect((pending as Seen | null)!.missingFields).toEqual(['efficiency.value', 'efficiency.unit']);
    expect(plain).toEqual(jasmine.objectContaining({ completable: false, missingFields: [], corrected: null, declared: null, correctionVersion: 0 }));
  });
});
