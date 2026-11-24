import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Component } from '@angular/core';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, importCountsDto, importDetailDto, importSummaryDto, vehiclesDetectedDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { routes } from '../../app.routes';
import { SessionStore } from '../../core/auth/session.store';
import { permissionGuard } from '../../core/guards/auth.guards';
import { ShellComponent } from '../../shared/layouts/shell.component';
import { ImportSummaryDto } from '../../infrastructure/dto/imports.dto';
import { ImportsComponent } from './imports.component';
import { ImportsFacade } from './imports.facade';

@Component({ template: '<p id="denied">Acceso denegado</p>' })
class DeniedComponent {}

describe('ImportsComponent: Cargar información', () => {
  let fixture: ComponentFixture<ImportsComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };
  const listRequest = (): TestRequest => http.expectOne((r) => r.url === IMPORTS_URL && r.method === 'GET');
  const countsRequest = (): TestRequest => http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/counts` });
  const postRequests = (): TestRequest[] => http.match({ method: 'POST', url: IMPORTS_URL });
  const created = (id: string, duplicate = false) => ({ data: { id, status: duplicate ? 'COMPLETED' : 'QUEUED', duplicate } });
  const accepted = { status: 202, statusText: 'Accepted' };
  const xlsx = (name: string): File => new File(['x'], name);

  function open(items: ImportSummaryDto[] = [], total = items.length, roles = ['ORG_ADMIN'], counts = importCountsDto({ total, completed: total })): void {
    TestBed.configureTestingModule({ imports: [ImportsComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImportsComponent);
    fixture.detectChanges();
    flushQueue(items, total, counts);
  }

  /** Responde la lista y los conteos que pide la pantalla. */
  function flushQueue(items: ImportSummaryDto[], total = items.length, counts = importCountsDto({ total, completed: total })): void {
    listRequest().flush(pagedBody(items, total));
    countsRequest().flush({ data: counts });
    fixture.detectChanges();
  }

  const pick = (...files: File[]): void => {
    const input = q<HTMLInputElement>('[data-testid="file-input"]')!;
    const transfer = new DataTransfer();

    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  /** Sube un solo archivo y responde con la cola ya mostrándolo (`summary` son los datos de esa carga). */
  function uploadOne(summary: Partial<ImportSummaryDto> = {}): void {
    pick(xlsx('operaciones.xlsx'));
    postRequests()[0].flush(created('imp-1'), accepted);
    flushQueue([importSummaryDto({ id: 'imp-1', ...summary })]);
  }

  afterEach(() => http?.match(() => true));

  /** Vuelve a pedir la cola con otros conteos (lo que haría la renovación en vivo). */
  function flushAgain(counts: Partial<ReturnType<typeof importCountsDto>>): void {
    TestBed.inject(ImportsFacade).loadList();
    flushQueue([], 0, importCountsDto(counts));
  }

  describe('pasos', () => {
    it('muestra el título, el subtítulo y las dos tarjetas de pasos', () => {
      open();

      expect(text('h1')).toBe('Cargar información');
      expect(text('app-page-hero p')).toBe('Sube tus operaciones y calcula tu huella de CO₂.');
      expect(text('#step-template-title')).toBe('1. Descarga la plantilla');
      expect(text('#step-upload-title')).toBe('2. Sube tus archivos');
      expect(text('[data-testid="step-template"] p')).toBe('Incluye instrucciones, listas desplegables y diccionario. El ID del viaje es obligatorio: debe ser estable (el mismo viaje lleva el mismo ID en cada carga) y único por viaje. Llénala y súbela en el paso 2.');
      expect(q('[data-testid="step-template"]')!.getAttribute('aria-labelledby')).toBe('step-template-title');
      expect(qa('.ico').every((i) => i.getAttribute('aria-hidden') === 'true')).toBeTrue();
    });

    const stage = (): number => qa('[data-testid="route-step"]').findIndex((step) => step.classList.contains('current'));

    it('la ruta marca la parada según la cola: sin cargas, en curso o con cargas listas', () => {
      open([], 0, ['ORG_ADMIN'], importCountsDto());
      expect(stage()).toBe(0);
      expect(qa('[data-testid="route-step"]').map((step) => step.querySelector('strong')!.textContent)).toEqual(['Descarga la plantilla', 'Sube tus archivos', 'Calcula tu huella de CO₂']);
      expect(text('[data-testid="route-step"]:last-child small')).toBe('Revisamos qué viajes se pueden calcular');

      flushAgain({ in_progress: 2, completed: 1, total: 3 });
      expect(stage()).toBe(1);
      expect(text('[aria-current="step"] strong')).toBe('Sube tus archivos');

      flushAgain({ completed: 3, total: 3 });
      expect(stage()).toBe(2);
      expect(text('[aria-current="step"] strong')).toBe('Calcula tu huella de CO₂');
    });

    it('mientras se envían archivos la ruta está en la parada de subida aunque la cola aún esté vacía', () => {
      open([], 0, ['ORG_ADMIN'], importCountsDto());
      pick(xlsx('a.xlsx'));

      expect(stage()).toBe(1);
    });

    it('«Descargar plantilla (.xlsx)» descarga con la sesión, guarda el archivo y libera la URL temporal', () => {
      open();
      const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:plantilla');
      const revoke = spyOn(URL, 'revokeObjectURL');
      const anchorClick = spyOn(HTMLAnchorElement.prototype, 'click');

      expect(text('[data-testid="download-template"]')).toBe('Descargar plantilla (.xlsx)');
      click('[data-testid="download-template"]');
      expect(text('[data-testid="download-template"]')).toBe('Descargando…');
      expect(q<HTMLButtonElement>('[data-testid="download-template"]')!.disabled).toBeTrue();

      http.expectOne(`${IMPORTS_URL}/template`).flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="plantilla_cargas_logyco2.xlsx"' } });
      fixture.detectChanges();

      expect(create).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(text('[data-testid="download-template"]')).toBe('Descargar plantilla (.xlsx)');
      expect(revoke.calls.count()).toBeLessThanOrEqual(1);
    });

    it('si la descarga falla muestra el mensaje y el botón vuelve a estar disponible', async () => {
      open();
      click('[data-testid="download-template"]');
      http.expectOne(`${IMPORTS_URL}/template`).flush(new Blob([JSON.stringify({ error: { code: 'ORGANIZATION_ACCESS_DENIED' } })]), { status: 403, statusText: 'Forbidden' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      fixture.detectChanges();

      expect(text('[data-testid="download-error"]')).toBe('No tienes acceso a esta empresa.');
      expect(q<HTMLButtonElement>('[data-testid="download-template"]')!.disabled).toBeFalse();
    });
  });

  describe('subida', () => {
    it('la zona acepta varios .xlsx, se opera con teclado (campo de archivo enfocable) y anuncia con aria-live', () => {
      open();
      const input = q<HTMLInputElement>('[data-testid="file-input"]')!;

      expect(input.accept).toContain('.xlsx');
      expect(input.multiple).toBeTrue();
      expect(input.closest('label')!.textContent).toContain('Seleccionar archivos');
      expect(q('[data-testid="dropzone"]')!.getAttribute('role')).toBe('group');
      expect(q('[data-testid="step-upload"] [aria-live="polite"]')).not.toBeNull();
    });

    it('rechaza solo al archivo que no es .xlsx, con el mensaje de siempre, y sube el resto', () => {
      open();
      pick(xlsx('datos.csv'), xlsx('bueno.xlsx'));

      expect(text('[data-testid="upload-error"]')).toBe('El archivo debe ser un libro de Excel con extensión .xlsx.');
      const sent = postRequests();
      expect(sent.length).toBe(1);
      expect((sent[0].request.body as FormData).get('file')).toEqual(jasmine.objectContaining({ name: 'bueno.xlsx' }));
    });

    it('si se rechazan varios los cuenta en un solo mensaje y no llama al servidor', () => {
      open();
      pick(xlsx('a.csv'), xlsx('b.pdf'));

      expect(text('[data-testid="upload-error"]')).toBe('2 archivos no se cargaron: deben ser libros de Excel con extensión .xlsx.');
      expect(postRequests().length).toBe(0);
    });

    it('también acepta soltar varios archivos y envía cada uno con su Idempotency-Key', () => {
      open();
      const zone = q('[data-testid="dropzone"]')!;
      const transfer = new DataTransfer();

      transfer.items.add(xlsx('uno.xlsx'));
      transfer.items.add(xlsx('dos.xlsx'));
      zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, cancelable: true }));
      fixture.detectChanges();
      expect(zone.classList).toContain('over');
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, cancelable: true }));
      fixture.detectChanges();

      const sent = postRequests();
      expect(sent.length).toBe(2);
      expect(sent[0].request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
      expect(sent[1].request.headers.get('Idempotency-Key')).not.toBe(sent[0].request.headers.get('Idempotency-Key'));
    });

    it('envía 2 a la vez y lista el resto como «Esperando turno»; la zona sigue disponible', () => {
      open();
      pick(xlsx('a.xlsx'), xlsx('b.xlsx'), xlsx('c.xlsx'));

      expect(postRequests().length).toBe(2);
      const items = qa('[data-testid="upload-item"]');
      expect(items.length).toBe(3);
      expect(items[0].querySelector('app-excel-icon')).not.toBeNull();
      expect(items[0].querySelector('app-truck-progress .sm')).not.toBeNull();
      expect(items[0].querySelector('[role="progressbar"]')!.classList).toContain('loop');
      expect(text('[data-testid="upload-waiting"]')).toBe('Esperando turno');
      expect(q('[data-testid="dropzone"]')).not.toBeNull();
      expect(q<HTMLInputElement>('[data-testid="file-input"]')!.disabled).toBeFalse();
    });

    it('al responder el servidor el archivo sale de «Enviando» y pasa a la cola', () => {
      open();
      pick(xlsx('a.xlsx'));
      postRequests()[0].flush(created('imp-1'), accepted);
      flushQueue([importSummaryDto({ id: 'imp-1', status: 'QUEUED', headline: null })]);

      expect(q('[data-testid="uploading-list"]')).toBeNull();
      expect(qa('[data-testid="history-row"]').length).toBe(1);
    });

    it('un archivo demasiado grande o de un tipo no admitido muestra el mensaje del catálogo, por archivo', () => {
      open();
      pick(xlsx('grande.xlsx'), xlsx('raro.xlsx'));
      const [big, odd] = postRequests();

      big.flush({ error: { code: 'FILE_TOO_LARGE' } }, { status: 413, statusText: 'Payload Too Large' });
      odd.flush({ error: { code: 'UNSUPPORTED_FILE' } }, { status: 415, statusText: 'Unsupported' });
      fixture.detectChanges();

      const errors = qa('[data-testid="upload-item-error"]').map((e) => e.textContent!);
      expect(errors[0]).toContain('El archivo supera el tamaño permitido');
      expect(errors[1]).toContain('.xlsx');
    });

    it('un corte de red lo explica y «Reintentar» envía el mismo archivo con una clave nueva', () => {
      open();
      pick(xlsx('grande.xlsx'));
      const first = postRequests()[0];

      first.error(new ProgressEvent('error'), { status: 0 });
      fixture.detectChanges();

      expect(text('[data-testid="upload-item-error"]')).toBe('No se pudo subir el archivo: puede superar el tamaño permitido o se perdió la conexión.');
      click('[data-testid="retry-upload"]');
      const second = postRequests()[0];

      expect(second.request.headers.get('Idempotency-Key')).not.toBe(first.request.headers.get('Idempotency-Key'));
      expect((second.request.body as FormData).get('file')).toEqual(jasmine.any(File));
    });

    it('«Descartar» quita de la lista al archivo que falló, sin tocar al resto', () => {
      open();
      pick(xlsx('a.xlsx'), xlsx('b.xlsx'));
      postRequests()[0].error(new ProgressEvent('error'), { status: 0 });
      fixture.detectChanges();

      click('[data-testid="discard-upload"]');

      expect(qa('[data-testid="upload-item"]').length).toBe(1);
      expect(text('[data-testid="upload-item"] strong')).toBe('b.xlsx');
    });

    it('los archivos que ya estaban cargados se avisan una sola vez, agrupados', () => {
      open();
      pick(xlsx('a.xlsx'), xlsx('b.xlsx'));
      const [first, second] = postRequests();

      first.flush(created('imp-1', true), { status: 200, statusText: 'OK' });
      second.flush(created('imp-2', true), { status: 200, statusText: 'OK' });
      fixture.detectChanges();

      expect(qa('[data-testid="duplicate"]').length).toBe(1);
      expect(text('[data-testid="duplicate"] span')).toBe('2 archivos ya estaban cargados');
      click('[data-testid="dismiss-duplicates"]');
      expect(q('[data-testid="duplicate"]')).toBeNull();
    });
  });

  describe('archivo ya procesado y conflictos de envío', () => {
    const original = (id: string, fileName: string, createdAt = '2026-03-01T10:00:00Z') => ({ data: { id, status: 'COMPLETED', duplicate: true, file_name: fileName, created_at: createdAt } });

    it('un archivo ya procesado no es un error ni suma otra fila a la cola: dice cuál fue y cuándo, y no queda en «Enviando»', () => {
      open();
      pick(xlsx('copia.xlsx'));
      postRequests()[0].flush(original('imp-0', 'operaciones-marzo.xlsx'), { status: 200, statusText: 'OK' });
      fixture.detectChanges();

      expect(text('[data-testid="duplicate"] span')).toBe('Este archivo ya fue procesado el 1 de marzo de 2026: «operaciones-marzo.xlsx». No se volvió a sumar a tus emisiones.');
      expect(q('[data-testid="upload-error"]')).toBeNull();
      expect(q('[data-testid="upload-item-error"]')).toBeNull();
      expect(qa('[data-testid="upload-item"]').length).toBe(0);
      http.match((r) => r.url === IMPORTS_URL && r.method === 'GET');
    });

    it('«Ver resultado original» abre la revisión de la carga original, sin volver a subir el archivo', () => {
      open();
      pick(xlsx('copia.xlsx'));
      postRequests()[0].flush(original('imp-0', 'operaciones-marzo.xlsx'), { status: 200, statusText: 'OK' });
      fixture.detectChanges();
      http.match((r) => r.url === IMPORTS_URL && r.method === 'GET');

      click('[data-testid="open-original"]');
      http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-0` }).flush({ data: importDetailDto({ id: 'imp-0', file_name: 'operaciones-marzo.xlsx' }) });
      fixture.detectChanges();

      expect(q('dialog[data-testid="import-review"]')).not.toBeNull();
      expect(text('dialog[data-testid="import-review"] h2')).toBe('operaciones-marzo.xlsx');
      expect(postRequests().length).toBe(0);
    });

    it('con varios archivos ya procesados lista cada original con su fecha y su propio enlace al resultado', () => {
      open();
      pick(xlsx('a.xlsx'), xlsx('b.xlsx'));
      const [first, second] = postRequests();

      first.flush(original('imp-1', 'uno.xlsx'), { status: 200, statusText: 'OK' });
      second.flush(original('imp-2', 'dos.xlsx', '2026-04-02T10:00:00Z'), { status: 200, statusText: 'OK' });
      fixture.detectChanges();
      http.match((r) => r.url === IMPORTS_URL && r.method === 'GET');

      expect(text('[data-testid="duplicate"] span')).toBe('2 archivos ya estaban cargados');
      expect(qa('[data-testid="duplicate-original"]').map((li) => li.querySelector('span')!.textContent)).toEqual(['«uno.xlsx» · procesado el 1 de marzo de 2026', '«dos.xlsx» · procesado el 2 de abril de 2026']);
      expect(qa('[data-testid="duplicate-original"] [data-testid="open-original"]').length).toBe(2);
    });

    it('si el original no se puede abrir lo dice, sin romper la pantalla', () => {
      open();
      pick(xlsx('copia.xlsx'));
      postRequests()[0].flush(original('imp-0', 'operaciones-marzo.xlsx'), { status: 200, statusText: 'OK' });
      fixture.detectChanges();
      http.match((r) => r.url === IMPORTS_URL && r.method === 'GET');

      click('[data-testid="open-original"]');
      http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-0` }).flush({ error: { code: 'IMPORT_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(text('[data-testid="deep-link-error"]')).toContain('La carga no existe');
    });

    it('409 IDEMPOTENCY_KEY_REUSED se explica en lenguaje claro y permite reintentar', () => {
      open();
      pick(xlsx('a.xlsx'));
      postRequests()[0].flush({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="upload-item-error"]')).toBe('Este envío se identificó igual que otro con un archivo distinto, por eso no se pudo completar. Vuelve a seleccionar el archivo e inténtalo de nuevo.');
      expect(q('[data-testid="retry-upload"]')).not.toBeNull();
    });

    it('409 IMPORT_ALREADY_PROCESSED al reintentar una carga dice que el archivo ya fue procesado', () => {
      open([importSummaryDto({ id: 'imp-9', status: 'FAILED', headline: null })], 1);
      click('[data-testid="retry-import"]');
      http.expectOne({ method: 'POST', url: `${IMPORTS_URL}/imp-9/retry` }).flush({ error: { code: 'IMPORT_ALREADY_PROCESSED' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="retry-error"]')).toBe('Este archivo ya fue procesado en otra carga de tu empresa. Consulta su resultado en la cola de cargas.');
    });
  });

  describe('cola de cargas', () => {
    const counts = importCountsDto({ total: 12, in_progress: 2, completed: 7, failed: 3, vehicles_pending: 4 });

    it('las pestañas-filtro son un tablist con conteo y «Vehículos por revisar» queda al final', () => {
      open([importSummaryDto()], 12, ['ORG_ADMIN'], counts);
      const tabs = qa('[role="tab"]');

      expect(q('[role="tablist"]')).not.toBeNull();
      expect(tabs.map((t) => t.firstChild!.textContent!.trim())).toEqual(['Todas', 'En proceso', 'Listas', 'Fallidas', 'Vehículos por revisar']);
      expect(tabs.map((t) => t.querySelector('.n')!.textContent!.trim())).toEqual(['12', '2', '7', '3', '4']);
      expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false']);
      expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1']);
      expect(q('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe('tab-ALL');
    });

    it('elegir una pestaña envía el filtro al servidor, vuelve a la página 1 y la deja seleccionada', () => {
      open([importSummaryDto()], 25, ['ORG_ADMIN'], counts);
      (qa('app-pagination button').find((b) => b.textContent!.includes('Siguiente')) as HTMLButtonElement).click();
      listRequest().flush(pagedBody([importSummaryDto()], 25, 10, 2));
      countsRequest().flush({ data: counts });

      click('[data-testid="tab-FAILED"]');
      const req = listRequest();

      expect(req.request.params.get('filter')).toBe('FAILED');
      expect(req.request.params.get('page')).toBe('1');
      req.flush(pagedBody([importSummaryDto({ status: 'FAILED', headline: null })]));
      countsRequest().flush({ data: counts });
      fixture.detectChanges();

      expect(q('[data-testid="tab-FAILED"]')!.getAttribute('aria-selected')).toBe('true');
      expect(q('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe('tab-FAILED');
    });

    it('las flechas, Inicio y Fin cambian de pestaña y el foco la sigue', () => {
      open([importSummaryDto()], 12, ['ORG_ADMIN'], counts);
      const press = (key: string, from: string): void => {
        q(`[data-testid="tab-${from}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
        fixture.detectChanges();
      };

      press('ArrowRight', 'ALL');
      expect(listRequest().request.params.get('filter')).toBe('IN_PROGRESS');
      expect(document.activeElement).toBe(q('[data-testid="tab-IN_PROGRESS"]'));
      http.match(() => true);

      press('End', 'IN_PROGRESS');
      expect(listRequest().request.params.get('filter')).toBe('VEHICLES_PENDING');
      http.match(() => true);

      press('ArrowRight', 'VEHICLES_PENDING');
      expect(listRequest().request.params.get('filter')).toBe('ALL');
      http.match(() => true);

      press('ArrowLeft', 'ALL');
      expect(listRequest().request.params.get('filter')).toBe('VEHICLES_PENDING');
      http.match(() => true);

      press('Home', 'VEHICLES_PENDING');
      expect(listRequest().request.params.get('filter')).toBe('ALL');
    });

    it('cada filtro sin resultados tiene su propio estado vacío', () => {
      open([], 0, ['ORG_ADMIN'], importCountsDto());
      expect(text('[data-testid="history-empty"]')).toBe('Aún no has cargado archivos.');

      const cases: [string, string][] = [
        ['IN_PROGRESS', 'No hay cargas en proceso'],
        ['COMPLETED', 'Aún no hay cargas listas'],
        ['FAILED', 'No hay cargas fallidas'],
        ['VEHICLES_PENDING', 'No hay cargas con vehículos por revisar'],
      ];

      for (const [filter, message] of cases) {
        click(`[data-testid="tab-${filter}"]`);
        flushQueue([], 0, importCountsDto());
        expect(text('[data-testid="history-empty"]')).withContext(filter).toBe(message);
        expect(q('[data-testid="history-table"]')).toBeNull();
      }
    });

    it('la tabla tiene semántica de tabla y la columna de resultado va antes que la de vehículos', () => {
      open([importSummaryDto()]);

      expect(qa('[data-testid="history-table"] thead th').map((th) => th.textContent!.trim())).toEqual(['Archivo', 'Subida', 'Estado', 'Resultado', 'Vehículos', 'Acciones']);
      expect(q('[data-testid="history-table"] caption')).not.toBeNull();
      expect(qa('[data-testid="view-review"]')[0].getAttribute('aria-label')).toBe('Ver revisión de operaciones-marzo.xlsx');
    });

    it('una carga lista muestra el porcentaje grande, la barra y «N calculables · M por completar»', () => {
      open([importSummaryDto()]);
      const row = text('[data-testid="history-row"]');

      expect(row).toContain('operaciones-marzo.xlsx');
      expect(row).toContain('Ana Prueba');
      expect(row).toContain('20 KB · 200 filas');
      expect(row).toContain('Lista');
      expect(text('[data-testid="row-pct"]')).toBe('85 %');
      expect(text('.rsub')).toBe('170 calculables · 30 por completar');
      expect(text('[data-testid="row-took"]')).toBe('Procesada en 1 min 55 s');
      expect(q('[data-testid="row-result"] [role="img"]')!.getAttribute('aria-label')).toBe('85 % de los viajes se pueden calcular');
      expect(q('.vchip')).toBeNull();
    });

    it('«Ver qué falta» abre la revisión de esa carga', () => {
      open([importSummaryDto()]);

      expect(text('[data-testid="see-missing"]')).toBe('30 por completar');
      click('[data-testid="see-missing"]');
      http.expectOne(`${IMPORTS_URL}/imp-1`).flush({ data: importDetailDto() });
      fixture.detectChanges();

      expect(q('dialog[data-testid="import-review"]')).not.toBeNull();
    });

    it('sin viajes pendientes no hay «Ver qué falta»', () => {
      open([importSummaryDto({ headline: { rows_read: 200, real_consumption: 150, estimated_consumption: 50, pending: 0 } })]);

      expect(text('[data-testid="row-result"]')).toContain('200 calculables');
      expect(text('[data-testid="row-pct"]')).toBe('100 %');
      expect(q('[data-testid="see-missing"]')).toBeNull();
    });

    it('lee bien una carga de 3.400.000 filas: miles con punto, porcentajes y nada se desborda', () => {
      open([importSummaryDto({ file_size: 612_000_000, rows_total: 3_400_000, rows_processed: 3_400_000, headline: { rows_read: 3_400_000, real_consumption: 2_900_000, estimated_consumption: 300_000, pending: 200_000 } })]);
      const row = text('[data-testid="history-row"]');

      expect(row).toContain('584 MB · 3.400.000 filas');
      expect(row).toContain('94 %');
      expect(row).toContain('3.200.000 calculables · 200.000 por completar');
      const result = q('[data-testid="row-result"]')!;

      expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth + 1);
    });

    it('una carga en curso muestra el avance compacto con el camión, el porcentaje, «N de M filas» y la fase', () => {
      open([importSummaryDto({ status: 'RUNNING', phase: 'READING', rows_total: 3_400_000, rows_processed: 1_250_000, headline: null, finished_at: null })]);

      expect(q('[data-testid="row-progress"] app-truck-progress [role="progressbar"]')!.classList).toContain('sm');
      expect(q('[data-testid="row-progress"] [role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('18');
      expect(q('[data-testid="row-progress"] [role="progressbar"]')!.getAttribute('aria-label')).toBe('Avance de operaciones-marzo.xlsx');
      expect(text('[data-testid="row-rows"]')).toBe('1/2 · Leyendo filas · 1.250.000 de 3.400.000');
      expect(q('[data-testid="row-rows"]')!.getAttribute('title')).toBe('Paso 1 de 2 · Leyendo filas · 1.250.000 de 3.400.000 filas · calculando…');
      expect(text('[data-testid="row-progress"] .pct')).toBe('18 %');
      expect(text('[data-testid="row-eta"]')).toBe('· calculando…');
      expect(text('[data-testid="history-row"]')).toContain('Revisando');
    });

    it('en la fase CALCULATING el avance es determinado y arranca en 50 % (paso 2 de 2): no retrocede al reiniciarse rows_processed', () => {
      open([importSummaryDto({ status: 'RUNNING', phase: 'CALCULATING', rows_total: 3_400_000, rows_processed: 0, headline: null, finished_at: null })]);

      expect(q('[data-testid="row-progress"] [role="progressbar"]')!.classList).not.toContain('loop');
      expect(q('[data-testid="row-progress"] [role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50');
      expect(text('[data-testid="row-progress"] .pct')).toBe('50 %');
      expect(text('[data-testid="row-rows"]')).toBe('2/2 · Calculando emisiones · 0 de 3.400.000');
      expect(text('[data-testid="row-step"]')).toBe('Paso 2 de 2 · Calculando emisiones');
    });

    it('el reloj de una carga en proceso cuenta desde started_at y tiene nombre accesible, sin aria-live', () => {
      const started = new Date(Date.now() - 72_000).toISOString();

      open([importSummaryDto({ status: 'RUNNING', phase: 'READING', rows_total: 500_000, rows_processed: 230_000, headline: null, finished_at: null, started_at: started })]);
      const clock = q('[data-testid="row-clock"]')!;

      expect(text('[data-testid="row-clock"]')).toMatch(/^01:1[2-4]$/);
      expect(clock.getAttribute('aria-label')).toMatch(/^Tiempo transcurrido: 1 min 1[2-4] s$/);
      expect(clock.closest('[aria-live]')).toBeNull();
      expect(clock.hasAttribute('aria-live')).toBeFalse();
    });

    it('una carga recién tomada, sin started_at, cuenta desde su subida', () => {
      const created = new Date(Date.now() - 30_000).toISOString();

      open([importSummaryDto({ status: 'RUNNING', phase: 'READING', rows_total: 100, rows_processed: 1, headline: null, finished_at: null, started_at: null, created_at: created })]);

      expect(text('[data-testid="row-clock"]')).toMatch(/^00:3[0-2]$/);
    });

    it('las filas de cada estado miden lo mismo (la cola, la lectura, el cálculo y la terminada no crecen ni descuadran la tabla)', () => {
      open([
        importSummaryDto({ id: 'a', status: 'QUEUED', phase: null, rows_total: null, rows_processed: 0, headline: null, started_at: null }),
        importSummaryDto({ id: 'b', status: 'RUNNING', phase: 'READING', rows_total: 500_000, rows_processed: 230_000, headline: null, finished_at: null }),
        importSummaryDto({ id: 'c', status: 'RUNNING', phase: 'CALCULATING', rows_total: 500_000, rows_processed: 350_000, headline: null, finished_at: null }),
        importSummaryDto({ id: 'd' }),
      ]);
      const heights = qa('[data-testid="history-row"]').map((row) => Math.round(row.getBoundingClientRect().height));

      expect(heights.length).toBe(4);
      expect(new Set(heights).size).toBe(1);
      expect(qa('[data-testid="history-row"]').every((row) => row.scrollWidth <= row.clientWidth + 1)).toBeTrue();
    });

    it('una carga terminada dice en qué tiempo se procesó y, sin started_at, no muestra nada', () => {
      open([importSummaryDto({ id: 'a' }), importSummaryDto({ id: 'b', started_at: null })]);
      const took = qa('[data-testid="row-took"]');

      expect(took.length).toBe(1);
      expect(took[0].textContent!.replace(/\s+/g, ' ').trim()).toBe('Procesada en 1 min 55 s');
    });

    it('sin total de filas el avance es indeterminado y solo cuenta las filas procesadas', () => {
      open([importSummaryDto({ status: 'RUNNING', phase: 'REVIEWING', rows_total: null, rows_processed: 4200, headline: null })]);

      expect(q('[data-testid="row-progress"] [role="progressbar"]')!.classList).toContain('loop');
      expect(text('[data-testid="row-rows"]')).toBe('Revisando los datos');
      expect(q('[data-testid="row-eta"]')).toBeNull();
    });

    it('una carga en cola dice «En cola» sin avance', () => {
      open([importSummaryDto({ status: 'QUEUED', phase: null, rows_total: null, rows_processed: 0, headline: null })]);

      expect(text('[data-testid="row-state"]')).toBe('En cola');
      expect(text('.pct')).toBe('En cola');
      expect(text('[data-testid="queued"]')).toMatch(/^En cola · esperando \d+:\d{2}(:\d{2})?$/);
      expect(q('[data-testid="history-row"] [role="progressbar"]')).toBeNull();
    });

    it('una carga fallida muestra su motivo y «Reintentar» la vuelve a encolar; si no se puede, lo dice', () => {
      open([importSummaryDto({ status: 'FAILED', headline: null, error: 'El archivo no tiene filas.' })]);

      expect(text('[data-testid="row-failed"]')).toBe('El archivo no tiene filas.');
      expect(q('[data-testid="row-failed"]')!.getAttribute('title')).toBe('El archivo no tiene filas.');
      expect(text('.pct')).toBe('—');
      click('[data-testid="retry-import"]');
      http.expectOne({ method: 'POST', url: `${IMPORTS_URL}/imp-1/retry` }).flush({ error: { code: 'IMPORT_FILE_UNAVAILABLE' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="retry-error"]')).toContain('ya no está disponible');
    });

    it('sin cargas dice «Aún no has cargado archivos.»', () => {
      open();

      expect(text('[data-testid="history-empty"]')).toBe('Aún no has cargado archivos.');
      expect(q('[data-testid="history-table"]')).toBeNull();
    });

    it('pagina en el servidor y el historial conserva la página pedida', () => {
      open([importSummaryDto()], 25);

      expect(text('app-pagination')).toContain('Página 1 de 3 · 25 registros');
      (qa('app-pagination button').find((b) => b.textContent!.includes('Siguiente')) as HTMLButtonElement).click();
      const req = listRequest();

      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('page_size')).toBe('4');
      req.flush(pagedBody([importSummaryDto()], 25, 10, 2));
    });

    it('si el historial falla muestra el error con «Reintentar»', () => {
      TestBed.configureTestingModule({ imports: [ImportsComponent], providers: provideTestApp() });
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(ImportsComponent);
      fixture.detectChanges();
      listRequest().flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' });
      fixture.detectChanges();

      expect(text('app-resource-state [role="alert"]')).toContain('Ocurrió un error interno');
      click('app-resource-state [role="alert"] button');
      listRequest().flush(pagedBody([importSummaryDto()]));
      fixture.detectChanges();
      expect(qa('[data-testid="history-row"]').length).toBe(1);
    });

    it('«Ver revisión» abre el diálogo con el detalle y devuelve el foco al botón al cerrarse', async () => {
      open([importSummaryDto()]);
      const opener = q<HTMLButtonElement>('[data-testid="view-review"]')!;

      opener.focus();
      opener.click();
      fixture.detectChanges();
      http.expectOne(`${IMPORTS_URL}/imp-1`).flush({ data: importDetailDto() });
      fixture.detectChanges();

      const dialog = q<HTMLDialogElement>('dialog[data-testid="import-review"]')!;
      expect(dialog.open).toBeTrue();
      expect(text('#review-title')).toBe('operaciones-marzo.xlsx');

      const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
      dialog.close();
      await closed;
      fixture.detectChanges();
      await Promise.resolve();

      expect(q('dialog[data-testid="import-review"]')).toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it('al cambiar de empresa se cierra la revisión y se descarta el historial', () => {
      open([importSummaryDto()]);
      click('[data-testid="view-review"]');
      http.expectOne(`${IMPORTS_URL}/imp-1`);

      TestBed.inject(SessionStore).setUser(buildUser({ memberships: [membership({ id: '33333333-3333-4333-8333-333333333333', name: 'Otra' }, ['ORG_ADMIN'])] }));
      fixture.detectChanges();

      expect(q('dialog[data-testid="import-review"]')).toBeNull();
      http.expectOne((r) => r.url === 'http://api.test/api/v1/organizations/33333333-3333-4333-8333-333333333333/imports');
    });
  });

  it('el CSS de la pantalla usa solo tokens de la plataforma: sin hexadecimales ni rgb()', () => {
    open();
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.drop') && c.includes('.route')).join('\n');

    expect(css).toContain('.drop');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });

  it('«Ver revisión» es solo el ojo (34 px) con aria-label y title, y «Reintentar» es solo el ícono, primario y del mismo tamaño', () => {
    open([importSummaryDto(), importSummaryDto({ id: 'imp-2', status: 'FAILED' })]);
    const view = q<HTMLButtonElement>('[data-testid="view-review"]')!;
    const retry = q<HTMLButtonElement>('[data-testid="retry-import"]')!;

    expect(view.textContent!.trim()).toBe('');
    expect(view.querySelector('svg')).not.toBeNull();
    expect(view.getAttribute('title')).toBe('Ver revisión');
    expect(view.getAttribute('aria-label')).toBe('Ver revisión de operaciones-marzo.xlsx');
    expect(view.getBoundingClientRect().width).toBe(34);
    expect(view.getBoundingClientRect().height).toBe(34);
    expect(retry.textContent!.trim()).toBe('');
    expect(retry.getAttribute('title')).toBe('Reintentar');
    expect(retry.getAttribute('aria-label')).toBe('Reintentar operaciones-marzo.xlsx');
    expect(retry.getBoundingClientRect().height).toBe(34);
    expect(retry.getBoundingClientRect().width).toBe(34);
  });

  it('la tabla es simétrica: columnas fijas, la misma altura de fila en cualquier estado y una sola línea secundaria por celda', () => {
    open([importSummaryDto(), importSummaryDto({ id: 'b', status: 'RUNNING', headline: null }), importSummaryDto({ id: 'c', status: 'QUEUED', headline: null }), importSummaryDto({ id: 'd', status: 'FAILED', headline: null, error: 'x'.repeat(300) })]);
    const css = Array.from(document.querySelectorAll('style')).map((st) => st.textContent ?? '').join('\n');
    const heights = qa('[data-testid="history-row"]').map((r) => Math.round(r.getBoundingClientRect().height));

    expect(css).toMatch(/\.tbl[^{]*\{[^}]*table-layout:\s*fixed/);
    // En ventanas angostas la tabla pasa a tarjetas: la altura común solo aplica con la tabla.
    if (window.matchMedia('(min-width: 1181px)').matches) {
      expect(getComputedStyle(q('[data-testid="history-table"]')!).tableLayout).toBe('fixed');
      expect(new Set(heights).size).toBe(1);
      expect(heights[0]).toBeGreaterThanOrEqual(60);
    }
    for (const sub of qa('.rsub, .fname small')) expect(sub.getBoundingClientRect().height).toBeLessThan(24);
  });

  it('cada fila de la cola lleva el ícono de Excel en vez del de archivo genérico', () => {
    open([importSummaryDto()]);

    expect(q('[data-testid="history-row"] app-excel-icon')).not.toBeNull();
    expect(q('.ftile')).toBeNull();
  });

  it('«Subida» muestra el tiempo relativo con la fecha completa en el title y «Estado» solo la insignia con su punto', () => {
    const iso = new Date(Date.now() - 2 * 3_600_000).toISOString();

    open([importSummaryDto({ created_at: iso }), importSummaryDto({ id: 'b', status: 'FAILED', headline: null })]);
    const when = q('[data-testid="row-when"]')!;

    expect(when.tagName).toBe('TIME');
    expect(when.getAttribute('datetime')).toBe(iso);
    expect(when.textContent!.trim()).toBe('Hace 2 h');
    expect(when.getAttribute('title')).toMatch(/\d{4} · \d{2}:\d{2}$/);
    expect(qa('[data-testid="row-state"]').map((e) => e.textContent!.trim())).toEqual(['Lista', 'Falló']);
    expect(qa('[data-testid="row-state"]').map((e) => e.dataset['s'])).toEqual(['COMPLETED', 'FAILED']);
    expect(q('[data-testid="row-state"] .dot')).not.toBeNull();
    expect(q('[data-testid="history-row"] small[data-testid="row-date"]')).toBeNull();
  });

  describe('ruta y permisos', () => {
    const shell = routes.find((r) => r.component === ShellComponent)!;
    const route = shell.children!.find((r) => r.path === 'cargas')!;

    it('/cargas es la pantalla real (carga perezosa), ancha y con la miga «Cargar información»', async () => {
      expect(route.data).toEqual({ breadcrumb: 'Cargar información', wide: true });
      expect(route.canActivate!.length).toBe(1);
      expect(await route.loadComponent!()).toBe(ImportsComponent);
    });

    it('ORG_ADMIN y ORG_ANALYST abren /cargas; ORG_VIEWER, GUILD_VIEWER y el Super Admin terminan en «acceso denegado»', async () => {
      const testRoutes: Routes = [
        { path: 'cargas', canActivate: [permissionGuard('imports:create')], component: ImportsComponent },
        { path: 'acceso-denegado', component: DeniedComponent },
      ];
      const users = [
        { name: 'ORG_ADMIN', user: buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), allowed: true },
        { name: 'ORG_ANALYST', user: buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ANALYST'])] }), allowed: true },
        { name: 'ORG_VIEWER', user: buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }), allowed: false },
        { name: 'GUILD_VIEWER', user: buildUser({ memberships: [membership(ORG_ENVIA, ['GUILD_VIEWER'])] }), allowed: false },
        { name: 'SUPER_ADMIN', user: buildUser({ globalRoles: [{ code: 'SUPER_ADMIN', name: 'x' }], memberships: [] }), allowed: false },
      ];

      for (const { name, user, allowed } of users) {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: provideTestApp({ routes: testRoutes }) });
        signInAs(user, TestBed.inject(SessionStore));
        const harness = await RouterTestingHarness.create();

        await harness.navigateByUrl('/cargas');
        TestBed.inject(HttpTestingController).match(() => true);

        expect(TestBed.inject(Router).url).withContext(name).toBe(allowed ? '/cargas' : '/acceso-denegado');
      }
    });
  });

  describe('carga sin ningún viaje calculable', () => {
    const dialog = (): HTMLDialogElement | null => q<HTMLDialogElement>('[data-testid="not-calculable-dialog"]');
    const pendingAck = { not_calculable: { acknowledged_at: null }, headline: { rows_read: 40, real_consumption: 0, estimated_consumption: 0, pending: 40 } };
    const flushDetail = (id = 'imp-1'): void => {
      http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/${id}` }).flush({ data: importDetailDto({ id, ...pendingAck }) });
      fixture.detectChanges();
    };

    it('un archivo subido que termina sin viajes calculables abre el diálogo bloqueante, antes que el aviso de vehículos', () => {
      open();
      uploadOne({ ...pendingAck, vehicles_detected: vehiclesDetectedDto() });
      flushDetail();

      expect(dialog()!.open).toBeTrue();
      expect(q('[data-testid="vehicles-modal"]')).toBeNull();
      expect(text('[data-testid="nc-confirm"]')).toBe('Entiendo, conservar el archivo');
    });

    it('un archivo calculable en parte no muestra el diálogo ni la marca «Sin confirmar»', () => {
      open();
      uploadOne({ not_calculable: undefined });

      expect(dialog()).toBeNull();
      expect(q('[data-testid="confirm-keep"]')).toBeNull();
    });

    it('una carga anterior sin confirmar no abre nada sola, pero su fila lo ofrece y confirmar la saca de la marca', () => {
      open([importSummaryDto({ id: 'imp-1', ...pendingAck }), importSummaryDto({ id: 'imp-2', not_calculable: { acknowledged_at: '2026-03-01T10:05:00Z' } })]);

      expect(dialog()).toBeNull();
      expect(qa('[data-testid="confirm-keep"]').length).toBe(1);

      click('[data-testid="confirm-keep"]');
      flushDetail();
      expect(dialog()!.open).toBeTrue();

      click('[data-testid="nc-confirm"]');
      http.expectOne({ method: 'POST', url: `${IMPORTS_URL}/imp-1/acknowledge-not-calculable` }).flush({ data: { acknowledged_at: '2026-03-01T11:00:00Z' } });
      flushQueue([importSummaryDto({ id: 'imp-1', not_calculable: { acknowledged_at: '2026-03-01T11:00:00Z' } })]);

      expect(q('[data-testid="confirm-keep"]')).toBeNull();
    });
  });

  describe('aviso de vehículos al terminar', () => {
    const modal = (): HTMLDialogElement | null => q<HTMLDialogElement>('[data-testid="vehicles-modal"]');
    const withVehicles = { vehicles_detected: vehiclesDetectedDto() };

    it('un solo archivo que termina con vehículos abre el aviso modal, una sola vez', async () => {
      open();
      uploadOne({ ...withVehicles });

      expect(modal()!.open).toBeTrue();
      expect(text('#vf-title')).toBe('Encontramos 2 vehículos nuevos');
      expect(q('[data-testid="batch-notice"]')).toBeNull();

      const closing = new Promise((resolve) => modal()!.addEventListener('close', resolve, { once: true })); // el evento `close` del diálogo nativo es asíncrono

      click('[data-testid="modal-close"]');
      await closing;
      fixture.detectChanges();
      TestBed.inject(ImportsFacade).loadList();
      flushQueue([importSummaryDto({ id: 'imp-1', ...withVehicles })]);

      expect(modal()).toBeNull();
    });

    it('«Revisar uno por uno» cierra el aviso y abre la ventana de vehículos, sin abrir la revisión', () => {
      open();
      uploadOne({ ...withVehicles });

      click('[data-testid="modal-review"]');

      expect(modal()).toBeNull();
      expect(q('app-vehicles-detected-dialog')).not.toBeNull();
      expect(q('app-import-vehicles-section')).not.toBeNull();
      expect(q('app-import-review-dialog')).toBeNull();
    });

    it('sin vehículos nuevos ni con cambios no aparece ningún aviso', () => {
      open();
      uploadOne({ vehicles_detected: vehiclesDetectedDto({ new: 0, changed: 0, pending_decision: 0 }) });

      expect(modal()).toBeNull();
      expect(q('[data-testid="batch-notice"]')).toBeNull();
    });

    it('mientras la carga se revisa no aparece el aviso', () => {
      open();
      uploadOne({ status: 'RUNNING', phase: 'REVIEWING', headline: null, vehicles_detected: null });

      expect(modal()).toBeNull();
    });

    it('no se abre si su fila aún no está en la tabla como lista: primero se ve el resultado de calculabilidad', () => {
      open();
      pick(xlsx('a.xlsx'));
      postRequests()[0].flush(created('imp-9'), accepted);
      flushQueue([importSummaryDto({ id: 'otra' })]);
      http.expectOne(`${IMPORTS_URL}/imp-9`).flush({ data: importDetailDto({ id: 'imp-9', ...withVehicles }) });
      fixture.detectChanges();

      expect(modal()).toBeNull();
    });

    it('no le quita el foco a otra ventana abierta: espera a que se cierre', async () => {
      open([importSummaryDto({ id: 'imp-0' })]);
      click('[data-testid="view-review"]');
      http.expectOne(`${IMPORTS_URL}/imp-0`).flush({ data: importDetailDto({ id: 'imp-0' }) });
      fixture.detectChanges();

      pick(xlsx('a.xlsx'));
      postRequests()[0].flush(created('imp-1'), accepted);
      flushQueue([importSummaryDto({ id: 'imp-1', ...withVehicles }), importSummaryDto({ id: 'imp-0' })]);
      expect(modal()).toBeNull();

      const dialog = q<HTMLDialogElement>('dialog[data-testid="import-review"]')!;
      const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));

      dialog.close();
      await closed;
      fixture.detectChanges();

      expect(modal()!.open).toBeTrue();
    });

    it('varios archivos no abren un modal por archivo: un aviso agrupado no modal con «Ver cargas»', () => {
      open();
      pick(xlsx('a.xlsx'), xlsx('b.xlsx'), xlsx('c.xlsx'));
      const [first, second] = postRequests();

      first.flush(created('imp-1'), accepted);
      http.match((r) => r.method === 'GET');
      second.flush(created('imp-2'), accepted);
      http.match((r) => r.method === 'GET');
      postRequests()[0].flush(created('imp-3'), accepted);
      flushQueue([importSummaryDto({ id: 'imp-1', ...withVehicles }), importSummaryDto({ id: 'imp-2', ...withVehicles }), importSummaryDto({ id: 'imp-3' })]);

      expect(modal()).toBeNull();
      expect(text('[data-testid="batch-notice"]')).toContain('2 cargas terminaron con vehículos por revisar');
      expect(q('[data-testid="batch-notice"]')!.getAttribute('role')).toBe('status');

      click('[data-testid="see-vehicle-loads"]');
      expect(listRequest().request.params.get('filter')).toBe('VEHICLES_PENDING');
      expect(q('[data-testid="batch-notice"]')).toBeNull();
      expect(q('[data-testid="tab-VEHICLES_PENDING"]')!.getAttribute('aria-selected')).toBe('true');
    });

    it('«Cerrar» descarta el aviso agrupado', () => {
      open();
      pick(xlsx('a.xlsx'), xlsx('b.xlsx'));
      const [first, second] = postRequests();

      first.flush(created('imp-1'), accepted);
      second.flush(created('imp-2'), accepted);
      http.match((r) => r.method === 'GET');
      TestBed.inject(ImportsFacade).loadList();
      flushQueue([importSummaryDto({ id: 'imp-1', ...withVehicles }), importSummaryDto({ id: 'imp-2', ...withVehicles })]);

      expect(q('[data-testid="batch-notice"]')).not.toBeNull();
      click('[data-testid="dismiss-batch"]');
      expect(q('[data-testid="batch-notice"]')).toBeNull();
    });
  });

  describe('vehículos detectados', () => {
    it('el vehículo es secundario: un enlace discreto «Vehículos: N por revisar» solo en las cargas que lo tienen', () => {
      open([importSummaryDto({ vehicles_detected: vehiclesDetectedDto({ new: 1, changed: 3 }) }), importSummaryDto({ id: 'imp-2', vehicles_detected: null })]);

      const rows = qa('[data-testid="history-row"]');
      const link = rows[0].querySelector('[data-testid="review-vehicles"]')!;

      expect(rows[0].querySelector('[data-testid="history-vehicles"]')!.textContent!.trim()).toBe('4 por revisar');
      expect(link.getAttribute('title')).toBe('1 vehículo nuevo · 3 con cambios');
      expect(link.getAttribute('aria-label')).toBe('Revisar vehículos de operaciones-marzo.xlsx');
      expect(link.classList).toContain('linkbtn');
      expect(rows[1].querySelector('[data-testid="history-vehicles"]')).toBeNull();
      expect(rows[1].querySelector('[data-testid="review-vehicles"]')).toBeNull();
      expect(rows[0].querySelector('[data-testid="view-review"]')).not.toBeNull();
    });

    it('sin nuevos ni cambios dice «Sin novedades»', () => {
      open([importSummaryDto({ vehicles_detected: vehiclesDetectedDto({ new: 0, changed: 0, pending_decision: 0 }) })]);

      expect(q('[data-testid="review-vehicles"]')).toBeNull();
      expect(text('[data-testid="history-row"]')).toContain('Sin novedades');
    });

    it('el enlace de vehículos abre la ventana de vehículos de esa carga, independiente de la revisión', () => {
      open([importSummaryDto({ vehicles_detected: vehiclesDetectedDto() })]);

      click('[data-testid="review-vehicles"]');

      expect(text('#vd-title')).toBe('Vehículos detectados');
      expect(text('app-vehicles-detected-dialog .head p')).toBe('operaciones-marzo.xlsx');
      expect(q('app-import-vehicles-section')).not.toBeNull();
      expect(q('app-import-review-dialog')).toBeNull();
    });
  });

  describe('pestaña pedida por la URL (?filter=)', () => {
    async function openWithFilter(value: string): Promise<{ router: Router; first: TestRequest }> {
      TestBed.configureTestingModule({ imports: [ImportsComponent], providers: provideTestApp() });
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
      http = TestBed.inject(HttpTestingController);
      const router = TestBed.inject(Router);

      await router.navigate([], { queryParams: { filter: value } });
      fixture = TestBed.createComponent(ImportsComponent);
      fixture.detectChanges();

      return { router, first: listRequest() };
    }

    it('un filtro válido activa su pestaña y la primera petición ya lo lleva (sin pedir dos veces)', async () => {
      const { first } = await openWithFilter('VEHICLES_PENDING');

      expect(first.request.params.get('filter')).toBe('VEHICLES_PENDING');
      first.flush(pagedBody([importSummaryDto({ vehicles_detected: vehiclesDetectedDto() })]));
      countsRequest().flush({ data: importCountsDto({ total: 1, completed: 1, vehicles_pending: 1 }) });
      fixture.detectChanges();

      expect(q('[data-testid="tab-VEHICLES_PENDING"]')!.getAttribute('aria-selected')).toBe('true');
      http.expectNone((r) => r.url === IMPORTS_URL);
    });

    it('un valor inválido se ignora y se ve «Todas»', async () => {
      const { first } = await openWithFilter('NOPE');

      expect(first.request.params.get('filter')).toBe('ALL');
      first.flush(pagedBody([]));
      countsRequest().flush({ data: importCountsDto() });
      fixture.detectChanges();

      expect(q('[data-testid="tab-ALL"]')!.getAttribute('aria-selected')).toBe('true');
    });

    it('cambiar a «Todas» limpia el parámetro de la URL y otra pestaña lo actualiza', async () => {
      const { router, first } = await openWithFilter('FAILED');

      first.flush(pagedBody([]));
      countsRequest().flush({ data: importCountsDto() });
      fixture.detectChanges();
      expect(router.url).toContain('filter=FAILED');

      click('[data-testid="tab-COMPLETED"]');
      await fixture.whenStable();
      expect(router.url).toContain('filter=COMPLETED');
      http.match(() => true);

      click('[data-testid="tab-ALL"]');
      await fixture.whenStable();
      expect(router.url).not.toContain('filter=');
    });

    it('sin el parámetro la URL no se toca al cambiar de pestaña', async () => {
      open();
      const router = TestBed.inject(Router);

      click('[data-testid="tab-FAILED"]');
      await fixture.whenStable();

      expect(router.url).not.toContain('filter=');
    });
  });

  describe('abrir una carga desde un aviso (?import=)', () => {
    async function openWithParam(id: string): Promise<Router> {
      TestBed.configureTestingModule({ imports: [ImportsComponent], providers: provideTestApp() });
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
      http = TestBed.inject(HttpTestingController);
      const router = TestBed.inject(Router);

      await router.navigate([], { queryParams: { import: id } });
      fixture = TestBed.createComponent(ImportsComponent);
      fixture.detectChanges();
      listRequest().flush(pagedBody([]));

      return router;
    }

    it('con ?import=<id> pide esa carga, abre la ventana de vehículos (no la revisión) y al cerrar limpia el parámetro', async () => {
      const router = await openWithParam('imp-1');

      http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto({ vehicles_detected: vehiclesDetectedDto() }) });
      fixture.detectChanges();

      expect(q('app-vehicles-detected-dialog')).not.toBeNull();
      expect(q('app-import-vehicles-section')).not.toBeNull();
      expect(q('app-import-review-dialog')).toBeNull();
      expect(router.url).toContain('import=imp-1');

      q<HTMLDialogElement>('dialog.vd')!.close();
      await new Promise((resolve) => setTimeout(resolve, 30));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(q('app-vehicles-detected-dialog')).toBeNull();
      expect(router.url).not.toContain('import=');
    });

    it('si la carga ya no propone vehículos, el aviso abre la revisión', async () => {
      await openWithParam('imp-1');

      http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto({ vehicles_detected: vehiclesDetectedDto({ new: 0, changed: 0, pending_decision: 0 }) }) });
      fixture.detectChanges();
      http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto() });
      fixture.detectChanges();

      expect(q('app-vehicles-detected-dialog')).toBeNull();
      expect(q('app-import-review-dialog')).not.toBeNull();
    });

    it('si la carga no existe muestra el mensaje y limpia el parámetro', async () => {
      const router = await openWithParam('imp-x');

      http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-x` }).flush({ error: { code: 'IMPORT_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text('[data-testid="deep-link-error"]')).toBe('La carga no existe. Vuelve al historial y actualízalo.');
      expect(q('app-import-review-dialog')).toBeNull();
      expect(router.url).not.toContain('import=');
    });

    it('sin el parámetro no pide ninguna carga puntual', () => {
      open();

      http.expectNone((r) => r.method === 'GET' && /\/imports\/[^/]+$/.test(r.url));
    });
  });
});
