import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { DUPLICATES_URL, duplicateDtos, duplicateTripDto, duplicatesBody, possibleDuplicateDto } from '../../../testing/duplicates';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { OrganizationContext } from '../../core/org/organization-context';
import { MAX_DUPLICATE_RESOLUTION } from '../../domain/models/duplicates';
import { DuplicatesFacade } from './duplicates.facade';

describe('DuplicatesFacade', () => {
  let http: HttpTestingController;
  let facade: DuplicatesFacade;
  const listRequest = () => http.expectOne((r) => r.url === DUPLICATES_URL && r.method === 'GET');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(DuplicatesFacade);
  });
  afterEach(() => http.verify());

  it('lista la primera página de 5 y expone el total que entrega el servidor', () => {
    facade.load();
    const request = listRequest();

    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('page_size')).toBe('5');
    request.flush(duplicatesBody(duplicateDtos(5), 12));

    expect(facade.list.status()).toBe('ready');
    expect(facade.list.data()?.items.length).toBe(5);
    expect(facade.list.data()?.total).toBe(12);
  });

  it('pagina conservando la lista visible (sin pasar por «cargando») y vuelve a la página 1 al cambiar el tamaño o la carga', () => {
    facade.load();
    listRequest().flush(duplicatesBody(duplicateDtos(5), 12));

    facade.load({ page: 2 });
    expect(facade.list.status()).toBe('ready');
    const second = listRequest();
    expect(second.request.params.get('page')).toBe('2');
    second.flush(duplicatesBody(duplicateDtos(5), 12, 5, 2));

    facade.load({ pageSize: 10 });
    const sized = listRequest();
    expect([sized.request.params.get('page'), sized.request.params.get('page_size')]).toEqual(['1', '10']);
    sized.flush(duplicatesBody(duplicateDtos(10), 12, 10));

    facade.load({ page: 2 });
    listRequest().flush(duplicatesBody(duplicateDtos(2), 12, 10, 2));
    facade.load({ importFileId: 'imp-2' });
    const filtered = listRequest();
    expect(filtered.request.params.get('import_file_id')).toBe('imp-2');
    expect(filtered.request.params.get('page')).toBe('1');
    filtered.flush(duplicatesBody([]));
  });

  it('un error de la lista queda en el recurso para mostrar «Reintentar», y reintentar vuelve a pedir', () => {
    facade.load();
    listRequest().flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Server Error' });

    expect(facade.list.status()).toBe('error');
    facade.load();
    listRequest().flush(duplicatesBody(duplicateDtos(1)));
    expect(facade.list.status()).toBe('ready');
  });

  it('marca y desmarca pares, marca toda la página y no pasa de 500', () => {
    facade.load();
    listRequest().flush(duplicatesBody(duplicateDtos(3), 3));
    const items = facade.list.data()!.items;

    facade.toggle(items[0]);
    expect(facade.isSelected('trip-a1')).toBeTrue();
    facade.togglePage(items);
    expect(facade.selection()).toEqual(['trip-a1', 'trip-a2', 'trip-a3']);
    facade.togglePage(items);
    expect(facade.selectedCount()).toBe(0);

    facade.selection.set(Array.from({ length: MAX_DUPLICATE_RESOLUTION }, (_, i) => `x${i}`));
    expect(facade.selectionFull()).toBeTrue();
    facade.toggle(items[1]);
    expect(facade.selectedCount()).toBe(MAX_DUPLICATE_RESOLUTION);
    facade.togglePage(items);
    expect(facade.isSelected('trip-a1')).toBeFalse();
  });

  it('recuerda cuáles de los marcados tienen el retenido sin resultado, también al marcar la página, y lo olvida al desmarcar', () => {
    facade.load();
    listRequest().flush(duplicatesBody([possibleDuplicateDto({ id: 'trip-a1' }), possibleDuplicateDto({ id: 'trip-a2', a: duplicateTripDto({ id: 'trip-a2', kg_co2: null }) })], 2));
    const items = facade.list.data()!.items;

    facade.toggle(items[1]);
    expect(facade.withoutResultCount()).toBe(1);
    facade.toggle(items[1]);
    expect(facade.withoutResultCount()).toBe(0);
    facade.togglePage(items);
    expect(facade.selectedCount()).toBe(2);
    expect(facade.withoutResultCount()).toBe(1);
    facade.clearSelection();
    expect(facade.withoutResultCount()).toBe(0);
  });

  it('«mismo viaje» envía keep, quita lo decidido de la selección y renueva la lista sin parpadeo', () => {
    facade.load();
    listRequest().flush(duplicatesBody(duplicateDtos(5), 12));
    facade.selection.set(['trip-a1', 'trip-a2', 'otro']);
    let result: unknown = null;

    facade.resolve(['trip-a1', 'trip-a2'], 'SAME_TRIP', 'EXISTING').subscribe((r) => (result = r));
    expect(facade.resolving()).toBeTrue();
    const post = http.expectOne(`${DUPLICATES_URL}/resolve`);

    expect(post.request.body).toEqual({ trip_ids: ['trip-a1', 'trip-a2'], decision: 'SAME_TRIP', keep: 'EXISTING' });
    post.flush({ data: { resolved: 2, skipped: 0, without_result: 1 } });

    expect(result).toEqual({ resolved: 2, skipped: 0, withoutResult: 1 });
    expect(facade.resolving()).toBeFalse();
    expect(facade.selection()).toEqual(['otro']);
    expect(facade.list.status()).toBe('ready');
    listRequest().flush(duplicatesBody(duplicateDtos(5), 10));
  });

  it('«Dejar pendiente» no cambia nada: no renueva la lista y vacía la selección de esos pares', () => {
    facade.load();
    listRequest().flush(duplicatesBody(duplicateDtos(2), 2));
    facade.selection.set(['trip-a1']);

    facade.resolve(['trip-a1'], 'KEEP_PENDING').subscribe();
    const post = http.expectOne(`${DUPLICATES_URL}/resolve`);

    expect(post.request.body).toEqual({ trip_ids: ['trip-a1'], decision: 'KEEP_PENDING' });
    post.flush({ data: { resolved: 1, skipped: 0 } });
    expect(facade.selection()).toEqual([]);
    http.expectNone((r) => r.url === DUPLICATES_URL && r.method === 'GET');
  });

  it('al decidir en lote hasta 500, envía todos los ids en una sola petición', () => {
    const ids = Array.from({ length: MAX_DUPLICATE_RESOLUTION }, (_, i) => `t${i}`);

    facade.resolve(ids, 'DIFFERENT_TRIPS').subscribe();
    const post = http.expectOne(`${DUPLICATES_URL}/resolve`);

    expect((post.request.body as { trip_ids: string[] }).trip_ids.length).toBe(500);
    post.flush({ data: { resolved: 500, skipped: 0 } });
    listRequest().flush(duplicatesBody([]));
  });

  it('un 404 TRIP_NOT_FOUND llega como error, no cambia la selección y deja de estar «guardando»', () => {
    facade.selection.set(['trip-a1']);
    let error: AppError | null = null;

    facade.resolve(['trip-a1'], 'DIFFERENT_TRIPS').subscribe({ error: (e: unknown) => (error = toAppError(e)) });
    http.expectOne(`${DUPLICATES_URL}/resolve`).flush({ error: { code: 'TRIP_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });

    expect((error as AppError | null)?.code).toBe('TRIP_NOT_FOUND');
    expect((error as AppError | null)?.message).toContain('ya no está disponible');
    expect(facade.selection()).toEqual(['trip-a1']);
    expect(facade.resolving()).toBeFalse();
  });

  it('si la última página queda vacía al resolver, vuelve a la última que existe', () => {
    facade.load({ page: 3 });
    listRequest().flush(duplicatesBody(duplicateDtos(5), 11, 5, 3));
    facade.resolve(['trip-a1'], 'DIFFERENT_TRIPS').subscribe();
    http.expectOne(`${DUPLICATES_URL}/resolve`).flush({ data: { resolved: 1, skipped: 0 } });

    listRequest().flush(duplicatesBody([], 10, 5, 3));
    const back = listRequest();

    expect(back.request.params.get('page')).toBe('2');
    back.flush(duplicatesBody(duplicateDtos(5), 10, 5, 2));
  });

  it('cambiar de empresa descarta lista, filtro, página y selección', () => {
    facade.load({ importFileId: 'imp-9' });
    listRequest().flush(duplicatesBody(duplicateDtos(1)));
    facade.selection.set(['trip-a1']);

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.list.data()).toBeNull();
    expect(facade.importFileId()).toBeNull();
    expect(facade.selection()).toEqual([]);
  });
});
