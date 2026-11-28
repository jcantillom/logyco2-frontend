import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import {
  COMPLETIONS_URL, EXPORTS_URL, OPERATIONS_URL, bulkApplyDto, bulkPreviewDto, capped, completionOutDto, completionPlateDto, completionPlatesBody, completionStateDto, completionUrl, exportsBody, operationTripDto, operationsPageBody, pendingTripDetailDto, tabCountsDto,
  tripDetailDto,
} from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OperationTripDto } from '../../infrastructure/dto/operations.dto';
import { OperationsComponent } from './operations.component';

const componentCss = (marker: string): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '))
    .filter((c) => c.includes(marker))
    .join('\n');

describe('Operaciones logísticas: completar datos', () => {
  let fixture: ComponentFixture<OperationsComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const click = (selector: string, index = 0): void => {
    qa(selector)[index].click();
    fixture.detectChanges();
  };
  const type = (selector: string, value: string, event = 'input'): void => {
    const field = q<HTMLInputElement | HTMLSelectElement>(selector)!;

    field.value = value;
    field.dispatchEvent(new Event(event));
    fixture.detectChanges();
  };
  const pendingRow = (n: number, extra: Partial<OperationTripDto> = {}): OperationTripDto =>
    operationTripDto({ id: `trip-${n}`, trip_id: `VIA-${n}`, plate: `PLA00${n}`, status: 'PENDING', state_label: 'Por completar', reason: 'DISTANCE_WITHOUT_EFFICIENCY', reason_label: 'Falta el rendimiento', kg_co2: null, ...extra });
  const patch = (id = 'trip-1'): TestRequest => http.expectOne((r) => r.url === completionUrl(id) && r.method === 'PATCH');
  const summary = (): TestRequest => http.expectOne(`${OPERATIONS_URL}/summary`);

  function render(roles: string[], params: Record<string, string> = {}): void {
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

  function init(rows: readonly OperationTripDto[], roles: string[] = ['ORG_ANALYST'], params: Record<string, string> = {}): void {
    render(roles, params);
    http.expectOne((r) => r.url === OPERATIONS_URL && r.method === 'GET').flush(operationsPageBody(rows, { next: 'cur-2', total: capped(rows.length) }));
    summary().flush({ data: tabCountsDto(), meta: {} });

    if (roles.includes('ORG_ANALYST') || roles.includes('ORG_ADMIN')) {
      http.expectOne((r) => r.url.endsWith('/imports/periods')).flush({ data: [], meta: {} });
      http.expectOne((r) => r.url.endsWith('/imports') && r.method === 'GET').flush({ data: [], meta: { pagination: { page: 1, page_size: 50, total: 0, total_pages: 0, has_next: false, has_previous: false } } });
    }

    fixture.detectChanges();
  }

  /** Abre el detalle de la fila 0 con el detalle indicado. */
  function openDetail(detail = pendingTripDetailDto(), index = 0): void {
    click('[data-testid="open-detail"]', index);
    http.expectOne(`${OPERATIONS_URL}/trip-${index + 1}`).flush({ data: detail, meta: {} });
    fixture.detectChanges();
  }

  /** Abre el formulario: pide qué falta y lo muestra. */
  function openForm(state = completionStateDto()): void {
    click('[data-testid="complete-action"]');
    http.expectOne(completionUrl('trip-1')).flush({ data: state, meta: {} });
    fixture.detectChanges();
  }

  afterEach(() => {
    if (!http) return;

    http.match((r) => r.url === EXPORTS_URL && r.method === 'GET').forEach((request) => !request.cancelled && request.flush(exportsBody()));
    http.verify();
  });

  describe('acción en el panel', () => {
    it('un viaje completable muestra «Completar datos» junto a «Emisiones del viaje» (sin altura extra) y uno calculado no', () => {
      init([pendingRow(1), operationTripDto({ id: 'trip-2' })]);
      openDetail();

      const action = q<HTMLButtonElement>('[data-testid="complete-action"]')!;

      expect(action.textContent?.trim()).toBe('Completar datos');
      expect(action.disabled).toBeFalse();
      expect(action.closest('[data-testid="detail-kg"]')).not.toBeNull();

      click('[data-testid="open-detail"]', 1);
      http.expectOne(`${OPERATIONS_URL}/trip-2`).flush({ data: tripDetailDto({ identity: { ...tripDetailDto().identity, id: 'trip-2' } }), meta: {} });
      fixture.detectChanges();
      expect(q('[data-testid="complete-action"]')).toBeNull();
    });

    it('sin imports:create la acción se ve deshabilitada con su explicación accesible y no pide nada', () => {
      init([pendingRow(1)], ['ORG_VIEWER']);
      openDetail();
      const action = q<HTMLButtonElement>('[data-testid="complete-action"]')!;

      expect(action.disabled).toBeTrue();
      expect(action.getAttribute('aria-describedby')).toBe('complete-hint');
      expect(text('#complete-hint')).toContain('permiso');
      action.click();
      http.expectNone((r) => r.url.includes('/completion'));
    });

    it('un viaje por completar que el servidor no deja completar no tiene formulario y muestra el motivo con su guía', () => {
      init([pendingRow(1)]);
      openDetail(pendingTripDetailDto({ completable: false, missing_fields: [], reason: 'INVALID_DATE', reason_label: 'La fecha no es válida' }));
      http.expectOne(completionUrl('trip-1')).flush({ data: completionStateDto({ completable: false, refusal: { code: 'TRIP_NOT_COMPLETABLE', message: 'La fecha no es válida: corrígela en el archivo y vuelve a cargarlo' }, fields: [], missing: [] }), meta: {} });
      fixture.detectChanges();

      expect(q('[data-testid="complete-action"]')).toBeNull();
      expect(text('[data-testid="detail-refusal"]')).toBe('La fecha no es válida: corrígela en el archivo y vuelve a cargarlo');
    });
  });

  describe('formulario', () => {
    it('muestra SOLO los datos que pide el servidor, con su etiqueta, unidades y ayuda; sin valores por defecto y con el foco en el primero', fakeAsync(() => {
      init([pendingRow(1)]);
      openDetail();
      openForm();
      tick();

      expect(qa('[data-testid^="field-"]:not([data-testid="field-error"])').map((f) => f.getAttribute('data-testid'))).toEqual(['field-efficiency.value', 'field-efficiency.unit']);
      expect(q('[data-testid="field-distance_km"]')).toBeNull();
      expect(q('[data-testid="field-fuel_type"]')).toBeNull();
      expect(text('[data-testid="completion-form"]')).toContain('Falta: Hay distancia, pero falta el rendimiento del vehículo');
      const value = q<HTMLInputElement>('[data-testid="field-efficiency.value"]')!;
      const unit = q<HTMLSelectElement>('[data-testid="field-efficiency.unit"]')!;

      expect(value.value).toBe('');
      expect(value.getAttribute('inputmode')).toBe('decimal');
      expect(unit.value).toBe('');
      expect(Array.from(unit.options).map((o) => o.textContent!.trim())).toEqual(['Elegir', 'km/gal', 'km/l']);
      expect(text('[data-testid="completion-form"]')).toContain('Kilómetros por unidad de combustible');
      expect(document.activeElement).toBe(value);
      expect((q('[data-testid="completion-save"]') as HTMLButtonElement).disabled).toBeTrue();
      expect(q('.tabs')).toBeNull();  // el formulario ocupa el cuerpo del panel: no suma altura
      flush();
    }));

    it('un viaje sin rendimiento ni distancia pide solo lo que falta y agrupa cada cantidad con su unidad', () => {
      init([pendingRow(1)]);
      openDetail();
      openForm(
        completionStateDto({
          fields: [
            { name: 'distance_km', label: 'Distancia (km)', kind: 'number', group: 'distance', options: null, range: { min_exclusive: '0', max: '5000' }, hint: null },
            { name: 'consumption.quantity', label: 'Cantidad', kind: 'number', group: 'consumption', options: null, range: null, hint: null },
            { name: 'consumption.unit', label: 'Unidad', kind: 'unit', group: 'consumption', options: [{ value: 'gal', label: 'galones' }], range: null, hint: null },
          ],
        }),
      );

      expect(qa('fieldset').map((f) => f.getAttribute('data-testid'))).toEqual(['group-distance', 'group-consumption']);
      expect(qa('[data-testid="group-consumption"] [data-testid^="field-"]').length).toBe(2);
      expect(text('[data-testid="completion-form"]')).toContain('Mayor que 0 y hasta 5.000');
    });

    it('Guardar envía lo escrito, con la coma decimal tal cual, muestra «Guardando…» con aria-busy y luego el resultado que calculó el servidor; la fila se actualiza sin recargar la lista', fakeAsync(() => {
      init([pendingRow(1), pendingRow(2)]);
      openDetail();
      openForm();
      type('[data-testid="field-efficiency.value"]', '9,5');
      type('[data-testid="field-efficiency.unit"]', 'km/gal', 'change');
      expect((q('[data-testid="completion-save"]') as HTMLButtonElement).disabled).toBeFalse();

      click('[data-testid="completion-save"]');
      const request = patch();

      expect(request.request.body).toEqual({ expected_version: 0, efficiency: { value: '9,5', unit: 'km/gal' } });
      expect(text('[data-testid="completion-save"]')).toBe('Guardando…');
      expect(q('[data-testid="completion-save"]')!.getAttribute('aria-busy')).toBe('true');
      expect((q('[data-testid="completion-cancel"]') as HTMLButtonElement).disabled).toBeTrue();
      request.flush({ data: completionOutDto(), meta: {} });
      summary().flush({ data: tabCountsDto({ pending: capped(11) }), meta: {} });
      fixture.detectChanges();
      tick();

      expect(text('[data-testid="completion-message"]')).toBe('Calculado: 50,745 kg CO₂');
      expect(text('[data-testid="completion-live"]')).toBe('Calculado: 50,745 kg CO₂');
      expect(text('[data-testid="detail-kg"] b')).toBe('50,745 kg CO₂');
      const first = qa('[data-testid="trip-row"]')[0];

      expect(first.querySelector('[data-testid="state-chip"]')?.textContent?.trim()).toBe('Calculado');
      expect(first.querySelector('td.kg')?.textContent).toContain('50,745');
      expect(qa('[data-testid="trip-row"]')[1].querySelector('[data-testid="state-chip"]')?.textContent?.trim()).toBe('Por completar');
      expect(text('[data-testid="count-pending"]')).toBe('11');
      http.expectNone((r) => r.url === OPERATIONS_URL && r.method === 'GET');
      expect(document.activeElement?.id).toBe('completion-title');
      flush();
    }));

    it('«Listo» vuelve al detalle con el foco en un lugar válido y muestra «Corregido por» y «Declarado en el archivo» (solo lectura)', fakeAsync(() => {
      init([pendingRow(1)]);
      openDetail();
      openForm();
      type('[data-testid="field-efficiency.value"]', '8');
      click('[data-testid="completion-save"]');
      patch().flush({ data: completionOutDto(), meta: {} });
      summary().flush({ data: tabCountsDto(), meta: {} });
      fixture.detectChanges();
      click('[data-testid="completion-done"]');
      tick();
      fixture.detectChanges();
      tick(300);

      expect(q('[data-testid="completion"]')).toBeNull();
      expect(q('[data-testid="detail-info"]')).not.toBeNull();
      const info = text('[data-testid="detail-info"]');

      expect(info).toContain('Completado en pantalla');
      expect(info).toContain('Corregido por Laura Gómez');
      expect(info).toContain('Declarado en el archivo');
      expect(info).toContain('Declarado: Rendimiento');
      expect(info).toContain('No venía en el archivo');
      expect(qa('[data-testid="detail-info"] input, [data-testid="detail-info"] select').length).toBe(0);
      expect(document.activeElement?.id).toBe('trip-detail-title');
      flush();
    }));

    it('«Cancelar» vuelve al detalle sin guardar y devuelve el foco a «Completar datos»', fakeAsync(() => {
      init([pendingRow(1)]);
      openDetail();
      openForm();
      type('[data-testid="field-efficiency.value"]', '8');
      click('[data-testid="completion-cancel"]');
      tick();
      fixture.detectChanges();
      tick(300);

      expect(q('[data-testid="completion"]')).toBeNull();
      expect(document.activeElement).toBe(q("[data-testid=\"complete-action\"]"));
      http.expectNone((r) => r.method === 'PATCH');
      flush();
    }));

    it('un error de validación del servidor queda bajo su dato, asociado con aria-describedby y aria-invalid, y se quita al corregirlo', () => {
      init([pendingRow(1)]);
      openDetail();
      openForm();
      type('[data-testid="field-efficiency.value"]', '0');
      click('[data-testid="completion-save"]');
      patch().flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'efficiency.value', message: 'Debe ser mayor que 0 y no superar 100', type: 'number' }] } }, { status: 422, statusText: 'Unprocessable' });
      fixture.detectChanges();

      const input = q<HTMLInputElement>('[data-testid="field-efficiency.value"]')!;
      const error = q('[data-testid="field-error"]')!;

      expect(error.textContent?.trim()).toBe('Debe ser mayor que 0 y no superar 100');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toContain(error.id);
      expect(q('[data-testid="completion-error"]')).toBeNull();
      type('[data-testid="field-efficiency.value"]', '8');
      expect(q('[data-testid="field-error"]')).toBeNull();
      expect(q('[data-testid="field-efficiency.value"]')!.getAttribute('aria-invalid')).toBeNull();
    });

    it('un conflicto de versión refresca el formulario con los datos que trae el error, conserva lo escrito y avisa con un mensaje corto', () => {
      init([pendingRow(1)]);
      openDetail();
      openForm();
      type('[data-testid="field-efficiency.value"]', '8');
      click('[data-testid="completion-save"]');
      patch().flush(
        { error: { code: 'TRIP_VERSION_CONFLICT', message: 'x', details: [{ field: 'version', message: '3', type: 'current_version' }] }, data: completionStateDto({ version: 3 }) },
        { status: 409, statusText: 'Conflict' },
      );
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: pendingTripDetailDto({ correction_version: 3 }), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="completion-notice"]')).toBe('Alguien más modificó este viaje. Revisa los datos actuales y vuelve a guardar.');
      expect(q<HTMLInputElement>('[data-testid="field-efficiency.value"]')!.value).toBe('8');
      click('[data-testid="completion-save"]');
      expect(patch().request.body.expected_version).toBe(3);
    });

    it('otros errores usan la alerta existente con el mensaje del catálogo', () => {
      init([pendingRow(1)]);
      openDetail();
      openForm();
      type('[data-testid="field-efficiency.value"]', '8');
      click('[data-testid="completion-save"]');
      patch().flush({ error: { code: 'TRIP_HAS_CONFIRMED_MATCH' } }, { status: 409, statusText: 'Conflict' });
      http.expectOne(`${OPERATIONS_URL}/trip-1`).flush({ data: pendingTripDetailDto(), meta: {} });
      fixture.detectChanges();

      const alert = q('[data-testid="completion-error"]')!;

      expect(alert.getAttribute('role')).toBe('alert');
      expect(alert.className).toContain('alert-danger');
      expect(alert.textContent).toContain('confirmado con una empresa vinculada');
    });

    it('«Guardar y siguiente» solo aparece si hay otro viaje por completar en la página y abre el siguiente (sin recargar la lista)', fakeAsync(() => {
      init([pendingRow(1), operationTripDto({ id: 'trip-9' }), pendingRow(3)]);
      openDetail();
      openForm();
      expect(q('[data-testid="completion-save-next"]')).not.toBeNull();
      type('[data-testid="field-efficiency.value"]', '8');
      click('[data-testid="completion-save-next"]');
      patch().flush({ data: completionOutDto(), meta: {} });
      summary().flush({ data: tabCountsDto(), meta: {} });
      http.expectOne(`${OPERATIONS_URL}/trip-3`).flush({ data: pendingTripDetailDto({ identity: { ...pendingTripDetailDto().identity, id: 'trip-3', trip_id: 'VIA-3' } }), meta: {} });
      http.expectOne(completionUrl('trip-3')).flush({ data: completionStateDto({ trip_id: 'trip-3' }), meta: {} });
      fixture.detectChanges();
      tick();

      expect(q('[data-testid="completion-form"]')).not.toBeNull();
      expect(text('[data-testid="detail-id"]')).toBe('VIA-3');
      expect(qa('[data-testid="trip-row"]')[2].className).toContain('sel');
      expect(q('[data-testid="completion-save-next"]')).toBeNull();  // ya no queda otro después
      http.expectNone((r) => r.url === OPERATIONS_URL && r.method === 'GET');
      flush();
    }));
  });

  const six = (): ReturnType<typeof completionPlateDto>[] => Array.from({ length: 6 }, (_, i) => completionPlateDto(i + 1));
  const platesRequest = (): ReturnType<HttpTestingController['expectOne']> => http.expectOne((r) => r.url === `${COMPLETIONS_URL}/plates`);
  /** Abre el diálogo y atiende la primera página de placas del servidor. */
  const openBulk = (plates = six(), meta: Parameters<typeof completionPlatesBody>[1] = { next_cursor: 'c1', total_plates: { value: 1926, capped: false } }): void => {
    click('[data-testid="bulk-open"]');
    platesRequest().flush(completionPlatesBody(plates, meta));
    fixture.detectChanges();
  };

  describe('completar por vehículo', () => {
    const rows = (): OperationTripDto[] => Array.from({ length: 8 }, (_, i) => pendingRow(i + 1));
    it('solo se ofrece en «Por completar» con viajes a la vista, junto al paginador (sin añadir una fila nueva a la página)', () => {
      init(rows());
      expect(q('[data-testid="bulk-open"]')).toBeNull();
    });

    it('en «Por completar» aparece en el paginador y sin permiso queda deshabilitado con su explicación', () => {
      init(rows(), ['ORG_VIEWER'], { view: 'pending' });
      const button = q<HTMLButtonElement>('[data-testid="bulk-open"]')!;

      expect(button.closest('[data-testid="pager"]')).not.toBeNull();
      expect(button.disabled).toBeTrue();
      expect(button.getAttribute('aria-describedby')).toBe('bulk-hint');
      expect(text('#bulk-hint')).toContain('permiso');
    });

    it('muestra las placas del servidor (6 por página) con viajes y combustible, una entrada por placa y una unidad por elegir sin valor por defecto, y pagina dentro del diálogo', fakeAsync(() => {
      init(rows(), ['ORG_ANALYST'], { view: 'pending' });
      openBulk();
      tick();

      expect(q('[data-testid="bulk-panel"]')!.getAttribute('role')).toBe('dialog');
      expect(qa('[data-testid="bulk-row"]').length).toBe(6);
      expect(text('[data-testid="bulk-row"] .plate')).toBe('PLA001 · 31 viajes · Diésel');
      expect((q('[data-testid="bulk-value-PLA001"]') as HTMLInputElement).value).toBe('');
      expect((q('[data-testid="bulk-unit-PLA001"]') as HTMLSelectElement).value).toBe('');
      expect(Array.from((q('[data-testid="bulk-unit-PLA001"]') as HTMLSelectElement).options).map((o) => o.textContent!.trim())).toEqual(['Elegir', 'km/gal', 'km/l']);
      expect(document.activeElement?.id).toBe('bulk-title');
      expect((q('[data-testid="bulk-review"]') as HTMLButtonElement).disabled).toBeTrue();
      expect(text('[data-testid="bulk-pager"]')).toContain('1–6 de 1.926 placas');
      expect(text('[data-testid="bulk-filled"]')).toBe('0 placas con valor de 1.926');
      expect((q('[data-testid="bulk-prev"]') as HTMLButtonElement).disabled).toBeTrue();
      type('[data-testid="bulk-value-PLA001"]', '9,5');
      click('[data-testid="bulk-next"]');
      const next = platesRequest();

      expect(next.request.params.get('cursor')).toBe('c1');
      next.flush(completionPlatesBody([completionPlateDto(7), completionPlateDto(8)], { next_cursor: null }));
      fixture.detectChanges();
      expect(qa('[data-testid="bulk-row"]').length).toBe(2);
      expect(text('[data-testid="bulk-pager"]')).toContain('7–8 de 1.926 placas');
      expect(text('[data-testid="bulk-live"]')).toContain('Placas 7–8 de 1.926 placas');
      expect((q('[data-testid="bulk-next"]') as HTMLButtonElement).disabled).toBeTrue();
      click('[data-testid="bulk-prev"]');
      platesRequest().flush(completionPlatesBody(six(), { next_cursor: 'c1' }));
      fixture.detectChanges();
      expect((q('[data-testid="bulk-value-PLA001"]') as HTMLInputElement).value).toBe('9,5');  // lo escrito se conserva al paginar
      expect(text('[data-testid="bulk-filled"]')).toBe('1 placa con valor de 1.926');
      flush();
    }));

    it('la unidad ya declarada se muestra de solo lectura «km/gal (del archivo)» (sin select vacío) y no se envía; la que no se declara se elige', fakeAsync(() => {
      init(rows(), ['ORG_ANALYST'], { view: 'pending' });
      openBulk([completionPlateDto(1, { efficiency_unit: 'km/gal', unit_options: [] }), completionPlateDto(2)], { next_cursor: null });

      expect(text('[data-testid="bulk-declared-PLA001"]')).toBe('km/gal (del archivo)');
      expect(q('[data-testid="bulk-unit-PLA001"]')).toBeNull();
      expect(q('[data-testid="bulk-unit-PLA002"]')).not.toBeNull();
      expect(qa('[data-testid="bulk-panel"] select').every((select) => (select as HTMLSelectElement).options.length > 1)).toBeTrue();  // ningún select queda solo con «Elegir»
      type('[data-testid="bulk-value-PLA001"]', '8');
      click('[data-testid="bulk-review"]');

      expect(http.expectOne(`${COMPLETIONS_URL}/preview`).request.body.items).toEqual([{ plate: 'PLA001', efficiency_value: '8' }]);
      flush();
    }));

    it('la búsqueda por placa espera 300 ms, pide el prefijo y muestra su resultado; sin coincidencias lo dice', fakeAsync(() => {
      init(rows(), ['ORG_ANALYST'], { view: 'pending' });
      openBulk();
      type('[data-testid="bulk-search"]', 'pla-00');
      tick(299);
      http.expectNone((r) => r.url === `${COMPLETIONS_URL}/plates`);
      tick(1);
      const search = platesRequest();

      expect(search.request.params.get('q')).toBe('PLA00');
      search.flush(completionPlatesBody([completionPlateDto(1)], { total_plates: { value: 1, capped: false } }));
      fixture.detectChanges();
      expect(qa('[data-testid="bulk-row"]').length).toBe(1);
      type('[data-testid="bulk-search"]', 'ZZZ');
      tick(300);
      platesRequest().flush(completionPlatesBody([], { total_plates: { value: 0, capped: false } }));
      fixture.detectChanges();

      expect(text('[data-testid="bulk-empty"]')).toBe('Ninguna placa con viajes sin rendimiento empieza por «ZZZ».');
      expect(q('[data-testid="bulk-add-input"]')).toBeNull();  // la búsqueda reemplaza el «Agregar otra placa» escrito a mano
      flush();
    }));

    it('flujo completo: valores → revisión con los conteos del servidor → «Aplicar a 301 viajes» → resultado; la lista actual se recarga', fakeAsync(() => {
      init(rows(), ['ORG_ANALYST'], { view: 'pending' });
      openBulk();
      type('[data-testid="bulk-value-PLA001"]', '9,5');
      type('[data-testid="bulk-unit-PLA001"]', 'km/gal', 'change');
      click('[data-testid="bulk-review"]');
      const review = http.expectOne(`${COMPLETIONS_URL}/preview`);

      expect(review.request.body.items).toEqual([{ plate: 'PLA001', efficiency_value: '9,5', efficiency_unit: 'km/gal' }]);
      review.flush({ data: bulkPreviewDto(), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="bulk-summary"] b')).toBe('301 viajes de 2 placas: 280 se calcularán y 21 seguirán pendientes');
      expect(text('[data-testid="bulk-summary"]')).toContain('3 viajes quedarán retenidos');
      expect(text('[data-testid="bulk-summary"]')).toContain('12.345,678 kg CO₂');
      expect(qa('[data-testid="bulk-preview-row"]').length).toBe(2);
      expect(text('[data-testid="bulk-apply"]')).toBe('Aplicar a 301 viajes');
      click('[data-testid="bulk-apply"]');
      http.expectOne(`${COMPLETIONS_URL}/apply`).flush({ data: bulkApplyDto(), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="bulk-result"]')).toContain('301 viajes completados');
      expect(text('[data-testid="bulk-live"]')).toContain('301 viajes completados');
      const list = http.expectOne((r) => r.url === OPERATIONS_URL && r.method === 'GET');

      expect(list.request.params.get('view')).toBe('pending');
      list.flush(operationsPageBody([], { total: capped(0) }));
      summary().flush({ data: tabCountsDto(), meta: {} });
      flush();
    }));

    it('con la vista previa vencida pide revisar de nuevo (no reintenta solo) y con muchas placas resume «y N más» sin scroll', fakeAsync(() => {
      init(rows(), ['ORG_ANALYST'], { view: 'pending' });
      openBulk();
      type('[data-testid="bulk-value-PLA001"]', '9');
      type('[data-testid="bulk-unit-PLA001"]', 'km/gal', 'change');
      click('[data-testid="bulk-review"]');
      http.expectOne(`${COMPLETIONS_URL}/preview`).flush({ data: bulkPreviewDto({ per_plate: Array.from({ length: 9 }, (_, i) => ({ plate: `PL${i}`, affected: 1, would_calculate: 1, would_remain_pending: 0, held: 0, skipped_incompatible: 0 })) }), meta: {} });
      fixture.detectChanges();
      expect(qa('[data-testid="bulk-preview-row"]').length).toBe(6);
      expect(text('[data-testid="bulk-more"]')).toBe('y 3 más');
      click('[data-testid="bulk-apply"]');
      http.expectOne(`${COMPLETIONS_URL}/apply`).flush({ error: { code: 'COMPLETION_TOKEN_EXPIRED' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="bulk-error"]')).toContain('La revisión venció');
      expect(q('[data-testid="bulk-apply"]')).toBeNull();
      click('[data-testid="bulk-rereview"]');
      expect(q('[data-testid="bulk-review"]')).not.toBeNull();
      expect((q('[data-testid="bulk-value-PLA001"]') as HTMLInputElement).value).toBe('9');
      flush();
    }));

    it('Escape cierra el diálogo y devuelve el foco al botón', fakeAsync(() => {
      init(rows(), ['ORG_ANALYST'], { view: 'pending' });
      openBulk();
      tick();
      q('[data-testid="bulk-panel"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(q('[data-testid="bulk-panel"]')).toBeNull();
      expect(document.activeElement).toBe(q('[data-testid="bulk-open"]'));
      flush();
    }));
  });

  describe('presentación', () => {
    it('el CSS de «Completar datos» y de «Completar por vehículo» usa solo tokens, tintes 14/20/40/60/80 y no crea scroll interno', () => {
      init([pendingRow(1)], ['ORG_ANALYST'], { view: 'pending' });
      openDetail();
      openForm();
      click('[data-testid="bulk-open"]');
      platesRequest();
      const css = [componentCss('.cf {'), componentCss('.trigger { min-height: 34px'), componentCss('.guide {')].join('\n');

      expect(css).toContain('.cf');
      expect(css).toContain('.panel');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      // Escritorio: ningún overflow auto/scroll. La excepción es el teléfono (< 720 px): el cuerpo se desplaza y el pie queda fijo, como en el diálogo de registro.
      const at = css.indexOf('@media (max-width: 719px)');

      expect(at).toBeGreaterThan(0);
      expect(css.slice(0, at)).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
      expect(css.slice(at)).toMatch(/\.bd \{[^}]*overflow-y: auto/);
      expect(css.slice(at)).toMatch(/\.head, \.ft \{ flex: none; \}/);
      expect(css.slice(at)).toMatch(/max-height: 100dvh/);

      for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });

    it('con el formulario y con el diálogo abiertos ningún elemento es desplazable ni recorta su contenido', fakeAsync(() => {
      init(Array.from({ length: 8 }, (_, i) => pendingRow(i + 1)), ['ORG_ANALYST'], { view: 'pending' });
      document.body.appendChild(el());
      openDetail();
      openForm();
      tick();
      const scrollable = (): string[] =>
        qa('*')
          .filter((node) => {
            const style = getComputedStyle(node);

            if (node.classList.contains('sr-only') || node.closest('thead')) return false;

            return ['auto', 'scroll'].includes(style.overflowY) || (style.overflowY !== 'visible' && node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0);
          })
          .map((n) => n.className || n.tagName);

      expect(scrollable()).toEqual([]);
      click('[data-testid="completion-cancel"]');
      tick();
      openBulk();
      expect(scrollable()).toEqual([]);
      el().remove();
      flush();
    }));
  });
});
