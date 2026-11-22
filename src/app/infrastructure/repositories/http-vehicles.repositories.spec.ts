import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { analysisDto, analysisSummaryDto, findingDto, notificationDto, pagedBody, summaryDto, vehicleDetailDto, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { NotificationsRepository, PlatformVehiclesRepository, VehiclesRepository } from '../../domain/repositories/vehicles.repositories';

const ORG = ORG_ENVIA.id;

describe('HttpVehiclesRepository', () => {
  let repo: VehiclesRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(VehiclesRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('summary: GET con la empresa en la ruta', () => {
    let result: unknown;
    repo.summary(ORG).subscribe((v) => (result = v));

    const req = http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: summaryDto });

    expect(result).toEqual({ registered: 12, pendingNew: 3, conflicts: 2, inactive: 1 });
  });

  it('list: envía página, tamaño y filtros; omite los vacíos y mapea la página', () => {
    let total = 0;
    repo.list(ORG, { page: 2, pageSize: 10 }, { search: ' abc ', status: 'ACTIVE', configuration: 'C2', fuel: '' }).subscribe((p) => (total = p.total));

    const req = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('page_size')).toBe('10');
    expect(req.request.params.get('search')).toBe('abc');
    expect(req.request.params.get('status')).toBe('ACTIVE');
    expect(req.request.params.get('configuration')).toBe('C2');
    expect(req.request.params.has('fuel')).toBeFalse();
    req.flush(pagedBody([vehicleDto()], 21, 10, 2));

    expect(total).toBe(21);
  });

  it('get: detalle con historial y archivos', () => {
    let history = 0;
    repo.get(ORG, 'veh-1').subscribe((d) => (history = d.history.length));

    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto() });

    expect(history).toBe(2);
  });

  it('create: POST /vehicles con el cuerpo del contrato', () => {
    repo.create(ORG, { plate: ' abc123 ', configurationCode: 'C2', capacityTons: 8 }).subscribe();

    const req = http.expectOne(`${VEHICLES_ORG_URL}/vehicles`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ plate: 'abc123', configuration_code: 'C2', capacity_tons: 8 });
    req.flush({ data: vehicleDto() });
  });

  it('update: PATCH con confirm_structural', () => {
    repo.update(ORG, 'veh-1', { configurationCode: 'C3', confirmStructural: true }).subscribe();

    const req = http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ configuration_code: 'C3', confirm_structural: true });
    req.flush({ data: vehicleDto() });
  });

  it('createAnalysis: multipart con el archivo y la cabecera Idempotency-Key', () => {
    let created: unknown;
    const file = new File(['x'], 'operaciones.xlsx');
    repo.createAnalysis(ORG, file, 'key-1').subscribe((r) => (created = r));

    const req = http.expectOne(`${VEHICLES_ORG_URL}/vehicle-analyses`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect(req.request.headers.has('Content-Type')).toBeFalse();
    expect((req.request.body as FormData).get('file')).toEqual(jasmine.any(File));
    req.flush({ data: { id: 'run-1', status: 'QUEUED', duplicate: false } });

    expect(created).toEqual({ id: 'run-1', status: 'QUEUED', duplicate: false });
  });

  it('listAnalyses: página de corridas recientes, solo con pendientes cuando se pide', () => {
    let pending = 0;
    repo.listAnalyses(ORG, { page: 1, pageSize: 5 }).subscribe((p) => (pending = p.items[0].pending.new));
    const all = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicle-analyses`);
    expect(all.request.method).toBe('GET');
    expect(all.request.params.get('page_size')).toBe('5');
    expect(all.request.params.has('has_pending')).toBeFalse();
    all.flush(pagedBody([analysisSummaryDto()]));
    expect(pending).toBe(3);

    repo.listAnalyses(ORG, { page: 1, pageSize: 1 }, true).subscribe();
    const only = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicle-analyses`);
    expect(only.request.params.get('has_pending')).toBe('true');
    only.flush(pagedBody([]));
  });

  it('retryAnalysis: POST /retry y devuelve la corrida en cola', () => {
    let created: unknown;
    repo.retryAnalysis(ORG, 'run-1').subscribe((r) => (created = r));

    const req = http.expectOne(`${VEHICLES_ORG_URL}/vehicle-analyses/run-1/retry`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: { id: 'run-1', status: 'QUEUED', duplicate: false } }, { status: 202, statusText: 'Accepted' });
    expect(created).toEqual({ id: 'run-1', status: 'QUEUED', duplicate: false });
  });

  it('el archivo ya analizado responde 200 con duplicate: true y se mapea igual', () => {
    let duplicate = false;
    repo.createAnalysis(ORG, new File(['x'], 'a.xlsx'), 'k').subscribe((r) => (duplicate = r.duplicate));

    http.expectOne(`${VEHICLES_ORG_URL}/vehicle-analyses`).flush({ data: { id: 'run-1', status: 'COMPLETED', duplicate: true } }, { status: 200, statusText: 'OK' });
    expect(duplicate).toBeTrue();
  });

  it('getAnalysis y listFindings (con estado y decisión)', () => {
    let status = '';
    repo.getAnalysis(ORG, 'run-1').subscribe((a) => (status = a.status));
    http.expectOne(`${VEHICLES_ORG_URL}/vehicle-analyses/run-1`).flush({ data: analysisDto() });

    let plates: string[] = [];
    repo.listFindings(ORG, 'run-1', { page: 1, pageSize: 20 }, { state: 'CONFLICT', decision: 'PENDING' }).subscribe((p) => (plates = p.items.map((f) => f.plate)));
    const req = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicle-analyses/run-1/findings`);
    expect(req.request.params.get('state')).toBe('CONFLICT');
    expect(req.request.params.get('decision')).toBe('PENDING');
    req.flush(pagedBody([findingDto()]));

    expect(status).toBe('COMPLETED');
    expect(plates).toEqual(['ABC123']);
  });

  it('confirm y resolve usan las rutas del contrato', () => {
    let result: unknown;
    repo.confirm(ORG, 'run-1', { allNew: true }).subscribe((r) => (result = r));
    const confirm = http.expectOne(`${VEHICLES_ORG_URL}/vehicle-analyses/run-1/confirm`);
    expect(confirm.request.body).toEqual({ all_new: true });
    confirm.flush({ data: { registered: 3, already_registered: 0, skipped: 1 } });
    expect(result).toEqual({ registered: 3, alreadyRegistered: 0, skipped: 1 });

    let decision = '';
    repo.resolve(ORG, 'f-1', { action: 'KEEP_CURRENT' }).subscribe((f) => (decision = f.decision));
    const resolve = http.expectOne(`${VEHICLES_ORG_URL}/vehicle-findings/f-1/resolve`);
    expect(resolve.request.body).toEqual({ action: 'KEEP_CURRENT' });
    resolve.flush({ data: findingDto({ decision: 'REJECTED' }) });
    expect(decision).toBe('REJECTED');
  });

  it('el identificador de la empresa se codifica en la ruta', () => {
    let registered = 0;
    repo.summary('a/b').subscribe((summary) => (registered = summary.registered));

    http.expectOne('http://api.test/api/v1/organizations/a%2Fb/vehicles/summary').flush({ data: summaryDto });
    expect(registered).toBe(12);
  });
});

describe('HttpNotificationsRepository', () => {
  let repo: NotificationsRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(NotificationsRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list: solo no leídas cuando se pide, con la empresa en la ruta', () => {
    let titles: string[] = [];
    repo.list(ORG, { page: 1, pageSize: 5 }, true).subscribe((p) => (titles = p.items.map((n) => n.title)));

    const req = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/notifications`);
    expect(req.request.params.get('unread')).toBe('true');
    expect(req.request.params.get('page_size')).toBe('5');
    req.flush(pagedBody([notificationDto()]));

    expect(titles).toEqual(['Vehículos nuevos por confirmar']);

    repo.list(ORG, { page: 1, pageSize: 5 }, false).subscribe();
    const all = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/notifications`);
    expect(all.request.params.has('unread')).toBeFalse();
    all.flush(pagedBody([]));
  });

  it('unreadCount, markRead y markAllRead', () => {
    let count = -1;
    repo.unreadCount(ORG).subscribe((n) => (count = n));
    http.expectOne(`${VEHICLES_ORG_URL}/notifications/unread-count`).flush({ data: { count: 4 } });
    expect(count).toBe(4);

    let read = false;
    repo.markRead(ORG, 'n-1').subscribe((n) => (read = n.read));
    const readReq = http.expectOne(`${VEHICLES_ORG_URL}/notifications/n-1/read`);
    expect(readReq.request.method).toBe('POST');
    readReq.flush({ data: notificationDto({ read: true }) });
    expect(read).toBeTrue();

    let updated = -1;
    repo.markAllRead(ORG).subscribe((n) => (updated = n));
    const all = http.expectOne(`${VEHICLES_ORG_URL}/notifications/read-all`);
    expect(all.request.method).toBe('POST');
    all.flush({ data: { updated: 3 } });
    expect(updated).toBe(3);
  });
});

describe('HttpPlatformVehiclesRepository', () => {
  let repo: PlatformVehiclesRepository;
  let http: HttpTestingController;
  const BASE = `http://api.test/api/v1/platform/organizations/${ORG}/vehicles`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(PlatformVehiclesRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('summary: GET /platform/organizations/{id}/vehicles/summary', () => {
    let result: unknown;
    repo.summary(ORG).subscribe((v) => (result = v));

    const req = http.expectOne(`${BASE}/summary`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: summaryDto });
    expect(result).toEqual({ registered: 12, pendingNew: 3, conflicts: 2, inactive: 1 });
  });

  it('list: la empresa va en la ruta y se envían página, tamaño y filtros', () => {
    let total = 0;
    repo.list(ORG, { page: 3, pageSize: 10 }, { search: ' abc ', status: 'INACTIVE', configuration: 'C2', fuel: 'DIESEL' }).subscribe((p) => (total = p.total));

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('page_size')).toBe('10');
    expect(req.request.params.get('search')).toBe('abc');
    expect(req.request.params.get('status')).toBe('INACTIVE');
    expect(req.request.params.get('configuration')).toBe('C2');
    expect(req.request.params.get('fuel')).toBe('DIESEL');
    req.flush(pagedBody([vehicleDto()], 21, 10, 3));
    expect(total).toBe(21);
  });

  it('get: detalle con historial y archivos', () => {
    let runs = 0;
    repo.get(ORG, 'veh-1').subscribe((d) => (runs = d.runs.length));

    http.expectOne(`${BASE}/veh-1`).flush({ data: vehicleDetailDto() });
    expect(runs).toBe(1);
  });

  it('solo lee: no expone creación ni edición', () => {
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter((n) => n !== 'constructor').sort()).toEqual(['get', 'list', 'summary']);
  });
});
