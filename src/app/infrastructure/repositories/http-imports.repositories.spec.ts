import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, candidateDto, changedCandidateDto, importDetailDto, importSummaryDto, vehiclesDetectedDto } from '../../../testing/imports';
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

    expect(created).toEqual({ id: 'imp-1', status: 'QUEUED', duplicate: false });
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
    http.expectOne(`${IMPORTS_URL}/counts`).flush({ data: { total: 9, in_progress: 2, completed: 5, failed: 2, vehicles_pending: 3, rows_read: 1000, rows_calculable: 900, rows_pending: 100, rows_real: 600, rows_estimated: 300, vehicles_new_pending: 4, vehicles_changed_pending: 2, period_from: '2026-01-05', period_to: '2026-03-28', distance_km: 1000, cargo_ton: 12.5, rows_with_distance: 9, rows_with_cargo: 8 } });

    expect(counts).toEqual({ total: 9, inProgress: 2, completed: 5, failed: 2, vehiclesPending: 3, rowsRead: 1000, rowsCalculable: 900, rowsPending: 100, rowsReal: 600, rowsEstimated: 300, vehiclesNewPending: 4, vehiclesChangedPending: 2, periodFrom: '2026-01-05', periodTo: '2026-03-28', distanceKm: 1000, cargoTon: 12.5, rowsWithDistance: 9, rowsWithCargo: 8 });
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
    expect(first!.proposed).toEqual({ configurationCode: 'C3', modelYear: 2019, fuelType: 'DIESEL', vehicleType: null });
  });

  it('decideVehicles: POST /vehicles/decisions con candidate_ids y SIN kind', () => {
    let result: unknown;
    repo.decideVehicles(ORG, 'imp-1', { decision: 'ACCEPT', candidateIds: ['cand-1', 'cand-2'] }).subscribe((r) => (result = r));

    const req = http.expectOne(`${IMPORTS_URL}/imp-1/vehicles/decisions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ decision: 'ACCEPT', candidate_ids: ['cand-1', 'cand-2'] });
    req.flush({ data: { accepted: 1, rejected: 0, skipped: 1, skipped_reasons: [{ code: 'ALREADY_DECIDED', rows: 1 }] } });

    expect(result).toEqual({ accepted: 1, rejected: 0, skipped: 1, skippedReasons: [{ code: 'ALREADY_DECIDED', rows: 1 }] });
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
});
