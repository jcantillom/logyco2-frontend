import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { OPERATIONS_URL, completionOutDto, completionStateDto, completionUrl, operationTripDto, pendingTripDetailDto, tripDetailDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ToastService } from '../../core/notifications/toast.service';
import { OrganizationContext } from '../../core/org/organization-context';
import { toOperationTrip, toTripDetail } from '../../infrastructure/mappers/operations.mappers';
import { OperationsFacade } from './operations.facade';
import { TripCompletionFacade } from './trip-completion.facade';

describe('TripCompletionFacade', () => {
  let http: HttpTestingController;
  let facade: TripCompletionFacade;
  let ops: OperationsFacade;
  const pending = (id: string): ReturnType<typeof operationTripDto> => operationTripDto({ id, trip_id: `VIA-${id}`, status: 'PENDING', state_label: 'Por completar', reason: 'DISTANCE_WITHOUT_EFFICIENCY', reason_label: 'Falta el rendimiento', kg_co2: null });
  const state = (): TestRequest => http.expectOne(completionUrl('trip-1'));
  const save = (): TestRequest => http.expectOne((r) => r.url === completionUrl('trip-1') && r.method === 'PATCH');
  const summary = (): TestRequest => http.expectOne(`${OPERATIONS_URL}/summary`);
  const listCalls = (): number => http.match((r) => r.url === OPERATIONS_URL && r.method === 'GET').length;

  function setup(roles: string[] = ['ORG_ANALYST']): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles), membership(ORG_COORDINADORA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(TripCompletionFacade);
    ops = TestBed.inject(OperationsFacade);
  }

  /** La página cargada: dos viajes por completar con uno calculado en medio y un cursor de la segunda página. */
  function withRows(rows = [pending('trip-1'), operationTripDto({ id: 'trip-2' }), pending('trip-3')]): void {
    ops.list.replace({ items: rows.map((r) => toOperationTrip(r)), limit: 8, nextCursor: 'cur-2', total: null });
    ops.cursors.set([null, 'cur-2']);
  }

  /** Abre el viaje 1 y su formulario, con el estado ya llegado. */
  function opened(): void {
    withRows();
    ops.open('trip-1');
    http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: pendingTripDetailDto(), meta: {} });
    facade.start('trip-1');
    state().flush({ data: completionStateDto(), meta: {} });
  }

  beforeEach(() => setup());
  afterEach(() => http.verify());

  it('start pide qué falta, pasa a modo formulario y no precarga ningún valor', () => {
    withRows();
    facade.start('trip-1');

    expect(facade.mode()).toBe('form');
    expect(facade.state.status()).toBe('loading');
    state().flush({ data: completionStateDto(), meta: {} });

    expect(facade.state.data()?.fields.map((f) => f.name)).toEqual(['efficiency.value', 'efficiency.unit']);
    expect(facade.values()).toEqual({});
    expect(facade.hasValues()).toBeFalse();
  });

  it('sin el permiso imports:create no abre el formulario ni pide nada', () => {
    TestBed.resetTestingModule();
    setup(['ORG_VIEWER']);

    facade.start('trip-1');

    expect(facade.canComplete()).toBeFalse();
    expect(facade.mode()).toBe('idle');
    http.expectNone(completionUrl('trip-1'));
  });

  it('guardar sin escribir nada no envía nada; guardar envía expected_version del estado y lo escrito, con busy mientras llega', () => {
    opened();
    facade.save();
    http.expectNone((r) => r.method === 'PATCH');

    facade.setValue('efficiency.value', '9,5');
    facade.setValue('efficiency.unit', 'km/gal');
    facade.save();
    facade.save();  // un segundo clic con la petición en curso no envía otra
    const request = save();

    expect(facade.saving()).toBeTrue();
    expect(request.request.body).toEqual({ expected_version: 0, efficiency: { value: '9,5', unit: 'km/gal' } });
    request.flush({ data: completionOutDto(), meta: {} });
    summary().flush({ data: { all: { value: 1, capped: false }, calculated: { value: 1, capped: false }, pending: { value: 0, capped: false }, issues: { value: 0, capped: false }, shared: { value: 0, capped: false } }, meta: {} });

    expect(facade.saving()).toBeFalse();
    expect(facade.mode()).toBe('done');
  });

  it('al guardar muestra lo que el servidor recalculó, anuncia «Calculado: X kg CO₂», refresca la fila y el detalle SIN recargar la lista ni perder los cursores', () => {
    opened();
    facade.setValue('efficiency.value', '8');
    facade.save();
    save().flush({ data: completionOutDto(), meta: {} });
    summary().flush({ data: { all: { value: 1, capped: false }, calculated: { value: 1, capped: false }, pending: { value: 0, capped: false }, issues: { value: 0, capped: false }, shared: { value: 0, capped: false } }, meta: {} });

    expect(facade.announcement()).toBe('Calculado: 50,745 kg CO₂');
    expect(facade.outcome()?.result.counted).toBeTrue();
    expect(ops.detail.data()?.emissions?.kgCo2).toBe(50.745);
    expect(ops.detail.data()?.corrected?.byName).toBe('Laura Gómez');
    const row = ops.items()[0];

    expect(row).toEqual(jasmine.objectContaining({ status: 'CALCULATED', stateLabel: 'Calculado', kgCo2: 50.745, corrected: true, reason: null }));
    expect(ops.items()[2].status).toBe('PENDING');
    expect(ops.cursors()).toEqual([null, 'cur-2']);
    expect(ops.list.data()?.nextCursor).toBe('cur-2');
    expect(listCalls()).toBe(0);
  });

  it('un guardado parcial anuncia «Sigue por completar: <motivo>» con la nota de retenido del servidor y deja la fila por completar', () => {
    opened();
    facade.setValue('efficiency.value', '8');
    facade.save();
    save().flush({
      data: completionOutDto({
        trip: pendingTripDetailDto({ correction_version: 1, reason_label: 'Falta la distancia', corrected: { at: '2026-11-24T10:00:00Z', by_name: 'Laura Gómez' } }),
        result: { previous_status: 'PENDING', status: 'PENDING', reason: 'MISSING_DISTANCE_WITH_ROUTE', reason_label: 'Falta la distancia', method_label: null, kg_co2: null, counted: false, counted_note: null },
      }),
      meta: {},
    });
    summary().flush({ data: { all: { value: 1, capped: false }, calculated: { value: 1, capped: false }, pending: { value: 1, capped: false }, issues: { value: 0, capped: false }, shared: { value: 0, capped: false } }, meta: {} });

    expect(facade.announcement()).toBe('Sigue por completar: Falta la distancia');
    expect(ops.items()[0]).toEqual(jasmine.objectContaining({ status: 'PENDING', reasonLabel: 'Falta la distancia', corrected: true }));
  });

  it('un viaje que quedó calculado pero retenido conserva la nota del servidor (no suma)', () => {
    opened();
    facade.setValue('efficiency.value', '8');
    facade.save();
    save().flush({ data: completionOutDto({ result: { previous_status: 'PENDING', status: 'CALCULATED', reason: null, reason_label: null, method_label: 'Estimado', kg_co2: '50.7450', counted: false, counted_note: 'Quedó retenido como posible duplicado: no suma hasta resolverlo' } }), meta: {} });
    summary().flush({ data: { all: { value: 1, capped: false }, calculated: { value: 1, capped: false }, pending: { value: 0, capped: false }, issues: { value: 0, capped: false }, shared: { value: 0, capped: false } }, meta: {} });

    expect(facade.outcome()?.result.countedNote).toContain('no suma');
    expect(facade.outcome()?.result.counted).toBeFalse();
  });

  it('TRIP_VERSION_CONFLICT refresca el formulario con el estado vigente que trae el error, conserva lo escrito de los datos que siguen y recarga el detalle', () => {
    opened();
    facade.setValue('efficiency.value', '8');
    facade.setValue('distance_km', '300');
    facade.save();
    save().flush(
      { error: { code: 'TRIP_VERSION_CONFLICT', message: 'x', details: [{ field: 'version', message: '3', type: 'current_version' }] }, data: completionStateDto({ version: 3 }) },
      { status: 409, statusText: 'Conflict' },
    );

    expect(facade.state.data()?.version).toBe(3);
    expect(facade.values()).toEqual({ 'efficiency.value': '8' });
    expect(facade.notice()).toContain('Alguien más modificó');
    expect(facade.mode()).toBe('form');
    expect(facade.saving()).toBeFalse();
    http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: pendingTripDetailDto({ correction_version: 3 }), meta: {} });

    facade.save();
    expect(save().request.body.expected_version).toBe(3);
  });

  it('INVALID_FIELD_VALUE deja el mensaje de la regla bajo cada dato y se limpia al corregirlo', () => {
    opened();
    facade.setValue('efficiency.value', '0');
    facade.save();
    save().flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'efficiency.value', message: 'Debe ser mayor que 0 y no superar 100', type: 'number' }] } }, { status: 422, statusText: 'Unprocessable' });

    expect(facade.fieldErrors()).toEqual({ 'efficiency.value': 'Debe ser mayor que 0 y no superar 100' });
    expect(facade.error()).toBeNull();
    expect(facade.mode()).toBe('form');
    facade.setValue('efficiency.value', '8');
    expect(facade.fieldErrors()).toEqual({});
  });

  it('otros errores van a la alerta con el mensaje del catálogo; si el viaje cambió se vuelve a pedir el detalle', () => {
    opened();
    facade.setValue('efficiency.value', '8');
    facade.save();
    save().flush({ error: { code: 'TRIP_NOT_EDITABLE', message: 'crudo' } }, { status: 409, statusText: 'Conflict' });

    expect(facade.error()?.code).toBe('TRIP_NOT_EDITABLE');
    expect(facade.error()?.message).toContain('ya no se puede completar');
    http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });
  });

  it('COMPANY_BUSY muestra el aviso, conserva lo escrito y permite reintentar con el mismo estado', () => {
    opened();
    facade.setValue('efficiency.value', '8');
    facade.save();
    save().flush({ error: { code: 'COMPANY_BUSY', message: 'crudo' } }, { status: 409, statusText: 'Conflict' });

    expect(facade.error()?.message).toBe('Hay una carga procesándose en tu empresa. Inténtalo en unos segundos.');
    expect(facade.values()).toEqual({ 'efficiency.value': '8' });
    expect(facade.mode()).toBe('form');
    facade.save();
    expect(save().request.body).toEqual({ expected_version: 0, efficiency: { value: '8' } });
  });

  it('cancelar vuelve al detalle sin guardar y descarta el estado', () => {
    opened();
    facade.setValue('efficiency.value', '8');
    facade.cancel();

    expect(facade.mode()).toBe('idle');
    expect(facade.state.data()).toBeNull();
    http.expectNone((r) => r.method === 'PATCH');
  });

  it('«Guardar y siguiente» pasa al siguiente viaje por completar de la página (salta el calculado), abre su detalle y su formulario', () => {
    opened();
    expect(facade.nextPending()).toBe('trip-3');
    facade.setValue('efficiency.value', '8');
    facade.save(true);
    save().flush({ data: completionOutDto(), meta: {} });
    summary().flush({ data: { all: { value: 1, capped: false }, calculated: { value: 1, capped: false }, pending: { value: 1, capped: false }, issues: { value: 0, capped: false }, shared: { value: 0, capped: false } }, meta: {} });

    expect(ops.selectedId()).toBe('trip-3');
    http.expectOne(`${OPERATIONS_URL}/trip-3`).flush({ data: pendingTripDetailDto(), meta: {} });
    http.expectOne(completionUrl('trip-3')).flush({ data: completionStateDto({ trip_id: 'trip-3' }), meta: {} });

    expect(facade.mode()).toBe('form');
    expect(facade.tripId()).toBe('trip-3');
    expect(facade.values()).toEqual({});
    expect(ops.cursors()).toEqual([null, 'cur-2']);
    expect(listCalls()).toBe(0);
  });

  it('en cadena salta un viaje que el servidor dice que no se puede completar y, agotada la página, cierra con un aviso amable', () => {
    withRows([pending('trip-1'), pending('trip-2'), operationTripDto({ id: 'trip-3' })]);
    const toast = spyOn(TestBed.inject(ToastService), 'info');
    ops.open('trip-1');
    http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: pendingTripDetailDto(), meta: {} });
    facade.start('trip-1');
    state().flush({ data: completionStateDto(), meta: {} });
    facade.setValue('efficiency.value', '8');
    facade.save(true);
    save().flush({ data: completionOutDto(), meta: {} });
    summary().flush({ data: { all: { value: 1, capped: false }, calculated: { value: 1, capped: false }, pending: { value: 1, capped: false }, issues: { value: 0, capped: false }, shared: { value: 0, capped: false } }, meta: {} });
    http.expectOne(`${OPERATIONS_URL}/trip-2`).flush({ data: pendingTripDetailDto(), meta: {} });
    http.expectOne(completionUrl('trip-2')).flush({ data: completionStateDto({ trip_id: 'trip-2', completable: false, refusal: { code: 'TRIP_NOT_COMPLETABLE', message: 'La fecha no es válida' }, fields: [], missing: [] }), meta: {} });

    expect(toast).toHaveBeenCalledWith('No hay más viajes por completar en esta página.');
    expect(facade.mode()).toBe('idle');
    expect(ops.selectedId()).toBeNull();
    expect(facade.announcement()).toBe('No hay más viajes por completar en esta página.');
  });

  it('con un viaje por completar que NO se puede completar pide el motivo al servidor (una sola vez por viaje) y lo expone; uno completable o calculado no pide nada', () => {
    const blocked = toTripDetail(pendingTripDetailDto({ completable: false, missing_fields: [] }));

    facade.inspect(blocked);
    state().flush({ data: completionStateDto({ completable: false, refusal: { code: 'TRIP_NOT_COMPLETABLE', message: 'La fecha no es válida: corrígela en el archivo' }, fields: [], missing: [] }), meta: {} });
    expect(facade.refusal()).toEqual({ tripId: 'trip-1', message: 'La fecha no es válida: corrígela en el archivo' });

    facade.inspect(blocked);
    http.expectNone(completionUrl('trip-1'));

    facade.inspect(toTripDetail(pendingTripDetailDto()));
    facade.inspect(toTripDetail(tripDetailDto()));
    http.expectNone(completionUrl('trip-1'));
    expect(facade.refusal()).toBeNull();
  });

  it('sin permiso no pide el motivo y si el servidor falla no muestra nada', () => {
    const blocked = toTripDetail(pendingTripDetailDto({ completable: false, missing_fields: [] }));

    facade.inspect(blocked);
    state().flush({ error: { code: 'INTERNAL' } }, { status: 500, statusText: 'Error' });
    expect(facade.refusal()).toBeNull();

    TestBed.resetTestingModule();
    setup(['ORG_VIEWER']);
    facade.inspect(blocked);
    http.expectNone(completionUrl('trip-1'));
  });

  it('cambiar de empresa descarta el formulario y lo escrito', () => {
    opened();
    facade.setValue('efficiency.value', '8');
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.mode()).toBe('idle');
    expect(facade.values()).toEqual({});
    expect(facade.state.data()).toBeNull();
  });
});
