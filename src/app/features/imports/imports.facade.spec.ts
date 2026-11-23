import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, importCountsDto, importDetailDto, importSummaryDto, vehiclesDetectedDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { ImportSummaryDto } from '../../infrastructure/dto/imports.dto';
import { HISTORY_REFRESH_MS, ImportsFacade, MAX_CONCURRENT_UPLOADS, POLL_MAX_MS } from './imports.facade';

const ONE = `${IMPORTS_URL}/imp-1`;

describe('ImportsFacade', () => {
  let facade: ImportsFacade;
  let http: HttpTestingController;
  const running = (rows = 10) => ({ data: importDetailDto({ status: 'RUNNING', phase: 'READING', rows_processed: rows, rows_total: 100, review: null, format: null, headline: null }) });
  const poll = (): TestRequest => http.expectOne({ method: 'GET', url: ONE });
  const listRequest = (): TestRequest => http.expectOne((r) => r.url === IMPORTS_URL && r.method === 'GET');
  const countsRequest = (): TestRequest => http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/counts` });
  const posts = (): TestRequest[] => http.match({ method: 'POST', url: IMPORTS_URL });
  const created = (id: string, duplicate = false) => ({ data: { id, status: duplicate ? 'COMPLETED' : 'QUEUED', duplicate } });
  /** Responde la lista y los conteos que pide cada `loadList`. */
  function flushLists(items: ImportSummaryDto[], counts = importCountsDto({ total: items.length })): void {
    listRequest().flush(pagedBody(items));
    countsRequest().flush({ data: counts });
  }
  const file = (name: string): File => new File(['x'], name);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(ImportsFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sube cada archivo con su propia Idempotency-Key y refresca la cola y los conteos', () => {
    facade.enqueue([file('a.xlsx'), file('b.xlsx')]);
    const requests = posts();

    expect(requests.length).toBe(2);
    expect(requests[0].request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests[1].request.headers.get('Idempotency-Key')).not.toBe(requests[0].request.headers.get('Idempotency-Key'));
    expect((requests[0].request.body as FormData).get('file')).toEqual(jasmine.any(File));

    requests[0].flush(created('imp-1'), { status: 202, statusText: 'Accepted' });
    flushLists([importSummaryDto({ status: 'QUEUED' })]);
    expect(facade.uploads().length).toBe(1);
    requests[1].flush(created('imp-2'), { status: 202, statusText: 'Accepted' });
    flushLists([importSummaryDto({ status: 'QUEUED' })]);
    expect(facade.uploads()).toEqual([]);
    http.match(() => true);
  });

  it('envía como máximo 2 archivos a la vez y el resto espera; al terminar uno entra el siguiente', () => {
    facade.enqueue([file('a.xlsx'), file('b.xlsx'), file('c.xlsx'), file('d.xlsx')]);

    expect(MAX_CONCURRENT_UPLOADS).toBe(2);
    let sending = posts();
    expect(sending.length).toBe(2);
    expect(facade.uploads().map((u) => u.status)).toEqual(['sending', 'sending', 'waiting', 'waiting']);

    sending[0].flush(created('imp-1'), { status: 202, statusText: 'Accepted' });
    http.match((r) => r.url !== IMPORTS_URL || r.method === 'GET');
    sending = posts();
    expect(sending.length).toBe(1);
    expect(facade.uploads().map((u) => u.file.name)).toEqual(['b.xlsx', 'c.xlsx', 'd.xlsx']);
    expect(facade.uploads().map((u) => u.status)).toEqual(['sending', 'sending', 'waiting']);
    http.match(() => true);
  });

  it('un archivo que falla queda en la lista con su error sin frenar al resto; se reintenta con clave nueva o se descarta', () => {
    facade.enqueue([file('a.xlsx'), file('b.xlsx')]);
    const [first, second] = posts();

    first.flush({ error: { code: 'FILE_TOO_LARGE' } }, { status: 413, statusText: 'Payload Too Large' });
    expect(facade.uploads()[0]).toEqual(jasmine.objectContaining({ status: 'failed' }));
    expect(facade.uploads()[0].error?.message).toContain('tamaño permitido');
    expect(facade.uploads()[1].status).toBe('sending');

    facade.retryUpload(facade.uploads()[0].id);
    const retried = posts();
    expect(retried.length).toBe(1);
    expect(retried[0].request.headers.get('Idempotency-Key')).not.toBe(first.request.headers.get('Idempotency-Key'));
    retried[0].error(new ProgressEvent('error'), { status: 0 });
    expect(facade.uploads()[0].error?.kind).toBe('network');

    facade.discardUpload(facade.uploads()[0].id);
    expect(facade.uploads().map((u) => u.file.name)).toEqual(['b.xlsx']);
    second.flush(created('imp-2'), { status: 202, statusText: 'Accepted' });
    http.match(() => true);
  });

  it('los archivos ya cargados se cuentan juntos, sin bloquear al resto, y el aviso se descarta', () => {
    facade.enqueue([file('a.xlsx'), file('b.xlsx')]);
    const [first, second] = posts();

    first.flush(created('imp-1', true), { status: 200, statusText: 'OK' });
    second.flush(created('imp-2', true), { status: 200, statusText: 'OK' });

    expect(facade.duplicates()).toBe(2);
    facade.dismissDuplicates();
    expect(facade.duplicates()).toBe(0);
    http.match(() => true);
  });

  it('un archivo ya cargado guarda su carga original (nombre y fecha) una sola vez aunque se suba varias veces', () => {
    facade.enqueue([file('a.xlsx'), file('b.xlsx')]);
    const [first, second] = posts();
    const original = { data: { id: 'imp-0', status: 'COMPLETED', duplicate: true, file_name: 'original.xlsx', created_at: '2026-03-01T10:00:00Z' } };

    first.flush(original, { status: 200, statusText: 'OK' });
    second.flush(original, { status: 200, statusText: 'OK' });

    expect(facade.duplicates()).toBe(2);
    expect(facade.duplicateOriginals()).toEqual([{ id: 'imp-0', fileName: 'original.xlsx', createdAt: '2026-03-01T10:00:00Z' }]);
    expect(facade.uploads().length).toBe(0);
    facade.dismissDuplicates();
    expect(facade.duplicateOriginals()).toEqual([]);
    http.match(() => true);
  });

  it('subir mientras hay otra pestaña activa vuelve a «Todas» en la página 1', () => {
    facade.setFilter('FAILED');
    http.match(() => true);
    facade.enqueue([file('a.xlsx')]);

    expect(facade.filter()).toBe('ALL');
    expect(listRequest().request.params.get('filter')).toBe('ALL');
    http.match(() => true);
  });

  it('el filtro viaja al servidor, reinicia la página y sobrevive a la renovación en vivo', fakeAsync(() => {
    facade.loadList(3);
    listRequest().flush(pagedBody([importSummaryDto({ status: 'RUNNING' })], 25, 10, 3));
    countsRequest().flush({ data: importCountsDto({ total: 25, in_progress: 1 }) });

    facade.setFilter('IN_PROGRESS');
    const req = listRequest();
    expect(req.request.params.get('filter')).toBe('IN_PROGRESS');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(pagedBody([importSummaryDto({ status: 'RUNNING' })]));
    countsRequest().flush({ data: importCountsDto({ total: 25, in_progress: 1 }) });

    tick(HISTORY_REFRESH_MS);
    const refresh = listRequest();
    expect(refresh.request.params.get('filter')).toBe('IN_PROGRESS');
    expect(refresh.request.params.get('page')).toBe('1');
    refresh.flush(pagedBody([importSummaryDto({ status: 'COMPLETED' })]));
    countsRequest().flush({ data: importCountsDto({ total: 25 }) });
    expect(facade.filter()).toBe('IN_PROGRESS');
  }));

  it('elegir la pestaña que ya está activa no repite la petición', () => {
    facade.loadList(1);
    flushLists([importSummaryDto()]);

    facade.setFilter('ALL');
    http.expectNone((r) => r.url === IMPORTS_URL);
    expect(facade.counts.data()?.total).toBe(1);
  });

  describe('aviso al terminar el lote', () => {
    const withVehicles = (id: string): ImportSummaryDto => importSummaryDto({ id, vehicles_detected: vehiclesDetectedDto() });

    it('un solo archivo terminado con vehículos ofrece su ventana', () => {
      facade.enqueue([file('a.xlsx')]);
      posts()[0].flush(created('imp-1'), { status: 202, statusText: 'Accepted' });
      flushLists([importSummaryDto({ status: 'RUNNING' })]);
      expect(facade.batchResult()).toBeNull();

      facade.loadList();
      flushLists([withVehicles('imp-1')]);

      expect(facade.batchResult()).toEqual({ kind: 'single', item: jasmine.objectContaining({ id: 'imp-1' }) });
      facade.dismissBatchResult();
      expect(facade.batchResult()).toBeNull();
    });

    it('varios archivos ofrecen un aviso agrupado con cuántos tienen vehículos por revisar', () => {
      facade.enqueue([file('a.xlsx'), file('b.xlsx'), file('c.xlsx')]);
      const sent = posts();

      sent[0].flush(created('imp-1'), { status: 202, statusText: 'Accepted' });
      http.match((r) => r.method === 'GET');
      sent[1].flush(created('imp-2'), { status: 202, statusText: 'Accepted' });
      http.match((r) => r.method === 'GET');
      posts()[0].flush(created('imp-3'), { status: 202, statusText: 'Accepted' });
      flushLists([withVehicles('imp-1'), withVehicles('imp-2'), importSummaryDto({ id: 'imp-3' })]);

      expect(facade.batchResult()).toEqual({ kind: 'group', count: 2 });
    });

    it('no ofrece nada mientras queden envíos pendientes ni cuando ninguna carga propone vehículos', () => {
      facade.enqueue([file('a.xlsx'), file('b.xlsx'), file('c.xlsx')]);
      const sent = posts();

      sent[0].flush(created('imp-1'), { status: 202, statusText: 'Accepted' });
      flushLists([withVehicles('imp-1')]);
      expect(facade.batchResult()).toBeNull();

      sent[1].flush(created('imp-2'), { status: 202, statusText: 'Accepted' });
      http.match((r) => r.method === 'GET');
      posts()[0].flush(created('imp-3'), { status: 202, statusText: 'Accepted' });
      flushLists([importSummaryDto({ id: 'imp-1' }), importSummaryDto({ id: 'imp-2' }), importSummaryDto({ id: 'imp-3' })]);

      expect(facade.batchResult()).toBeNull();
    });

    it('si la carga ya no está en la página visible la consulta una vez', () => {
      facade.enqueue([file('a.xlsx')]);
      posts()[0].flush(created('imp-9'), { status: 202, statusText: 'Accepted' });
      flushLists([importSummaryDto({ id: 'otra' })]);
      http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-9` }).flush({ data: importDetailDto({ id: 'imp-9', vehicles_detected: vehiclesDetectedDto() }) });

      expect(facade.batchResult()).toEqual({ kind: 'single', item: jasmine.objectContaining({ id: 'imp-9' }) });
    });
  });

  it('consulta con espera creciente (1,5 s, 2,25 s, 3,4 s) hasta el tope de 5 s mientras corre', fakeAsync(() => {
    facade.openDetail('imp-1');
    poll().flush(running());

    for (const wait of [1500, 2250, 3375, POLL_MAX_MS, POLL_MAX_MS]) {
      tick(wait - 1);
      http.expectNone(ONE);
      tick(1);
      poll().flush(running());
    }

    expect(facade.detail.data()?.status).toBe('RUNNING');
    facade.closeDetail();
  }));

  it('al terminar (lista o fallida) deja de consultar', fakeAsync(() => {
    facade.openDetail('imp-1');
    poll().flush(running());
    tick(1500);
    poll().flush({ data: importDetailDto() });
    tick(60_000);
    http.expectNone(ONE);
    expect(facade.detail.data()?.review?.rowsRead).toBe(200);

    facade.openDetail('imp-1');
    poll().flush({ data: importDetailDto({ status: 'FAILED', error: 'No se pudo leer el archivo.', review: null }) });
    tick(60_000);
    http.expectNone(ONE);
    expect(facade.detail.data()?.error).toBe('No se pudo leer el archivo.');
  }));

  it('con la pestaña oculta no consulta y al volver a verse retoma enseguida', fakeAsync(() => {
    const hidden = spyOnProperty(document, 'hidden').and.returnValue(true);

    facade.openDetail('imp-1');
    poll().flush(running());
    tick(60_000);
    http.expectNone(ONE);

    hidden.and.returnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    poll().flush(running());
    expect(facade.detail.data()?.status).toBe('RUNNING');
    facade.closeDetail();
  }));

  it('al cambiar de empresa se cancelan consultas y temporizadores y se descarta todo', fakeAsync(() => {
    facade.openDetail('imp-1');
    poll().flush(running());
    facade.setFilter('FAILED');
    listRequest().flush(pagedBody([importSummaryDto({ status: 'RUNNING' })], 25, 10, 3));
    countsRequest().flush({ data: importCountsDto({ in_progress: 1 }) });
    facade.enqueue([file('a.xlsx')]);

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);
    tick(60_000);

    http.expectNone(ONE);
    http.expectNone((r) => r.url === IMPORTS_URL && r.method === 'GET' && r.params.get('filter') !== 'ALL');
    http.match(() => true);
    expect(facade.detail.data()).toBeNull();
    expect(facade.list.data()).toBeNull();
    expect(facade.counts.data()).toBeNull();
    expect(facade.uploads()).toEqual([]);
    expect(facade.filter()).toBe('ALL');
    expect(facade.page()).toBe(1);
  }));

  it('mientras alguna carga siga en cola o revisión el historial se renueva solo; al terminar todas, deja de hacerlo', fakeAsync(() => {
    facade.loadList(1);
    flushLists([importSummaryDto({ status: 'RUNNING' })], importCountsDto({ total: 1, in_progress: 1 }));

    tick(HISTORY_REFRESH_MS - 1);
    http.expectNone((r) => r.url === IMPORTS_URL);
    tick(1);
    flushLists([importSummaryDto({ status: 'COMPLETED' })], importCountsDto({ total: 1, completed: 1 }));

    tick(HISTORY_REFRESH_MS * 3);
    http.expectNone((r) => r.url === IMPORTS_URL);
    expect(facade.list.data()?.items[0].status).toBe('COMPLETED');
  }));

  it('con otra pestaña activa también se renueva mientras los conteos digan que hay cargas en curso', fakeAsync(() => {
    facade.loadList(1);
    flushLists([importSummaryDto()], importCountsDto({ total: 3, completed: 1, in_progress: 2 }));

    tick(HISTORY_REFRESH_MS);
    flushLists([importSummaryDto()], importCountsDto({ total: 3, completed: 3 }));
    tick(HISTORY_REFRESH_MS * 2);
    http.expectNone((r) => r.url === IMPORTS_URL);
    expect(facade.counts.data()?.inProgress).toBe(0);
  }));

  it('el historial con la pestaña oculta no se renueva y al volver se pide de nuevo', fakeAsync(() => {
    const hidden = spyOnProperty(document, 'hidden').and.returnValue(false);

    facade.loadList(1);
    flushLists([importSummaryDto({ status: 'QUEUED' })], importCountsDto({ total: 1, in_progress: 1 }));
    hidden.and.returnValue(true);
    tick(HISTORY_REFRESH_MS * 2);
    http.expectNone((r) => r.url === IMPORTS_URL);

    hidden.and.returnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    flushLists([importSummaryDto({ status: 'COMPLETED' })]);
    expect(facade.list.data()?.items[0].status).toBe('COMPLETED');
  }));

  it('reintentar una carga fallida la vuelve a encolar y renueva la cola', () => {
    facade.retry('imp-1').subscribe();
    http.expectOne({ method: 'POST', url: `${ONE}/retry` }).flush({ data: { id: 'imp-1', status: 'QUEUED', duplicate: false } }, { status: 202, statusText: 'Accepted' });
    flushLists([importSummaryDto({ status: 'QUEUED' })]);

    expect(facade.list.data()?.items[0].status).toBe('QUEUED');
  });

  it('tras decidir sobre los vehículos vuelve a pedir el detalle abierto y la cola con sus conteos', fakeAsync(() => {
    facade.reloadImport('imp-1');
    poll().flush({ data: importDetailDto() });
    flushLists([importSummaryDto()]);

    expect(facade.detail.data()?.id).toBe('imp-1');
    expect(facade.counts.data()?.total).toBe(1);
  }));

  it('descarga la plantilla autenticada, la guarda con su nombre y libera la URL temporal', fakeAsync(() => {
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:plantilla');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('plantilla_2026.xlsx');
      expect(this.href).toContain('blob:plantilla');
    });

    facade.downloadTemplate();
    expect(facade.downloading()).toBeTrue();
    http.expectOne(`${IMPORTS_URL}/template`).flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="plantilla_2026.xlsx"' } });

    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    tick();
    expect(revoke).toHaveBeenCalledWith('blob:plantilla');
    expect(facade.downloading()).toBeFalse();
  }));

  it('si la descarga falla muestra el error y no guarda nada', async () => {
    const create = spyOn(URL, 'createObjectURL');

    facade.downloadTemplate();
    http.expectOne(`${IMPORTS_URL}/template`).flush(new Blob([JSON.stringify({ error: { code: 'ORGANIZATION_ACCESS_DENIED' } })]), { status: 403, statusText: 'Forbidden' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(facade.downloadError()?.kind).toBe('forbidden');
    expect(facade.downloadError()?.code).toBe('ORGANIZATION_ACCESS_DENIED');
    expect(facade.downloading()).toBeFalse();
    expect(create).not.toHaveBeenCalled();
  });

  it('una descarga en curso no se repite', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
    spyOn(HTMLAnchorElement.prototype, 'click');
    facade.downloadTemplate();
    facade.downloadTemplate();

    http.expectOne(`${IMPORTS_URL}/template`).flush(new Blob(['x']));
    expect(facade.downloading()).toBeFalse();
  });
});
