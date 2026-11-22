import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { analysisDto, analysisSummaryDto, findingDto, pagedBody, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { toFinding } from '../../infrastructure/mappers/vehicles.mappers';
import { AnalysisFacade, FINDINGS_PAGE_SIZE, POLL_MAX_MS } from './analysis.facade';

const RUN = `${VEHICLES_ORG_URL}/vehicle-analyses/run-1`;

describe('AnalysisFacade', () => {
  let facade: AnalysisFacade;
  let http: HttpTestingController;
  const running = (rows = 10) => ({ data: analysisDto({ status: 'RUNNING', phase: 'READING', rows_processed: rows, rows_total: 100 }) });
  const poll = (): TestRequest => http.expectOne({ method: 'GET', url: RUN });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(AnalysisFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta ya y repite con espera creciente (1,5 s, 2,25 s, 3,4 s) hasta el tope de 5 s, sin parar mientras corre', fakeAsync(() => {
    facade.watch('run-1');
    poll().flush(running());

    for (const wait of [1500, 2250, 3375, POLL_MAX_MS, POLL_MAX_MS]) {
      tick(wait - 1);
      http.expectNone(RUN);
      tick(1);
      poll().flush(running());
    }

    expect(facade.analysis.data()?.status).toBe('RUNNING');
    facade.clear();
  }));

  it('al completarse deja de consultar y carga los hallazgos de cada estado', fakeAsync(() => {
    facade.watch('run-1');
    poll().flush(running());
    tick(1500);
    poll().flush({ data: analysisDto() });

    const states = ['NEW', 'CONFLICT', 'INCOMPLETE', 'INVALID'].map((state) => {
      const req = http.expectOne((r) => r.url === `${RUN}/findings` && r.params.get('state') === state);
      expect(req.request.params.get('page_size')).toBe(String(FINDINGS_PAGE_SIZE));
      expect(req.request.params.get('decision')).toBe(state === 'NEW' ? 'PENDING' : null);
      req.flush(pagedBody([findingDto({ state })]));

      return state;
    });

    expect(states.length).toBe(4);
    tick(60_000);
    http.expectNone(RUN);
    expect(facade.newFindings.data()?.items.length).toBe(1);
  }));

  it('una corrida fallida también detiene la consulta y no pide hallazgos', fakeAsync(() => {
    facade.watch('run-1');
    poll().flush({ data: analysisDto({ status: 'FAILED', error: 'El archivo no tiene el formato esperado.' }) });
    tick(60_000);

    http.expectNone(RUN);
    expect(facade.analysis.data()?.error).toBe('El archivo no tiene el formato esperado.');
  }));

  it('con la pestaña oculta no consulta y al volver a verse retoma enseguida', fakeAsync(() => {
    const hidden = spyOnProperty(document, 'hidden').and.returnValue(true);

    facade.watch('run-1');
    poll().flush(running());
    tick(60_000);
    http.expectNone(RUN);

    hidden.and.returnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    poll().flush(running());
    expect(facade.analysis.data()?.status).toBe('RUNNING');
    facade.clear();
  }));

  it('al cambiar de empresa se cancelan la consulta y los temporizadores y se descarta lo cargado', fakeAsync(() => {
    facade.watch('run-1');
    poll().flush(running());

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);
    tick(60_000);

    http.expectNone(RUN);
    expect(facade.analysis.data()).toBeNull();
  }));

  it('un error de consulta se muestra y detiene el seguimiento', fakeAsync(() => {
    facade.watch('run-1');
    poll().flush({ error: { code: 'ANALYSIS_NOT_FOUND' } }, { status: 404, statusText: 'x' });
    tick(60_000);

    http.expectNone(RUN);
    expect(facade.analysis.error()?.code).toBe('ANALYSIS_NOT_FOUND');
  }));

  it('cada subida lleva una Idempotency-Key nueva y registra el error de tamaño', () => {
    const keys: string[] = [];

    for (let i = 0; i < 2; i++) {
      facade.upload(new File(['x'], 'a.xlsx')).subscribe({ error: () => undefined });
      const req = http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicle-analyses` });

      keys.push(req.request.headers.get('Idempotency-Key')!);
      req.flush({ error: { code: 'FILE_TOO_LARGE' } }, { status: 413, statusText: 'Payload Too Large' });
    }

    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).not.toBe(keys[0]);
    expect(facade.uploadError()?.code).toBe('FILE_TOO_LARGE');
    expect(facade.uploading()).toBeFalse();
  });

  it('una subida duplicada se marca y refresca las cargas recientes', () => {
    facade.upload(new File(['x'], 'a.xlsx')).subscribe();
    http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicle-analyses` }).flush({ data: { id: 'run-1', status: 'COMPLETED', duplicate: true } }, { status: 200, statusText: 'OK' });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicle-analyses` && r.params.get('page_size') === '5').flush(pagedBody([analysisSummaryDto()]));
    http.expectOne((r) => r.params.get('has_pending') === 'true').flush(pagedBody([analysisSummaryDto()]));

    expect(facade.duplicate()).toBeTrue();
    expect(facade.latestPending.data()?.id).toBe('run-1');
  });

  it('la corrida más reciente con pendientes es null si no hay ninguna', () => {
    facade.loadLatestPending();
    http.expectOne((r) => r.params.get('has_pending') === 'true' && r.params.get('page_size') === '1').flush(pagedBody([]));

    expect(facade.latestPending.data()).toBeNull();
    expect(facade.latestPending.status()).toBe('ready');
  });

  describe('decisiones', () => {
    beforeEach(fakeAsync(() => {
      facade.watch('run-1');
      poll().flush({ data: analysisDto() });
      for (const state of ['NEW', 'CONFLICT', 'INCOMPLETE', 'INVALID']) {
        http.expectOne((r) => r.url === `${RUN}/findings` && r.params.get('state') === state).flush(pagedBody(state === 'CONFLICT' ? [findingDto()] : state === 'NEW' ? [findingDto({ id: 'n-1', state: 'NEW' })] : []));
      }
    }));

    const refresh = (): void => {
      http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: { registered: 1, pending_new: 0, conflicts: 0, inactive: 0 } });
      http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([]));
      http.expectOne((r) => r.params.get('page_size') === '5').flush(pagedBody([]));
      http.expectOne((r) => r.params.get('has_pending') === 'true').flush(pagedBody([]));
    };

    it('confirmar envía la selección, recarga los nuevos y refresca el inventario y las cargas', () => {
      let registered = 0;
      facade.confirm({ allNew: true }).subscribe((r) => (registered = r.registered));
      const req = http.expectOne({ method: 'POST', url: `${RUN}/confirm` });

      expect(req.request.body).toEqual({ all_new: true });
      req.flush({ data: { registered: 2, already_registered: 0, skipped: 0 } });
      http.expectOne((r) => r.url === `${RUN}/findings` && r.params.get('state') === 'NEW').flush(pagedBody([]));
      refresh();

      expect(registered).toBe(2);
      expect(facade.newFindings.data()?.total).toBe(0);
    });

    it('resolver muestra la decisión enseguida (optimista) y la confirma con la respuesta del servidor', () => {
      const finding = facade.conflicts.data()!.items[0];

      facade.resolve(finding, { action: 'KEEP_CURRENT' }).subscribe();
      expect(facade.conflicts.data()!.items[0].decision).toBe('REJECTED');

      const req = http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicle-findings/f-1/resolve` });
      expect(req.request.body).toEqual({ action: 'KEEP_CURRENT' });
      req.flush({ data: findingDto({ decision: 'REJECTED' }) });
      refresh();

      expect(facade.conflicts.data()!.items[0].decision).toBe('REJECTED');
    });

    it('si el servidor rechaza la decisión se revierte', () => {
      const finding = facade.conflicts.data()!.items[0];
      let failed = false;

      facade.resolve(finding, { action: 'ACCEPT_INCOMING', confirmStructural: true }).subscribe({ error: () => (failed = true) });
      expect(facade.conflicts.data()!.items[0].decision).toBe('CONFIRMED');

      http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicle-findings/f-1/resolve` }).flush({ error: { code: 'FINDING_ALREADY_RESOLVED' } }, { status: 409, statusText: 'Conflict' });

      expect(failed).toBeTrue();
      expect(facade.conflicts.data()!.items[0].decision).toBe('PENDING');
      expect(toFinding(findingDto()).id).toBe(finding.id);
    });

    it('reintentar una corrida fallida vuelve a seguir su avance', fakeAsync(() => {
      facade.retry('run-1').subscribe();
      http.expectOne({ method: 'POST', url: `${RUN}/retry` }).flush({ data: { id: 'run-1', status: 'QUEUED', duplicate: false } }, { status: 202, statusText: 'Accepted' });
      poll().flush({ data: analysisDto({ status: 'QUEUED', phase: null, rows_processed: 0, rows_total: null }) });
      expect(facade.analysis.data()?.status).toBe('QUEUED');
      facade.clear();
      flush();
      discardPeriodicTasks();
    }));
  });
});
