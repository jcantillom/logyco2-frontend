import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { COMPLETIONS_URL, OPERATIONS_URL, bulkApplyDto, bulkPreviewDto, completionStateDto, completionUrl, operationTripDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { toOperationTrip } from '../../infrastructure/mappers/operations.mappers';
import { BULK_PAGE_SIZE, BulkCompletionFacade } from './bulk-completion.facade';
import { OperationsFacade } from './operations.facade';

describe('BulkCompletionFacade', () => {
  let http: HttpTestingController;
  let facade: BulkCompletionFacade;
  let ops: OperationsFacade;
  const noEfficiency = (n: number, fuel = 'DIESEL'): ReturnType<typeof operationTripDto> =>
    operationTripDto({ id: `trip-${n}`, plate: `PLA${String(n).padStart(3, '0')}`, status: 'PENDING', reason: 'DISTANCE_WITHOUT_EFFICIENCY', fuel_type: fuel, kg_co2: null });
  const preview = (): TestRequest => http.expectOne(`${COMPLETIONS_URL}/preview`);
  const apply = (): TestRequest => http.expectOne(`${COMPLETIONS_URL}/apply`);
  const unitStates = (...ids: string[]): void => ids.forEach((id) => http.expectOne(completionUrl(id)).flush({ data: completionStateDto({ trip_id: id, fields: [{ name: 'efficiency.unit', label: 'Unidad', kind: 'unit', group: 'efficiency', options: [{ value: 'km/gal', label: 'km/gal' }, { value: 'km/l', label: 'km/l' }], range: null, hint: null }] }), meta: {} }));
  const counts = { all: { value: 1, capped: false }, calculated: { value: 1, capped: false }, pending: { value: 0, capped: false }, issues: { value: 0, capped: false }, shared: { value: 0, capped: false } };

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

  /** Abre el diálogo con N viajes sin rendimiento y atiende la consulta de unidades (una por combustible). */
  function opened(count = 2): void {
    withRows(Array.from({ length: count }, (_, i) => noEfficiency(i + 1)));
    facade.show();
    unitStates('trip-1');
  }

  beforeEach(() => setup());
  afterEach(() => http.verify());

  it('solo se ofrece en «Por completar» con viajes a la vista', () => {
    withRows([noEfficiency(1)], 'all');
    expect(facade.available()).toBeFalse();
    withRows([noEfficiency(1)]);
    expect(facade.available()).toBeTrue();
    withRows([]);
    expect(facade.available()).toBeFalse();
  });

  it('sin el permiso no abre y no pide nada', () => {
    TestBed.resetTestingModule();
    setup(['ORG_VIEWER']);
    withRows([noEfficiency(1)]);
    facade.show();

    expect(facade.open()).toBeFalse();
    http.expectNone((r) => r.url.includes('/completion'));
  });

  it('ofrece las placas de los viajes visibles sin rendimiento (sin repetir ni incluir otros motivos) y trae las unidades del servidor, una consulta por combustible', () => {
    withRows([noEfficiency(1), { ...noEfficiency(2), plate: 'PLA001' }, noEfficiency(3, 'GASOLINE'), operationTripDto({ id: 'trip-4', plate: 'OTRA99', status: 'PENDING', reason: 'MISSING_UNIT' }), operationTripDto({ id: 'trip-5', plate: 'CALC99' })]);
    facade.show();
    unitStates('trip-1', 'trip-3');

    expect(facade.plates()).toEqual(['PLA001', 'PLA003']);
    expect(facade.unitsFor('PLA001').map((o) => o.value)).toEqual(['km/gal', 'km/l']);
    expect(facade.unitsFor('MANUAL1').map((o) => o.value)).toEqual(['km/gal', 'km/l']);
    expect(facade.unitsStatus()).toBe('ready');
    expect(facade.allImports()).toBeTrue();
  });

  it('con una carga elegida en el filtro el alcance por defecto es esa carga; se puede ampliar a todas', () => {
    ops.importFileId.set('33333333-3333-4333-8333-333333333333');
    opened();

    expect(facade.allImports()).toBeFalse();
    facade.setEntry('PLA001', { value: '8', unit: 'km/gal' });
    facade.review();
    expect(preview().request.body.import_file_id).toBe('33333333-3333-4333-8333-333333333333');
    facade.close();
    opened();
    facade.setScope(true);
    facade.setEntry('PLA001', { value: '8', unit: 'km/gal' });
    facade.review();
    expect('import_file_id' in preview().request.body).toBeFalse();
  });

  it('no revisa sin un valor: las filas vacías se omiten (no hay valor ni unidad por defecto) y exige la unidad elegida', () => {
    opened();
    facade.review();
    http.expectNone(`${COMPLETIONS_URL}/preview`);
    expect(facade.problem()).toBe('Escribe el rendimiento de al menos una placa.');

    facade.setEntry('PLA001', { value: '8' });
    facade.review();
    http.expectNone(`${COMPLETIONS_URL}/preview`);
    expect(facade.plateErrors()['PLA001']).toBe('Elige la unidad');
    expect(facade.problem()).toContain('unidad');
  });

  it('revisar envía SOLO las placas con valor y unidad escritos y muestra lo que contó el servidor; nada se aplica todavía', () => {
    opened();
    facade.setEntry('PLA001', { value: '9,5', unit: 'km/gal' });
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
    facade.setEntry('PLA001', { value: '9,5', unit: 'km/gal' });
    facade.review();
    preview().flush({ data: bulkPreviewDto(), meta: {} });
    facade.setEntry('PLA001', { value: '1', unit: 'km/l' });  // cambiar lo escrito después de revisar no cambia lo que se aplica
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
    facade.setEntry('PLA001', { value: '8', unit: 'km/gal' });
    facade.review();
    preview().flush({ data: bulkPreviewDto({ per_plate: [], totals: { affected: 0, would_calculate: 0, would_remain_pending: 0, held: 0, skipped_incompatible: 0, expected_kg_co2: '0' } }), meta: {} });
    facade.apply();

    http.expectNone(`${COMPLETIONS_URL}/apply`);
  });

  for (const code of ['COMPLETION_PREVIEW_STALE', 'COMPLETION_TOKEN_EXPIRED', 'COMPLETION_TOKEN_INVALID']) {
    it(`${code} al aplicar descarta el token y pide revisar de nuevo conservando los valores; no reintenta solo`, () => {
      opened();
      facade.setEntry('PLA001', { value: '8', unit: 'km/gal' });
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
      expect(facade.entries()['PLA001']).toEqual({ value: '8', unit: 'km/gal' });
      facade.review();
      preview().flush({ data: bulkPreviewDto({ token: 'token-nuevo-123' }), meta: {} });
      facade.apply();
      expect(apply().request.body.token).toBe('token-nuevo-123');
    });
  }

  it('COMPANY_BUSY al aplicar muestra el aviso y deja reintentar con la misma revisión (el token sigue vigente)', () => {
    opened();
    facade.setEntry('PLA001', { value: '8', unit: 'km/gal' });
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
    facade.setEntry('PLA001', { value: '8', unit: 'km/gal' });
    facade.review();
    preview().flush({ error: { code: 'COMPLETION_TOO_LARGE', details: [{ field: 'cap', message: '5000' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.step()).toBe('values');
    expect(facade.error()?.message).toContain('5.000');
    expect(facade.error()?.message).toContain('Acota');
  });

  it('INVALID_FIELD_VALUE en items.N lleva el mensaje del servidor a la placa correcta', () => {
    opened();
    facade.setEntry('PLA001', { value: '8', unit: 'km/gal' });
    facade.setEntry('PLA002', { value: '0', unit: 'km/gal' });
    facade.review();
    preview().flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'items.1.efficiency_value', message: 'Debe ser mayor que 0 y no superar 100', type: 'number' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.plateErrors()).toEqual({ PLA002: 'Debe ser mayor que 0 y no superar 100' });
    expect(facade.step()).toBe('values');
  });

  it('pagina las placas de a 6 y permite agregar otras (normalizadas, sin repetir)', () => {
    withRows(Array.from({ length: 8 }, (_, i) => noEfficiency(i + 1)));
    facade.show();
    unitStates('trip-1');

    expect(facade.visiblePlates().length).toBe(BULK_PAGE_SIZE);
    expect(facade.pageCount()).toBe(2);
    facade.setPage(1);
    expect(facade.visiblePlates().length).toBe(2);
    facade.setPage(9);
    expect(facade.page()).toBe(1);
    expect(facade.addPlate(' abc-12 3 ')).toBeTrue();
    expect(facade.plates().at(-1)).toBe('ABC123');
    expect(facade.addPlate('abc123')).toBeTrue();
    expect(facade.plates().filter((p) => p === 'ABC123').length).toBe(1);
    expect(facade.addPlate('A')).toBeFalse();
  });

  it('cerrar o cambiar de empresa descarta valores, revisión y token', () => {
    opened();
    facade.setEntry('PLA001', { value: '8', unit: 'km/gal' });
    facade.review();
    preview().flush({ data: bulkPreviewDto(), meta: {} });
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.open()).toBeFalse();
    expect(facade.entries()).toEqual({});
    expect(facade.preview()).toBeNull();
    facade.apply();
    http.expectNone(`${COMPLETIONS_URL}/apply`);
  });
});
