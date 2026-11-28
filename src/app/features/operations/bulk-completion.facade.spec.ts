import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { COMPLETIONS_URL, OPERATIONS_URL, bulkApplyDto, bulkPreviewDto, completionPlateDto, completionPlatesBody, operationTripDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { CompletionPlate } from '../../domain/models/operations';
import { toCompletionPlatesPage, toOperationTrip } from '../../infrastructure/mappers/operations.mappers';
import { BULK_PAGE_SIZE, BulkCompletionFacade } from './bulk-completion.facade';
import { OperationsFacade } from './operations.facade';

describe('BulkCompletionFacade', () => {
  let http: HttpTestingController;
  let facade: BulkCompletionFacade;
  let ops: OperationsFacade;
  const pendingTrip = operationTripDto({ id: 'trip-1', plate: 'PLA001', status: 'PENDING', reason: 'DISTANCE_WITHOUT_EFFICIENCY', fuel_type: 'DIESEL', kg_co2: null });
  const plates = (): TestRequest => http.expectOne((r) => r.url === `${COMPLETIONS_URL}/plates`);
  const preview = (): TestRequest => http.expectOne(`${COMPLETIONS_URL}/preview`);
  const apply = (): TestRequest => http.expectOne(`${COMPLETIONS_URL}/apply`);
  const counts = { all: { value: 1, capped: false }, calculated: { value: 1, capped: false }, pending: { value: 0, capped: false }, issues: { value: 0, capped: false }, shared: { value: 0, capped: false } };
  /** Una placa del dominio (la que la pantalla recibe del mapper): sin unidad declarada por defecto. */
  const plate = (n: number, overrides: Parameters<typeof completionPlateDto>[1] = {}): CompletionPlate => toCompletionPlatesPage(completionPlatesBody([completionPlateDto(n, overrides)])).items[0];
  const six = Array.from({ length: BULK_PAGE_SIZE }, (_, i) => completionPlateDto(i + 1));

  function setup(roles: string[] = ['ORG_ANALYST']): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles), membership(ORG_COORDINADORA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(BulkCompletionFacade);
    ops = TestBed.inject(OperationsFacade);
  }

  function withRows(rows: readonly ReturnType<typeof operationTripDto>[], view: 'pending' | 'all' = 'pending'): void {
    ops.list.replace({ items: rows.map((r) => toOperationTrip(r)), limit: 8, nextCursor: null, total: null });
    ops.view.set(view);
  }

  /** Abre el diálogo y atiende la primera página de placas (total solo en la primera). */
  function opened(count = 2): void {
    withRows([pendingTrip]);
    facade.show();
    plates().flush(completionPlatesBody(Array.from({ length: count }, (_, i) => completionPlateDto(i + 1)), { total_plates: { value: 1926, capped: false } }));
  }

  beforeEach(() => setup());
  afterEach(() => http.verify());

  it('solo se ofrece en «Por completar» con viajes a la vista', () => {
    withRows([pendingTrip], 'all');
    expect(facade.available()).toBeFalse();
    withRows([pendingTrip]);
    expect(facade.available()).toBeTrue();
    withRows([]);
    expect(facade.available()).toBeFalse();
  });

  it('sin el permiso no abre y no pide nada', () => {
    TestBed.resetTestingModule();
    setup(['ORG_VIEWER']);
    withRows([pendingTrip]);
    facade.show();

    expect(facade.open()).toBeFalse();
    http.expectNone((r) => r.url.includes('/completions'));
  });

  it('al abrir pide al servidor la primera página de 6 placas (motivo, sin cursor) y muestra el total; nada se ofrece de la página de la lista', () => {
    withRows([pendingTrip]);
    facade.show();
    const request = plates();

    expect(request.request.params.get('reason')).toBe('DISTANCE_WITHOUT_EFFICIENCY');
    expect(request.request.params.get('limit')).toBe('6');
    expect(request.request.params.has('cursor')).toBeFalse();
    expect(request.request.params.has('import_file_id')).toBeFalse();
    request.flush(completionPlatesBody(six, { next_cursor: 'c1', total_plates: { value: 1926, capped: false } }));

    expect(facade.plates().map((p) => p.plate)).toEqual(['PLA001', 'PLA002', 'PLA003', 'PLA004', 'PLA005', 'PLA006']);
    expect(facade.total()).toEqual({ value: 1926, capped: false });
    expect(facade.hasNext()).toBeTrue();
    expect(facade.rangeLabel()).toBe('1–6 de 1.926 placas');
    expect(facade.allImports()).toBeTrue();
  });

  it('con una carga elegida en el filtro el alcance por defecto es esa carga (se envía al listar); se puede ampliar a todas y vuelve a la primera página', () => {
    ops.importFileId.set('33333333-3333-4333-8333-333333333333');
    withRows([pendingTrip]);
    facade.show();
    expect(plates().request.params.get('import_file_id')).toBe('33333333-3333-4333-8333-333333333333');
    http.verify();
    expect(facade.allImports()).toBeFalse();
    facade.setScope(true);
    expect(plates().request.params.has('import_file_id')).toBeFalse();
  });

  it('pagina con el cursor del servidor: siguiente usa next_cursor, anterior vuelve sin adivinar y el total se conserva', () => {
    withRows([pendingTrip]);
    facade.show();
    plates().flush(completionPlatesBody(six, { next_cursor: 'c1', total_plates: { value: 20, capped: false } }));
    facade.setPage(1);
    const second = plates();

    expect(second.request.params.get('cursor')).toBe('c1');
    second.flush(completionPlatesBody([completionPlateDto(7)], { next_cursor: null }));
    expect(facade.page()).toBe(1);
    expect(facade.hasNext()).toBeFalse();
    expect(facade.total()).toEqual({ value: 20, capped: false });
    expect(facade.rangeLabel()).toBe('7–7 de 20 placas');
    facade.setPage(2);  // no hay más: no pide nada
    facade.setPage(0);
    const first = plates();

    expect(first.request.params.has('cursor')).toBeFalse();
    first.flush(completionPlatesBody(six, { next_cursor: 'c1', total_plates: { value: 20, capped: false } }));
    expect(facade.page()).toBe(0);
  });

  it('conserva lo escrito al paginar y al buscar (un Map por placa) y cuenta las placas con valor', () => {
    withRows([pendingTrip]);
    facade.show();
    plates().flush(completionPlatesBody(six, { next_cursor: 'c1', total_plates: { value: 20, capped: false } }));
    facade.setEntry(plate(1), { value: '9,5' });
    facade.setEntry(plate(1), { unit: 'km/gal' });
    facade.setPage(1);
    plates().flush(completionPlatesBody([completionPlateDto(7)]));
    facade.setEntry(plate(7), { value: '8', unit: 'km/l' });
    facade.setEntry(plate(8), { unit: 'km/gal' });  // solo la unidad: no cuenta como placa con valor

    expect(facade.filled()).toEqual(['PLA001', 'PLA007']);
    expect(facade.entries().get('PLA001')).toEqual({ value: '9,5', unit: 'km/gal', declared: null });
    facade.setPage(0);
    plates().flush(completionPlatesBody(six, { next_cursor: 'c1' }));
    expect(facade.entries().get('PLA001')?.value).toBe('9,5');
    facade.setEntry(plate(7), { value: '' });  // borrar el valor la quita del conteo
    expect(facade.filled()).toEqual(['PLA001']);
  });

  it('la búsqueda espera 300 ms, normaliza el prefijo, vuelve a la primera página y cancela la petición anterior', fakeAsync(() => {
    withRows([pendingTrip]);
    facade.show();
    plates().flush(completionPlatesBody(six, { next_cursor: 'c1', total_plates: { value: 20, capped: false } }));
    facade.setQuery('p');
    tick(200);
    facade.setQuery(' pl-a ');
    tick(299);
    http.expectNone((r) => r.url === `${COMPLETIONS_URL}/plates`);
    tick(1);
    const first = plates();

    expect(first.request.params.get('q')).toBe('PLA');
    expect(first.request.params.has('cursor')).toBeFalse();
    facade.setQuery('PLA0');
    tick(300);
    const second = plates();

    expect(first.cancelled).toBeTrue();
    expect(second.request.params.get('q')).toBe('PLA0');
    second.flush(completionPlatesBody([completionPlateDto(1)], { total_plates: { value: 1, capped: false } }));
    expect(facade.plates().map((p) => p.plate)).toEqual(['PLA001']);
    expect(facade.total()).toEqual({ value: 1, capped: false });
    flush();
  }));

  it('una búsqueda sin coincidencias deja la lista vacía y un fallo del servidor se muestra sin perder lo escrito', fakeAsync(() => {
    opened();
    facade.setEntry(plate(1), { value: '8', unit: 'km/gal' });
    facade.setQuery('ZZZ');
    tick(300);
    plates().flush(completionPlatesBody([], { total_plates: { value: 0, capped: false } }));
    expect(facade.plates()).toEqual([]);
    expect(facade.announcement()).toBe('No hay placas.');
    facade.setQuery('Z');
    tick(300);
    plates().flush({ error: { code: 'SEARCH_TOO_BROAD' } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.error()).not.toBeNull();
    expect(facade.loading()).toBeFalse();
    expect(facade.filled()).toEqual(['PLA001']);
    flush();
  }));

  it('una respuesta que llega después de cerrar se ignora', () => {
    withRows([pendingTrip]);
    facade.show();
    const request = plates();

    facade.close();
    request.flush(completionPlatesBody(six));
    expect(facade.plates()).toEqual([]);
  });

  it('no revisa sin un valor: las filas vacías se omiten (no hay valor ni unidad por defecto) y exige la unidad elegida', () => {
    opened();
    facade.review();
    http.expectNone(`${COMPLETIONS_URL}/preview`);
    expect(facade.problem()).toBe('Escribe el rendimiento de al menos una placa.');

    facade.setEntry(plate(1), { value: '8' });
    facade.review();
    http.expectNone(`${COMPLETIONS_URL}/preview`);
    expect(facade.plateErrors()['PLA001']).toBe('Elige la unidad');
    expect(facade.problem()).toContain('unidad');
  });

  it('revisar envía SOLO las placas con valor y unidad escritos y muestra lo que contó el servidor; nada se aplica todavía', () => {
    opened();
    facade.setEntry(plate(1), { value: '9,5', unit: 'km/gal' });
    facade.review();
    const request = preview();

    expect(facade.busy()).toBeTrue();
    expect(request.request.body).toEqual({ reason: 'DISTANCE_WITHOUT_EFFICIENCY', items: [{ plate: 'PLA001', efficiency_value: '9,5', efficiency_unit: 'km/gal' }] });
    request.flush({ data: bulkPreviewDto(), meta: {} });

    expect(facade.step()).toBe('review');
    expect(facade.preview()?.totals.affected).toBe(301);
    http.expectNone(`${COMPLETIONS_URL}/apply`);
  });

  it('aplicar usa el alcance exacto revisado y el token en memoria, pasa al resultado y recarga la página actual y los conteos', () => {
    opened();
    facade.setEntry(plate(1), { value: '9,5', unit: 'km/gal' });
    facade.review();
    preview().flush({ data: bulkPreviewDto(), meta: {} });
    facade.setEntry(plate(1), { value: '1', unit: 'km/l' });  // cambiar lo escrito después de revisar no cambia lo que se aplica
    facade.apply();
    facade.apply();  // doble clic: una sola petición
    const request = apply();

    expect(request.request.body).toEqual({ reason: 'DISTANCE_WITHOUT_EFFICIENCY', items: [{ plate: 'PLA001', efficiency_value: '9,5', efficiency_unit: 'km/gal' }], token: 'token-de-confirmacion-1' });
    request.flush({ data: bulkApplyDto(), meta: {} });

    expect(facade.step()).toBe('result');
    expect(facade.result()).toEqual({ applied: 301, alreadyCompleted: 0, nowCalculated: 280, stillPending: 21, held: 3, skippedIncompatible: 2 });
    expect(JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage))).not.toContain('token-de-confirmacion-1');

    const lists = http.match((r) => r.url === OPERATIONS_URL && r.method === 'GET');

    expect(lists.length).toBe(1);
    expect(lists[0].request.params.has('cursor')).toBeFalse();
    lists[0].flush({ data: [], meta: { next_cursor: null, limit: 8 } });
    http.expectOne(`${OPERATIONS_URL}/summary`).flush({ data: counts, meta: {} });
  });

  it('sin viajes afectados no se puede aplicar', () => {
    opened();
    facade.setEntry(plate(1), { value: '8', unit: 'km/gal' });
    facade.review();
    preview().flush({ data: bulkPreviewDto({ per_plate: [], totals: { affected: 0, would_calculate: 0, would_remain_pending: 0, held: 0, skipped_incompatible: 0, expected_kg_co2: '0' } }), meta: {} });
    facade.apply();

    http.expectNone(`${COMPLETIONS_URL}/apply`);
  });

  for (const code of ['COMPLETION_PREVIEW_STALE', 'COMPLETION_TOKEN_EXPIRED', 'COMPLETION_TOKEN_INVALID']) {
    it(`${code} al aplicar descarta el token y pide revisar de nuevo conservando los valores; no reintenta solo`, () => {
      opened();
      facade.setEntry(plate(1), { value: '8', unit: 'km/gal' });
      facade.review();
      preview().flush({ data: bulkPreviewDto(), meta: {} });
      facade.apply();
      apply().flush({ error: { code } }, { status: 409, statusText: 'Conflict' });

      expect(facade.stale()).toBeTrue();
      expect(facade.error()?.code).toBe(code);
      expect(facade.step()).toBe('review');
      facade.apply();
      http.expectNone(`${COMPLETIONS_URL}/apply`);
      facade.backToValues();
      expect(facade.step()).toBe('values');
      expect(facade.entries().get('PLA001')).toEqual({ value: '8', unit: 'km/gal', declared: null });
      facade.review();
      preview().flush({ data: bulkPreviewDto({ token: 'token-nuevo-123' }), meta: {} });
      facade.apply();
      expect(apply().request.body.token).toBe('token-nuevo-123');
    });
  }

  it('COMPANY_BUSY al aplicar muestra el aviso y deja reintentar con la misma revisión (el token sigue vigente)', () => {
    opened();
    facade.setEntry(plate(1), { value: '8', unit: 'km/gal' });
    facade.review();
    preview().flush({ data: bulkPreviewDto(), meta: {} });
    facade.apply();
    apply().flush({ error: { code: 'COMPANY_BUSY' } }, { status: 409, statusText: 'Conflict' });

    expect(facade.error()?.message).toContain('carga procesándose');
    expect(facade.stale()).toBeFalse();
    facade.apply();
    expect(apply().request.body.token).toBe('token-de-confirmacion-1');
  });

  it('COMPLETION_TOO_LARGE al revisar pide acotar y se queda en los valores', () => {
    opened();
    facade.setEntry(plate(1), { value: '8', unit: 'km/gal' });
    facade.review();
    preview().flush({ error: { code: 'COMPLETION_TOO_LARGE', details: [{ field: 'cap', message: '5000' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.step()).toBe('values');
    expect(facade.error()?.message).toContain('5.000');
    expect(facade.error()?.message).toContain('Acota');
  });

  it('INVALID_FIELD_VALUE en items.N lleva el mensaje del servidor a la placa correcta', () => {
    opened();
    facade.setEntry(plate(1), { value: '8', unit: 'km/gal' });
    facade.setEntry(plate(2), { value: '0', unit: 'km/gal' });
    facade.review();
    preview().flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'items.1.efficiency_value', message: 'Debe ser mayor que 0 y no superar 100', type: 'number' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.plateErrors()).toEqual({ PLA002: 'Debe ser mayor que 0 y no superar 100' });
    expect(facade.problem()).toBe('PLA002: Debe ser mayor que 0 y no superar 100');  // también como mensaje: la placa puede estar en otra página
    expect(facade.step()).toBe('values');
  });

  it('cerrar o cambiar de empresa descarta placas, valores, revisión y token', () => {
    opened();
    facade.setEntry(plate(1), { value: '8', unit: 'km/gal' });
    facade.review();
    preview().flush({ data: bulkPreviewDto(), meta: {} });
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.open()).toBeFalse();
    expect(facade.entries().size).toBe(0);
    expect(facade.plates()).toEqual([]);
    expect(facade.preview()).toBeNull();
    facade.apply();
    http.expectNone(`${COMPLETIONS_URL}/apply`);
  });

  it('con la unidad declarada por los viajes no se pide ni se envía unidad: el servidor usa la de cada viaje', () => {
    withRows([pendingTrip]);
    facade.show();
    plates().flush(completionPlatesBody([completionPlateDto(1, { efficiency_unit: 'km/gal', unit_options: [] })]));
    const declared = facade.plates()[0];

    facade.setEntry(declared, { value: '8' });
    facade.review();
    const request = preview();

    expect(facade.plateErrors()).toEqual({});
    expect(request.request.body).toEqual({ reason: 'DISTANCE_WITHOUT_EFFICIENCY', items: [{ plate: 'PLA001', efficiency_value: '8' }] });
    request.flush({ data: bulkPreviewDto(), meta: {} });
    facade.apply();
    expect(apply().request.body.items).toEqual([{ plate: 'PLA001', efficiency_value: '8' }]);
  });

  it('mezcla declaradas y por elegir: solo las que no declaran exigen unidad y esa unidad sí se envía', () => {
    opened();
    facade.setEntry(plate(1, { efficiency_unit: 'km/gal' }), { value: '8' });
    facade.setEntry(plate(2), { value: '9' });
    facade.review();
    http.expectNone(`${COMPLETIONS_URL}/preview`);

    expect(facade.plateErrors()).toEqual({ PLA002: 'Elige la unidad' });
    facade.setEntry(plate(2), { unit: 'km/l' });
    facade.review();

    expect(preview().request.body.items).toEqual([{ plate: 'PLA001', efficiency_value: '8' }, { plate: 'PLA002', efficiency_value: '9', efficiency_unit: 'km/l' }]);
  });

  it('un error del servidor sobre una placa de otra página se dice con su placa y la revisión sigue en los valores', () => {
    opened();
    facade.setEntry(plate(1), { value: '8', unit: 'km/gal' });
    facade.setEntry(plate(9, { efficiency_unit: 'km/gal' }), { value: '8' });
    facade.review();
    preview().flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'items.1.efficiency_unit', message: 'Esta placa tiene viajes sin unidad declarada: indique la unidad del rendimiento', type: 'unit' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.problem()).toBe('PLA009: Esta placa tiene viajes sin unidad declarada: indique la unidad del rendimiento');
    expect(facade.step()).toBe('values');
  });

  it('no envía más de 200 placas por revisión', () => {
    opened();

    for (let n = 1; n <= 201; n++) facade.setEntry(plate(n), { value: '8', unit: 'km/gal' });

    facade.review();
    http.expectNone(`${COMPLETIONS_URL}/preview`);
    expect(facade.problem()).toContain('Máximo 200');
  });
});
