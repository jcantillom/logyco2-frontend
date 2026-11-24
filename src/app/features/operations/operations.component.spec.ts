import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { EXPORTS_URL, OPERATIONS_URL, capped, exportJobDto, exportsBody, operationTripDto, operationTripDtos, operationsPageBody, tabCountsDto, tripDetailDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { routes } from '../../app.routes';
import { SessionStore } from '../../core/auth/session.store';
import { NAV_ITEMS } from '../../shared/layouts/nav-items';
import { OperationTripDto } from '../../infrastructure/dto/operations.dto';
import { OperationsComponent } from './operations.component';

/** CSS de los componentes ya compilado por Angular, sin los atributos de encapsulación ni saltos de línea. */
const componentCss = (marker: string): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '))
    .filter((c) => c.includes(marker))
    .join('\n');

describe('OperationsComponent: Operaciones logísticas', () => {
  let fixture: ComponentFixture<OperationsComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const listRequest = (): TestRequest => http.expectOne((r) => r.url === OPERATIONS_URL && r.method === 'GET');
  const summaryRequest = (): TestRequest => http.expectOne((r) => r.url === `${OPERATIONS_URL}/summary`);
  /** «Etiqueta valor ayuda» de cada par dt/dd de una lista de definiciones (los textos pegados no se pueden comparar). */
  const rows = (selector: string): string =>
    qa(`${selector} dt`)
      .map((dt) => `${dt.textContent} ${Array.from((dt.nextElementSibling as HTMLElement).childNodes).map((n) => n.textContent).join(' ')}`.replace(/\s+/g, ' ').trim())
      .join(' | ');
  const click = (selector: string, index = 0): void => {
    qa(selector)[index].click();
    fixture.detectChanges();
  };

  function render(roles: string[] = ['ORG_VIEWER'], params: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      imports: [OperationsComponent],
      providers: [...provideTestApp(), provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(params) } } }],
    });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OperationsComponent);
    fixture.detectChanges();
  }

  function init(items: readonly OperationTripDto[] = operationTripDtos(8), options: { next?: string | null; roles?: string[]; params?: Record<string, string> } = {}): void {
    render(options.roles, options.params);
    listRequest().flush(operationsPageBody(items, { next: options.next === undefined ? 'cur-2' : options.next, total: capped(items.length === 8 ? 254 : items.length) }));
    summaryRequest().flush({ data: tabCountsDto(), meta: {} });
    fixture.detectChanges();
  }

  afterEach(() => {
    if (!http) return;

    http.match((r) => r.url === EXPORTS_URL && r.method === 'GET').forEach((request) => !request.cancelled && request.flush(exportsBody()));  // el panel «Reportes» pide sus trabajos al entrar
    http.verify();
  });

  describe('listado', () => {
    it('muestra 8 filas con fecha dd/mm/aaaa, placa, trayecto legible, distancia, carga, combustible, kg CO₂ y estado, y el título de la pantalla', () => {
      init();

      expect(text('app-page-hero h1')).toBe('Operaciones logísticas');
      expect(qa('[data-testid="trip-row"]').length).toBe(8);
      const cells = qa('[data-testid="trip-row"]')[0].querySelectorAll('td');
      const value = (i: number): string => (cells[i].textContent ?? '').replace(cells[i].querySelector('.lbl')?.textContent ?? '', '').replace(/\s+/g, ' ').trim();

      expect(value(0)).toBe('15/03/2026');
      expect(value(1)).toBe('ABC123');
      expect(value(2)).toBe('Yumbo Valle del Cauca');
      expect(value(3)).toBe('Palmira Valle del Cauca');
      expect(value(4)).toBe('Yumbo, Valle del Cauca → Palmira, Valle del Cauca');
      expect(value(5)).toBe('40');
      expect(value(6)).toBe('18,0');
      expect(value(7)).toBe('Diésel');
      expect(value(8)).toBe('50,745');
      expect(qa('thead th').some((th) => th.textContent!.includes('ID del viaje'))).toBeFalse();
      expect(qa('[data-testid="trip-row"]')[0].getAttribute('aria-label')).toBe('Viaje VIA-000001');
      expect(text('[data-testid="trip-row"] [data-testid="state-chip"]')).toBe('Calculado');
    });

    it('un dato que falta se ve «—», nunca 0, y el chip dice lo que dice el servidor con su motivo como ayuda', () => {
      init([operationTripDto({ trip_id: null, trip_date: null, plate: null, distance_km: null, cargo_ton: null, fuel_type: null, kg_co2: null, status: 'PENDING', state_label: 'Por completar', reason: 'MISSING_DISTANCE', reason_label: 'Falta la distancia' })], { next: null });
      const cells = qa('[data-testid="trip-row"] td');
      const value = (i: number): string => (cells[i].textContent ?? '').replace(cells[i].querySelector('.lbl')?.textContent ?? '', '').trim();

      for (const i of [0, 1, 5, 6, 7, 8]) expect(value(i)).toBe('—');
      expect(text('[data-testid="state-chip"]')).toBe('Por completar');
      expect(q('[data-testid="state-chip"]')!.getAttribute('title')).toBe('Falta la distancia');
    });

    it('el estado compartido sale con la etiqueta del servidor y sin ningún valor de la otra empresa', () => {
      init([operationTripDto({ shared: { state: 'CONFLICTING_DATA', label: 'Cifras en conflicto' } })], { next: null });

      expect(text('[data-testid="shared-chip"]')).toBe('Cifras en conflicto');
      expect(qa('[data-testid="trip-row"] td').length).toBe(11);
    });

    it('mientras carga por primera vez muestra un esqueleto de 8 filas (las de la página) con el mismo alto, marcado aria-busy, y sin filas reales', () => {
      render();

      expect(qa('[data-testid="skeleton-row"]').length).toBe(8);
      expect(q('[data-testid="trip-row"]')).toBeNull();
      expect(q('[data-testid="results"]')!.getAttribute('aria-busy')).toBe('true');
      listRequest().flush(operationsPageBody([]));
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });
    });

    it('al cambiar un filtro conserva las filas (atenuadas y aria-busy) sin volver al esqueleto y se refresca al llegar la respuesta', () => {
      init();
      const fuel = q<HTMLSelectElement>('[data-testid="fuel"]')!;

      fuel.value = 'GASOLINE';
      fuel.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(qa('[data-testid="trip-row"]').length).toBe(8);
      expect(q('[data-testid="skeleton-row"]')).toBeNull();
      expect(q('[data-testid="trip-list"]')!.classList.contains('busy')).toBeTrue();
      expect(q('[data-testid="results"]')!.getAttribute('aria-busy')).toBe('true');
      const request = listRequest();

      expect(request.request.params.get('fuel')).toBe('GASOLINE');
      request.flush(operationsPageBody(operationTripDtos(3), { total: capped(3) }));
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });
      fixture.detectChanges();
      expect(qa('[data-testid="trip-row"]').length).toBe(3);
      expect(q('[data-testid="results"]')!.getAttribute('aria-busy')).toBe('false');
    });

    it('error: muestra el mensaje y «Reintentar» vuelve a pedir la lista', () => {
      render();
      listRequest().flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Server Error' });
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });
      fixture.detectChanges();

      expect(q('[data-testid="list-error"]')).not.toBeNull();
      expect(q('[data-testid="trips-table"]')).toBeNull();
      click('[data-testid="retry"]');
      listRequest().flush(operationsPageBody(operationTripDtos(2)));
      fixture.detectChanges();
      expect(q('[data-testid="list-error"]')).toBeNull();
      expect(qa('[data-testid="trip-row"]').length).toBe(2);
    });

    it('vacío sin filtros: «Aún no hay viajes»; vacío con filtros: «Sin resultados» y «Limpiar filtros» vuelve a pedir sin ellos', () => {
      init([], { next: null });
      expect(text('[data-testid="empty-state"] h2')).toBe('Aún no hay viajes');
      expect(q('[data-testid="clear-filters"]')).toBeNull();
      expect(q('app-cursor-pager')).toBeNull();
    });

    it('con filtros y sin resultados ofrece «Limpiar filtros»', () => {
      init([], { next: null, params: { fuel: 'DIESEL' } });
      expect(text('[data-testid="empty-state"] h2')).toBe('Sin resultados');
      click('[data-testid="clear-filters"]');
      const request = listRequest();

      expect(request.request.params.has('fuel')).toBeFalse();
      summaryRequest();
      request.flush(operationsPageBody([]));
    });
  });

  describe('pestañas y conteos', () => {
    it('las pestañas muestran los conteos del resumen y los acotados salen como «10.000+»', () => {
      init();

      expect(text('[data-testid="count-all"]')).toBe('254');
      expect(text('[data-testid="count-calculated"]')).toBe('234');
      expect(text('[data-testid="count-pending"]')).toBe('12');
      expect(text('[data-testid="count-issues"]')).toBe('8');
      expect(text('[data-testid="count-shared"]')).toBe('10.000+');
      expect(qa('[role="tab"]', ).map((t) => (t.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/\s*[\d.]+\+?$/, '')).slice(0, 5)).toEqual(['Todos los viajes', 'Calculados', 'Por completar', 'Inconsistencias', 'Compartidos']);
    });

    it('antes de que lleguen los conteos cada pestaña reserva su lugar (sin salto) y la lista no espera por ellos', () => {
      render();
      expect(qa('.vtab .n.pending').length).toBe(5);
      listRequest().flush(operationsPageBody([]));
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });
    });

    it('elegir «Por completar» pide la vista pending sin volver a pedir los conteos y deja la pestaña seleccionada; las flechas cambian de pestaña', () => {
      init();
      click('[data-testid="view-pending"]');
      const request = listRequest();

      expect(request.request.params.get('view')).toBe('pending');
      expect(http.match((r) => r.url.endsWith('/summary')).length).toBe(0);
      request.flush(operationsPageBody([]));
      fixture.detectChanges();
      expect(q('[data-testid="view-pending"]')!.getAttribute('aria-selected')).toBe('true');
      expect(q('[data-testid="view-pending"]')!.getAttribute('tabindex')).toBe('0');
      expect(q('[data-testid="view-all"]')!.getAttribute('tabindex')).toBe('-1');

      q('[data-testid="view-pending"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();
      expect(listRequest().request.params.get('view')).toBe('issues');
    });
  });

  describe('filtros, búsqueda y paginación', () => {
    it('la búsqueda espera 300 ms (una sola petición con el texto final) y «Borrar» actúa al instante', fakeAsync(() => {
      init();
      const input = q<HTMLInputElement>('[data-testid="search"]')!;
      const type = (value: string): void => {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      };

      type('AB');
      tick(120);
      type('ABC123');
      tick(299);
      expect(http.match((r) => r.url === OPERATIONS_URL).length).toBe(0);
      tick(1);
      const request = listRequest();

      expect(request.request.params.get('q')).toBe('ABC123');
      request.flush(operationsPageBody([operationTripDto({ plate: 'ABC123' })], { total: capped(1) }));
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });
      fixture.detectChanges();

      click('[data-testid="clear-search"]');
      expect(listRequest().request.params.has('q')).toBeFalse();
      summaryRequest();
      expect(input.value).toBe('');
    }));

    it('con un solo carácter avisa que hacen falta 2 y no pide nada', fakeAsync(() => {
      init();
      const input = q<HTMLInputElement>('[data-testid="search"]')!;

      input.value = 'A';
      input.dispatchEvent(new Event('input'));
      tick(300);
      fixture.detectChanges();

      expect(text('[data-testid="search-hint"]')).toContain('al menos 2 caracteres');
      expect(http.match((r) => r.url === OPERATIONS_URL).length).toBe(0);
    }));

    it('«Siguiente» pide con el cursor y «Anterior» regresa; el total acotado se muestra «254» y se mantiene en la página 2', () => {
      init();
      expect(text('[data-testid="pager-total"]')).toBe('254');
      expect(text('[data-testid="pager"] .info')).toContain('1–8');
      expect(q<HTMLButtonElement>('[data-testid="page-prev"]')!.disabled).toBeTrue();

      click('[data-testid="page-next"]');
      const next = listRequest();

      expect(next.request.params.get('cursor')).toBe('cur-2');
      next.flush(operationsPageBody(operationTripDtos(8, 9), { next: null }));
      fixture.detectChanges();
      expect(text('[data-testid="pager"] .info')).toContain('9–16');
      expect(text('[data-testid="pager-total"]')).toBe('254');
      expect(q<HTMLButtonElement>('[data-testid="page-next"]')!.disabled).toBeTrue();

      click('[data-testid="page-prev"]');
      expect(listRequest().request.params.has('cursor')).toBeFalse();
    });

    it('un total acotado se escribe «10.000+»', () => {
      render();
      listRequest().flush(operationsPageBody(operationTripDtos(8), { next: 'c', total: capped(10000, true) }));
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });
      fixture.detectChanges();
      expect(text('[data-testid="pager-total"]')).toBe('10.000+');
    });

    it('el selector de filas ofrece 8, 10, 25 y 50 y 50 pide limit=50', () => {
      init();
      const select = q<HTMLSelectElement>('[data-testid="page-size"]')!;

      expect(Array.from(select.options).map((o) => o.value)).toEqual(['8', '10', '25', '50']);
      select.value = '50';
      select.dispatchEvent(new Event('change'));
      expect(listRequest().request.params.get('limit')).toBe('50');
    });

    it('«Más filtros» abre «Duplicados» (los duplicados son alcanzables con un filtro claro) y lo elegido se pide con dedup', () => {
      init();
      expect(q('[data-testid="more-panel"]')).toBeNull();
      click('[data-testid="more-filters"]');
      expect(q('[data-testid="more-filters"]')!.getAttribute('aria-expanded')).toBe('true');
      const dedup = q<HTMLSelectElement>('[data-testid="dedup"]')!;

      expect(Array.from(dedup.options).map((o) => o.textContent!.trim())).toEqual(['Solo los que cuentan', 'Duplicados confirmados', 'Posibles duplicados retenidos', 'Todos, con su estado']);
      dedup.value = 'duplicates';
      dedup.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(listRequest().request.params.get('dedup')).toBe('duplicates');
      summaryRequest();
      click('[data-testid="more-filters"]');
      expect(q('[data-testid="more-panel"]')).not.toBeNull();
    });

    it('los filtros de la URL se aplican al entrar y el estado de la vista se escribe de vuelta en la URL sin historial', () => {
      render(['ORG_VIEWER'], { view: 'pending', fuel: 'GASOLINE', dedup: 'held' });
      const request = listRequest();

      expect(request.request.params.get('view')).toBe('pending');
      expect(request.request.params.get('fuel')).toBe('GASOLINE');
      expect(request.request.params.get('dedup')).toBe('held');
      expect(q('[data-testid="more-panel"]')).not.toBeNull();
      expect(q<HTMLSelectElement>('[data-testid="fuel"]')!.value).toBe('GASOLINE');
      request.flush(operationsPageBody([]));
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });

      const navigate = TestBed.inject(Router).navigate as jasmine.Spy;
      const [, extras] = navigate.calls.mostRecent().args;

      expect(extras.queryParams).toEqual(jasmine.objectContaining({ view: 'pending', fuel: 'GASOLINE', dedup: 'held', q: null }));
      expect(extras.replaceUrl).toBeTrue();
    });

    it('con permiso de cargas ofrece el selector de periodo y el filtro de archivo; sin él, no', () => {
      init(operationTripDtos(1), { next: null });
      expect(q('[data-testid="period"]')).toBeNull();
      expect(q('[data-testid="import-file"]')).toBeNull();
    });

    it('con permiso de cargas el periodo elegido va como from y to y el archivo como import_file_id', () => {
      render(['ORG_ADMIN']);
      listRequest().flush(operationsPageBody([]));
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });
      http.expectOne((r) => r.url.endsWith('/imports/periods')).flush({ data: [{ from: '2026-01-01', to: '2026-03-31', imports: 2, rows_read: 300 }], meta: {} });
      http.expectOne((r) => r.url.endsWith('/imports') && r.method === 'GET').flush({
        data: [{ id: '33333333-3333-4333-8333-333333333333', file_name: 'Viajes_marzo.xlsx', file_size: 10, status: 'COMPLETED', created_at: '2026-03-16T10:00:00Z' }],
        meta: { pagination: { page: 1, page_size: 50, total: 1, total_pages: 1, has_next: false, has_previous: false } },
      });
      fixture.detectChanges();

      expect(q('[data-testid="period"]')).not.toBeNull();
      const file = q<HTMLSelectElement>('[data-testid="import-file"]')!;

      expect(Array.from(file.options).map((o) => o.textContent!.trim())).toEqual(['Todos', 'Viajes_marzo.xlsx']);
      file.value = '33333333-3333-4333-8333-333333333333';
      file.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const request = listRequest();

      expect(request.request.params.get('import_file_id')).toBe('33333333-3333-4333-8333-333333333333');
      request.flush(operationsPageBody([]));
      summaryRequest();
    });
  });

  describe('exportar', () => {
    const EXPORT_URL = `${OPERATIONS_URL}/export`;
    const exportRequest = (): TestRequest => http.expectOne((r) => r.url === EXPORT_URL && r.method === 'GET');
    const button = (): HTMLButtonElement => q<HTMLButtonElement>('[data-testid="export"]')!;
    const spyDownload = (): { create: jasmine.Spy; anchorClick: jasmine.Spy } => {
      spyOn(URL, 'revokeObjectURL');

      return { create: spyOn(URL, 'createObjectURL').and.returnValue('blob:reporte'), anchorClick: spyOn(HTMLAnchorElement.prototype, 'click').and.stub() };
    };

    it('con filas el botón está activo, sin la leyenda «Disponible próximamente» ni título de ayuda', () => {
      init();

      expect(button().disabled).toBeFalse();
      expect(button().textContent).toContain('Exportar');
      expect(button().getAttribute('aria-busy')).toBe('false');
      expect(button().hasAttribute('aria-describedby')).toBeFalse();
      expect(q('[data-testid="export-hint"]')).toBeNull();
      expect(el().textContent).not.toContain('Disponible próximamente');
      expect(button().closest('.export')!.hasAttribute('title')).toBeFalse();
    });

    it('sin viajes en el resultado está desactivado y lo explica de forma accesible', () => {
      init([], { next: null });

      expect(button().disabled).toBeTrue();
      expect(button().getAttribute('aria-describedby')).toBe('ops-export-hint');
      expect(text('[data-testid="export-hint"]')).toBe('No hay viajes para exportar con los filtros actuales');
      button().click();
      http.expectNone((r) => r.url === EXPORT_URL);
    });

    it('al pulsar pide el reporte con los filtros y la pestaña actuales (sin cursor ni límite), muestra «Preparando…» sin cambiar el ancho y descarga con el nombre del servidor', () => {
      init(operationTripDtos(8), { params: { view: 'calculated', fuel: 'DIESEL', q: 'ABC' } });
      const { create, anchorClick } = spyDownload();
      const navigations = (TestBed.inject(Router).navigate as jasmine.Spy).calls.count();
      const width = button().getBoundingClientRect().width;

      click('[data-testid="export"]');
      const request = exportRequest();

      expect(request.request.responseType).toBe('blob');
      expect(request.request.params.get('view')).toBe('calculated');
      expect(request.request.params.get('fuel')).toBe('DIESEL');
      expect(request.request.params.get('q')).toBe('ABC');
      expect(request.request.params.has('cursor')).toBeFalse();
      expect(request.request.params.has('limit')).toBeFalse();
      expect(button().disabled).toBeTrue();
      expect(button().getAttribute('aria-busy')).toBe('true');
      expect(button().textContent).toContain('Preparando…');
      expect(button().getBoundingClientRect().width).toBe(width);
      click('[data-testid="export"]');  // un segundo clic no lanza otra petición
      request.flush(new Blob(['xlsx']), { headers: { 'Content-Disposition': 'attachment; filename="operaciones-logisticas_20261123.xlsx"' } });
      fixture.detectChanges();

      expect(create).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(document.querySelector('a[download="operaciones-logisticas_20261123.xlsx"]')).toBeNull();  // el ancla temporal se retira
      expect(button().disabled).toBeFalse();
      expect(button().getAttribute('aria-busy')).toBe('false');
      expect(button().textContent).toContain('Exportar');
      expect((TestBed.inject(Router).navigate as jasmine.Spy).calls.count()).toBe(navigations);  // descargar no navega
    });

    it('si la descarga directa es demasiado grande ofrece generarlo en segundo plano en la misma alerta, sin error rojo y sin descargar nada', async () => {
      init();
      const { create } = spyDownload();

      click('[data-testid="export"]');
      exportRequest().flush(
        new Blob([JSON.stringify({ error: { code: 'EXPORT_TOO_LARGE', message: 'x', details: [{ field: 'sync_max_rows', message: '100000', type: 'limit' }] } })], { type: 'application/json' }),
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      for (let attempt = 0; attempt < 100 && !q('[data-testid="export-offer"]'); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        fixture.detectChanges();
      }

      const offer = q('[data-testid="export-offer"]')!;

      expect(offer.getAttribute('role')).toBe('alert');
      expect(offer.classList).toContain('alert');
      expect(offer.classList).not.toContain('alert-danger');
      expect(offer.textContent).toContain('El reporte tiene más de 100.000 viajes. ¿Generarlo en segundo plano?');
      expect(q('[data-testid="export-error"]')).toBeNull();
      expect(text('[data-testid="export-generate"]')).toBe('Generar reporte');
      expect(create).not.toHaveBeenCalled();
      expect(button().disabled).toBeFalse();
    });

    it('«Generar reporte» pide el trabajo, quita la oferta, abre el panel «Reportes» con el trabajo en cola y anuncia el estado', async () => {
      init();
      spyDownload();
      click('[data-testid="export"]');
      exportRequest().flush(new Blob([JSON.stringify({ error: { code: 'EXPORT_TOO_LARGE', message: 'x' } })], { type: 'application/json' }), { status: 422, statusText: 'Unprocessable Entity' });

      for (let attempt = 0; attempt < 100 && !q('[data-testid="export-generate"]'); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        fixture.detectChanges();
      }

      click('[data-testid="export-generate"]');
      http.expectOne((r) => r.url === EXPORTS_URL && r.method === 'POST').flush({ data: exportJobDto({ status: 'QUEUED', progress: 0, downloadable: false, size_bytes: null }), meta: {} }, { status: 202, statusText: 'Accepted' });
      fixture.detectChanges();

      expect(q('[data-testid="export-offer"]')).toBeNull();
      expect(q('[data-testid="exports-panel"]')).not.toBeNull();
      expect(text('[data-testid="export-status"]')).toBe('En cola');
      expect(text('[data-testid="exports-live"]')).toContain('Reporte en cola');
      expect(text('[data-testid="exports-count"]')).toBe('1');
      fixture.destroy();
    });

    it('al salir de la pantalla cancela la descarga directa en vuelo: el archivo no se guarda en silencio después', () => {
      init();
      spyDownload();
      click('[data-testid="export"]');
      const request = exportRequest();
      fixture.destroy();

      expect(request.cancelled).toBeTrue();
    });
  });

  describe('detalle del viaje', () => {
    function openFirst(detail = tripDetailDto()): void {
      init();
      click('[data-testid="open-detail"]');
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: detail, meta: {} });
      fixture.detectChanges();
    }

    it('el ojo pide el detalle solo ahora y abre el panel con la cabecera de la fila mientras llega (esqueleto con aria-busy)', () => {
      init();
      expect(q('[data-testid="trip-detail"]')).toBeNull();
      click('[data-testid="open-detail"]');

      expect(text('[data-testid="detail-id"]')).toBe('VIA-000001');
      expect(q('[data-testid="detail-loading"]')).not.toBeNull();
      expect(q('[data-testid="trip-detail"]')!.getAttribute('aria-busy')).toBe('true');
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });
    });

    it('ofrece el acceso a Calidad de datos solo cuando hay un posible duplicado retenido', () => {
      openFirst();
      expect(q('[data-testid="detail-quality-link"]')).toBeNull();
    });

    it('un posible duplicado enlaza a Calidad de datos', () => {
      const base = tripDetailDto();
      openFirst({ ...base, dedup: { ...base.dedup, status: 'POSSIBLE_DUPLICATE' } });

      expect(q('[data-testid="detail-quality-link"]')!.getAttribute('href')).toBe('/calidad');
    });

    it('«Información» muestra lo guardado: vehículo, combustible, trayecto, distancia, carga, rendimiento y archivo de origen', () => {
      openFirst();
      const info = rows('[data-testid="detail-info"]');

      expect(text('[data-testid="detail-state"]')).toBe('Calculado');
      expect(info).toContain('Vehículo ABC123 · C3S3');
      expect(info).toContain('Tractocamión · 2019 · 32,0 t');
      expect(info).toContain('Combustible Diésel');
      expect(info).toContain('Trayecto Yumbo, Valle del Cauca → Palmira, Valle del Cauca');
      expect(info).toContain('Distancia 40 km');
      expect(info).toContain('Carga transportada 18,0 toneladas');
      expect(info).toContain('Rendimiento 8 km/gal');
      expect(info).toContain('Rendimiento 8 km/gal Estimado');
      expect(info).toContain('Archivo Excel: Viajes_marzo.xlsx (fila 128)');
      expect(text('[data-testid="detail-kg"]')).toContain('50,745 kg CO₂');
    });

    it('«Cálculo de emisiones» muestra los valores guardados con su factor y fuente, sin recalcular nada', () => {
      openFirst();
      click('[data-testid="detail-tab-emissions"]');
      const calc = rows('[data-testid="detail-emissions"]');

      expect(calc).toContain('Emisiones 50,745 kg CO₂');
      expect(calc).toContain('Consumo 5 gal');
      expect(calc).toContain('Factor de emisión 10,149 kg CO2/gal');
      expect(calc).toContain('UPME');
      expect(calc).toContain('Factores de emisión 2024 · 2024');
    });

    it('«Historial» lista los eventos del propio viaje', () => {
      openFirst();
      click('[data-testid="detail-tab-history"]');
      const events = qa('[data-testid="detail-history"] li').map((li) => (li.textContent ?? '').trim());

      expect(events.length).toBe(2);
      expect(events[0]).toContain('Viaje registrado desde la carga');
      expect(events[1]).toContain('Emisiones calculadas');
    });

    it('un viaje sin resultado dice «todavía no tiene resultado calculado» con el motivo y los kg salen «—»', () => {
      openFirst(tripDetailDto({ emissions: null, status: 'PENDING', state_label: 'Por completar', reason_label: 'Falta la distancia' }));
      click('[data-testid="detail-tab-emissions"]');

      expect(text('[data-testid="detail-no-result"]')).toContain('todavía no tiene resultado calculado');
      expect(text('[data-testid="detail-no-result"]')).toContain('Falta la distancia');
      expect(text('[data-testid="detail-kg"] b')).toBe('—');
    });

    it('un duplicado muestra su estado y a qué viaje repite; un viaje compartido, su etiqueta del servidor', () => {
      openFirst(tripDetailDto({
        dedup: { status: 'CONFIRMED_DUPLICATE', status_label: 'Duplicado confirmado', rule: 'R2', rule_label: 'Mismo identificador', resolved_by_name: 'Ana Prueba', resolved_at: '2026-03-20T08:00:00Z', duplicate_of: { id: 'x', trip_date: '2026-03-15', plate: 'ABC123', import_file_id: 'f', file_name: 'Viajes_febrero.xlsx' } },
        shared: { state: 'POSSIBLE_MATCH', label: 'Posible coincidencia' },
      }));

      expect(rows('[data-testid="detail-info"]')).toContain('Duplicados Duplicado confirmado Mismo identificador');
      expect(rows('[data-testid="detail-info"]')).toContain('Viajes_febrero.xlsx');
      expect(rows('[data-testid="detail-info"]')).toContain('Ana Prueba');
      expect(text('[data-testid="detail-shared"]')).toBe('Posible coincidencia');
    });

    it('error 404: «Reintentar» vuelve a pedir el detalle', () => {
      init();
      click('[data-testid="open-detail"]');
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ error: { code: 'TRIP_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(text('[data-testid="detail-error"]')).toContain('Reintentar');
      expect(text('[data-testid="detail-error"]')).toContain('Este viaje ya no está disponible. Actualiza la lista.');
      expect(text('[data-testid="detail-error"]')).not.toContain('Alguno');
      click('[data-testid="detail-error"] button');
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });
      fixture.detectChanges();
      expect(q('[data-testid="detail-info"]')).not.toBeNull();
    });

    it('las pestañas del panel son accesibles: tablist, aria-selected, foco itinerante y flechas; el panel se rotula con el título', () => {
      openFirst();
      const tabs = qa('[data-testid="trip-detail"] [role="tab"]');

      expect(q('[data-testid="trip-detail"] [role="tablist"]')).not.toBeNull();
      expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
      expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
      expect(q('[role="tabpanel"]#trip-tabpanel')!.getAttribute('aria-labelledby')).toBe('trip-tab-info');
      expect(q('[data-testid="trip-detail"]')!.getAttribute('aria-labelledby')).toBe('trip-detail-title');

      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();
      expect(qa('[data-testid="trip-detail"] [role="tab"]').map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
      qa('[data-testid="trip-detail"] [role="tab"]')[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      fixture.detectChanges();
      expect(q('[data-testid="detail-history"]')).not.toBeNull();
    });

    it('cerrar (botón o Escape) quita el panel, devuelve el foco al ojo y no vuelve a pedir nada', () => {
      openFirst();
      document.body.appendChild(el());
      const eye = qa('[data-testid="open-detail"]')[0];

      click('[data-testid="close-detail"]');
      expect(q('[data-testid="trip-detail"]')).toBeNull();
      expect(document.activeElement).toBe(eye);

      click('[data-testid="open-detail"]');
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });
      fixture.detectChanges();
      q('[data-testid="trip-detail"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(q('[data-testid="trip-detail"]')).toBeNull();
      el().remove();
    });

    it('la fila abierta queda marcada (aria-current) y el ojo se nombra con el ID del viaje', () => {
      openFirst();
      expect(qa('[data-testid="trip-row"]')[0].getAttribute('aria-current')).toBe('true');
      expect(qa('[data-testid="trip-row"]')[1].getAttribute('aria-current')).toBeNull();
      expect(qa('[data-testid="open-detail"]')[0].getAttribute('aria-label')).toBe('Ver el detalle del viaje VIA-000001');
    });
  });

  describe('mensajes, accesibilidad y alineación', () => {
    it('SEARCH_TOO_SHORT dice 2 caracteres (el mínimo de esta vista), no los 3 del catálogo compartido', () => {
      render();
      listRequest().flush({ error: { code: 'SEARCH_TOO_SHORT' } }, { status: 400, statusText: 'Bad Request' });
      summaryRequest().flush({ data: tabCountsDto(), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="list-error"]')).toContain('Escribe al menos 2 caracteres para buscar.');
      expect(text('[data-testid="list-error"]')).not.toContain('3 caracteres');
    });

    it('la tabla conserva su semántica con roles (table, rowgroup, row, columnheader, cell) y la fila se nombra con el ID', () => {
      init();

      expect(q('[data-testid="trips-table"]')!.getAttribute('role')).toBe('table');
      expect(qa('thead[role="rowgroup"], tbody[role="rowgroup"]').length).toBe(2);
      expect(qa('[role="columnheader"]').length).toBe(11);
      expect(qa('[data-testid="trip-row"][role="row"]').length).toBe(8);
      expect(qa('[data-testid="trip-row"]')[0].querySelectorAll('[role="cell"]').length).toBe(11);
      expect(qa('[data-testid="trip-row"]')[0].getAttribute('aria-label')).toBe('Viaje VIA-000001');
    });

    it('mientras llega otra página los botones del paginador no se desactivan (no pierden el foco): quedan aria-disabled y no piden otra vez', () => {
      init();
      const next = q<HTMLButtonElement>('[data-testid="page-next"]')!;

      next.focus();
      next.click();
      fixture.detectChanges();

      expect(next.disabled).toBeFalse();
      expect(next.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(next);
      next.click();
      expect(http.match((r) => r.url === OPERATIONS_URL && r.method === 'GET').length).toBe(1);
    });

    it('al cerrar el detalle el foco vuelve al ojo de la fila; si esa fila ya no existe, va al buscador', () => {
      init();
      click('[data-testid="open-detail"]');
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });
      fixture.detectChanges();
      const eye = qa<HTMLButtonElement>('[data-testid="open-detail"]')[0];

      click('[data-testid="close-detail"]');
      fixture.detectChanges();
      expect(document.activeElement).toBe(eye);

      click('[data-testid="open-detail"]');
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });
      fixture.detectChanges();
      qa('[data-testid="open-detail"]')[0].remove();
      click('[data-testid="close-detail"]');
      fixture.detectChanges();
      expect(document.activeElement).toBe(q('[data-testid="search"]'));
    });

    it('el encabezado es solo texto (sin la imagen del camión) y la tabla no muestra la columna del ID del viaje', () => {
      init();

      expect(q('app-page-hero img')).toBeNull();
      expect(qa('thead th').map((th) => th.textContent!.trim())).not.toContain('ID del viaje');
    });

    it('Distancia, Carga, Combustible, Emisiones, Estado y la acción van centrados con su cabecera; Fecha, Placa, Origen y Destino a la izquierda', () => {
      init();
      const align = (selector: string): string => getComputedStyle(q(selector)!).textAlign;

      for (const selector of ['th.c-dist', 'th.c-cargo', 'th.c-fuel', 'th.kgh', 'th.stateh', 'th.acth', 'td.dist', 'td.c-cargo', 'td.c-fuel', 'td.kg', 'td.stateCell', 'td.act']) expect(align(selector)).withContext(selector).toBe('center');

      for (const selector of ['th.c-date', 'th.plate', 'td.c-date', 'td.plate', 'td.o', 'td.d']) expect(['left', 'start']).withContext(selector).toContain(align(selector));
    });
  });

  describe('presentación', () => {
    it('el CSS usa solo tokens de la plataforma: sin hexadecimales ni rgb(), sin scroll interno y con tintes 14/20/40/60/80', () => {
      init();
      click('[data-testid="open-detail"]');
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: tripDetailDto(), meta: {} });
      fixture.detectChanges();
      const css = [componentCss('.vtab'), componentCss('.kg .leaf')].join('\n');

      expect(css).toContain('.vtab');
      expect(css).toContain('.kg');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);

      const tints = Array.from(css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g));

      expect(tints.length).toBeGreaterThan(0);
      for (const m of tints) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });

    it('nada tiene scroll interno: ningún elemento de la pantalla es desplazable ni recorta su contenido (25 filas)', () => {
      init();
      document.body.appendChild(el());
      const scrollable = qa('*').filter((node) => {
        const style = getComputedStyle(node);

        if (node.classList.contains('sr-only') || node.closest('thead')) return false;

        return ['auto', 'scroll'].includes(style.overflowY) || (style.overflowY !== 'visible' && node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0);
      });

      expect(scrollable.map((n) => n.className || n.tagName)).toEqual([]);
      el().remove();
    });

    it('la lista nunca pasa de 50 filas en el DOM aunque el servidor devuelva más páginas', () => {
      init(operationTripDtos(50), { next: 'cur-2' });
      expect(qa('[data-testid="trip-row"]').length).toBe(50);
    });
  });

  describe('permisos, ruta y menú', () => {
    const operaciones = () => routes.find((r) => r.path === '')!.children!.find((r) => r.path === 'operaciones')!;

    it('la ruta existe con el componente real (ya no «Próximamente») y exige `indicators:read`', async () => {
      expect(operaciones().data).toEqual(jasmine.objectContaining({ breadcrumb: 'Operaciones logísticas' }));
      expect(await (operaciones().loadComponent as () => Promise<unknown>)()).toBe(OperationsComponent);

      for (const [role, allowed] of [['ORG_ADMIN', true], ['ORG_ANALYST', true], ['ORG_VIEWER', true]] as const) {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [...provideTestApp(), provideRouter([])] });
        signInAs(buildUser({ memberships: [membership(ORG_ENVIA, [role])] }), TestBed.inject(SessionStore));
        const result = TestBed.runInInjectionContext(() => (operaciones().canActivate![0] as () => unknown)());

        expect(result === true).toBe(allowed);
      }

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [...provideTestApp(), provideRouter([])] });
      signInAs(buildUser({ memberships: [] }), TestBed.inject(SessionStore));
      expect(TestBed.runInInjectionContext(() => (operaciones().canActivate![0] as () => unknown)())).not.toBe(true);
    });

    it('el ítem del menú «Operaciones logísticas» ya no es «Próximamente», mantiene su ruta y su permiso', () => {
      const item = NAV_ITEMS.find((n) => n.label === 'Operaciones logísticas')!;

      expect(item.soon).toBeFalse();
      expect(item.path).toBe('/operaciones');
      expect(item.requires).toEqual(['indicators:read']);
    });
  });
});
