import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { EFFICIENCY_URL, FICHA_APPLY_URL, FICHA_PREVIEW_URL, FICHA_TEMPLATE_URL, SETTINGS_URL, settingsDto, measuredProtectedDetails, protectedRowDto, apiError, declareOutDto, fichaApplyDto, fichaPreviewDto, recordDto, viewDto, xlsxFile } from '../../../testing/vehicle-efficiency';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { EfficiencyDeclaration, EfficiencyView } from '../../domain/models/vehicle-efficiency';
import { VehicleEfficiencyRepository } from '../../domain/repositories/vehicle-efficiency.repositories';
import { toMeasuredProtection } from '../mappers/vehicle-efficiency.mappers';
import { DEFAULT_FICHA_FILE_NAME } from './http-vehicle-efficiency.repositories';

const ORG = ORG_ENVIA.id;
const DECLARATION: EfficiencyDeclaration = { value: '6.9', unit: 'km/gal', origin: 'DECLARED', basis: 'THEORETICAL', note: 'Fabricante', measuredOn: '2026-11-01' };

describe('HttpVehicleEfficiencyRepository', () => {
  let repo: VehicleEfficiencyRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(VehicleEfficiencyRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const fail = (code: string, status: number, details: { field: string; message: string }[] = []): AppError => {
    let error!: AppError;

    repo.declare(ORG, 'veh-1', DECLARATION).subscribe({ error: (e: unknown) => (error = toAppError(e)) });
    http.expectOne(EFFICIENCY_URL()).flush(apiError(code, details), { status, statusText: 'x' });

    return error;
  };

  it('view: GET con página y tamaño, y mapea los decimales de texto a números y la paginación', () => {
    let result: EfficiencyView | undefined;

    repo.view(ORG, 'veh-1', { page: 2, pageSize: 5 }).subscribe((v) => (result = v));
    const req = http.expectOne((r) => r.url === EFFICIENCY_URL());

    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('page_size')).toBe('5');
    req.flush({ data: viewDto({}, [recordDto(), recordDto({ id: 'rec-0', is_current: false, value: '7.250000', superseded_at: '2026-11-20T15:00:00Z', origin: 'MEASURED', basis: 'REAL' })]) });

    expect(result?.compatibleUnits).toEqual(['km/gal', 'km/l']);
    expect(result?.current?.value).toBe(6.9);
    expect(result?.history.items.map((r) => [r.value, r.origin, r.basis, r.isCurrent])).toEqual([[6.9, 'DECLARED', 'THEORETICAL', true], [7.25, 'MEASURED', 'REAL', false]]);
    expect(result?.history.total).toBe(2);
  });

  it('un origen o una base desconocidos se leen como declarado y sin indicar, nunca como medido', () => {
    let record: EfficiencyView['history']['items'][number] | undefined;

    repo.view(ORG, 'veh-1', { page: 1, pageSize: 5 }).subscribe((v) => (record = v.history.items[0]));
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: viewDto({}, [recordDto({ origin: 'OTRO', basis: 'OTRA' })]) });

    expect(record?.origin).toBe('DECLARED');
    expect(record?.basis).toBeNull();
  });

  it('declare: PUT con solo los campos informados (el valor viaja como texto) y mapea los pendientes', () => {
    let result: unknown;

    repo.declare(ORG, 'veh-1', DECLARATION).subscribe((r) => (result = r));
    const req = http.expectOne(EFFICIENCY_URL());

    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ value: '6.9', unit: 'km/gal', origin: 'DECLARED', basis: 'THEORETICAL', note: 'Fabricante', measured_on: '2026-11-01' });
    req.flush({ data: declareOutDto() });

    expect(result).toEqual(jasmine.objectContaining({ changed: true, applied: { tripsRecalculated: 120, stillPending: 3, remaining: 0, cap: 20000, staleCalculatedTrips: 0 } }));
  });

  it('declare: sin base, nota ni fecha no se envían (el servidor distingue «no enviado» de «vacío»)', () => {
    repo.declare(ORG, 'veh-1', { value: '6,9'.replace(',', '.'), unit: 'km/l', origin: 'MEASURED', basis: null, note: null, measuredOn: null }).subscribe();

    expect(http.expectOne(EFFICIENCY_URL()).request.body).toEqual({ value: '6.9', unit: 'km/l', origin: 'MEASURED' });
  });

  it('el id del vehículo se codifica en la ruta', () => {
    repo.view(ORG, 'a/b', { page: 1, pageSize: 5 }).subscribe();

    const req = http.expectOne((r) => r.url === EFFICIENCY_URL('a%2Fb'));

    expect(req.request.url).toContain('/vehicles/a%2Fb/efficiency');
    req.flush({ data: viewDto() });
  });

  it('template: GET del archivo con el nombre del servidor o el predeterminado', () => {
    const names: string[] = [];

    repo.template(ORG).subscribe((f) => names.push(f.fileName));
    repo.template(ORG).subscribe((f) => names.push(f.fileName));
    const [first, second] = http.match(FICHA_TEMPLATE_URL);

    expect(first.request.responseType).toBe('blob');
    first.flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="mi-ficha.xlsx"' } });
    second.flush(new Blob(['x']));

    expect(names).toEqual(['mi-ficha.xlsx', DEFAULT_FICHA_FILE_NAME]);
  });

  it('template: un error del servidor llega con su código estable', async () => {
    let code = '';

    repo.template(ORG).subscribe({ error: (e: unknown) => (code = toAppError(e).code) });
    http.expectOne(FICHA_TEMPLATE_URL).flush(new Blob([JSON.stringify(apiError('ORGANIZATION_ACCESS_DENIED'))]), { status: 403, statusText: 'x' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(code).toBe('ORGANIZATION_ACCESS_DENIED');
  });

  it('previewFicha: POST multipart con el archivo y mapea conteos y problemas', () => {
    const file = xlsxFile('mi ficha.xlsx');
    let result: unknown;

    repo.previewFicha(ORG, file).subscribe((r) => (result = r));
    const req = http.expectOne(FICHA_PREVIEW_URL);
    const body = req.request.body as FormData;

    expect(req.request.method).toBe('POST');
    expect(body instanceof FormData).toBeTrue();
    expect((body.get('file') as File).name).toBe('mi ficha.xlsx');
    expect(body.has('token')).toBeFalse();
    req.flush({ data: fichaPreviewDto() });

    expect(result).toEqual(jasmine.objectContaining({ token: 'tok-secreto', counts: { rows: 12, valid: 9, withIssues: 3, unchanged: 1, toCreate: 8, toReplace: 2, measuredProtected: 0, pendingTrips: 340 }, issuesTruncated: false, maxRows: 20000 }));
    expect((result as { issues: unknown[] }).issues[2]).toEqual({ row: 9, plate: null, field: 'value', message: 'El rendimiento debe ser mayor que 0' });
  });

  it('applyFicha: POST multipart con el MISMO archivo y el token', () => {
    const file = xlsxFile();
    let result: unknown;

    repo.applyFicha(ORG, file, 'tok-secreto').subscribe((r) => (result = r));
    const req = http.expectOne(FICHA_APPLY_URL);
    const body = req.request.body as FormData;

    expect(body.get('file')).toBeInstanceOf(File);
    expect((body.get('file') as File).name).toBe('ficha.xlsx');
    expect(body.get('token')).toBe('tok-secreto');
    req.flush({ data: fichaApplyDto() });

    expect(result).toEqual(jasmine.objectContaining({ recordsCreated: 8, recordsReplaced: 2, unchanged: 1 }));
  });

  it('el token nunca viaja en la URL', () => {
    repo.applyFicha(ORG, xlsxFile(), 'tok-secreto').subscribe();

    const req = http.expectOne(FICHA_APPLY_URL);

    expect(req.request.urlWithParams).not.toContain('tok-secreto');
    req.flush({ data: fichaApplyDto() });
  });

  it('cada código nuevo sale en español del catálogo y no con el texto del servidor', () => {
    const cases: readonly [string, number][] = [
      ['EFFICIENCY_CONFLICT', 409],
      ['COMPANY_BUSY', 409],
      ['FICHA_TOKEN_EXPIRED', 409],
      ['FICHA_PREVIEW_STALE', 409],
      ['FICHA_TOKEN_INVALID', 422],
      ['FICHA_TOO_LARGE', 422],
      ['FICHA_NOTHING_TO_APPLY', 422],
      ['EFFICIENCY_APPLY_TOO_LARGE', 422],
      ['FILE_TOO_LARGE', 413],
      ['UNSUPPORTED_FILE', 415],
      ['INVALID_FILE', 422],
      ['VEHICLE_FUEL_MISSING', 422],
      ['VEHICLE_NOT_FOUND', 404],
      ['INVALID_FIELD_VALUE', 422],
    ];

    for (const [code, status] of cases) {
      const error = fail(code, status);

      expect(error.code).toBe(code);
      expect(error.message).not.toContain('servidor');
      expect(error.message.length).toBeGreaterThan(20);
      expect(error.message).not.toMatch(/^(HTTP|Ocurrió un error inesperado)/);
    }
  });

  it('INVALID_FIELD_VALUE conserva el mensaje por campo del servidor para mostrarlo en línea', () => {
    const error = fail('INVALID_FIELD_VALUE', 422, [{ field: 'value', message: 'Debe ser mayor que 0' }, { field: 'unit', message: 'Unidad incompatible' }]);

    expect(error.details.map((d) => [d.field, d.message])).toEqual([['value', 'Debe ser mayor que 0'], ['unit', 'Unidad incompatible']]);
  });

  it('settings: GET …/efficiency/settings mapea los modos y las opciones del servidor en su orden', () => {
    let result: unknown;

    repo.settings(ORG).subscribe((r) => (result = r));

    const req = http.expectOne(SETTINGS_URL);
    expect(req.request.method).toBe('GET');
    req.flush({ data: { ...settingsDto({ mode: 'AUTO', cargo_unit_mode: 'AUTO_KG' }), default_mode: 'ASK', effective: true } });

    expect(result).toEqual({ mode: 'AUTO', platformEnabled: true, cargoUnitMode: 'AUTO_KG', modeOptions: ['OFF', 'ASK', 'AUTO'], cargoUnitOptions: ['ASK', 'AUTO_KG'] });
  });

  it('settings: un valor desconocido es lo más prudente (OFF y ASK) y una opción desconocida no se ofrece', () => {
    let result: { mode: string; cargoUnitMode: string; modeOptions: string[]; cargoUnitOptions: string[] } | undefined;

    repo.settings(ORG).subscribe((r) => (result = r as never));
    http.expectOne(SETTINGS_URL).flush({ data: settingsDto({ mode: 'NUEVO', cargo_unit_mode: 'NUEVO', options: ['ASK', 'NUEVO'], cargo_unit_options: ['NUEVO'] }) });

    expect(result).toEqual(jasmine.objectContaining({ mode: 'OFF', cargoUnitMode: 'ASK', modeOptions: ['ASK'], cargoUnitOptions: [] }));
  });

  it('updateSettings: PUT con solo lo que cambia (lo omitido no viaja)', () => {
    repo.updateSettings(ORG, { cargoUnitMode: 'AUTO_KG' }).subscribe();
    repo.updateSettings(ORG, { mode: 'OFF' }).subscribe();

    const [cargo, mode] = http.match(SETTINGS_URL);

    expect(cargo.request.method).toBe('PUT');
    expect(cargo.request.body).toEqual({ cargo_unit_mode: 'AUTO_KG' });
    expect(mode.request.body).toEqual({ mode: 'OFF' });
    cargo.flush({ data: settingsDto() });
    mode.flush({ data: settingsDto({ mode: 'OFF' }) });
  });

  it('declare: confirm_replace_measured viaja solo cuando es true', () => {
    repo.declare(ORG, 'veh-1', DECLARATION).subscribe();
    repo.declare(ORG, 'veh-1', { ...DECLARATION, confirmReplaceMeasured: false }).subscribe();
    repo.declare(ORG, 'veh-1', { ...DECLARATION, confirmReplaceMeasured: true }).subscribe();
    const [a, b, c] = http.match((r) => r.url === EFFICIENCY_URL() && r.method === 'PUT');

    expect('confirm_replace_measured' in a.request.body).toBeFalse();
    expect('confirm_replace_measured' in b.request.body).toBeFalse();
    expect(c.request.body.confirm_replace_measured).toBeTrue();
    [a, b, c].forEach((r) => r.flush({ data: declareOutDto() }));
  });

  it('declare: el 409 MEASURED_PROTECTED conserva el texto de details (por mapper) y toMeasuredProtection lo ordena', () => {
    let error!: AppError;

    repo.declare(ORG, 'veh-1', DECLARATION).subscribe({ error: (e: unknown) => (error = toAppError(e)) });
    http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'PUT').flush(apiError('MEASURED_PROTECTED', measuredProtectedDetails), { status: 409, statusText: 'Conflict' });

    expect(error.code).toBe('MEASURED_PROTECTED');
    expect(error.message).toContain('rendimiento medido vigente');
    expect(toMeasuredProtection(error.details)).toEqual({ protectedRows: '1', currentId: 'rec-m1', value: '7.200000', unit: 'km/gal', measuredOn: '2026-10-01' });
    expect(toMeasuredProtection([])).toEqual({ protectedRows: null, currentId: null, value: null, unit: null, measuredOn: null });
  });

  it('previewFicha: mapea measured_protected, protected_rows y protected_truncated (0 y vacío si faltan)', () => {
    let full: { counts: { measuredProtected: number }; protectedRows: unknown[]; protectedTruncated: boolean } | undefined;
    let plain: typeof full;

    repo.previewFicha(ORG, xlsxFile()).subscribe((p) => (full = p as never));
    repo.previewFicha(ORG, xlsxFile()).subscribe((p) => (plain = p as never));
    const [a, b] = http.match(FICHA_PREVIEW_URL);

    a.flush({ data: { ...fichaPreviewDto(), counts: { ...fichaPreviewDto().counts, measured_protected: 1 }, protected_rows: [protectedRowDto()], protected_truncated: true } });
    b.flush({ data: fichaPreviewDto() });

    expect(full!.counts.measuredProtected).toBe(1);
    expect(full!.protectedRows).toEqual([{ row: 5, plate: 'ABC123', currentValue: '7.200000', currentUnit: 'km/gal', currentMeasuredOn: '2026-10-01', newValue: '6.900000', newUnit: 'km/gal' }]);
    expect(full!.protectedTruncated).toBeTrue();
    expect(plain!.counts.measuredProtected).toBe(0);
    expect(plain!.protectedRows).toEqual([]);
  });

  it('applyFicha: confirm_replace_measured en el multipart solo si se pide; la respuesta trae los nuevos números', () => {
    const results: { skippedMeasuredProtected: number; recordsReplacedMeasured: number }[] = [];

    repo.applyFicha(ORG, xlsxFile(), 'tok').subscribe((r) => results.push(r));
    repo.applyFicha(ORG, xlsxFile(), 'tok', true).subscribe((r) => results.push(r));
    const [off, on] = http.match(FICHA_APPLY_URL);

    expect((off.request.body as FormData).has('confirm_replace_measured')).toBeFalse();
    expect((on.request.body as FormData).get('confirm_replace_measured')).toBe('true');
    expect((on.request.body as FormData).get('token')).toBe('tok');
    off.flush({ data: { ...fichaApplyDto(), skipped_measured_protected: 3 } });
    on.flush({ data: { ...fichaApplyDto(), records_replaced_measured: 3 } });

    expect(results.map((r) => [r.skippedMeasuredProtected, r.recordsReplacedMeasured])).toEqual([[3, 0], [0, 3]]);
  });
});
