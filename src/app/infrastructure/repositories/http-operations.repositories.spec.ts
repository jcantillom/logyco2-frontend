import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { EXPORTS_URL, OPERATIONS_URL, capped, exportJobDto, operationTripDto, operationsPageBody, tabCountsDto, tripDetailDto } from '../../../testing/operations';
import { provideTestApp } from '../../../testing/providers';
import { ExportJob, OperationsPage, TabCounts, TripDetail } from '../../domain/models/operations';
import { OperationsRepository } from '../../domain/repositories/operations.repositories';
import { defaultReportFileName } from './http-operations.repositories';

describe('HttpOperationsRepository y mappers de Operaciones logísticas', () => {
  let http: HttpTestingController;
  let repository: OperationsRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(OperationsRepository);
  });
  afterEach(() => http.verify());

  it('GET .../operations/trips con vista, límite, cursor y filtros (lo vacío no se envía) y entrega la página de dominio', () => {
    let page: OperationsPage | null = null;

    repository
      .list(ORG_ENVIA.id, { status: 'PENDING', fuel: 'DIESEL', importFileId: 'f-1', from: '2026-01-01', to: '2026-03-31', dedup: 'held', query: 'ABC' }, { view: 'pending', limit: 50, cursor: 'cur-2' })
      .subscribe((p) => (page = p));
    const request = http.expectOne((r) => r.url === OPERATIONS_URL);

    expect(request.request.method).toBe('GET');
    const params = request.request.params;

    expect(params.get('view')).toBe('pending');
    expect(params.get('limit')).toBe('50');
    expect(params.get('cursor')).toBe('cur-2');
    expect(params.get('status')).toBe('PENDING');
    expect(params.get('fuel')).toBe('DIESEL');
    expect(params.get('import_file_id')).toBe('f-1');
    expect(params.get('from')).toBe('2026-01-01');
    expect(params.get('to')).toBe('2026-03-31');
    expect(params.get('dedup')).toBe('held');
    expect(params.get('q')).toBe('ABC');
    request.flush(operationsPageBody([operationTripDto()], { next: 'cur-3', total: capped(10000, true) }));

    expect(page!.items.length).toBe(1);
    expect(page!.nextCursor).toBe('cur-3');
    expect(page!.total).toEqual({ value: 10000, capped: true });
    expect(page!.limit).toBe(25);
  });

  it('sin filtros solo envía vista y límite; sin cursor ni total (páginas siguientes) el total es null', () => {
    let page: OperationsPage | null = null;

    repository.list(ORG_ENVIA.id, {}, { view: 'all', limit: 25, cursor: null }).subscribe((p) => (page = p));
    const request = http.expectOne((r) => r.url === OPERATIONS_URL);

    expect(request.request.params.keys().sort()).toEqual(['limit', 'view']);
    request.flush(operationsPageBody([], {}));
    expect(page!.total).toBeNull();
    expect(page!.nextCursor).toBeNull();
  });

  it('el mapper convierte decimales de texto a número («sin dato» es null, nunca 0) y conserva etiquetas y estado compartido del servidor', () => {
    let page: OperationsPage | null = null;

    repository.list(ORG_ENVIA.id, {}, { view: 'all', limit: 25 }).subscribe((p) => (page = p));
    http.expectOne((r) => r.url === OPERATIONS_URL).flush(
      operationsPageBody([
        operationTripDto(),
        operationTripDto({ id: 'trip-2', trip_id: null, trip_date: null, plate: null, distance_km: null, cargo_ton: '', kg_co2: null, status: 'BLOCKED', state_label: 'Inconsistencia', reason: 'INVALID_DATE', reason_label: 'Fecha inválida', vehicle: null, shared: { state: 'POSSIBLE_MATCH', label: 'Posible coincidencia' } }),
      ]),
    );
    const [first, second] = page!.items;

    expect(first.distanceKm).toBe(40);
    expect(first.cargoTon).toBe(18);
    expect(first.kgCo2).toBe(50.745);
    expect(first.configurationCode).toBe('C3S3');
    expect(first.shared).toBeNull();
    expect(second.tripId).toBeNull();
    expect(second.tripDate).toBeNull();
    expect(second.distanceKm).toBeNull();
    expect(second.cargoTon).toBeNull();
    expect(second.kgCo2).toBeNull();
    expect(second.configurationCode).toBeNull();
    expect(second.reasonLabel).toBe('Fecha inválida');
    expect(second.shared).toEqual({ state: 'POSSIBLE_MATCH', label: 'Posible coincidencia' });
  });

  it('GET .../summary con los mismos filtros pero sin vista, cursor ni límite', () => {
    let counts: TabCounts | null = null;

    repository.summary(ORG_ENVIA.id, { fuel: 'GASOLINE', query: 'Cali' }).subscribe((c) => (counts = c));
    const request = http.expectOne((r) => r.url === `${OPERATIONS_URL}/summary`);

    expect(request.request.params.get('fuel')).toBe('GASOLINE');
    expect(request.request.params.get('q')).toBe('Cali');
    expect(request.request.params.has('view')).toBeFalse();
    expect(request.request.params.has('cursor')).toBeFalse();
    expect(request.request.params.has('limit')).toBeFalse();
    request.flush({ data: tabCountsDto({ all: capped(10000, true) }), meta: {} });
    expect(counts!.all).toEqual({ value: 10000, capped: true });
    expect(counts!.shared).toEqual({ value: 10000, capped: true });
    expect(counts!.pending).toEqual({ value: 12, capped: false });
  });

  it('GET .../trips/{id} pide el detalle bajo demanda y lo mapea (valores guardados, factor y fuente, historial)', () => {
    let detail: TripDetail | null = null;

    repository.detail(ORG_ENVIA.id, 'trip-1').subscribe((d) => (detail = d));
    const request = http.expectOne(`${OPERATIONS_URL}/trip-1`);

    expect(request.request.method).toBe('GET');
    request.flush({ data: tripDetailDto(), meta: {} });

    expect(detail!.tripId).toBe('VIA-001245');
    expect(detail!.serviceId).toBe('SRV-9');
    expect(detail!.fileName).toBe('Viajes_marzo.xlsx');
    expect(detail!.vehicle).toEqual(jasmine.objectContaining({ configurationCode: 'C3S3', modelYear: 2019, capacityTons: 32 }));
    expect(detail!.efficiency).toEqual({ quantity: 8, unit: 'km/gal' });
    expect(detail!.emissions).toEqual({ kgCo2: 50.745, method: 'ESTIMATED', factor: { value: 10.149, unit: 'kg CO2/gal', fuelCode: 'DIESEL', sourceName: 'UPME', sourceDocument: 'Factores de emisión 2024', referenceYear: 2024 } });
    expect(detail!.history.length).toBe(2);
    expect(detail!.dedup.status).toBe('UNIQUE');
  });

  it('un detalle sin resultado calculado trae emissions null y sin vehículo trae vehicle null', () => {
    let detail: TripDetail | null = null;

    repository.detail(ORG_ENVIA.id, 'trip-9').subscribe((d) => (detail = d));
    http.expectOne(`${OPERATIONS_URL}/trip-9`).flush({ data: tripDetailDto({ emissions: null, vehicle: null, status: 'PENDING', state_label: 'Por completar', reason_label: 'Falta la distancia' }), meta: {} });

    expect(detail!.emissions).toBeNull();
    expect(detail!.vehicle).toBeNull();
    expect(detail!.reasonLabel).toBe('Falta la distancia');
  });

  it('exportReport: GET .../export como blob con la vista y los mismos filtros, sin cursor ni límite, y toma el nombre de Content-Disposition', () => {
    let result: { blob: Blob; fileName: string } | undefined;

    repository.exportReport(ORG_ENVIA.id, { status: 'PENDING', fuel: 'DIESEL', importFileId: 'f-1', from: '2026-01-01', to: '2026-03-31', dedup: 'all_states', query: 'ABC' }, 'pending').subscribe((f) => (result = f));
    const request = http.expectOne((r) => r.url === `${OPERATIONS_URL}/export`);

    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    const params = request.request.params;

    expect(params.get('view')).toBe('pending');
    expect(params.get('status')).toBe('PENDING');
    expect(params.get('fuel')).toBe('DIESEL');
    expect(params.get('import_file_id')).toBe('f-1');
    expect(params.get('from')).toBe('2026-01-01');
    expect(params.get('to')).toBe('2026-03-31');
    expect(params.get('dedup')).toBe('all_states');
    expect(params.get('q')).toBe('ABC');
    expect(params.has('cursor') || params.has('limit')).toBeFalse();
    request.flush(new Blob(['xlsx']), { headers: { 'Content-Disposition': 'attachment; filename="operaciones-logisticas_20261123.xlsx"' } });

    expect(result!.fileName).toBe('operaciones-logisticas_20261123.xlsx');
    expect(result!.blob.size).toBe(4);
  });

  it('exportReport: sin filtros solo envía la vista, y sin Content-Disposition usa operaciones-logisticas_<yyyymmdd>.xlsx', () => {
    let name = '';

    repository.exportReport(ORG_ENVIA.id, {}, 'all').subscribe((f) => (name = f.fileName));
    const request = http.expectOne((r) => r.url === `${OPERATIONS_URL}/export`);

    expect(request.request.params.keys()).toEqual(['view']);
    request.flush(new Blob(['x']));

    expect(name).toMatch(/^operaciones-logisticas_\d{8}\.xlsx$/);
    expect(defaultReportFileName(new Date(2026, 10, 3))).toBe('operaciones-logisticas_20261103.xlsx');
  });

  describe('reportes en segundo plano', () => {
    it('createExport: POST con los mismos filtros del listado y la pestaña (lo vacío no se envía) y entrega el trabajo de dominio', () => {
      let job: ExportJob | null = null;

      repository.createExport(ORG_ENVIA.id, { status: 'PENDING', fuel: 'DIESEL', importFileId: 'f-1', from: '2026-01-01', to: '2026-03-31', dedup: 'held', query: 'ABC' }, 'pending').subscribe((j) => (job = j));
      const request = http.expectOne((r) => r.url === EXPORTS_URL);

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ status: 'PENDING', fuel: 'DIESEL', import_file_id: 'f-1', from: '2026-01-01', to: '2026-03-31', dedup: 'held', q: 'ABC', view: 'pending' });
      request.flush({ data: exportJobDto({ status: 'QUEUED', progress: 0, downloadable: false, size_bytes: null }), meta: {} }, { status: 202, statusText: 'Accepted' });

      expect(job).toEqual(jasmine.objectContaining({ id: 'job-1', status: 'QUEUED', rowsTotal: 250000, progress: 0, sizeBytes: null, requestedByName: 'Laura Gómez', downloadable: false }));
    });

    it('createExport sin filtros solo envía la vista', () => {
      repository.createExport(ORG_ENVIA.id, {}, 'all').subscribe();
      const request = http.expectOne((r) => r.url === EXPORTS_URL);

      expect(request.request.body).toEqual({ view: 'all' });
      request.flush({ data: exportJobDto(), meta: {} });
    });

    it('listExports: GET de la empresa y mapeo del trabajo (errorCode, vencimiento, descargable)', () => {
      let jobs: ExportJob[] = [];

      repository.listExports(ORG_ENVIA.id).subscribe((list) => (jobs = list));
      http.expectOne((r) => r.url === EXPORTS_URL && r.method === 'GET').flush({ data: [exportJobDto(), exportJobDto({ id: 'bad', status: 'FAILED', error_code: 'EXPORT_FAILED', downloadable: false })], meta: {} });

      expect(jobs.map((j) => j.id)).toEqual(['job-1', 'bad']);
      expect(jobs[0].downloadable).toBeTrue();
      expect(jobs[0].expiresAt).not.toBeNull();
      expect(jobs[1].errorCode).toBe('EXPORT_FAILED');
    });

    it('cancelExport: POST .../{id}/cancel', () => {
      let job: ExportJob | null = null;

      repository.cancelExport(ORG_ENVIA.id, 'job-1').subscribe((j) => (job = j));
      const request = http.expectOne(`${EXPORTS_URL}/job-1/cancel`);

      expect(request.request.method).toBe('POST');
      request.flush({ data: exportJobDto({ status: 'CANCELED', downloadable: false, progress: null }), meta: {} });
      expect(job!.status).toBe('CANCELED');
    });

    it('downloadExport: GET .../{id}/download como blob con el nombre de Content-Disposition; sin cabecera usa el nombre de respaldo', () => {
      const names: string[] = [];

      repository.downloadExport(ORG_ENVIA.id, 'job-1').subscribe((file) => names.push(file.fileName));
      http.expectOne(`${EXPORTS_URL}/job-1/download`).flush(new Blob(['xlsx']), { headers: { 'Content-Disposition': 'attachment; filename="operaciones-logisticas_20261123-1200.xlsx"' } });
      repository.downloadExport(ORG_ENVIA.id, 'job-1').subscribe((file) => names.push(file.fileName));
      http.expectOne(`${EXPORTS_URL}/job-1/download`).flush(new Blob(['x']));

      expect(names[0]).toBe('operaciones-logisticas_20261123-1200.xlsx');
      expect(names[1]).toMatch(/^operaciones-logisticas_\d{8}\.xlsx$/);
    });
  });
});
