import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { ORG_COORDINADORA, ORG_ENVIA, buildUser, membership } from '../../../testing/builders';
import { EXPORTS_URL, exportJobDto, exportsBody, runningExportDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { EXPORTS_MAX_BACKOFF_MS, EXPORTS_POLL_MS, OperationExportsFacade } from './operation-exports.facade';

describe('OperationExportsFacade', () => {
  let http: HttpTestingController;
  let facade: OperationExportsFacade;
  const lists = (): TestRequest[] => http.match((r) => r.url === EXPORTS_URL && r.method === 'GET');
  const list = (): TestRequest => http.expectOne((r) => r.url === EXPORTS_URL && r.method === 'GET');
  const noList = (): void => expect(lists().length).toBe(0);
  let visibility: 'hidden' | 'visible' = 'visible';
  const hidden = (state: 'hidden' | 'visible'): void => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    visibility = 'visible';
    spyOnProperty(document, 'visibilityState', 'get').and.callFake(() => visibility);
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER']), membership(ORG_COORDINADORA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(OperationExportsFacade);
  });

  afterEach(() => {
    facade.stop();
    http.verify();
  });

  it('carga los trabajos del servidor (recargar la página no los pierde) y la insignia cuenta los activos y los listos', () => {
    facade.load();
    expect(facade.status()).toBe('loading');
    list().flush(exportsBody(runningExportDto(50000), exportJobDto(), exportJobDto({ id: 'job-old', status: 'EXPIRED', downloadable: false })));

    expect(facade.status()).toBe('ready');
    expect(facade.jobs().length).toBe(3);
    expect(facade.liveCount()).toBe(2);
    expect(facade.jobs()[1].downloadable).toBeTrue();
    expect(facade.jobs()[0].progress).toBe(20);
    facade.stop();
  });

  it('consulta cada 2 s mientras haya un trabajo activo y se detiene sola cuando ninguno lo está', fakeAsync(() => {
    facade.load();
    list().flush(exportsBody(runningExportDto(50000)));

    tick(EXPORTS_POLL_MS - 1);
    noList();
    tick(1);
    list().flush(exportsBody(runningExportDto(125000)));
    expect(facade.jobs()[0].rowsDone).toBe(125000);

    tick(EXPORTS_POLL_MS);
    list().flush(exportsBody(exportJobDto({ id: 'job-run' })));
    expect(facade.active().length).toBe(0);

    tick(60_000);
    noList();  // sin nada activo no hay más consultas
    flush();
  }));

  it('con la pestaña oculta no consulta y al volver consulta de inmediato', fakeAsync(() => {
    facade.load();
    list().flush(exportsBody(runningExportDto(50000)));

    hidden('hidden');
    tick(10 * EXPORTS_POLL_MS);
    noList();

    hidden('visible');
    list().flush(exportsBody(runningExportDto(200000)));
    tick(EXPORTS_POLL_MS);
    list().flush(exportsBody(exportJobDto({ id: 'job-run' })));
    flush();
  }));

  it('tras un error espera cada vez más (2, 4, 8… hasta 30 s), conserva lo mostrado y se recupera sola', fakeAsync(() => {
    facade.load();
    list().flush(exportsBody(runningExportDto(50000)));
    tick(EXPORTS_POLL_MS);
    list().flush({ error: { code: 'X', message: 'x' } }, { status: 503, statusText: 'Unavailable' });

    expect(facade.error()).not.toBeNull();
    expect(facade.status()).toBe('ready');  // lo ya mostrado no se pierde
    expect(facade.jobs().length).toBe(1);

    tick(EXPORTS_POLL_MS * 2 - 1);
    noList();
    tick(1);
    list().flush({ error: { code: 'X', message: 'x' } }, { status: 503, statusText: 'Unavailable' });
    tick(EXPORTS_POLL_MS * 4 - 1);
    noList();
    tick(1);
    list().flush(exportsBody(runningExportDto(60000)));  // se recuperó

    expect(facade.error()).toBeNull();
    tick(EXPORTS_POLL_MS);  // vuelve al ritmo normal
    list().flush(exportsBody(exportJobDto({ id: 'job-run' })));
    flush();
    expect(EXPORTS_MAX_BACKOFF_MS).toBe(30_000);
  }));

  it('el error de la primera carga queda en estado de error y se puede reintentar', () => {
    facade.load();
    list().flush({ error: { code: 'X', message: 'x' } }, { status: 500, statusText: 'Server Error' });

    expect(facade.status()).toBe('error');
    facade.load();
    list().flush(exportsBody());
    expect(facade.status()).toBe('ready');
    facade.stop();
  });

  it('stop() cancela la consulta en vuelo y el temporizador; no vuelve a consultar', fakeAsync(() => {
    facade.load();
    const inFlight = list();
    facade.stop();

    expect(inFlight.cancelled).toBeTrue();
    facade.load();
    list().flush(exportsBody(runningExportDto(1)));
    facade.stop();
    tick(60_000);
    noList();
  }));

  it('cambiar de empresa descarta lo mostrado y cancela la consulta en curso', () => {
    facade.load();
    list().flush(exportsBody(runningExportDto(50000)));
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.jobs()).toEqual([]);
    expect(facade.status()).toBe('idle');
    expect(facade.panelOpen()).toBeFalse();
  });

  it('pedir un reporte lo agrega primero, abre el panel, anuncia el estado y empieza a vigilarlo', fakeAsync(() => {
    facade.load();
    list().flush(exportsBody(exportJobDto({ id: 'old' })));
    let result: unknown = 'sin respuesta';
    facade.request({ fuel: 'DIESEL' }, 'calculated', (error) => (result = error));
    const request = http.expectOne((r) => r.url === EXPORTS_URL && r.method === 'POST');

    expect(request.request.body).toEqual({ fuel: 'DIESEL', view: 'calculated' });
    expect(facade.requesting()).toBeTrue();
    facade.request({}, 'all');  // una sola petición a la vez
    request.flush({ data: exportJobDto({ id: 'new', status: 'QUEUED', progress: 0, downloadable: false, size_bytes: null }), meta: {} }, { status: 202, statusText: 'Accepted' });

    expect(result).toBeNull();
    expect(facade.jobs().map((job) => job.id)).toEqual(['new', 'old']);
    expect(facade.panelOpen()).toBeTrue();
    expect(facade.announcement()).toContain('Reporte en cola');
    tick(EXPORTS_POLL_MS);
    list().flush(exportsBody(exportJobDto({ id: 'new', status: 'RUNNING', progress: 10, downloadable: false }), exportJobDto({ id: 'old' })));
    expect(facade.announcement()).toContain('generando 10 %');
    tick(EXPORTS_POLL_MS);
    list().flush(exportsBody(exportJobDto({ id: 'new' }), exportJobDto({ id: 'old' })));
    expect(facade.announcement()).toBe('Reporte listo para descargar.');
    flush();
  }));

  it('pedir un reporte cancela la consulta de la lista en vuelo: su respuesta anterior no puede pisar el trabajo nuevo, y la vigilancia continúa', fakeAsync(() => {
    facade.load();
    list().flush(exportsBody(runningExportDto(1000)));
    tick(EXPORTS_POLL_MS);
    const stale = list();  // consulta en vuelo cuando la persona pide el reporte
    facade.request({}, 'all');
    expect(stale.cancelled).toBeTrue();
    http.expectOne((r) => r.method === 'POST').flush({ data: exportJobDto({ id: 'new', status: 'QUEUED', progress: 0, downloadable: false, size_bytes: null }), meta: {} }, { status: 202, statusText: 'Accepted' });

    expect(facade.jobs().map((job) => job.id)).toEqual(['new', 'job-run']);
    tick(EXPORTS_POLL_MS);
    list().flush(exportsBody(exportJobDto({ id: 'new', status: 'RUNNING', progress: 5, downloadable: false }), runningExportDto(2000)));
    expect(facade.jobs()[0].status).toBe('RUNNING');
    tick(EXPORTS_POLL_MS);
    list().flush(exportsBody(exportJobDto({ id: 'new' }), exportJobDto({ id: 'job-run' })));
    flush();
  }));

  it('si el pedido falla retoma la vigilancia que se cortó al pedir', () => {
    facade.load();
    list().flush(exportsBody(runningExportDto(1000)));
    facade.request({}, 'all');
    http.expectOne((r) => r.method === 'POST').flush({ error: { code: 'EXPORT_LIMIT', message: 'x' } }, { status: 409, statusText: 'Conflict' });

    list().flush(exportsBody(runningExportDto(2000)));
    expect(facade.jobs()[0].rowsDone).toBe(2000);
    facade.stop();
  });

  it('si el servidor rechaza el pedido (409) lo entrega como AppError con el mensaje del catálogo', () => {
    let failure: { code?: string; message?: string } | null = null;
    facade.request({}, 'all', (error) => (failure = error));
    http.expectOne((r) => r.method === 'POST').flush({ error: { code: 'EXPORT_LIMIT', message: 'x' } }, { status: 409, statusText: 'Conflict' });

    expect(failure!.code).toBe('EXPORT_LIMIT');
    expect(failure!.message).toContain('máximo de reportes');
    expect(facade.requesting()).toBeFalse();
  });

  it('cancelar marca el trabajo, anuncia y un error se muestra con el mensaje del catálogo y vuelve a consultar', () => {
    facade.load();
    list().flush(exportsBody(runningExportDto(50000)));
    facade.cancel('job-run');
    facade.cancel('job-run');  // una sola acción por trabajo
    const cancel = http.expectOne((r) => r.url === `${EXPORTS_URL}/job-run/cancel`);

    expect(facade.busy().has('job-run')).toBeTrue();
    cancel.flush({ data: exportJobDto({ id: 'job-run', status: 'CANCELED', downloadable: false, progress: null }), meta: {} });
    expect(facade.jobs()[0].status).toBe('CANCELED');
    expect(facade.busy().size).toBe(0);
    expect(facade.announcement()).toBe('Reporte cancelado.');

    facade.cancel('job-run');
    http.expectOne((r) => r.url === `${EXPORTS_URL}/job-run/cancel`).flush({ error: { code: 'EXPORT_NOT_ACTIVE', message: 'x' } }, { status: 409, statusText: 'Conflict' });
    expect(facade.actionError()?.code).toBe('EXPORT_NOT_ACTIVE');
    list().flush(exportsBody(exportJobDto({ id: 'job-run', status: 'COMPLETED' })));
    facade.stop();
  });

  it('descargar guarda el archivo con el nombre del servidor; si venció muestra el motivo; salir de la pantalla cancela una descarga a medias', () => {
    facade.load();
    list().flush(exportsBody(exportJobDto()));
    spyOn(URL, 'revokeObjectURL');
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
    const click = spyOn(HTMLAnchorElement.prototype, 'click').and.stub();

    facade.download('job-1');
    http.expectOne((r) => r.url === `${EXPORTS_URL}/job-1/download`).flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="operaciones-logisticas_20261123-1200.xlsx"' } });
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(facade.busy().size).toBe(0);

    facade.download('job-1');
    http.expectOne((r) => r.url === `${EXPORTS_URL}/job-1/download`).flush(new Blob([JSON.stringify({ error: { code: 'EXPORT_EXPIRED', message: 'x' } })], { type: 'application/json' }), { status: 409, statusText: 'Conflict' });
    return new Promise<void>((resolve) => {
      const wait = (attempt: number): void => {
        if (facade.actionError() || attempt > 100) {
          expect(facade.actionError()?.code).toBe('EXPORT_EXPIRED');
          list().flush(exportsBody(exportJobDto({ status: 'EXPIRED', downloadable: false })));
          facade.download('job-1');
          const pending = http.expectOne((r) => r.url === `${EXPORTS_URL}/job-1/download`);
          facade.stop();
          expect(pending.cancelled).toBeTrue();
          expect(facade.busy().size).toBe(0);
          resolve();

          return;
        }

        setTimeout(() => wait(attempt + 1), 10);
      };

      wait(0);
    });
  });
});
