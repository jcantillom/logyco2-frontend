import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { MANUAL_URLS, manualOptionsDto, manualPlaceDto, manualTripOutDto, manualVehicleDto, repeatedDataDto, routeDto } from '../../../testing/manual-trips';
import { OPERATIONS_URL, operationsPageBody, tabCountsDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { TripRegistrationComponent } from './trip-registration.component';
import { TripRegistrationFacade } from './trip-registration.facade';

const componentCss = (marker: string): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '))
    .filter((c) => c.includes(marker))
    .join('\n');

describe('TripRegistrationComponent', () => {
  let fixture: ComponentFixture<TripRegistrationComponent>;
  let http: HttpTestingController;
  let facade: TripRegistrationFacade;
  let closed: number;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const type = (selector: string, value: string, event = 'input'): void => {
    const field = q<HTMLInputElement | HTMLSelectElement>(selector)!;

    field.value = value;
    field.dispatchEvent(new Event(event));
    fixture.detectChanges();
  };
  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };
  const key = (selector: string, init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

    q(selector)!.dispatchEvent(event);
    fixture.detectChanges();

    return event;
  };

  function render(roles: string[] = ['ORG_ANALYST']): void {
    TestBed.configureTestingModule({ imports: [TripRegistrationComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(TripRegistrationFacade);
    closed = 0;
    facade.show();
    fixture = TestBed.createComponent(TripRegistrationComponent);
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
    fixture.detectChanges();
  }

  /** Elige vehículo con el teclado/ratón como lo haría la persona. */
  function chooseVehicle(dto = manualVehicleDto()): void {
    type('#reg-vehicle', dto.plate.slice(0, 3));
    tick(250);
    http.expectOne((r) => r.url === MANUAL_URLS.vehicles).flush({ data: [dto], meta: {} });
    fixture.detectChanges();
    q('[data-testid="combo-option"]')!.click();
    fixture.detectChanges();
  }

  function choosePlace(selector: string, dto = manualPlaceDto()): void {
    type(selector, dto.municipality.slice(0, 3));
    tick(250);
    http.expectOne((r) => r.url === MANUAL_URLS.places).flush({ data: [dto], meta: {} });
    fixture.detectChanges();
    q('[data-testid="combo-option"]')!.click();
    fixture.detectChanges();
  }

  const bogota = manualPlaceDto({ code: '11001', municipality: 'Bogotá D.C.', department: 'Bogotá D.C.', label: 'Bogotá D.C., Bogotá D.C.' });

  /** Formulario completo hasta la distancia por ruta resuelta. */
  function filled(): void {
    chooseVehicle();
    choosePlace('#reg-origin');
    choosePlace('#reg-destination', bogota);
    http.match((r) => r.url === MANUAL_URLS.route).at(-1)!.flush({ data: routeDto(), meta: {} });
    type('#reg-date', '2026-11-24');
  }

  afterEach(() => {
    if (http) http.verify();
  });

  describe('formulario', () => {
    it('es breve: solo fecha, vehículo, origen y destino, el modo de energía con SUS entradas y carga; foco en la fecha al abrir', fakeAsync(() => {
      render();
      tick();
      fixture.detectChanges();

      expect(qa('input, select').map((n) => n.id).filter(Boolean)).toEqual(['reg-date', 'reg-vehicle', 'reg-origin', 'reg-destination', 'reg-value', 'reg-unit', 'reg-cargo']);
      expect(document.activeElement?.id).toBe('reg-date');
      expect(q<HTMLInputElement>('#reg-date')!.value).toBe('');
      expect(q<HTMLInputElement>('#reg-date')!.max).toBe('2026-11-25');
      expect(q<HTMLInputElement>('#reg-date')!.min).toBe('2000-01-01');
      expect(q('#reg-fuel')).toBeNull();
      expect(q('#reg-distance')).toBeNull();
      expect(text('[data-testid="reg-route-idle"]')).toContain('se calcula al elegir origen y destino');
    }));

    it('«Consumo real» muestra consumo y las unidades de consumo; «Rendimiento estimado» muestra rendimiento y sus unidades; ninguno viene con valor', fakeAsync(() => {
      render();
      chooseVehicle();

      expect(text('label[for="reg-value"]')).toBe('Consumo');
      expect(qa('#reg-unit option').map((o) => o.textContent?.trim())).toEqual(['Elegir', 'Galones (gal)', 'Litros (l)']);
      expect(q<HTMLInputElement>('#reg-value')!.value).toBe('');
      expect(q('[data-testid="reg-last-efficiency"]')).toBeNull();

      click('[data-testid="reg-mode-estimated"]');

      expect(text('label[for="reg-value"]')).toBe('Rendimiento');
      expect(qa('#reg-unit option').map((o) => o.textContent?.trim())).toEqual(['Elegir', 'km/gal', 'km/l']);
      expect(q<HTMLInputElement>('#reg-value')!.value).toBe('');
      flush();
    }));

    it('«Usar último rendimiento» es un botón explícito con el valor y la fecha del servidor: no rellena nada hasta pulsarlo y entonces el valor queda visible', fakeAsync(() => {
      render();
      chooseVehicle();
      click('[data-testid="reg-mode-estimated"]');
      const button = q<HTMLButtonElement>('[data-testid="reg-last-efficiency"]')!;

      expect(button.textContent?.trim()).toBe('Usar último rendimiento (8,5 km/gal, 12/11)');
      expect(q<HTMLInputElement>('#reg-value')!.value).toBe('');

      button.click();
      fixture.detectChanges();

      expect(q<HTMLInputElement>('#reg-value')!.value).toBe('8.5');
      expect(q<HTMLSelectElement>('#reg-unit')!.value).toBe('km/gal');
      expect(text('[data-testid="reg-live"]')).toContain('último viaje');
      flush();
    }));

    it('«Usar rendimiento del vehículo» es el PRIMER botón explícito (antes del último rendimiento): no rellena nada hasta pulsarlo y entonces el valor queda visible', fakeAsync(() => {
      render();
      chooseVehicle(manualVehicleDto({ vehicle_efficiency: { value: '6.9000', unit: 'km/gal', origin: 'DECLARED', basis: 'THEORETICAL', declared_at: '2026-11-20T15:00:00Z' } }));

      expect(q('[data-testid="reg-vehicle-efficiency"]')).toBeNull();

      click('[data-testid="reg-mode-estimated"]');
      const buttons = qa('button.link').map((b) => b.getAttribute('data-testid'));
      const own = q<HTMLButtonElement>('[data-testid="reg-vehicle-efficiency"]')!;

      expect(buttons).toEqual(['reg-vehicle-efficiency', 'reg-last-efficiency']);
      expect(own.textContent?.trim()).toBe('Usar rendimiento del vehículo (6,9 km/gal · Declarado)');
      expect(q<HTMLInputElement>('#reg-value')!.value).toBe('');
      expect(text('#reg-energy-hint')).toBe('Si lo dejas vacío, se usa el rendimiento del vehículo si es compatible.');

      own.click();
      fixture.detectChanges();

      expect(q<HTMLInputElement>('#reg-value')!.value).toBe('6.9');
      expect(q<HTMLSelectElement>('#reg-unit')!.value).toBe('km/gal');
      expect(text('[data-testid="reg-live"]')).toContain('rendimiento del vehículo');
      flush();
    }));

    it('un vehículo medido se rotula «Medido» y uno sin registro no ofrece el botón', fakeAsync(() => {
      render();
      chooseVehicle(manualVehicleDto({ vehicle_efficiency: { value: '7.2500', unit: 'km/l', origin: 'MEASURED', basis: 'REAL', declared_at: '2026-11-20T15:00:00Z' } }));
      click('[data-testid="reg-mode-estimated"]');

      expect(q('[data-testid="reg-vehicle-efficiency"]')!.textContent?.trim()).toBe('Usar rendimiento del vehículo (7,25 km/l · Medido)');

      chooseVehicle(manualVehicleDto({ plate: 'XYZ987' }));

      expect(q('[data-testid="reg-vehicle-efficiency"]')).toBeNull();
      expect(text('#reg-energy-hint')).toBe('Si lo dejas vacío, el viaje queda por completar.');
      flush();
    }));

    it('los campos de energía están deshabilitados hasta elegir el vehículo; la ayuda dice por qué y qué pasa si se dejan vacíos', fakeAsync(() => {
      render();

      expect(q<HTMLInputElement>('#reg-value')!.disabled).toBeTrue();
      expect(text('#reg-energy-hint')).toBe('Elige primero el vehículo.');

      chooseVehicle();

      expect(q<HTMLInputElement>('#reg-value')!.disabled).toBeFalse();
      expect(text('#reg-energy-hint')).toBe('Si lo dejas vacío, el viaje queda por completar.');
      flush();
    }));

    it('un vehículo sin combustible muestra el selector de combustible; uno con combustible no; un combustible sin factor avisa en línea', fakeAsync(() => {
      render();
      chooseVehicle(manualVehicleDto({ plate: 'NOF123', fuel_type: null, fuel_label: null, last_efficiency: null }));

      expect(q('#reg-fuel')).not.toBeNull();
      expect(text('#reg-fuel-hint')).toContain('no tiene combustible registrado');
      expect(q<HTMLInputElement>('#reg-value')!.disabled).toBeTrue();

      type('#reg-fuel', 'ELECTRIC', 'change');

      expect(q<HTMLInputElement>('#reg-value')!.disabled).toBeFalse();
      expect(text('[data-testid="reg-no-factor"]')).toBe('Sin factor de emisión verificado: el viaje quedará sin calcular.');
      flush();
    }));

    it('el vehículo elegido muestra su configuración y combustible de solo lectura, y un vehículo inactivo lleva su marca', fakeAsync(() => {
      render();
      chooseVehicle(manualVehicleDto({ status: 'INACTIVE' }));

      expect(text('[data-testid="reg-vehicle-info"]')).toBe('C3S3 Diésel Inactivo');
      flush();
    }));

    it('origen y destino: tras elegir ambos pide la ruta, muestra «Calculando distancia…» y luego «Distancia por ruta: 412,3 km» sin campo de distancia', fakeAsync(() => {
      render();
      chooseVehicle();
      choosePlace('#reg-origin');
      choosePlace('#reg-destination', bogota);

      expect(text('[data-testid="reg-route-loading"]')).toBe('Calculando distancia…');
      http.expectOne((r) => r.url === MANUAL_URLS.route).flush({ data: routeDto(), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="reg-route-ready"]')).toContain('Distancia por ruta: 412,3 km');
      expect(q('#reg-distance')).toBeNull();

      click('[data-testid="reg-distance-edit"]');

      expect(q('#reg-distance')).not.toBeNull();
      expect(text('[data-testid="reg-distance-route"]')).toBe('Usar la distancia por ruta (412,3 km)');
      flush();
    }));

    it('sin ruta disponible aparece solo el campo «Distancia (km)» con su explicación; el resultado de buscar municipios muestra «Municipio, Departamento»', fakeAsync(() => {
      render();
      chooseVehicle();
      type('#reg-origin', 'med');
      tick(250);
      http.expectOne((r) => r.url === MANUAL_URLS.places).flush({ data: [manualPlaceDto()], meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="combo-option"]')).toBe('Medellín, Antioquia');
      q('[data-testid="combo-option"]')!.click();
      choosePlace('#reg-destination', bogota);
      http.expectOne((r) => r.url === MANUAL_URLS.route).flush({ data: routeDto({ available: false, distance_km: null, source: null, reason: 'NO_ROUTE' }), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="reg-route-unavailable"]')).toContain('No hay una distancia por ruta');
      expect(q('#reg-distance')).not.toBeNull();
      flush();
    }));

    it('«⇄» intercambia origen y destino', fakeAsync(() => {
      render();
      chooseVehicle();
      choosePlace('#reg-origin');
      choosePlace('#reg-destination', bogota);
      http.expectOne((r) => r.url === MANUAL_URLS.route).flush({ data: routeDto(), meta: {} });

      click('[data-testid="reg-swap"]');

      expect(q<HTMLInputElement>('#reg-origin')!.value).toBe('Bogotá D.C., Bogotá D.C.');
      expect(q<HTMLInputElement>('#reg-destination')!.value).toBe('Medellín, Antioquia');
      http.expectOne((r) => r.url === MANUAL_URLS.route).flush({ data: routeDto(), meta: {} });
      flush();
    }));

    it('guardar vacío marca los campos obligatorios con aria-invalid y aria-describedby al mensaje, y el foco va al primero', fakeAsync(() => {
      render();

      click('[data-testid="reg-save"]');
      tick();
      fixture.detectChanges();

      for (const [id, error] of [['reg-date', 'reg-date-err'], ['reg-vehicle', 'reg-vehicle-err'], ['reg-origin', 'reg-origin-err'], ['reg-destination', 'reg-destination-err']]) {
        expect(q(`#${id}`)!.getAttribute('aria-invalid')).withContext(id).toBe('true');
        expect(q(`#${id}`)!.getAttribute('aria-describedby')).withContext(id).toBe(error);
        expect(q(`#${error}`)).withContext(error).not.toBeNull();
      }

      expect(document.activeElement?.id).toBe('reg-date');
      expect(text('[data-testid="reg-live"]')).toContain('Revisa los campos');
      http.expectNone(MANUAL_URLS.register);
    }));

    it('los errores del servidor por campo se muestran bajo cada campo; COMPANY_BUSY conserva lo escrito y deja reintentar', fakeAsync(() => {
      render();
      filled();
      type('#reg-value', '0');
      type('#reg-unit', 'gal', 'change');

      click('[data-testid="reg-save"]');
      http.expectOne(MANUAL_URLS.register).flush({ error: { code: 'INVALID_FIELD_VALUE', details: [{ field: 'consumption', type: 'number', message: 'Debe ser mayor que 0' }] } }, { status: 422, statusText: 'Unprocessable' });
      fixture.detectChanges();

      expect(text('[data-testid="reg-error-value"]')).toBe('Debe ser mayor que 0');
      expect(q('#reg-value')!.getAttribute('aria-invalid')).toBe('true');

      type('#reg-value', '40');
      click('[data-testid="reg-save"]');
      http.expectOne(MANUAL_URLS.register).flush({ error: { code: 'COMPANY_BUSY' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="reg-error"]')).toContain('carga procesándose');
      expect(q<HTMLInputElement>('#reg-value')!.value).toBe('40');
      expect(q<HTMLInputElement>('#reg-date')!.value).toBe('2026-11-24');
      expect(q<HTMLButtonElement>('[data-testid="reg-save"]')!.disabled).toBeFalse();
      flush();
    }));
  });

  describe('teclado', () => {
    it('el formulario se envía con Enter (evento submit) y Alt+Enter guarda y registra otro; el botón queda ocupado mientras guarda', fakeAsync(() => {
      render();
      filled();

      q<HTMLFormElement>('[data-testid="reg-form"]')!.dispatchEvent(new Event('submit', { cancelable: true }));
      fixture.detectChanges();
      const first = http.expectOne(MANUAL_URLS.register);

      expect(q('[data-testid="reg-save"]')!.getAttribute('aria-busy')).toBe('true');
      expect(q<HTMLButtonElement>('[data-testid="reg-save"]')!.disabled).toBeTrue();
      first.flush({ data: manualTripOutDto() }, { status: 201, statusText: 'Created' });
      http.match((r) => r.url === OPERATIONS_URL).forEach((r) => r.flush(operationsPageBody([])));
      http.match(`${OPERATIONS_URL}/summary`).forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));
      fixture.detectChanges();
      click('[data-testid="reg-another"]');
      type('#reg-date', '2026-11-25');

      const event = key('#reg-date', { key: 'Enter', altKey: true });

      expect(event.defaultPrevented).toBeTrue();
      http.expectOne(MANUAL_URLS.register).flush({ data: manualTripOutDto() }, { status: 201, statusText: 'Created' });
      http.match((r) => r.url === OPERATIONS_URL).forEach((r) => r.flush(operationsPageBody([])));
      http.match(`${OPERATIONS_URL}/summary`).forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));
      fixture.detectChanges();

      expect(text('[data-testid="reg-last-saved"]')).toContain('Guardado.');
      flush();
    }));

    it('el combobox funciona con teclado: flechas mueven, Enter elige, Escape cierra solo la lista y no el diálogo', fakeAsync(() => {
      render();
      type('#reg-vehicle', 'AB');
      tick(250);
      http.expectOne((r) => r.url === MANUAL_URLS.vehicles).flush({ data: [manualVehicleDto(), manualVehicleDto({ plate: 'ABD456' })], meta: {} });
      fixture.detectChanges();
      const input = q('#reg-vehicle')!;

      expect(input.getAttribute('role')).toBe('combobox');
      expect(input.getAttribute('aria-expanded')).toBe('true');
      expect(q('[role="listbox"]')).not.toBeNull();
      expect(qa('[role="option"]').length).toBe(2);
      expect(input.getAttribute('aria-activedescendant')).toBe(qa('[role="option"]')[0].id);

      key('#reg-vehicle', { key: 'ArrowDown' });

      expect(input.getAttribute('aria-activedescendant')).toBe(qa('[role="option"]')[1].id);
      expect(qa('[role="option"]')[1].getAttribute('aria-selected')).toBe('true');

      const escape = key('#reg-vehicle', { key: 'Escape' });

      expect(escape.defaultPrevented).toBeTrue();
      expect(input.getAttribute('aria-expanded')).toBe('false');

      key('#reg-vehicle', { key: 'ArrowDown' });
      key('#reg-vehicle', { key: 'Enter' });

      // La opción activa seguía siendo la segunda al reabrir la lista.
      expect(facade.vehicle()?.plate).toBe('ABD456');
      expect(q<HTMLInputElement>('#reg-vehicle')!.value).toBe('ABD456');
      expect(q('[role="listbox"]')).toBeNull();
      expect(closed).toBe(0);
      flush();
    }));

    it('con la lista cerrada, Enter en el combobox no se intercepta: llega al formulario', fakeAsync(() => {
      render();

      const event = key('#reg-vehicle', { key: 'Enter' });

      expect(event.defaultPrevented).toBeFalse();
      flush();
    }));

    it('Escape (cancel) cierra el diálogo si no hay nada escrito', fakeAsync(() => {
      render();

      q('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
      fixture.detectChanges();

      expect(closed).toBe(1);
      flush();
    }));

    it('con algo escrito, Escape pide confirmar: «Seguir editando» conserva lo escrito y «Descartar» cierra; el fondo oscurecido se comporta igual', fakeAsync(() => {
      render();
      type('#reg-date', '2026-11-24');

      q('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
      fixture.detectChanges();
      tick();

      expect(closed).toBe(0);
      expect(text('[data-testid="reg-discard-ask"]')).toBe('¿Descartar lo que escribiste?');
      expect(document.activeElement?.getAttribute('data-testid')).toBe('reg-keep');

      q('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
      fixture.detectChanges();

      expect(q('[data-testid="reg-discard-ask"]')).toBeNull();
      expect(q<HTMLInputElement>('#reg-date')!.value).toBe('2026-11-24');

      click('[data-testid="reg-close"]');
      click('[data-testid="reg-discard"]');

      expect(closed).toBe(1);
      flush();
    }));

    it('no se puede cerrar mientras se guarda', fakeAsync(() => {
      render();
      filled();
      click('[data-testid="reg-save"]');

      click('[data-testid="reg-close"]');
      q('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));

      expect(closed).toBe(0);
      http.expectOne(MANUAL_URLS.register).flush({ data: manualTripOutDto() }, { status: 201, statusText: 'Created' });
      http.match((r) => r.url === OPERATIONS_URL).forEach((r) => r.flush(operationsPageBody([])));
      http.match(`${OPERATIONS_URL}/summary`).forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));
      flush();
    }));
  });

  describe('accesibilidad', () => {
    it('es un diálogo modal nombrado, con grupos con título, los campos con su etiqueta y una región aria-live educada', fakeAsync(() => {
      render();
      tick();
      const dialog = q<HTMLDialogElement>('dialog')!;

      expect(dialog.open).toBeTrue();
      expect(dialog.getAttribute('aria-labelledby')).toBe('reg-title');
      expect(text('#reg-title')).toBe('Registrar viaje');
      expect(qa('section[aria-labelledby]').map((s) => s.getAttribute('aria-labelledby'))).toEqual(['reg-trip-h', 'reg-energy-h']);

      for (const id of ['reg-date', 'reg-vehicle', 'reg-origin', 'reg-destination', 'reg-value', 'reg-unit', 'reg-cargo']) expect(q(`label[for="${id}"]`)).withContext(id).not.toBeNull();

      expect(q('fieldset[data-testid="reg-mode"] legend')!.textContent).toContain('Cómo registras la energía');
      expect(q('[data-testid="reg-live"]')!.getAttribute('aria-live')).toBe('polite');
      expect(q('[data-testid="reg-swap"]')!.getAttribute('aria-label')).toBe('Intercambiar origen y destino');
      flush();
    }));

    it('el orden de Tab sigue el orden visual: fecha, vehículo, origen, intercambiar, destino, modo, valor, unidad, carga, botones', fakeAsync(() => {
      render();
      tick();
      const order = qa('input:not([type="radio"]), select, button, input[type="radio"]').map((n) => n.id || n.getAttribute('data-testid'));

      expect(order.indexOf('reg-date')).toBeLessThan(order.indexOf('reg-vehicle'));
      expect(order.indexOf('reg-vehicle')).toBeLessThan(order.indexOf('reg-origin'));
      expect(order.indexOf('reg-origin')).toBeLessThan(order.indexOf('reg-swap'));
      expect(order.indexOf('reg-swap')).toBeLessThan(order.indexOf('reg-destination'));
      expect(order.indexOf('reg-destination')).toBeLessThan(order.indexOf('reg-mode-real'));
      expect(order.indexOf('reg-mode-estimated')).toBeLessThan(order.indexOf('reg-value'));
      expect(order.indexOf('reg-cargo')).toBeLessThan(order.indexOf('reg-save'));
      expect(qa('[tabindex]:not([tabindex="-1"])').length).toBe(0);
      flush();
    }));

    it('el selector de energía es un grupo de radios nativos (flechas del teclado) y muestra el activo', fakeAsync(() => {
      render();

      expect(qa<HTMLInputElement>('fieldset[data-testid="reg-mode"] input[type="radio"]').map((r) => [r.value, r.checked])).toEqual([['REAL', true], ['ESTIMATED', false]]);
      flush();
    }));
  });

  describe('resultado', () => {
    function save(out = manualTripOutDto()): void {
      filled();
      click('[data-testid="reg-save"]');
      http.expectOne(MANUAL_URLS.register).flush({ data: out }, { status: 201, statusText: 'Created' });
      http.match((r) => r.url === OPERATIONS_URL).forEach((r) => r.flush(operationsPageBody([])));
      http.match(`${OPERATIONS_URL}/summary`).forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));
      fixture.detectChanges();
    }

    it('un viaje calculado muestra «Emisiones del viaje: X kg CO₂» y el método tal como los devolvió el servidor, y lo anuncia con aria-live', fakeAsync(() => {
      render();
      save();
      tick();

      expect(text('[data-testid="reg-result"]')).toBe('Emisiones del viaje: 128,4 kg CO₂');
      expect(text('[data-testid="reg-method"]')).toBe('Método: Estimado');
      expect(text('[data-testid="reg-live"]')).toBe('Viaje registrado. Emisiones del viaje: 128,4 kg CO₂');
      expect(q('[data-testid="reg-complete"]')).toBeNull();
      expect(document.activeElement?.id).toBe('reg-saved-title');
      flush();
    }));

    it('un viaje por completar muestra el motivo y «Completar datos», que lleva al flujo de la Etapa 1 con el id del viaje', fakeAsync(() => {
      render();
      const completed: string[] = [];

      fixture.componentInstance.complete.subscribe((id) => completed.push(id));
      save(manualTripOutDto({ result: { status: 'PENDING', reason: 'MISSING_DISTANCE_WITH_ROUTE', reason_label: 'Falta la distancia', method_label: null, kg_co2: null, counted: false, counted_note: null, completable: true, missing_fields: ['distance_km'] } }));

      expect(text('[data-testid="reg-result"]')).toBe('Por completar: Falta la distancia');

      click('[data-testid="reg-complete"]');

      expect(completed).toEqual(['trip-m1']);
      flush();
    }));

    it('un viaje retenido muestra la nota del servidor con el enlace a Calidad de datos; un reenvío idempotente lo dice', fakeAsync(() => {
      render();
      save(manualTripOutDto({ created: false, result: { status: 'CALCULATED', reason: null, reason_label: null, method_label: 'Estimado', kg_co2: '10.0000', counted: false, counted_note: 'Queda retenido como posible duplicado: no suma hasta que lo resuelvas', completable: false, missing_fields: [] } }));

      expect(text('[data-testid="reg-note"]')).toContain('Queda retenido como posible duplicado');
      expect(q('[data-testid="reg-quality-link"]')!.getAttribute('href')).toBe('/calidad');
      expect(text('[data-testid="reg-replay"]')).toContain('no se creó uno nuevo');
      expect(text('#reg-saved-title')).toBe('Este viaje ya estaba registrado');
      flush();
    }));

    it('«Registrar otro viaje» vuelve al formulario con vehículo y ruta y sin fecha ni energía; «Listo» cierra; «Ver el viaje» abre su detalle', fakeAsync(() => {
      render();
      const opened: string[] = [];

      fixture.componentInstance.detail.subscribe((id) => opened.push(id));
      save();

      click('[data-testid="reg-detail"]');

      expect(opened).toEqual(['trip-m1']);

      click('[data-testid="reg-another"]');
      tick();

      expect(q<HTMLInputElement>('#reg-vehicle')!.value).toBe('ABC123');
      expect(q<HTMLInputElement>('#reg-origin')!.value).toBe('Medellín, Antioquia');
      expect(q<HTMLInputElement>('#reg-date')!.value).toBe('');
      expect(document.activeElement?.id).toBe('reg-date');

      flush();
    }));

    it('«Listo» cierra el diálogo', fakeAsync(() => {
      render();
      save();

      click('[data-testid="reg-done"]');

      expect(closed).toBe(1);
      flush();
    }));
  });

  describe('viaje repetido', () => {
    function repeated(candidates = repeatedDataDto()): void {
      filled();
      click('[data-testid="reg-save"]');
      http.expectOne(MANUAL_URLS.register).flush({ error: { code: 'MANUAL_TRIP_REPEATED' }, data: candidates }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
    }

    it('muestra el nuevo junto a los existentes (fecha, placa, ruta, estado, origen, kg) y las acciones «Revisar el existente» y «Es otro viaje distinto»', fakeAsync(() => {
      render();
      repeated();
      tick();

      const rows = qa('[data-testid="reg-compare"] tbody tr').map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim()));

      expect(rows[0]).toEqual(['Nuevo', '24/11/2026', 'ABC123', 'Medellín, Antioquia → Bogotá D.C., Bogotá D.C.', '—', 'Manual', '—', '']);
      expect(rows[1]).toEqual(['M-000099', '20/11/2026', 'ABC123', 'Medellín, Antioquia → Bogotá D.C., Bogotá D.C.', 'Calculado', 'Manual', '100', '']);
      expect(text('[data-testid="reg-review"]')).toBe('Revisar el existente');
      expect(text('[data-testid="reg-distinct"]')).toBe('Es otro viaje distinto');
      expect(document.activeElement?.id).toBe('reg-repeated-title');
      expect(text('[data-testid="reg-live"]')).toContain('Ya hay un viaje parecido');
      flush();
    }));

    it('«Revisar el existente» abre el detalle del candidato; «Es otro viaje distinto» reenvía confirm_distinct', fakeAsync(() => {
      render();
      const reviewed: string[] = [];

      fixture.componentInstance.review.subscribe((id) => reviewed.push(id));
      repeated();

      click('[data-testid="reg-review"]');

      expect(reviewed).toEqual(['trip-9']);

      click('[data-testid="reg-distinct"]');
      const request = http.expectOne(MANUAL_URLS.register);

      expect((request.request.body as Record<string, unknown>)['confirm_distinct']).toBeTrue();
      request.flush({ data: manualTripOutDto() }, { status: 201, statusText: 'Created' });
      http.match((r) => r.url === OPERATIONS_URL).forEach((r) => r.flush(operationsPageBody([])));
      http.match(`${OPERATIONS_URL}/summary`).forEach((r) => r.flush({ data: tabCountsDto(), meta: {} }));
      flush();
    }));

    it('con varios existentes cada fila trae su «Revisar»', fakeAsync(() => {
      render();
      const first = repeatedDataDto().candidates[0];

      repeated({ candidates: [first, { ...first, id: 'trip-10', trip_id: 'F-1', source: 'FILE' }] });

      expect(qa('[data-testid="reg-review-row"]').length).toBe(2);
      expect(q('[data-testid="reg-review"]')).toBeNull();
      flush();
    }));
  });

  describe('estados', () => {
    it('mientras llegan las opciones muestra un esqueleto; si fallan, el error con «Reintentar»', fakeAsync(() => {
      TestBed.configureTestingModule({ imports: [TripRegistrationComponent], providers: provideTestApp() });
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ANALYST'])] }), TestBed.inject(SessionStore));
      http = TestBed.inject(HttpTestingController);
      facade = TestBed.inject(TripRegistrationFacade);
      facade.show();
      fixture = TestBed.createComponent(TripRegistrationComponent);
      fixture.detectChanges();

      expect(q('[data-testid="reg-loading"]')).not.toBeNull();
      http.expectOne(MANUAL_URLS.options).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Error' });
      fixture.detectChanges();

      expect(q('[data-testid="reg-options-error"]')).not.toBeNull();
      click('[data-testid="reg-options-retry"]');
      http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
      fixture.detectChanges();

      expect(q('[data-testid="reg-form"]')).not.toBeNull();
      flush();
    }));
  });

  describe('presentación', () => {
    it('el CSS usa solo tokens (sin hexadecimales ni rgb()), tintes 14/20/40/60/80 y ningún scroll interno', fakeAsync(() => {
      render();
      const css = [componentCss('dialog.reg'), componentCss('.list { position: absolute')].join('\n');

      expect(css).toContain('dialog.reg');
      expect(css).toContain('.opt');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      // Escritorio (≥ 720 px): ningún overflow auto/scroll. La única excepción es el teléfono (< 720 px): el cuerpo se desplaza y el pie queda fijo.
      const at = css.indexOf('@media (max-width: 719px)');
      const desktop = css.slice(0, at);
      const phone = css.slice(at, css.indexOf('@media (prefers-reduced-motion'));

      expect(at).toBeGreaterThan(0);
      expect(desktop).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
      expect(phone).toMatch(/\.bd, \.done \{[^}]*overflow-y: auto/);
      expect(phone).toMatch(/dialog\.reg\[open\] \{ display: flex; flex-direction: column; \}/);
      expect(phone).toMatch(/\.rh, \.ft \{ flex: none; \}/);
      expect(phone).toMatch(/max-height: 100dvh/);

      const tints = Array.from(css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g));

      expect(tints.length).toBeGreaterThan(0);
      for (const m of tints) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
      flush();
    }));

    it('el diálogo cabe en 1280×800 sin scroll: su contenido mide menos que el alto de la ventana, sin overflow propio y en dos columnas', fakeAsync(() => {
      render();
      tick();
      document.body.appendChild(el());
      const dialog = q<HTMLDialogElement>('dialog')!;
      const box = dialog.getBoundingClientRect();
      const columns = qa('section.col').map((c) => c.getBoundingClientRect());

      expect(getComputedStyle(dialog).overflow).toBe('visible');
      // El iframe de Karma es más bajo que 800 px: se mide el alto del contenido, que es lo que decide si cabe en 800.
      expect(dialog.scrollHeight).toBeLessThanOrEqual(560);
      expect(box.width).toBeLessThanOrEqual(780);

      if (window.innerWidth >= 720) expect(columns[0].top).toBe(columns[1].top);

      for (const node of qa('*')) {
        const style = getComputedStyle(node);

        expect(style.overflowY === 'auto' || style.overflowY === 'scroll').withContext(node.tagName + '.' + node.className).toBeFalse();
      }

      document.body.removeChild(el());
      flush();
    }));
  });
});
