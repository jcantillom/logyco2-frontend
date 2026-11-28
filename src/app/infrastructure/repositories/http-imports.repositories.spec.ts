import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, cargoAppliedDto, cargoProposalDto, coverageDto, candidateDto, changedCandidateDto, importDetailDto, importSummaryDto, vehiclesDetectedDto } from '../../../testing/imports';
import { provideTestApp } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { ImportsRepository } from '../../domain/repositories/imports.repositories';
import { DEFAULT_TEMPLATE_FILE_NAME } from './http-imports.repositories';

const ORG = ORG_ENVIA.id;

describe('HttpImportsRepository', () => {
  let repo: ImportsRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(ImportsRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('template: descarga el archivo autenticado y toma el nombre de Content-Disposition', () => {
    let result: { blob: Blob; fileName: string } | undefined;
    repo.template(ORG).subscribe((f) => (result = f));

    const req = http.expectOne(`${IMPORTS_URL}/template`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['xlsx']), { headers: { 'Content-Disposition': 'attachment; filename="plantilla_2026.xlsx"' } });

    expect(result!.fileName).toBe('plantilla_2026.xlsx');
    expect(result!.blob.size).toBe(4);
  });

  it('template: sin nombre en la respuesta usa el nombre por defecto', () => {
    let name = '';
    repo.template(ORG).subscribe((f) => (name = f.fileName));

    http.expectOne(`${IMPORTS_URL}/template`).flush(new Blob(['x']));

    expect(name).toBe(DEFAULT_TEMPLATE_FILE_NAME);
    expect(DEFAULT_TEMPLATE_FILE_NAME).toBe('plantilla_cargas_logyco2.xlsx');
  });

  it('upload: multipart con el archivo, la empresa en la ruta y la cabecera Idempotency-Key', () => {
    let created: unknown;
    repo.upload(ORG, new File(['x'], 'operaciones.xlsx'), 'key-1').subscribe((r) => (created = r));

    const req = http.expectOne(IMPORTS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect((req.request.body as FormData).get('file')).toEqual(jasmine.any(File));
    expect(req.request.headers.has('Content-Type')).toBeFalse();
    req.flush({ data: { id: 'imp-1', status: 'QUEUED', duplicate: false } }, { status: 202, statusText: 'Accepted' });

    expect(created).toEqual({ id: 'imp-1', status: 'QUEUED', duplicate: false, fileName: null, createdAt: null });
  });

  it('upload: un archivo ya cargado trae el nombre y la fecha de la carga original', () => {
    let created: unknown = null;

    repo.upload(ORG, new File(['x'], 'a.xlsx'), 'k').subscribe((r) => (created = r));
    http.expectOne(IMPORTS_URL).flush({ data: { id: 'imp-0', status: 'COMPLETED', duplicate: true, file_name: 'original.xlsx', created_at: '2026-03-01T10:00:00Z' } }, { status: 200, statusText: 'OK' });

    expect(created).toEqual({ id: 'imp-0', status: 'COMPLETED', duplicate: true, fileName: 'original.xlsx', createdAt: '2026-03-01T10:00:00Z' });
  });

  it('upload: un archivo ya cargado responde 200 con duplicate: true', () => {
    let duplicate = false;
    repo.upload(ORG, new File(['x'], 'a.xlsx'), 'k').subscribe((r) => (duplicate = r.duplicate));

    http.expectOne(IMPORTS_URL).flush({ data: { id: 'imp-1', status: 'COMPLETED', duplicate: true } }, { status: 200, statusText: 'OK' });

    expect(duplicate).toBeTrue();
  });

  it('list: página y tamaño en la consulta y página mapeada', () => {
    let total = 0;
    let first = '';
    repo.list(ORG, { page: 2, pageSize: 10 }, 'VEHICLES_PENDING').subscribe((p) => {
      total = p.total;
      first = p.items[0].fileName;
    });

    const req = http.expectOne((r) => r.url === IMPORTS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('page_size')).toBe('10');
    expect(req.request.params.get('filter')).toBe('VEHICLES_PENDING');
    req.flush(pagedBody([importSummaryDto()], 11, 10, 2));

    expect(total).toBe(11);
    expect(first).toBe('operaciones-marzo.xlsx');
  });

  it('counts: conteos por estado de la empresa, mapeados a camelCase', () => {
    let counts: unknown = null;

    repo.counts(ORG).subscribe((c) => (counts = c));
    http.expectOne(`${IMPORTS_URL}/counts`).flush({ data: { total: 9, in_progress: 2, completed: 5, failed: 2, vehicles_pending: 3, rows_read: 1000, rows_calculable: 900, rows_pending: 100, rows_real: 600, rows_estimated: 300, vehicles_new_pending: 4, vehicles_changed_pending: 2, period_from: '2026-01-05', period_to: '2026-03-28', distance_km: 1000, cargo_ton: 12.5, rows_with_distance: 9, rows_with_cargo: 8, distance_from_routes_km: 77.123 } });

    expect(counts).toEqual({ total: 9, inProgress: 2, completed: 5, failed: 2, vehiclesPending: 3, rowsRead: 1000, rowsCalculable: 900, rowsPending: 100, rowsReal: 600, rowsEstimated: 300, vehiclesNewPending: 4, vehiclesChangedPending: 2, periodFrom: '2026-01-05', periodTo: '2026-03-28', distanceKm: 1000, cargoTon: 12.5, rowsWithDistance: 9, rowsWithCargo: 8, distanceFromRoutesKm: 77.123 });
  });

  it('counts con periodo envía period_from y period_to; sin periodo no envía ninguno', () => {
    repo.counts(ORG, { from: '2026-01-05', to: '2026-03-28' }).subscribe();
    const filtered = http.expectOne((r) => r.url === `${IMPORTS_URL}/counts`);

    expect(filtered.request.params.get('period_from')).toBe('2026-01-05');
    expect(filtered.request.params.get('period_to')).toBe('2026-03-28');
    filtered.flush({ data: { total: 1, in_progress: 0, completed: 1, failed: 0, vehicles_pending: 0 } });

    repo.counts(ORG).subscribe();
    const all = http.expectOne((r) => r.url === `${IMPORTS_URL}/counts`);

    expect(all.request.params.has('period_from')).toBeFalse();
    expect(all.request.params.has('period_to')).toBeFalse();
    all.flush({ data: { total: 1, in_progress: 0, completed: 1, failed: 0, vehicles_pending: 0 } });
  });

  it('periods: lista los periodos de las cargas terminadas, mapeados y tolerantes a campos faltantes', () => {
    let periods: unknown = null;

    repo.periods(ORG).subscribe((p) => (periods = p));
    http.expectOne(`${IMPORTS_URL}/periods`).flush({ data: [{ period_from: '2026-04-01', period_to: '2026-06-30', imports: 3, rows_read: 900 }, { period_from: '2026-01-05', period_to: '2026-03-28' }] });

    expect(periods).toEqual([{ from: '2026-04-01', to: '2026-06-30', imports: 3, rowsRead: 900 }, { from: '2026-01-05', to: '2026-03-28', imports: 0, rowsRead: 0 }]);
  });

  it('get: detalle con revisión', () => {
    let rows = 0;
    repo.get(ORG, 'imp-1').subscribe((d) => (rows = d.review!.rowsRead));

    http.expectOne(`${IMPORTS_URL}/imp-1`).flush({ data: importDetailDto() });

    expect(rows).toBe(200);
  });

  it('retry: POST /{id}/retry', () => {
    let status = '';
    repo.retry(ORG, 'imp-1').subscribe((r) => (status = r.status));

    const req = http.expectOne(`${IMPORTS_URL}/imp-1/retry`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: { id: 'imp-1', status: 'QUEUED', duplicate: false } }, { status: 202, statusText: 'Accepted' });

    expect(status).toBe('QUEUED');
  });

  it('la empresa y el id se codifican en la ruta', () => {
    let id = '';
    repo.get('a/b', 'x y').subscribe((d) => (id = d.id));

    http.expectOne('http://api.test/api/v1/organizations/a%2Fb/imports/x%20y').flush({ data: importDetailDto() });
    expect(id).toBe('imp-1');
  });

  it('vehicleCandidates: GET /{id}/vehicles con tipo, página y tamaño, y candidatos mapeados', () => {
    let page: { total: number; items: readonly { plate: string; proposed: unknown; changes: unknown; tripRows: number }[] } | undefined;
    repo.vehicleCandidates(ORG, 'imp-1', 'CHANGED', { page: 2, pageSize: 10 }).subscribe((p) => (page = p));

    const req = http.expectOne((r) => r.url === `${IMPORTS_URL}/imp-1/vehicles`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('kind')).toBe('CHANGED');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('page_size')).toBe('10');
    req.flush(pagedBody([changedCandidateDto()], 11, 10, 2));

    expect(page!.total).toBe(11);
    expect(page!.items[0]).toEqual(jasmine.objectContaining({ plate: 'XYZ789', tripRows: 12, fuelLabel: 'Diésel', kind: 'CHANGED', vehicleId: 'veh-9' }));
    expect(page!.items[0].changes).toEqual([
      { field: 'fuel_type', label: 'Combustible', before: 'Gasolina', after: 'Diésel' },
      { field: 'model_year', label: 'Modelo', before: '2015', after: '2016' },
    ]);
  });

  it('vehicleCandidates: un candidato nuevo no trae cambios y conserva conflictos e inactivo', () => {
    let first: { changes: unknown; conflicts: unknown; inactive: boolean; proposed: unknown } | undefined;
    repo.vehicleCandidates(ORG, 'imp-1', 'NEW', { page: 1, pageSize: 10 }).subscribe((p) => (first = p.items[0]));

    http.expectOne((r) => r.url === `${IMPORTS_URL}/imp-1/vehicles`).flush(pagedBody([candidateDto({ conflicts: [{ field: 'fuel_type', label: 'Combustible' }], inactive: true })]));

    expect(first!.changes).toEqual([]);
    expect(first!.conflicts).toEqual([{ field: 'fuel_type', label: 'Combustible' }]);
    expect(first!.inactive).toBeTrue();
    expect(first!.proposed).toEqual({ configurationCode: 'C3', modelYear: 2019, fuelType: 'DIESEL', vehicleType: null, technology: null, capacityTons: null });
  });

  it('decideVehicles: POST /vehicles/decisions con candidate_ids y SIN kind', () => {
    let result: unknown;
    repo.decideVehicles(ORG, 'imp-1', { decision: 'ACCEPT', candidateIds: ['cand-1', 'cand-2'] }).subscribe((r) => (result = r));

    const req = http.expectOne(`${IMPORTS_URL}/imp-1/vehicles/decisions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ decision: 'ACCEPT', candidate_ids: ['cand-1', 'cand-2'] });
    req.flush({ data: { accepted: 1, rejected: 0, skipped: 1, skipped_reasons: [{ code: 'ALREADY_DECIDED', rows: 1 }], remaining: 4 } });

    expect(result).toEqual({ accepted: 1, rejected: 0, skipped: 1, skippedReasons: [{ code: 'ALREADY_DECIDED', rows: 1 }], vehiclesEstimated: 0, tripsEstimated: 0, remaining: 4 });
  });

  it('decideVehicles: por tipo envía kind y SIN candidate_ids', () => {
    repo.decideVehicles(ORG, 'imp-1', { decision: 'REJECT', kind: 'NEW' }).subscribe();

    const req = http.expectOne(`${IMPORTS_URL}/imp-1/vehicles/decisions`);
    expect(req.request.body).toEqual({ decision: 'REJECT', kind: 'NEW' });
    req.flush({ data: { accepted: 0, rejected: 2, skipped: 0, skipped_reasons: [] } });
  });

  it('el resumen trae vehicles_detected mapeado, y sin él (carga sin terminar) la clave no existe', () => {
    let done: unknown;
    let running: unknown;
    repo.get(ORG, 'a').subscribe((d) => (done = d.vehiclesDetected));
    repo.get(ORG, 'b').subscribe((d) => (running = d));

    http.expectOne(`${IMPORTS_URL}/a`).flush({ data: importDetailDto({ vehicles_detected: vehiclesDetectedDto() }) });
    http.expectOne(`${IMPORTS_URL}/b`).flush({ data: importDetailDto({ vehicles_detected: null }) });

    expect(done).toEqual({ new: 2, changed: 1, unchanged: 5, pendingDecision: 3 });
    expect('vehiclesDetected' in (running as object)).toBeFalse();
  });

  it('get: mapea la propuesta de unidad, la unidad aplicada y la cobertura del rendimiento; sin ellas quedan en null', () => {
    let detail: { review: { cargoUnitProposal: unknown; cargoUnitApplied: unknown; efficiencyCoverage: { estimation: object; without: { estimable: { references: { source: string; valueKmPerGal: number | null }[] } } } | null } | null } | undefined;
    let plain: { review: { cargoUnitProposal: unknown; cargoUnitApplied: unknown; efficiencyCoverage: unknown } | null } | undefined;

    repo.get(ORG, 'a').subscribe((d) => (detail = d as never));
    repo.get(ORG, 'b').subscribe((d) => (plain = d as never));
    http.expectOne(`${IMPORTS_URL}/a`).flush({ data: importDetailDto({ review: { ...importDetailDto().review!, cargo_unit_proposal: cargoProposalDto(), cargo_unit_applied: cargoAppliedDto(), efficiency_coverage: coverageDto() } }) });
    http.expectOne(`${IMPORTS_URL}/b`).flush({ data: importDetailDto() });

    expect(detail!.review!.cargoUnitProposal).toEqual(jasmine.objectContaining({ status: 'KG_LIKELY', basis: 'CAPACITY', evidence: jasmine.objectContaining({ medianValue: 34440, medianAsTonsIfKg: 34.44, medianPctOfCapacity: 98.4, medianExact: true }) }));
    expect(detail!.review!.cargoUnitApplied).toEqual({ unit: 'KG', source: 'ADMIN', confirmedAt: '2026-03-02T09:30:00Z', header: null });
    expect(detail!.review!.efficiencyCoverage!.estimation).toEqual({ platformEnabled: true, mode: 'ASK', requiresConsent: true, canEstimate: true, consent: null });
    expect(detail!.review!.efficiencyCoverage!.without.estimable.references[0]).toEqual(jasmine.objectContaining({ source: 'UPME', valueKmPerGal: 7.5 }));
    expect(plain!.review).toEqual(jasmine.objectContaining({ cargoUnitProposal: null, cargoUnitApplied: null, efficiencyCoverage: null }));
  });

  it('un estado de propuesta, una fuente o un modo desconocidos son lo más prudente: ambiguo, persona y apagado', () => {
    let detail: { review: { cargoUnitProposal: { status: string } | null; cargoUnitApplied: { source: string } | null; efficiencyCoverage: { estimation: { mode: string } } | null } | null } | undefined;

    repo.get(ORG, 'a').subscribe((d) => (detail = d as never));
    http.expectOne(`${IMPORTS_URL}/a`).flush({ data: importDetailDto({ review: { ...importDetailDto().review!, cargo_unit_proposal: cargoProposalDto({ status: 'NUEVO' }), cargo_unit_applied: cargoAppliedDto({ source: 'NUEVO' }), efficiency_coverage: coverageDto({ estimation: { platform_enabled: true, mode: 'NUEVO', requires_consent: false, can_estimate: false } }) } }) });

    expect(detail!.review!.cargoUnitProposal!.status).toBe('AMBIGUOUS');
    expect(detail!.review!.cargoUnitApplied!.source).toBe('ADMIN');
    expect(detail!.review!.efficiencyCoverage!.estimation.mode).toBe('OFF');
  });

  it('confirmCargoUnit: POST …/cargo-unit con la unidad y mapea el resultado (también el repetido)', () => {
    let result: unknown;

    repo.confirmCargoUnit(ORG, 'imp-1', 'KG').subscribe((r) => (result = r));

    const req = http.expectOne(`${IMPORTS_URL}/imp-1/cargo-unit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ unit: 'KG' });
    req.flush({ data: { unit: 'KG', confirmed_at: '2026-03-02T09:30:00Z', rows_updated: 180, rows_converted: 178, unchanged: false } });

    expect(result).toEqual({ unit: 'KG', confirmedAt: '2026-03-02T09:30:00Z', rowsUpdated: 180, rowsConverted: 178, unchanged: false });
  });

  it('consentEfficiencyEstimation: POST …/efficiency-estimation con estimate_efficiency y mapea el resultado', () => {
    let result: unknown;

    repo.consentEfficiencyEstimation(ORG, 'imp-1', false).subscribe((r) => (result = r));

    const req = http.expectOne(`${IMPORTS_URL}/imp-1/efficiency-estimation`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ estimate_efficiency: false });
    req.flush({ data: { mode: 'ASK', estimate_efficiency: false, vehicles_estimated: 0, trips_calculated: 0, trips_still_pending: 12, next_cursor: null } });

    expect(result).toEqual({ mode: 'ASK', estimateEfficiency: false, vehiclesEstimated: 0, tripsCalculated: 0, tripsStillPending: 12 });
  });

  it('decideVehicles: estimate_efficiency viaja solo si se indica (también un «no») y la respuesta trae lo estimado (0 si falta)', () => {
    const results: { vehiclesEstimated: number; tripsEstimated: number }[] = [];

    repo.decideVehicles(ORG, 'imp-1', { decision: 'ACCEPT', kind: 'NEW', estimateEfficiency: true }).subscribe((r) => results.push(r));
    repo.decideVehicles(ORG, 'imp-1', { decision: 'ACCEPT', candidateIds: ['c1'], estimateEfficiency: false }).subscribe((r) => results.push(r));
    repo.decideVehicles(ORG, 'imp-1', { decision: 'ACCEPT', kind: 'NEW' }).subscribe((r) => results.push(r));

    const [on, off, none] = http.match(`${IMPORTS_URL}/imp-1/vehicles/decisions`);

    expect(on.request.body).toEqual({ decision: 'ACCEPT', kind: 'NEW', estimate_efficiency: true });
    expect(off.request.body).toEqual({ decision: 'ACCEPT', candidate_ids: ['c1'], estimate_efficiency: false });
    expect(none.request.body).toEqual({ decision: 'ACCEPT', kind: 'NEW' });
    on.flush({ data: { accepted: 2, rejected: 0, skipped: 0, skipped_reasons: [], vehicles_estimated: 2, trips_estimated: 30, remaining: 0 } });
    off.flush({ data: { accepted: 1, rejected: 0, skipped: 0, skipped_reasons: [], remaining: 0 } });
    none.flush({ data: { accepted: 1, rejected: 0, skipped: 0, skipped_reasons: [], remaining: 0 } });

    expect(results.map((r) => [r.vehiclesEstimated, r.tripsEstimated])).toEqual([[2, 30], [0, 0], [0, 0]]);
  });

  it('los candidatos traen tecnología y capacidad propuestas (null si faltan)', () => {
    let items: { proposed: { technology: string | null; capacityTons: number | null } }[] = [];

    repo.vehicleCandidates(ORG, 'imp-1', 'NEW', { page: 1, pageSize: 10 }).subscribe((p) => (items = p.items as never));
    http.expectOne((r) => r.url === `${IMPORTS_URL}/imp-1/vehicles`).flush(pagedBody([candidateDto({ proposed: { configuration_code: 'C3', model_year: 2019, fuel_type: 'DIESEL', vehicle_type: null, technology: 'Euro V', capacity_tons: 35 } }), candidateDto()]));

    expect(items.map((i) => [i.proposed.technology, i.proposed.capacityTons])).toEqual([['Euro V', 35], [null, null]]);
  });

  it('get: calculable_with_estimation se mapea (tolerante a campos que faltan); null, ausente u OFF/desconocido = sin bloque', () => {
    const inputs: (object | null | undefined)[] = [{ trips: 40, vehicles: 3, mode: 'ASK' }, { trips: 40, vehicles: 3, already_estimated_trips: 2, mode: 'AUTO', requires_consent: false, pending_without_distance_or_reference: 5 }, null, undefined, { trips: 1, vehicles: 1, mode: 'OFF' }, { trips: 1, vehicles: 1, mode: 'NUEVO' }];
    const out: unknown[] = [];

    inputs.forEach((_, i) => repo.get(ORG, `x${i}`).subscribe((d) => out[i] = d.calculableWithEstimation));
    http.match((r) => r.url.startsWith(`${IMPORTS_URL}/x`)).forEach((req, i) => req.flush({ data: { ...importDetailDto(), calculable_with_estimation: inputs[i] } }));

    expect(out[0]).toEqual({ trips: 40, vehicles: 3, alreadyEstimatedTrips: 0, mode: 'ASK', requiresConsent: false, pendingWithoutDistanceOrReference: 0 });
    expect(out[1]).toEqual({ trips: 40, vehicles: 3, alreadyEstimatedTrips: 2, mode: 'AUTO', requiresConsent: false, pendingWithoutDistanceOrReference: 5 });
    expect(out.slice(2)).toEqual([null, null, null, null]);
  });
});
