import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { EXPORTS_URL, OPERATIONS_URL, capped, exportJobDto, operationTripDtos, operationsPageBody, tabCountsDto, tripDetailDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { OperationExportsFacade } from './operation-exports.facade';
import { OperationsFacade, SEARCH_DEBOUNCE_MS } from './operations.facade';

describe('OperationsFacade', () => {
  let http: HttpTestingController;
  let facade: OperationsFacade;
  const lists = (): TestRequest[] => http.match((r) => r.url === OPERATIONS_URL && r.method === 'GET');
  const list = (): TestRequest => http.expectOne((r) => r.url === OPERATIONS_URL && r.method === 'GET');
  const summary = (): TestRequest => http.expectOne((r) => r.url === `${OPERATIONS_URL}/summary`);
  const noSummary = (): void => expect(http.match((r) => r.url === `${OPERATIONS_URL}/summary`).length).toBe(0);

  function setup(roles: string[] = ['ORG_VIEWER']): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles), membership(ORG_COORDINADORA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(OperationsFacade);
  }

  /** Carga inicial resuelta con una primera página de 8 que tiene siguiente. */
  function loaded(next: string | null = 'cur-2', total = capped(60)): void {
    facade.load();
    list().flush(operationsPageBody(operationTripDtos(8), { next, total }));
    summary().flush({ data: tabCountsDto(), meta: {} });
  }

  beforeEach(() => setup());
  afterEach(() => http.verify());

  it('al cargar pide la primera página de 8 sin cursor, los conteos de las pestañas y guarda el total acotado de la primera página', () => {
    facade.load();
    const request = list();

    expect(request.request.params.get('limit')).toBe('8');
    expect(request.request.params.get('view')).toBe('all');
    expect(request.request.params.has('cursor')).toBeFalse();
    request.flush(operationsPageBody(operationTripDtos(8), { next: 'cur-2', total: capped(10000, true) }));
    summary().flush({ data: tabCountsDto(), meta: {} });

    expect(facade.list.status()).toBe('ready');
    expect(facade.items().length).toBe(8);
    expect(facade.total()).toEqual({ value: 10000, capped: true });
    expect(facade.summary.data()?.pending.value).toBe(12);
    expect(facade.from()).toBe(1);
    expect(facade.to()).toBe(8);
    expect(facade.hasNext()).toBeTrue();
    expect(facade.hasPrevious()).toBeFalse();
  });

  it('sin permiso de cargas no pide periodos ni archivos; con él los pide', () => {
    facade.load();
    list().flush(operationsPageBody([]));
    summary().flush({ data: tabCountsDto(), meta: {} });
    expect(http.match((r) => r.url.includes('/imports')).length).toBe(0);

    TestBed.resetTestingModule();
    setup(['ORG_ADMIN']);
    facade.load();
    list().flush(operationsPageBody([]));
    summary().flush({ data: tabCountsDto(), meta: {} });
    http.expectOne((r) => r.url.endsWith('/imports/periods')).flush({ data: [], meta: {} });
    const files = http.expectOne((r) => r.url.endsWith('/imports') && r.method === 'GET');

    expect(files.request.params.get('page_size')).toBe('50');
    files.flush({ data: [], meta: { pagination: { page: 1, page_size: 50, total: 0, total_pages: 0, has_next: false, has_previous: false } } });
  });

  it('Siguiente envía el cursor del servidor, la página nueva no trae total (se conserva el conocido) y Anterior vuelve a pedir sin cursor', () => {
    loaded();
    facade.next();
    const second = list();

    expect(second.request.params.get('cursor')).toBe('cur-2');
    second.flush(operationsPageBody(operationTripDtos(8, 9), { next: 'cur-3' }));

    expect(facade.pageIndex()).toBe(1);
    expect(facade.from()).toBe(9);
    expect(facade.to()).toBe(16);
    expect(facade.total()).toEqual({ value: 60, capped: false });
    expect(facade.hasPrevious()).toBeTrue();

    facade.next();
    const third = list();

    expect(third.request.params.get('cursor')).toBe('cur-3');
    third.flush(operationsPageBody(operationTripDtos(8, 17)));
    expect(facade.hasNext()).toBeFalse();
    expect(facade.to()).toBe(24);

    facade.previous();
    expect(list().request.params.get('cursor')).toBe('cur-2');
  });

  it('Anterior en la primera página y Siguiente sin cursor no piden nada', () => {
    loaded(null);
    facade.previous();
    facade.next();
    expect(lists().length).toBe(0);
  });

  it('mientras llega una página no se admite otra navegación', () => {
    loaded();
    facade.next();
    const pending = list();

    facade.next();
    facade.previous();
    expect(lists().length).toBe(0);
    pending.flush(operationsPageBody(operationTripDtos(8, 9)));
  });

  it('cambiar un filtro vuelve a la primera página, descarta cursores y total y vuelve a pedir los conteos', () => {
    loaded();
    facade.next();
    list().flush(operationsPageBody(operationTripDtos(8, 9), { next: 'cur-3' }));

    facade.setFuel('GASOLINE');
    const request = list();

    expect(request.request.params.has('cursor')).toBeFalse();
    expect(request.request.params.get('fuel')).toBe('GASOLINE');
    expect(facade.cursors()).toEqual([null]);
    expect(facade.total()).toBeNull();
    expect(summary().request.params.get('fuel')).toBe('GASOLINE');
    request.flush(operationsPageBody([], { total: capped(0) }));
    expect(facade.total()).toEqual({ value: 0, capped: false });
  });

  it('cada filtro llega al servidor con su nombre: estado, carga, periodo, duplicados', () => {
    loaded();
    facade.setStatus('BLOCKED');
    facade.setImportFile('11111111-aaaa-4aaa-8aaa-111111111111');
    facade.setPeriod({ from: '2026-01-01', to: '2026-03-31' });
    facade.setDedup('all_states');
    const requests = lists();
    const last = requests.at(-1)!.request.params;

    expect(last.get('status')).toBe('BLOCKED');
    expect(last.get('import_file_id')).toBe('11111111-aaaa-4aaa-8aaa-111111111111');
    expect(last.get('from')).toBe('2026-01-01');
    expect(last.get('to')).toBe('2026-03-31');
    expect(last.get('dedup')).toBe('all_states');
    http.match((r) => r.url === `${OPERATIONS_URL}/summary`);
    // Cada cambio cancela la petición anterior en vuelo: solo la última sigue viva.
    expect(requests.slice(0, -1).every((r) => r.cancelled)).toBeTrue();
  });

  it('elegir una pestaña de estado libera el filtro «Estado» y elegir un estado vuelve a «Todos»: nunca se piden dos cosas contradictorias', () => {
    loaded();
    facade.setStatus('PENDING');
    http.match(() => true);
    expect(facade.view()).toBe('all');
    facade.setView('calculated');
    expect(facade.status()).toBeNull();
    expect(lists().at(-1)!.request.params.get('view')).toBe('calculated');
    http.match(() => true);
    facade.setStatus('CALCULATED');
    expect(facade.view()).toBe('all');
    http.match(() => true);
  });

  it('cambiar de pestaña pide solo la lista (los conteos no dependen de la vista)', () => {
    loaded();
    facade.setView('shared');
    expect(list().request.params.get('view')).toBe('shared');
    noSummary();
  });

  it('el tamaño de página 50 se pide con limit=50 y vuelve a la primera página; un tamaño no permitido se ignora', () => {
    loaded();
    facade.setPageSize(100);
    expect(lists().length).toBe(0);
    facade.setPageSize(50);
    const request = list();

    expect(request.request.params.get('limit')).toBe('50');
    noSummary();
  });

  it('la búsqueda espera 300 ms: teclear seguido pide UNA sola vez, con el texto final recortado', fakeAsync(() => {
    loaded();
    facade.setSearchText('AB');
    tick(100);
    facade.setSearchText('ABC');
    tick(100);
    facade.setSearchText('ABC12 ');
    tick(SEARCH_DEBOUNCE_MS - 1);
    expect(lists().length).toBe(0);

    tick(1);
    const request = list();

    expect(request.request.params.get('q')).toBe('ABC12');
    expect(facade.searchText()).toBe('ABC12 ');
    expect(facade.query()).toBe('ABC12');
    request.flush(operationsPageBody([]));
    expect(summary().request.params.get('q')).toBe('ABC12');
  }));

  it('escribir, borrar con la «x» y volver a escribir lo mismo antes de 300 ms vuelve a buscar (se compara con lo ya aplicado)', fakeAsync(() => {
    loaded();
    facade.setSearchText('ABC');
    tick(SEARCH_DEBOUNCE_MS);
    list().flush(operationsPageBody([]));
    summary().flush({ data: tabCountsDto(), meta: {} });
    expect(facade.query()).toBe('ABC');

    facade.clearSearch();
    expect(facade.query()).toBe('');
    http.match(() => true);
    facade.setSearchText('ABC');
    tick(SEARCH_DEBOUNCE_MS);
    const again = list();

    expect(again.request.params.get('q')).toBe('ABC');
    expect(facade.query()).toBe('ABC');
    again.flush(operationsPageBody([]));
    summary().flush({ data: tabCountsDto(), meta: {} });
  }));

  it('teclear rápido pide una sola vez y repetir el mismo texto ya aplicado no vuelve a pedir', fakeAsync(() => {
    loaded();
    for (const text of ['A', 'AB', 'ABC', 'ABCD']) {
      facade.setSearchText(text);
      tick(50);
    }

    tick(SEARCH_DEBOUNCE_MS);
    list().flush(operationsPageBody([]));
    summary().flush({ data: tabCountsDto(), meta: {} });
    facade.setSearchText('ABCD ');
    tick(SEARCH_DEBOUNCE_MS);
    expect(lists().length).toBe(0);
    expect(facade.query()).toBe('ABCD');
  }));

  it('un texto de solo espacios no busca ni cambia lo aplicado', fakeAsync(() => {
    loaded();
    facade.setSearchText('    ');
    tick(SEARCH_DEBOUNCE_MS);
    expect(lists().length).toBe(0);
    expect(facade.query()).toBe('');
    expect(facade.searchText()).toBe('    ');
  }));

  it('con un solo carácter no se busca; al borrar lo escrito se quita el filtro de búsqueda', fakeAsync(() => {
    loaded();
    facade.setSearchText('A');
    tick(SEARCH_DEBOUNCE_MS);
    expect(lists().length).toBe(0);

    facade.setSearchText('ABC');
    tick(SEARCH_DEBOUNCE_MS);
    list().flush(operationsPageBody([]));
    summary().flush({ data: tabCountsDto(), meta: {} });

    facade.setSearchText('');
    tick(SEARCH_DEBOUNCE_MS);
    expect(list().request.params.has('q')).toBeFalse();
    summary();
  }));

  it('una búsqueda nueva cancela la petición anterior que sigue en vuelo y su respuesta tardía no se pinta', fakeAsync(() => {
    loaded();
    facade.setSearchText('ABC');
    tick(SEARCH_DEBOUNCE_MS);
    const first = list();
    summary();

    facade.setSearchText('ABCD');
    tick(SEARCH_DEBOUNCE_MS);
    const second = list();

    expect(first.cancelled).toBeTrue();
    second.flush(operationsPageBody(operationTripDtos(2), { total: capped(2) }));
    expect(facade.items().length).toBe(2);
    http.match((r) => r.url === `${OPERATIONS_URL}/summary`);
  }));

  it('«Borrar la búsqueda» actúa al instante, sin esperar el debounce, y no deja una petición pendiente con el texto viejo', fakeAsync(() => {
    loaded();
    facade.setSearchText('ABC');
    tick(SEARCH_DEBOUNCE_MS);
    list().flush(operationsPageBody([]));
    summary().flush({ data: tabCountsDto(), meta: {} });

    facade.clearSearch();
    expect(list().request.params.has('q')).toBeFalse();
    summary();
    tick(SEARCH_DEBOUNCE_MS);
    expect(lists().length).toBe(0);
  }));

  it('un error de la lista queda en el recurso (mensaje del catálogo) y «Reintentar» vuelve a pedir; los items viejos no se pierden', () => {
    loaded();
    facade.setFuel('DIESEL');
    list().flush({ error: { code: 'SEARCH_TOO_BROAD' } }, { status: 422, statusText: 'Unprocessable' });
    summary();

    expect(facade.list.status()).toBe('error');
    expect(facade.list.error()?.code).toBe('SEARCH_TOO_BROAD');
    expect(facade.list.error()?.message).toContain('demasiado amplia');
    expect(facade.refreshing()).toBeFalse();
    facade.retry();
    list().flush(operationsPageBody(operationTripDtos(1)));
    expect(facade.list.status()).toBe('ready');
  });

  it('un cursor inválido (400 INVALID_CURSOR) se recupera reintentando desde la primera página', () => {
    loaded();
    facade.next();
    list().flush({ error: { code: 'INVALID_CURSOR' } }, { status: 400, statusText: 'Bad Request' });
    expect(facade.list.error()?.code).toBe('INVALID_CURSOR');

    facade.retry();
    const request = list();

    expect(request.request.params.has('cursor')).toBeFalse();
    expect(facade.cursors()).toEqual([null]);
    request.flush(operationsPageBody(operationTripDtos(8), { total: capped(60) }));
  });

  it('el estado de la vista se lee de la URL (valores fuera del vocabulario se ignoran) y se expresa de vuelta como parámetros', () => {
    facade.restore(convertToParamMap({ view: 'pending', fuel: 'DIESEL', from: '2026-01-01', to: '2026-03-31', dedup: 'held', q: 'ABC123', limit: '50', import_file_id: 'no-es-uuid' }));

    expect(facade.view()).toBe('pending');
    expect(facade.importFileId()).toBeNull();
    expect(facade.urlParams()).toEqual({ view: 'pending', status: null, fuel: 'DIESEL', import_file_id: null, from: '2026-01-01', to: '2026-03-31', dedup: 'held', q: 'ABC123', limit: '50' });
    expect(facade.searchText()).toBe('ABC123');

    facade.restore(convertToParamMap({ view: 'nope', status: 'X', fuel: 'AGUA', from: '2026-04-01', to: '2026-03-01', dedup: 'z', q: 'A', limit: '7' }));
    expect(facade.urlParams()).toEqual({ view: null, status: null, fuel: null, import_file_id: null, from: null, to: null, dedup: null, q: null, limit: null });
    expect(facade.hasFilters()).toBeFalse();
  });

  it('un periodo con solo uno de los dos extremos en la URL se ignora (el servidor exige ambos)', () => {
    facade.restore(convertToParamMap({ from: '2026-01-01' }));
    expect(facade.period()).toBe('ALL');
  });

  it('«Limpiar filtros» deja todo en su valor inicial y pide la primera página', () => {
    loaded();
    facade.setFuel('DIESEL');
    http.match(() => true);
    facade.clearFilters();
    const request = list();

    expect(request.request.params.keys().sort()).toEqual(['limit', 'view']);
    summary();
    expect(facade.hasFilters()).toBeFalse();
  });

  it('el detalle se pide solo al abrir; abrir otro viaje cancela el anterior y cerrar lo descarta', () => {
    loaded();
    facade.open('trip-1');
    const first = http.expectOne(`${OPERATIONS_URL}/trip-1`);

    facade.open('trip-2');
    expect(first.cancelled).toBeTrue();
    http.expectOne(`${OPERATIONS_URL}/trip-2`).flush({ data: tripDetailDto(), meta: {} });
    expect(facade.selectedId()).toBe('trip-2');
    expect(facade.detail.data()?.tripId).toBe('VIA-001245');

    facade.close();
    expect(facade.selectedId()).toBeNull();
    expect(facade.detail.data()).toBeNull();
  });

  it('un 404 TRIP_NOT_FOUND del detalle queda como error y «reintentar» lo vuelve a pedir', () => {
    loaded();
    facade.open('trip-1');
    http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ error: { code: 'TRIP_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
    expect(facade.detail.status()).toBe('error');
    facade.retryDetail();
    http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });
    expect(facade.detail.status()).toBe('ready');
  });

  it('cambiar de empresa descarta lista, conteos, detalle, filtros y cursores', () => {
    loaded();
    facade.setFuel('DIESEL');
    list().flush(operationsPageBody(operationTripDtos(3)));
    summary();
    facade.open('trip-1');
    http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.list.data()).toBeNull();
    expect(facade.summary.data()).toBeNull();
    expect(facade.detail.data()).toBeNull();
    expect(facade.selectedId()).toBeNull();
    expect(facade.fuel()).toBeNull();
    expect(facade.cursors()).toEqual([null]);
    expect(facade.total()).toBeNull();
  });

  describe('exportar', () => {
    const exportUrl = `${OPERATIONS_URL}/export`;
    const exportRequest = (): TestRequest => http.expectOne((r) => r.url === exportUrl);

    it('no exporta sin filas ni sin empresa activa; con filas pide el blob con los filtros y la pestaña y guarda el archivo', () => {
      facade.exportReport();
      http.expectNone((r) => r.url === exportUrl);

      facade.restore(convertToParamMap({ view: 'pending', fuel: 'GASOLINE', from: '2026-01-01', to: '2026-01-31', dedup: 'held' }));
      facade.load();
      list().flush(operationsPageBody(operationTripDtos(2), { next: null, total: capped(2) }));
      summary().flush({ data: tabCountsDto(), meta: {} });
      spyOn(URL, 'revokeObjectURL');
      const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
      const anchorClick = spyOn(HTMLAnchorElement.prototype, 'click').and.stub();
      facade.exportReport();
      facade.exportReport();
      const request = exportRequest();

      expect(facade.exporting()).toBeTrue();
      expect(request.request.params.get('view')).toBe('pending');
      expect(request.request.params.get('fuel')).toBe('GASOLINE');
      expect(request.request.params.get('from')).toBe('2026-01-01');
      expect(request.request.params.get('dedup')).toBe('held');
      expect(request.request.params.has('cursor') || request.request.params.has('limit')).toBeFalse();
      request.flush(new Blob(['x']));

      expect(facade.exporting()).toBeFalse();
      expect(create).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(facade.exportError()).toBeNull();
    });

    it('un error del servidor se guarda como AppError con el mensaje del catálogo y se limpia al cambiar un filtro', async () => {
      loaded();
      facade.exportReport();
      exportRequest().flush(new Blob([JSON.stringify({ error: { code: 'EXPORT_BUSY', message: 'x' } })], { type: 'application/json' }), { status: 429, statusText: 'Too Many Requests' });

      for (let attempt = 0; attempt < 100 && facade.exporting(); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));  // el cuerpo del error es un Blob: se lee de forma asíncrona

      expect(facade.exporting()).toBeFalse();
      expect(facade.exportError()?.code).toBe('EXPORT_BUSY');
      expect(facade.exportError()?.message).toContain('Hay reportes generándose');
      expect(facade.exportOffer()).toBeNull();

      facade.setFuel('DIESEL');
      list();
      summary();
      expect(facade.exportError()).toBeNull();
    });

    it('EXPORT_TOO_LARGE de la descarga directa no es un error rojo: ofrece generarlo en segundo plano con el tope que dijo el servidor, hasta que cambia un filtro', async () => {
      loaded();
      facade.exportReport();
      exportRequest().flush(
        new Blob([JSON.stringify({ error: { code: 'EXPORT_TOO_LARGE', message: 'x', details: [{ field: 'sync_max_rows', message: '100000', type: 'limit' }] } })], { type: 'application/json' }),
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      for (let attempt = 0; attempt < 100 && facade.exporting(); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));

      expect(facade.exportError()).toBeNull();
      expect(facade.exportOffer()).toEqual({ maxRows: 100000 });

      facade.setFuel('DIESEL');
      list();
      summary();
      expect(facade.exportOffer()).toBeNull();
    });

    it('sin el tope en los detalles igual ofrece el segundo plano (sin cifra)', async () => {
      loaded();
      facade.exportReport();
      exportRequest().flush(new Blob([JSON.stringify({ error: { code: 'EXPORT_TOO_LARGE', message: 'x' } })], { type: 'application/json' }), { status: 422, statusText: 'Unprocessable Entity' });

      for (let attempt = 0; attempt < 100 && facade.exporting(); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));

      expect(facade.exportOffer()).toEqual({ maxRows: null });
    });

    it('generateReport pide el trabajo con los filtros y la pestaña actuales y, al quedar en cola, quita la oferta; si el servidor lo rechaza el motivo queda en el error', async () => {
      loaded();
      facade.restore(convertToParamMap({ view: 'pending', fuel: 'GASOLINE', dedup: 'held' }));
      facade.load();
      list().flush(operationsPageBody(operationTripDtos(2), { next: null, total: capped(2) }));
      summary().flush({ data: tabCountsDto(), meta: {} });
      facade.exportOffer.set({ maxRows: 100000 });
      facade.generateReport();
      const create = http.expectOne((r) => r.url === EXPORTS_URL && r.method === 'POST');

      expect(create.request.body).toEqual({ view: 'pending', fuel: 'GASOLINE', dedup: 'held' });
      create.flush({ data: exportJobDto({ status: 'QUEUED', progress: 0, downloadable: false, size_bytes: null }), meta: {} }, { status: 202, statusText: 'Accepted' });
      expect(facade.exportOffer()).toBeNull();
      expect(facade.exportError()).toBeNull();
      TestBed.inject(OperationExportsFacade).stop();

      facade.exportOffer.set({ maxRows: 1 });
      facade.generateReport();
      http.expectOne((r) => r.url === EXPORTS_URL && r.method === 'POST').flush({ error: { code: 'EXPORT_IN_PROGRESS', message: 'x' } }, { status: 409, statusText: 'Conflict' });

      expect(facade.exportOffer()).toBeNull();
      expect(facade.exportError()?.code).toBe('EXPORT_IN_PROGRESS');
    });

    it('cancelExport (al salir de la pantalla) cancela la descarga directa en vuelo y no deja el botón en «Preparando…»', () => {
      loaded();
      facade.exportReport();
      const request = exportRequest();
      facade.cancelExport();

      expect(request.cancelled).toBeTrue();
      expect(facade.exporting()).toBeFalse();
    });

    it('cambiar de empresa cancela una descarga en curso y la deja sin efecto', () => {
      loaded();
      facade.exportReport();
      const request = exportRequest();
      TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

      expect(request.cancelled).toBeTrue();
      expect(facade.exporting()).toBeFalse();
      expect(facade.exportError()).toBeNull();
    });
  });
});
