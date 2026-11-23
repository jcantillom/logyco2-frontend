import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { RECONCILIATION_URL, candidatesBody, sharedCandidateDtos } from '../../../testing/reconciliation';
import { SessionStore } from '../../core/auth/session.store';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { OrganizationContext } from '../../core/org/organization-context';
import { MAX_SHARED_DECISIONS } from '../../domain/models/reconciliation';
import { SharedOperationsFacade } from './shared-operations.facade';

describe('SharedOperationsFacade', () => {
  let http: HttpTestingController;
  let facade: SharedOperationsFacade;
  const CANDIDATES = `${RECONCILIATION_URL}/candidates`;
  const listRequest = () => http.expectOne((r) => r.url === CANDIDATES && r.method === 'GET');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(SharedOperationsFacade);
  });
  afterEach(() => http.verify());

  it('lista la primera página de 5 y expone el total del servidor', () => {
    facade.load();
    const request = listRequest();

    expect([request.request.params.get('page'), request.request.params.get('page_size')]).toEqual(['1', '5']);
    request.flush(candidatesBody(sharedCandidateDtos(5), 12));

    expect(facade.list.status()).toBe('ready');
    expect(facade.list.data()?.total).toBe(12);
  });

  it('pagina sin pasar por «cargando» y vuelve a la página 1 al cambiar el tamaño o el estado', () => {
    facade.load();
    listRequest().flush(candidatesBody(sharedCandidateDtos(5), 12));

    facade.load({ page: 2 });
    expect(facade.list.status()).toBe('ready');
    const second = listRequest();

    expect(second.request.params.get('page')).toBe('2');
    second.flush(candidatesBody(sharedCandidateDtos(5), 12, 5, 2));

    facade.load({ pageSize: 10 });
    const sized = listRequest();

    expect([sized.request.params.get('page'), sized.request.params.get('page_size')]).toEqual(['1', '10']);
    sized.flush(candidatesBody(sharedCandidateDtos(10), 12, 10));

    facade.load({ page: 2 });
    listRequest().flush(candidatesBody(sharedCandidateDtos(2), 12, 10, 2));
    facade.load({ status: 'CONFLICTING_DATA' });
    const filtered = listRequest();

    expect([filtered.request.params.get('status'), filtered.request.params.get('page')]).toEqual(['CONFLICTING_DATA', '1']);
    filtered.flush(candidatesBody([]));
  });

  it('un error de la lista queda en el recurso y reintentar vuelve a pedir', () => {
    facade.load();
    listRequest().flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Server Error' });

    expect(facade.list.status()).toBe('error');
    facade.load();
    listRequest().flush(candidatesBody(sharedCandidateDtos(1)));
    expect(facade.list.status()).toBe('ready');
  });

  it('marca y desmarca, marca toda la página y no pasa de 500', () => {
    facade.toggle('cand-1');
    expect(facade.isSelected('cand-1')).toBeTrue();
    facade.togglePage(['cand-1', 'cand-2', 'cand-3']);
    expect(facade.selection()).toEqual(['cand-1', 'cand-2', 'cand-3']);
    facade.togglePage(['cand-1', 'cand-2', 'cand-3']);
    expect(facade.selectedCount()).toBe(0);

    facade.selection.set(Array.from({ length: MAX_SHARED_DECISIONS }, (_, i) => `x${i}`));
    expect(facade.selectionFull()).toBeTrue();
    facade.toggle('cand-9');
    expect(facade.selectedCount()).toBe(MAX_SHARED_DECISIONS);
    facade.togglePage(['cand-9']);
    expect(facade.isSelected('cand-9')).toBeFalse();
  });

  it('decidir envía los ids y la decisión, quita lo decidido de la selección y renueva la lista sin parpadeo', () => {
    facade.load();
    listRequest().flush(candidatesBody(sharedCandidateDtos(5), 12));
    facade.selection.set(['cand-1', 'cand-2', 'otro']);
    let result: unknown = null;

    facade.decide(['cand-1', 'cand-2'], 'SAME').subscribe((r) => (result = r));
    expect(facade.saving()).toBeTrue();
    const post = http.expectOne(`${CANDIDATES}/decide`);

    expect(post.request.body).toEqual({ candidate_ids: ['cand-1', 'cand-2'], decision: 'SAME' });
    post.flush({ data: { updated: 2, unchanged: 0, confirmed: 1, conflicting: 0, items: [] } });

    expect(result).toEqual({ updated: 2, unchanged: 0, confirmed: 1, conflicting: 0, items: [] });
    expect(facade.saving()).toBeFalse();
    expect(facade.selection()).toEqual(['otro']);
    expect(facade.list.status()).toBe('ready');
    listRequest().flush(candidatesBody(sharedCandidateDtos(5), 10));
  });

  it('al decidir en lote hasta 500, envía todos los ids en una sola petición', () => {
    const ids = Array.from({ length: MAX_SHARED_DECISIONS }, (_, i) => `c${i}`);

    facade.decide(ids, 'DISTINCT').subscribe();
    const post = http.expectOne(`${CANDIDATES}/decide`);

    expect((post.request.body as { candidate_ids: string[] }).candidate_ids.length).toBe(500);
    post.flush({ data: { updated: 500, unchanged: 0, confirmed: 0, conflicting: 0, items: [] } });
    listRequest().flush(candidatesBody([]));
  });

  it('un 409 llega como error con su mensaje, no cambia la selección y deja de estar «guardando»', () => {
    facade.selection.set(['cand-1']);
    let error: AppError | null = null;

    facade.decide(['cand-1'], 'SAME').subscribe({ error: (e: unknown) => (error = toAppError(e)) });
    http.expectOne(`${CANDIDATES}/decide`).flush({ error: { code: 'PAIR_NOT_CONFIRMABLE' } }, { status: 409, statusText: 'Conflict' });

    expect((error as AppError | null)?.code).toBe('PAIR_NOT_CONFIRMABLE');
    expect((error as AppError | null)?.message).toBe('Este par ya no se puede confirmar. Actualiza la lista.');
    expect(facade.selection()).toEqual(['cand-1']);
    expect(facade.saving()).toBeFalse();
  });

  it('elegir la declaración vigente envía la operación y el lado y renueva la lista', () => {
    facade.select('op-1', 'B').subscribe();
    const post = http.expectOne(`${RECONCILIATION_URL}/operations/select`);

    expect(post.request.body).toEqual({ operation_ids: ['op-1'], selection: 'B' });
    post.flush({ data: { updated: 1, unchanged: 0, effective: 0, operations: [] } });
    listRequest().flush(candidatesBody([]));
    expect(facade.saving()).toBeFalse();
  });

  it('si la última página queda vacía al decidir, vuelve a la última que existe', () => {
    facade.load({ page: 3 });
    listRequest().flush(candidatesBody(sharedCandidateDtos(5), 11, 5, 3));
    facade.decide(['cand-1'], 'DISTINCT').subscribe();
    http.expectOne(`${CANDIDATES}/decide`).flush({ data: { updated: 1, unchanged: 0, confirmed: 0, conflicting: 0, items: [] } });

    listRequest().flush(candidatesBody([], 10, 5, 3));
    const back = listRequest();

    expect(back.request.params.get('page')).toBe('2');
    back.flush(candidatesBody(sharedCandidateDtos(5), 10, 5, 2));
  });

  it('cambiar de empresa descarta lista, filtro, página y selección', () => {
    facade.load({ status: 'DISTINCT' });
    listRequest().flush(candidatesBody(sharedCandidateDtos(1)));
    facade.selection.set(['cand-1']);

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.list.data()).toBeNull();
    expect(facade.status()).toBeNull();
    expect(facade.selection()).toEqual([]);
  });
});
