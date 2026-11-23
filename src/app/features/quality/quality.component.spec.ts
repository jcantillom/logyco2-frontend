import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { DUPLICATES_URL, duplicateDtos, duplicateTripDto, duplicatesBody, possibleDuplicateDto } from '../../../testing/duplicates';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { RECONCILIATION_URL, candidatesBody, sharedCandidateDtos } from '../../../testing/reconciliation';
import { SessionStore } from '../../core/auth/session.store';
import { ToastService } from '../../core/notifications/toast.service';
import { routes } from '../../app.routes';
import { QualityComponent } from './quality.component';

/** El evento `close` de un `<dialog>` llega en una tarea posterior a `close()`. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25));

/** CSS de los componentes ya compilado por Angular, sin los atributos de encapsulación ni saltos de línea. */
const componentCss = (marker: string): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '))
    .filter((c) => c.includes(marker))
    .join('\n');

describe('QualityComponent: Calidad de datos', () => {
  let fixture: ComponentFixture<QualityComponent>;
  let http: HttpTestingController;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const listRequest = (): TestRequest => http.expectOne((r) => r.url === DUPLICATES_URL && r.method === 'GET');
  const sharedRequest = (): TestRequest => http.expectOne((r) => r.url === `${RECONCILIATION_URL}/candidates` && r.method === 'GET');
  const resolveRequest = (): TestRequest => http.expectOne(`${DUPLICATES_URL}/resolve`);
  const click = (selector: string, index = 0): void => {
    qa(selector)[index].click();
    fixture.detectChanges();
  };

  function render(roles: string[] = ['ORG_ADMIN'], params: Record<string, string> = {}): void {
    query = new BehaviorSubject(convertToParamMap(params));
    TestBed.configureTestingModule({ imports: [QualityComponent], providers: [...provideTestApp(), { provide: ActivatedRoute, useValue: { queryParamMap: query } }] });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(QualityComponent);
    fixture.detectChanges();
  }

  function init(count = 5, total = count, sharedTotal = 0): void {
    render();
    listRequest().flush(duplicatesBody(duplicateDtos(count), total));
    sharedRequest().flush(candidatesBody(sharedCandidateDtos(Math.min(sharedTotal, 5)), sharedTotal));
    fixture.detectChanges();
  }

  afterEach(() => http?.match(() => true));

  describe('estructura y estados', () => {
    it('muestra la cabecera de la plataforma y una sola sección «Por revisar» con dos pestañas y su total', () => {
      init(5, 12, 7);

      expect(text('h1')).toBe('Calidad de datos');
      expect(q('app-page-hero')).not.toBeNull();
      expect(text('#review-title')).toBe('Por revisar');
      expect(text('[data-testid="tab-duplicates"]')).toBe('Posibles duplicados 12');
      expect(text('[data-testid="tab-shared"]')).toBe('Operaciones compartidas 7');
      expect(qa('[role="tab"]').map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
      expect(q('[role="tablist"]')!.getAttribute('aria-label')).toBe('Por revisar');
      expect(qa('[data-testid="review-section"]').length).toBe(1);
      expect(qa('h2').map((h) => h.textContent!.trim())).toEqual(['Por revisar']);
      expect(qa('[data-testid="shared-list"]').length).toBe(0);
    });

    it('abre en «Posibles duplicados» y «Operaciones compartidas» cambia el panel sin pedir nada más', () => {
      init(5, 12, 7);
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

      click('[data-testid="tab-shared"]');

      expect(qa('[data-testid="duplicates-list"]').length).toBe(0);
      expect(qa('[data-testid="shared-candidate"]').length).toBe(5);
      expect(q('[data-testid="tab-shared"]')!.getAttribute('aria-selected')).toBe('true');
      expect(q('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe('tab-shared');
      expect(navigate.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ queryParams: { tab: 'compartidas' }, queryParamsHandling: 'merge' }));
      http.expectNone((r) => r.method === 'GET');

      click('[data-testid="tab-duplicates"]');
      expect(qa('[data-testid="duplicate-pair"]').length).toBe(5);
      expect(navigate.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ queryParams: { tab: null } }));
    });

    it('con `?tab=compartidas` (el enlace del aviso de la campana) abre directamente en «Operaciones compartidas»', () => {
      render(['ORG_ADMIN'], { tab: 'compartidas' });
      listRequest().flush(duplicatesBody([]));
      sharedRequest().flush(candidatesBody(sharedCandidateDtos(2), 2));
      fixture.detectChanges();

      expect(q('[data-testid="tab-shared"]')!.getAttribute('aria-selected')).toBe('true');
      expect(qa('[data-testid="shared-candidate"]').length).toBe(2);
    });

    it('las flechas, Inicio y Fin mueven entre pestañas con tabindex itinerante', async () => {
      init(1, 1, 1);
      document.body.appendChild(el());
      spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      const key = (name: string): void => {
        q('[data-testid="tab-duplicates"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
        fixture.detectChanges();
      };

      expect(qa('[role="tab"]').map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1']);
      key('ArrowRight');
      await settle();
      expect(q('[data-testid="tab-shared"]')!.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(q('[data-testid="tab-shared"]'));
      key('Home');
      expect(q('[data-testid="tab-duplicates"]')!.getAttribute('aria-selected')).toBe('true');
      key('End');
      expect(q('[data-testid="tab-shared"]')!.getAttribute('aria-selected')).toBe('true');
      el().remove();
    });

    it('lista 5 pares por página con paginador y pide la página elegida al servidor', () => {
      init(5, 12);

      expect(qa('[data-testid="duplicate-pair"]').length).toBe(5);
      expect(text('[data-testid="pager"]')).toContain('Mostrando 1–5 de 12');
      click('[data-testid="page-next"]');
      const next = listRequest();

      expect(next.request.params.get('page')).toBe('2');
      next.flush(duplicatesBody(duplicateDtos(5), 12, 5, 2));
      fixture.detectChanges();
      expect(text('[data-testid="pager"]')).toContain('Mostrando 6–10 de 12');
    });

    it('muestra un esqueleto mientras carga y, si falla, el error con «Reintentar» que vuelve a pedir', () => {
      render();
      expect(q('[role="status"][aria-busy="true"]')).not.toBeNull();

      listRequest().flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(q('[role="alert"]')).not.toBeNull();

      click('[role="alert"] button');
      listRequest().flush(duplicatesBody(duplicateDtos(2)));
      fixture.detectChanges();
      expect(qa('[data-testid="duplicate-pair"]').length).toBe(2);
    });

    it('sin posibles duplicados dice «No hay posibles duplicados por revisar»', () => {
      render();
      listRequest().flush(duplicatesBody([]));
      fixture.detectChanges();

      expect(text('h2:not(#review-title)')).toBe('No hay posibles duplicados por revisar');
      expect(q('[data-testid="duplicate-pair"]')).toBeNull();
      expect(q('[data-testid="duplicates-count"]')).toBeNull();
    });

    it('con `?import_file_id=` pide solo esa carga, lo avisa y «Ver todos» quita el filtro', () => {
      render(['ORG_ADMIN'], { import_file_id: 'imp-2' });
      const request = listRequest();

      expect(request.request.params.get('import_file_id')).toBe('imp-2');
      request.flush(duplicatesBody(duplicateDtos(1)));
      fixture.detectChanges();
      expect(q('[data-testid="filter-note"]')).not.toBeNull();

      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

      click('[data-testid="clear-filter"]');
      expect(navigate.calls.mostRecent().args[1]?.queryParams).toEqual({ import_file_id: null });
      query.next(convertToParamMap({}));
      fixture.detectChanges();
      expect(listRequest().request.params.has('import_file_id')).toBeFalse();
    });
  });

  describe('cada par', () => {
    it('muestra A (retenido) y B (vigente) con los mismos campos, en el mismo orden', () => {
      init(1);
      const labels = (side: string): string[] => qa(`[data-testid="${side}"] dt`).map((d) => d.textContent!.trim());

      expect(labels('side-a')).toEqual(['Fecha', 'Placa', 'Identificador', 'Origen y destino', 'Combustible', 'Consumo', 'Distancia', 'Emisiones calculadas', 'Archivo de origen']);
      expect(labels('side-b')).toEqual(labels('side-a'));
      expect(text('[data-testid="side-a"] h4')).toContain('Viaje A');
      expect(text('[data-testid="side-b"] h4')).toContain('Viaje B');
      expect(text('[data-testid="side-a"] [data-field="file"] dd')).toContain('operaciones-octubre.xlsx · fila 14');
      expect(text('[data-testid="side-b"] [data-field="file"] dd')).toContain('operaciones-septiembre.xlsx · fila 9');
      expect(text('[data-testid="side-a"] [data-field="emissions"] dd')).toBe('3.030 kg CO₂');
      expect(text('[data-testid="side-a"] [data-field="route"] dd')).toBe('Bogotá, D.C. → Medellín');
    });

    it('explica la regla con una frase clara y muestra la etiqueta que da el servidor', () => {
      init(1);

      expect(text('[data-testid="pair-rule"]')).toBe('Mismo identificador con valores distintos');
      expect(text('[data-testid="pair-why"]')).toContain('puede ser una corrección');
    });

    const ev = (kind: string, extra: object = {}) => ({ identical: false, matches: [], differs: [], kind, ...extra });
    const lin = { established: true, mutual: false, rows: 27, new_pct: 90, previous_pct: 100 };

    it('muestra la frase de cada regla y clase de caso (R2, R3, R4, R5 corrección, R5 ambiguo, R6) y una neutra para una regla desconocida', () => {
      render();
      listRequest().flush(duplicatesBody([
        possibleDuplicateDto({ id: 'p1', rule: 'R2' }),
        possibleDuplicateDto({ id: 'p2', rule: 'R3' }),
        possibleDuplicateDto({ id: 'p3', rule: 'R4', a: duplicateTripDto({ id: 'p3', trip_id: 'V-1' }), evidence: ev('identical') }),
        possibleDuplicateDto({ id: 'p4', rule: 'R5', evidence: ev('correction', { lineage: lin }) }),
        possibleDuplicateDto({ id: 'p5', rule: 'R5', evidence: ev('ambiguous', { lineage: lin, group: { existing: 2, new: 3 } }) }),
        possibleDuplicateDto({ id: 'p6', rule: 'R6', evidence: ev('extra_row', { lineage: lin, group: { existing: 3, new: 4 } }) }),
        possibleDuplicateDto({ id: 'p7', rule: 'R9', evidence: null }),
      ], 7, 10));
      fixture.detectChanges();
      const why = qa('[data-testid="pair-why"]').map((n) => n.textContent!.trim());

      expect(why[0]).toContain('puede ser una corrección');
      expect(why[1]).toContain('mismo archivo');
      expect(why[2]).toContain('su placa no es válida');
      expect(why[3]).toContain('parece una corrección. Está retenido y no suma hasta que decidas.');
      expect(why[4]).toContain('no se pueden emparejar con seguridad');
      expect(why[5]).toContain('Hay una fila más de la que había para esa fecha, placa y ruta');
      expect(why[6]).toContain('no hay datos suficientes para confirmarlo');
      expect(qa('[data-testid="duplicate-pair"]').length).toBe(7);
    });

    it('con linaje y grupo muestra una línea compacta de cada uno; sin ellos no hay bloque', () => {
      render();
      listRequest().flush(duplicatesBody([
        possibleDuplicateDto({ id: 'p1', rule: 'R6', evidence: ev('extra_row', { lineage: lin, group: { existing: 3, new: 4 } }) }),
        possibleDuplicateDto({ id: 'p2', rule: 'R2' }),
      ]));
      fixture.detectChanges();
      const pairs = qa('[data-testid="duplicate-pair"]');

      expect(pairs[0].querySelector('[data-testid="pair-lineage"]')!.textContent).toBe('La carga se parece a una anterior: 90 % de sus filas ya estaban en ella y 100 % de las de ella están aquí.');
      expect(pairs[0].querySelector('[data-testid="pair-group"]')!.textContent).toBe('Para esa fecha, placa y ruta: antes 3 viajes, ahora 4.');
      expect(pairs[1].querySelector('[data-testid="pair-facts"]')).toBeNull();
    });

    it('con `id_mismatch` agrega la frase del id distinto después de la regla; sin él no hay frase', () => {
      render();
      listRequest().flush(duplicatesBody([
        possibleDuplicateDto({ id: 'p1', rule: 'R5', evidence: ev('correction', { id_mismatch: true }) }),
        possibleDuplicateDto({ id: 'p2', rule: 'R5', evidence: ev('correction') }),
      ]));
      fixture.detectChanges();
      const pairs = qa('[data-testid="duplicate-pair"]');

      expect(pairs[0].querySelector('[data-testid="pair-id-mismatch"]')!.textContent).toBe('Una de las dos versiones trae el id del viaje y la otra no, por eso se comparan por fecha, placa y ruta.');
      expect(pairs[0].querySelector('[data-testid="pair-why"]')!.textContent).toContain('Está retenido y no suma hasta que decidas.');
      expect(pairs[0].querySelector('[data-testid="pair-why"]')!.compareDocumentPosition(pairs[0].querySelector('[data-testid="pair-id-mismatch"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(pairs[1].querySelector('[data-testid="pair-id-mismatch"]')).toBeNull();
    });

    it('un aviso de éxito con omitidos los explica: ya resueltos o de una carga que no terminó de procesarse', () => {
      init(1);
      const toast = spyOn(TestBed.inject(ToastService), 'success');

      click('[data-testid="action-different"]');
      click('[data-testid="decision-confirm"]');
      resolveRequest().flush({ data: { resolved: 1, skipped: 2, without_result: 0 } });

      expect(toast).toHaveBeenCalledWith('Listo. El viaje quedó como un viaje independiente. 2 no se pudieron resolver porque ya estaban resueltos o su carga no terminó de procesarse.');
      listRequest().flush(duplicatesBody([]));
    });

    it('las diferencias «≠» siguen viniendo de `differences` también en R5 y R6', () => {
      render();
      listRequest().flush(duplicatesBody([possibleDuplicateDto({ rule: 'R5', differences: ['fuel_type'], a: duplicateTripDto({ fuel_type: 'GASOLINE' }), evidence: ev('correction') })]));
      fixture.detectChanges();

      expect(qa('[data-testid="side-a"] .f.diff').map((d) => d.getAttribute('data-field'))).toContain('fuel');
    });

    it('destaca lo que difiere con color, con «≠» y con texto para lectores de pantalla (el color no es la única señal)', () => {
      init(1);
      const diff = qa('[data-testid="side-a"] .f.diff');

      expect(diff.map((d) => d.getAttribute('data-field'))).toEqual(['distance', 'file']);
      expect(diff[0].querySelector('.neq')!.getAttribute('aria-hidden')).toBe('true');
      expect(diff[0].querySelector('.sr-only')!.textContent).toContain('es distinto en el otro viaje');
      expect(qa('[data-testid="side-b"] .f.diff').length).toBe(2);
      expect(q('[data-field="plate"]')!.classList).not.toContain('diff');
      expect(text('[data-testid="pair-differences"]')).toBe('Difieren: Distancia, Archivo de origen.');
    });

    it('un original que ya no existe se avisa y no permite decir «mismo viaje»', () => {
      render();
      listRequest().flush(duplicatesBody([possibleDuplicateDto({ b: null, evidence: null })]));
      fixture.detectChanges();

      expect(q('[data-testid="side-b-gone"]')).not.toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="action-same"]')!.disabled).toBeTrue();
      expect(q<HTMLButtonElement>('[data-testid="action-different"]')!.disabled).toBeFalse();
    });

    it('las acciones son botones reales dentro de un grupo con nombre', () => {
      init(1);
      const group = q('[role="group"][aria-label="Decidir sobre este posible duplicado"]')!;

      expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent!.trim())).toEqual(['Son el mismo viaje', 'Son viajes diferentes', 'Dejar pendiente']);
    });
  });

  describe('decisiones con confirmación', () => {
    it('«Son el mismo viaje» pide elegir qué versión se queda, sin opción marcada, y no envía nada hasta confirmar', () => {
      init(2);
      click('[data-testid="action-same"]');

      expect(q('[data-testid="decision-dialog"]')).not.toBeNull();
      expect(text('[data-testid="decision-title"]')).toBe('¿Son el mismo viaje?');
      expect(text('[data-testid="decision-text"]')).toContain('no se borra nada');
      expect(text('[data-testid="keep-new"] + span')).toBe('Quedarme con el retenido (archivo operaciones-octubre.xlsx)');
      expect(text('[data-testid="keep-existing"] + span')).toBe('Quedarme con el vigente (archivo operaciones-septiembre.xlsx)');
      expect(q<HTMLInputElement>('[data-testid="keep-existing"]')!.checked).toBeFalse();
      expect(q<HTMLInputElement>('[data-testid="keep-new"]')!.checked).toBeFalse();
      expect(q<HTMLButtonElement>('[data-testid="decision-confirm"]')!.disabled).toBeTrue();
      http.expectNone(`${DUPLICATES_URL}/resolve`);
    });

    it('confirmar «el vigente» envía SAME_TRIP con keep EXISTING del par A, avisa y renueva la lista', () => {
      init(2);
      const toast = spyOn(TestBed.inject(ToastService), 'success');

      click('[data-testid="action-same"]', 1);
      click('[data-testid="keep-existing"]');
      click('[data-testid="decision-confirm"]');
      const post = resolveRequest();

      expect(post.request.body).toEqual({ trip_ids: ['trip-a2'], decision: 'SAME_TRIP', keep: 'EXISTING' });
      post.flush({ data: { resolved: 1, skipped: 0 } });
      fixture.detectChanges();
      expect(toast).toHaveBeenCalledWith('Listo. Se conservó el viaje vigente; el retenido queda en el historial y no suma.');
      expect(q('[data-testid="decision-dialog"]')).toBeNull();
      listRequest().flush(duplicatesBody(duplicateDtos(1)));
      fixture.detectChanges();
      expect(qa('[data-testid="duplicate-pair"]').length).toBe(1);
    });

    it('confirmar «el retenido» envía keep NEW', () => {
      init(1);
      click('[data-testid="action-same"]');
      click('[data-testid="keep-new"]');
      click('[data-testid="decision-confirm"]');
      const post = resolveRequest();

      expect(post.request.body).toEqual({ trip_ids: ['trip-a1'], decision: 'SAME_TRIP', keep: 'NEW' });
      post.flush({ data: { resolved: 1, skipped: 0 } });
      listRequest().flush(duplicatesBody([]));
    });

    const withoutResult = (id: string) => possibleDuplicateDto({ id, a: duplicateTripDto({ id, kg_co2: null }) });

    it('los lados se rotulan con etiquetas siempre ciertas y el archivo de cada uno: «Retenido (no suma por ahora)» y «Vigente (suma)»', () => {
      init(1);

      expect(text('[data-testid="side-a"] h4')).toBe('Viaje A Retenido (no suma por ahora)');
      expect(text('[data-testid="side-b"] h4')).toBe('Viaje B Vigente (suma)');
      expect(text('[data-testid="side-a-file"]')).toBe('operaciones-octubre.xlsx');
      expect(text('[data-testid="side-b-file"]')).toBe('operaciones-septiembre.xlsx');
      expect(el().textContent).not.toMatch(/El nuevo|El original/);
    });

    it('«Son viajes diferentes» con un retenido sin resultado calculado no dice que se sumará: avisa que no suma hasta corregir sus datos', () => {
      render();
      listRequest().flush(duplicatesBody([withoutResult('trip-a1')]));
      fixture.detectChanges();
      click('[data-testid="action-different"]');

      expect(text('[data-testid="decision-text"]')).toBe('Este viaje quedará como un viaje independiente, pero todavía no tiene resultado calculado, así que no suma emisiones hasta que corrijas sus datos.');
      expect(text('[data-testid="decision-text"]')).not.toContain('Los dos viajes se sumarán');
      expect(q<HTMLButtonElement>('[data-testid="decision-confirm"]')!.disabled).toBeFalse();
    });

    it('en lote con selección mixta dice cuántos no sumarán todavía, y si ninguno tiene resultado, «Ninguno»', () => {
      render();
      listRequest().flush(duplicatesBody([possibleDuplicateDto({ id: 'trip-a1' }), withoutResult('trip-a2'), withoutResult('trip-a3')]));
      fixture.detectChanges();
      click('[data-testid="select-page"]');
      click('[data-testid="bulk-different"]');

      expect(text('[data-testid="decision-text"]')).toBe('Los viajes retenidos pasarán a ser viajes independientes. 2 de 3 todavía no tienen resultado calculado, así que no suman emisiones hasta que corrijas sus datos.');
      expect(text('[data-testid="decision-text"]')).not.toContain('Los dos viajes se sumarán');
    });

    it('en lote con todos con resultado dice que se sumarán junto con los vigentes', () => {
      init(2);
      click('[data-testid="select-page"]');
      click('[data-testid="bulk-different"]');

      expect(text('[data-testid="decision-text"]')).toBe('Los viajes retenidos pasarán a ser viajes independientes y se sumarán a tus emisiones junto con los vigentes.');
    });

    it('«mismo viaje» desactiva «Quedarme con el retenido» con su motivo si el retenido no tiene resultado y el vigente sí; «el vigente» sigue disponible', () => {
      render();
      listRequest().flush(duplicatesBody([withoutResult('trip-a1')]));
      fixture.detectChanges();
      click('[data-testid="action-same"]');
      const retained = q<HTMLInputElement>('[data-testid="keep-new"]')!;

      expect(retained.disabled).toBeTrue();
      expect(text('[data-testid="keep-new-blocked"]')).toBe('No disponible: el retenido todavía no tiene resultado calculado.');
      expect(retained.getAttribute('aria-describedby')).toBe('dd-blocked');
      expect(q<HTMLInputElement>('[data-testid="keep-existing"]')!.disabled).toBeFalse();
      click('[data-testid="keep-existing"]');
      expect(q<HTMLButtonElement>('[data-testid="decision-confirm"]')!.disabled).toBeFalse();
    });

    it('si el retenido tiene resultado, ambas opciones están disponibles', () => {
      init(1);
      click('[data-testid="action-same"]');
      expect(q<HTMLInputElement>('[data-testid="keep-new"]')!.disabled).toBeFalse();
      expect(q('[data-testid="keep-new-blocked"]')).toBeNull();
    });

    it('en lote «mismo viaje» desactiva el retenido si algún seleccionado no tiene resultado', () => {
      render();
      listRequest().flush(duplicatesBody([possibleDuplicateDto({ id: 'trip-a1' }), withoutResult('trip-a2')]));
      fixture.detectChanges();
      click('[data-testid="select-page"]');
      click('[data-testid="bulk-same"]');

      expect(q<HTMLInputElement>('[data-testid="keep-new"]')!.disabled).toBeTrue();
      expect(text('[data-testid="keep-new-blocked"]')).toBe('No disponible: 1 de los retenidos todavía no tiene resultado calculado.');
    });

    it('un 422 KEEP_VERSION_NOT_CALCULATED se explica en la confirmación con el mensaje en español', () => {
      init(1);
      click('[data-testid="action-same"]');
      click('[data-testid="keep-new"]');
      click('[data-testid="decision-confirm"]');
      resolveRequest().flush({ error: { code: 'KEEP_VERSION_NOT_CALCULATED' } }, { status: 422, statusText: 'Unprocessable' });
      fixture.detectChanges();

      expect(text('[data-testid="decision-error"]')).toBe('La versión que quieres conservar todavía no tiene resultado calculado. Corrige sus datos o elige la otra versión.');
    });

    it('el aviso de éxito es veraz: si el servidor dice que quedaron viajes sin resultado calculado, lo agrega', () => {
      init(1);
      const toast = spyOn(TestBed.inject(ToastService), 'success');

      click('[data-testid="action-different"]');
      click('[data-testid="decision-confirm"]');
      resolveRequest().flush({ data: { resolved: 1, skipped: 0, without_result: 1 } });

      expect(toast).toHaveBeenCalledWith('Listo. El viaje quedó como un viaje independiente. 1 de los viajes que dejaste como independientes todavía no tiene resultado calculado, así que no suma emisiones hasta que corrijas sus datos.');
      listRequest().flush(duplicatesBody([]));
    });

    it('«Son viajes diferentes» explica que los dos contarán y envía DIFFERENT_TRIPS sin keep', () => {
      init(1);
      click('[data-testid="action-different"]');

      expect(text('[data-testid="decision-title"]')).toBe('¿Son viajes diferentes?');
      expect(text('[data-testid="decision-text"]')).toContain('Los dos viajes se sumarán');
      expect(q('[data-testid="keep-options"]')).toBeNull();
      click('[data-testid="decision-confirm"]');
      const post = resolveRequest();

      expect(post.request.body).toEqual({ trip_ids: ['trip-a1'], decision: 'DIFFERENT_TRIPS' });
      post.flush({ data: { resolved: 1, skipped: 0 } });
      listRequest().flush(duplicatesBody([]));
    });

    it('cancelar cierra la confirmación sin enviar nada', async () => {
      init(1);
      click('[data-testid="action-different"]');
      click('[data-testid="decision-cancel"]');
      await settle();
      fixture.detectChanges();

      expect(q('[data-testid="decision-dialog"]')).toBeNull();
      http.expectNone(`${DUPLICATES_URL}/resolve`);
    });

    it('«Dejar pendiente» no pide confirmación, no cambia la lista y dice que sigue fuera de los totales', () => {
      init(2);
      const toast = spyOn(TestBed.inject(ToastService), 'success');

      click('[data-testid="action-pending"]');
      const post = resolveRequest();

      expect(post.request.body).toEqual({ trip_ids: ['trip-a1'], decision: 'KEEP_PENDING' });
      post.flush({ data: { resolved: 1, skipped: 0 } });
      expect(toast).toHaveBeenCalledWith('Quedó pendiente. Sigue fuera de los totales hasta que se decida.');
      expect(q('[data-testid="decision-dialog"]')).toBeNull();
      http.expectNone((r) => r.url === DUPLICATES_URL && r.method === 'GET');
      expect(qa('[data-testid="duplicate-pair"]').length).toBe(2);
    });

    it('un 404 muestra el motivo en la confirmación, no cierra nada y renueva la lista', () => {
      init(1);
      click('[data-testid="action-different"]');
      click('[data-testid="decision-confirm"]');
      resolveRequest().flush({ error: { code: 'TRIP_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(text('[data-testid="decision-error"]')).toContain('ya no está disponible');
      expect(q('[data-testid="decision-dialog"]')).not.toBeNull();
      listRequest().flush(duplicatesBody([]));
    });

    it('un error al dejar pendiente se avisa con un mensaje de error', () => {
      init(1);
      const toast = spyOn(TestBed.inject(ToastService), 'error');

      click('[data-testid="action-pending"]');
      resolveRequest().flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Server Error' });

      expect(toast).toHaveBeenCalled();
    });
  });

  describe('decisión por lotes', () => {
    it('sin selección los botones del lote están desactivados; marcar pares los activa y cuenta', () => {
      init(3);

      expect(text('[data-testid="selected-count"]')).toBe('Ninguno seleccionado');
      expect(qa<HTMLButtonElement>('[data-testid="bulk-bar"] button').every((b) => b.disabled)).toBeTrue();
      click('[data-testid="pair-select"]', 0);
      click('[data-testid="pair-select"]', 2);

      expect(text('[data-testid="selected-count"]')).toBe('2 seleccionados');
      expect(q<HTMLButtonElement>('[data-testid="bulk-same"]')!.disabled).toBeFalse();
      expect(qa('[data-testid="duplicate-pair"].selected').length).toBe(2);
    });

    it('«Seleccionar los de esta página» marca y desmarca todos', () => {
      init(3);
      click('[data-testid="select-page"]');
      expect(text('[data-testid="selected-count"]')).toBe('3 seleccionados');
      click('[data-testid="select-page"]');
      expect(text('[data-testid="selected-count"]')).toBe('Ninguno seleccionado');
    });

    it('«Son el mismo viaje» a los seleccionados pide la misma confirmación y envía todos los ids en una sola petición', () => {
      init(3);
      click('[data-testid="select-page"]');
      click('[data-testid="bulk-same"]');

      expect(text('[data-testid="decision-title"]')).toBe('¿Son el mismo viaje en las 3 operaciones seleccionadas?');
      click('[data-testid="keep-new"]');
      click('[data-testid="decision-confirm"]');
      const post = resolveRequest();

      expect(post.request.body).toEqual({ trip_ids: ['trip-a1', 'trip-a2', 'trip-a3'], decision: 'SAME_TRIP', keep: 'NEW' });
      post.flush({ data: { resolved: 3, skipped: 0 } });
      fixture.detectChanges();
      expect(text('[data-testid="selected-count"]')).toBe('Ninguno seleccionado');
      listRequest().flush(duplicatesBody([]));
    });

    it('«Son viajes diferentes» y «Dejar pendiente» también valen para los seleccionados (la segunda sin confirmar)', () => {
      init(2);
      click('[data-testid="select-page"]');
      click('[data-testid="bulk-different"]');
      expect(text('[data-testid="decision-title"]')).toBe('¿Son viajes diferentes las 2 operaciones seleccionadas?');
      click('[data-testid="decision-cancel"]');

      click('[data-testid="bulk-pending"]');
      const post = resolveRequest();

      expect(post.request.body).toEqual({ trip_ids: ['trip-a1', 'trip-a2'], decision: 'KEEP_PENDING' });
      post.flush({ data: { resolved: 2, skipped: 0 } });
    });

    it('al llegar a 500 avisa y no deja marcar más; «Quitar selección» la vacía', () => {
      init(2);
      const facade = fixture.debugElement.injector.get(QualityComponent) as unknown as { facade: { selection: { set(v: string[]): void } } };

      facade['facade'].selection.set(Array.from({ length: 500 }, (_, i) => `x${i}`));
      fixture.detectChanges();

      expect(text('[data-testid="selection-max"]')).toContain('máximo de 500');
      expect(qa<HTMLInputElement>('[data-testid="pair-select"]').every((c) => c.disabled)).toBeTrue();
      click('[data-testid="bulk-clear"]');
      expect(q('[data-testid="selection-max"]')).toBeNull();
    });
  });

  describe('permisos y ruta', () => {
    const calidad = () => routes.find((r) => r.path === '')!.children!.find((r) => r.path === 'calidad')!;

    it('la ruta existe con el componente real y exige `imports:create`: sin él va a «acceso denegado» como las demás pantallas', async () => {
      expect(calidad().data).toEqual(jasmine.objectContaining({ breadcrumb: 'Calidad de datos' }));
      expect(await (calidad().loadComponent as () => Promise<unknown>)()).toBe(QualityComponent);

      for (const [role, allowed] of [['ORG_ADMIN', true], ['ORG_ANALYST', true], ['ORG_VIEWER', false]] as const) {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [...provideTestApp(), provideRouter([])] });
        signInAs(buildUser({ memberships: [membership(ORG_ENVIA, [role])] }), TestBed.inject(SessionStore));
        const result = TestBed.runInInjectionContext(() => (calidad().canActivate![0] as () => unknown)());

        expect(result === true).toBe(allowed);
      }
    });
  });

  describe('presentación', () => {
    it('el CSS usa solo tokens de la plataforma: sin hexadecimales ni rgb() y con tintes permitidos', () => {
      init(1);
      click('[data-testid="action-same"]');
      const css = [componentCss('.pair'), componentCss('.bulk'), componentCss('.opt')].join('\n');

      expect(css).toContain('.pair');
      expect(css).toContain('.bulk');
      expect(css).toContain('.opt');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);

      const tints = Array.from(css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g));

      expect(tints.length).toBeGreaterThan(0);
      for (const m of tints) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });

    it('nada tiene scroll interno: ningún elemento de la pantalla es desplazable ni recorta su contenido', () => {
      init(5, 12);
      document.body.appendChild(el());
      const scrollable = qa('*').filter((node) => {
        const style = getComputedStyle(node);

        if (node.classList.contains('sr-only')) return false;

        return ['auto', 'scroll'].includes(style.overflowY) || (style.overflowY !== 'visible' && node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0);
      });

      expect(scrollable.map((n) => n.className || n.tagName)).toEqual([]);
      el().remove();
    });

    it('A y B son dos tarjetas simétricas del mismo ancho y alto', () => {
      init(1);
      document.body.appendChild(el());
      const a = q('[data-testid="side-a"]')!.getBoundingClientRect();
      const b = q('[data-testid="side-b"]')!.getBoundingClientRect();

      expect(Math.abs(a.width - b.width)).toBeLessThan(2);
      expect(Math.abs(a.height - b.height)).toBeLessThan(2);
      el().remove();
    });

    it('usa duplicateTripDto con ids de texto o número tal como llegan', () => {
      render();
      listRequest().flush(duplicatesBody([possibleDuplicateDto({ id: 77, a: duplicateTripDto({ id: 77 }) })]));
      fixture.detectChanges();
      click('[data-testid="action-different"]');
      click('[data-testid="decision-confirm"]');

      expect(resolveRequest().request.body).toEqual({ trip_ids: [77], decision: 'DIFFERENT_TRIPS' });
    });
  });
});
