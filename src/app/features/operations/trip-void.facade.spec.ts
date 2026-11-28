import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { MANUAL_URLS, manualTripDetailDto, voidOutDto } from '../../../testing/manual-trips';
import { OPERATIONS_URL, operationTripDto, operationsPageBody, tabCountsDto, tripDetailDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ToastService } from '../../core/notifications/toast.service';
import { toOperationTrip, toTripDetail } from '../../infrastructure/mappers/operations.mappers';
import { OperationsFacade } from './operations.facade';
import { TripVoidFacade } from './trip-void.facade';

describe('TripVoidFacade', () => {
  let http: HttpTestingController;
  let facade: TripVoidFacade;
  let ops: OperationsFacade;
  const manual = (overrides: Parameters<typeof manualTripDetailDto>[0] = {}): ReturnType<typeof toTripDetail> => toTripDetail(manualTripDetailDto({ correction_version: 3, ...overrides }));

  function setup(roles: string[] = ['ORG_ANALYST']): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(TripVoidFacade);
    ops = TestBed.inject(OperationsFacade);
  }

  beforeEach(() => setup());
  afterEach(() => http.verify());

  it('solo se abre la confirmación de un viaje que el servidor dice que se puede anular, y con permiso', () => {
    facade.request(manual({ voidable: false, void_blocked_reason: 'Ya está confirmado' }));

    expect(facade.isOpen()).toBeFalse();

    facade.request(manual());

    expect(facade.isOpen()).toBeTrue();
    expect(facade.reason()).toBe('');
  });

  it('sin imports:create no se abre', () => {
    TestBed.resetTestingModule();
    setup(['ORG_VIEWER']);

    facade.request(manual());

    expect(facade.isOpen()).toBeFalse();
  });

  it('el motivo se limita a 200 caracteres', () => {
    facade.request(manual());

    facade.setReason('x'.repeat(250));

    expect(facade.reason().length).toBe(200);
  });

  it('confirmar envía motivo y versión, deja el detalle como Anulado y vuelve a pedir lista (misma pila de cursores) y conteos', () => {
    const detail = manual();
    const toast = TestBed.inject(ToastService);

    ops.list.replace({ items: [toOperationTrip(operationTripDto({ id: 'trip-m1' }))], limit: 8, nextCursor: 'cur-3', total: null });
    ops.cursors.set([null, 'cur-2']);
    ops.selectedId.set('trip-m1');
    ops.detail.replace(detail);
    facade.request(detail);
    facade.setReason('  Se registró dos veces  ');

    facade.confirm();
    const request = http.expectOne(MANUAL_URLS.voidOf('trip-m1'));

    expect(request.request.body).toEqual({ reason: 'Se registró dos veces', expected_version: 3 });
    expect(facade.saving()).toBeTrue();
    request.flush({ data: voidOutDto(), meta: {} });

    expect(facade.isOpen()).toBeFalse();
    expect(ops.detail.data()?.stateLabel).toBe('Anulado');
    expect(ops.detail.data()?.voidable).toBeFalse();
    expect(toast.toasts().at(-1)?.message).toBe('Viaje anulado. Ya no cuenta en tus emisiones.');
    expect(facade.announcement()).toBe('Viaje anulado. Ya no cuenta en tus emisiones.');
    const list = http.match((r) => r.url === OPERATIONS_URL && r.method === 'GET');

    expect(list.length).toBe(1);
    expect(list[0].request.params.get('cursor')).toBe('cur-2');
    expect(ops.cursors()).toEqual([null, 'cur-2']);
    list[0].flush(operationsPageBody([]));
    http.match(`${OPERATIONS_URL}/summary`).forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));
  });

  it('sin motivo el cuerpo solo lleva la versión; un viaje ya anulado se dice sin error', () => {
    facade.request(manual());

    facade.confirm();
    const request = http.expectOne(MANUAL_URLS.voidOf('trip-m1'));

    expect(request.request.body).toEqual({ expected_version: 3 });
    request.flush({ data: voidOutDto({ already_voided: true }), meta: {} });
    http.match((r) => r.url === OPERATIONS_URL).forEach((r) => r.flush(operationsPageBody([])));
    http.match(`${OPERATIONS_URL}/summary`).forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));

    expect(facade.announcement()).toBe('Este viaje ya estaba anulado.');
  });

  it('TRIP_HAS_CONFIRMED_MATCH y TRIP_NOT_MANUAL dejan la confirmación abierta con su error y vuelven a pedir el detalle abierto', () => {
    const detail = manual();

    ops.selectedId.set('trip-m1');
    ops.detail.replace(detail);
    facade.request(detail);

    facade.confirm();
    http.expectOne(MANUAL_URLS.voidOf('trip-m1')).flush({ error: { code: 'TRIP_HAS_CONFIRMED_MATCH' } }, { status: 409, statusText: 'Conflict' });

    expect(facade.isOpen()).toBeTrue();
    expect(facade.saving()).toBeFalse();
    expect(facade.error()?.code).toBe('TRIP_HAS_CONFIRMED_MATCH');
    http.expectOne(`${OPERATIONS_URL}/trip-m1`).flush({ data: tripDetailDto(), meta: {} });

    facade.confirm();
    http.expectOne(MANUAL_URLS.voidOf('trip-m1')).flush({ error: { code: 'TRIP_NOT_MANUAL' } }, { status: 409, statusText: 'Conflict' });

    expect(facade.error()?.code).toBe('TRIP_NOT_MANUAL');
    http.expectOne(`${OPERATIONS_URL}/trip-m1`).flush({ data: tripDetailDto(), meta: {} });
  });

  it('cancelar cierra sin pedir nada', () => {
    facade.request(manual());

    facade.cancel();

    expect(facade.isOpen()).toBeFalse();
    http.expectNone((r) => r.url.includes('/void'));
  });
});
