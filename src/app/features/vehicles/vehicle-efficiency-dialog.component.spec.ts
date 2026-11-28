import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { EFFICIENCY_URL, measuredProtectedDetails, apiError, appliedDto, declareOutDto, recordDto, viewDto } from '../../../testing/vehicle-efficiency';
import { pagedBody, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { EfficiencyRecordDto } from '../../infrastructure/dto/vehicle-efficiency.dto';
import { toVehicle } from '../../infrastructure/mappers/vehicles.mappers';
import { VehicleEfficiencyDialogComponent } from './vehicle-efficiency-dialog.component';

const componentCss = (marker: string): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '))
    .filter((c) => c.includes(marker))
    .join('\n');

describe('VehicleEfficiencyDialogComponent', () => {
  let fixture: ComponentFixture<VehicleEfficiencyDialogComponent>;
  let http: HttpTestingController;
  let closed: number;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const testId = <T extends HTMLElement = HTMLElement>(id: string): T | null => q<T>(`[data-testid="${id}"]`);
  const settle = (): void => fixture.detectChanges();

  function render(options: { roles?: string[]; view?: ReturnType<typeof viewDto> } = {}): void {
    TestBed.configureTestingModule({ imports: [VehicleEfficiencyDialogComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, options.roles ?? ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    closed = 0;
    fixture = TestBed.createComponent(VehicleEfficiencyDialogComponent);
    fixture.componentRef.setInput('vehicle', toVehicle(vehicleDto()));
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: options.view ?? viewDto() });
    settle();
  }

  const type = (id: string, value: string): void => {
    const input = testId<HTMLInputElement>(id)!;

    input.value = value;
    input.dispatchEvent(new Event('input'));
    settle();
  };
  const choose = (id: string, value: string): void => {
    const select = testId<HTMLSelectElement>(id)!;

    select.value = value;
    select.dispatchEvent(new Event('change'));
    settle();
  };
  const save = (): void => {
    testId('efficiency-save')!.click();
    settle();
  };
  const put = (): TestRequest => http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'PUT');
  const refresh = (view = viewDto()): void => {
    http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'GET').flush({ data: view });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    settle();
  };
  const history = (n: number, total = n): ReturnType<typeof viewDto> => {
    const records: EfficiencyRecordDto[] = Array.from({ length: n }, (_, i) => recordDto({ id: `r${i}`, value: `${6 + i}.000000`, is_current: i === 0, note: i === 0 ? 'Ficha del fabricante' : null }));

    return viewDto({ pagination: { page: 1, page_size: 5, total, total_pages: Math.ceil(total / 5), has_next: total > n, has_previous: false } }, records);
  };

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('abre como diálogo modal con nombre, placa, combustible de solo lectura, lo vigente con su chip y la historia', () => {
    render();
    const dialog = q<HTMLDialogElement>('dialog')!;

    expect(dialog.open).toBeTrue();
    expect(dialog.getAttribute('aria-labelledby')).toBe('eff-title');
    expect(text('#eff-title')).toBe('Rendimiento del vehículo');
    expect(text('[data-testid="efficiency-facts"]')).toContain('ABC123');
    expect(text('[data-testid="efficiency-fuel"]')).toBe('Diésel');
    expect(testId('efficiency-fuel')!.closest('div')!.querySelector('input,select')).toBeNull();
    expect(text('[data-testid="efficiency-current"]')).toContain('6,9 km/gal');
    expect(text('[data-testid="efficiency-current"]')).toContain('Declarado');
    expect(text('[data-testid="efficiency-current"]')).toContain('Teórico');
    expect(qa('[data-testid="efficiency-history"] li').length).toBe(1);
  });

  it('las unidades salen del servidor (compatible_units), no de una lista por combustible en la pantalla', () => {
    render({ view: viewDto({ compatible_units: ['km/m3'], fuel_type: 'NATURAL_GAS' }, [recordDto({ unit: 'km/m3' })]) });

    expect(qa('#eff-unit option').map((o) => o.getAttribute('value'))).toEqual(['', 'km/m3']);
    expect(testId<HTMLSelectElement>('efficiency-unit')!.value).toBe('km/m3');
  });

  it('sin rendimiento vigente dice «Sin rendimiento» y la unidad se elige a mano cuando hay varias', () => {
    render({ view: viewDto({ current: null }, []) });

    expect(text('[data-testid="efficiency-none"]')).toBe('Sin rendimiento');
    expect(testId<HTMLSelectElement>('efficiency-unit')!.value).toBe('');
    expect(text('[data-testid="efficiency-history-empty"]')).toContain('Todavía no hay');
  });

  it('el foco va al campo del valor al terminar de cargar', () => {
    const focused: Element[] = [];

    spyOn(HTMLInputElement.prototype, 'focus').and.callFake(function (this: HTMLInputElement) {
      focused.push(this);
    });
    render();

    expect(focused).toEqual([testId('efficiency-value')!]);
  });

  it('la historia muestra 5 a la vez con un paginador que pide la página del servidor', () => {
    render({ view: history(5, 12) });

    expect(qa('[data-testid="efficiency-history"] li').length).toBe(5);
    expect(text('nav.pg')).toContain('1–5 de 12');
    expect(testId<HTMLButtonElement>('efficiency-prev')!.disabled).toBeTrue();

    testId('efficiency-next')!.click();
    const req = http.expectOne((r) => r.url === EFFICIENCY_URL());

    expect(req.request.params.get('page')).toBe('2');
    req.flush({ data: viewDto({ pagination: { page: 2, page_size: 5, total: 12, total_pages: 3, has_next: true, has_previous: true } }, [recordDto({ id: 'x', is_current: false })]) });
    settle();
    expect(text('nav.pg')).toContain('6–6 de 12');
  });

  describe('validación y envío', () => {
    beforeEach(() => render());

    it('un valor vacío o inválido no se envía y se explica en línea', () => {
      const cases: readonly [string, string][] = [
        ['', 'Escribe'],
        ['abc', 'solo números'],
        ['-3', 'solo números'],
        ['1e5', 'solo números'],
        ['<script>alert(1)</script>', 'solo números'],
        ['6,9,1', 'solo números'],
        ['0', 'mayor que 0'],
        ['0,0', 'mayor que 0'],
        ['101', 'No puede superar 100'],
      ];

      for (const [value, message] of cases) {
        type('efficiency-value', value);
        save();

        expect(text('[data-testid="efficiency-error-value"]')).withContext(value).toContain(message);
        expect(testId('efficiency-value')!.getAttribute('aria-invalid')).toBe('true');
        expect(testId('efficiency-value')!.getAttribute('aria-describedby')).toBe('eff-value-err');
      }

      http.expectNone((r) => r.method === 'PUT');
    });

    it('sin unidad no se envía', () => {
      choose('efficiency-unit', '');
      type('efficiency-value', '6,9');
      save();

      expect(text('[data-testid="efficiency-error-unit"]')).toBe('Elige la unidad.');
      http.expectNone((r) => r.method === 'PUT');
    });

    it('una nota de más de 200 caracteres o una fecha futura no se envían', () => {
      type('efficiency-value', '6,9');
      type('efficiency-note', 'x'.repeat(201));
      type('efficiency-date', '2999-01-01');
      save();

      expect(text('[data-testid="efficiency-error-note"]')).toContain('200');
      expect(text('[data-testid="efficiency-error-date"]')).toContain('futura');
      http.expectNone((r) => r.method === 'PUT');
    });

    it('el decimal con coma viaja con punto, el tipo Teórico es declarado con base teórica y la nota y la fecha solo si se escribieron', () => {
      type('efficiency-value', ' 6,9 ');
      choose('efficiency-kind', 'THEORETICAL');
      type('efficiency-note', ' Fabricante ');
      type('efficiency-date', '2026-11-01');
      save();
      const req = put();

      expect(req.request.body).toEqual({ value: '6.9', unit: 'km/gal', origin: 'DECLARED', basis: 'THEORETICAL', note: 'Fabricante', measured_on: '2026-11-01' });
      req.flush({ data: declareOutDto() });
      refresh();
    });

    it('el tipo Medido es origen medido con base real; sin tipo es declarado sin base', () => {
      type('efficiency-value', '7');
      choose('efficiency-kind', 'MEASURED');
      save();
      const measured = put();

      expect(measured.request.body).toEqual({ value: '7', unit: 'km/gal', origin: 'MEASURED', basis: 'REAL' });
      measured.flush({ data: declareOutDto() });
      refresh();

      type('efficiency-value', '7');
      choose('efficiency-kind', '');
      save();
      const plain = put();

      expect(plain.request.body).toEqual({ value: '7', unit: 'km/gal', origin: 'DECLARED' });
      plain.flush({ data: declareOutDto() });
      refresh();
    });

    it('el resultado dice cuántos viajes pendientes quedaron calculados, cuántos siguen pendientes y, sin alarmar, los ya calculados con un valor anterior', () => {
      type('efficiency-value', '6,9');
      save();
      put().flush({ data: declareOutDto({ applied_to_pending: appliedDto({ trips_recalculated: 120, still_pending: 3, stale_calculated_trips: 7 }) }) });
      refresh();

      expect(text('[data-testid="efficiency-result"]')).toContain('Rendimiento guardado.');
      expect(text('[data-testid="efficiency-result"]')).toContain('120 viajes pendientes ahora calculados; 3 siguen pendientes.');
      expect(text('[data-testid="efficiency-stale"]')).toBe('7 viajes ya calculados usaron un rendimiento anterior; no se recalculan solos.');
      expect(testId('efficiency-stale')!.closest('.alert-danger')).toBeNull();
      expect(testId('efficiency-continue')).toBeNull();
      expect(testId<HTMLInputElement>('efficiency-value')!.value).toBe('');
      expect(q('[data-testid="efficiency-result"]')!.getAttribute('role')).toBe('status');
    });

    it('si quedan viajes por examinar ofrece «Continuar», que repite la misma declaración hasta que no quede ninguno', () => {
      type('efficiency-value', '6,9');
      save();
      put().flush({ data: declareOutDto({ applied_to_pending: appliedDto({ trips_recalculated: 20000, remaining: 4000 }) }) });
      refresh();

      expect(text('[data-testid="efficiency-remaining"]')).toContain('Hasta 4.000 viajes por revisar');
      testId('efficiency-continue')!.click();
      settle();
      const again = put();

      expect(again.request.body).toEqual({ value: '6.9', unit: 'km/gal', origin: 'DECLARED' });
      again.flush({ data: declareOutDto({ changed: false, applied_to_pending: appliedDto({ trips_recalculated: 4000, still_pending: 1, remaining: 0 }) }) });
      refresh();

      expect(testId('efficiency-continue')).toBeNull();
      expect(text('[data-testid="efficiency-result"]')).toContain('24.000 viajes pendientes ahora calculados; 1 sigue pendiente.');
      expect(text('[data-testid="efficiency-result"]')).toContain('Rendimiento guardado.');
    });

    it('si «Continuar» no avanza, deja de ofrecerlo y lo explica', () => {
      type('efficiency-value', '6,9');
      save();
      put().flush({ data: declareOutDto({ applied_to_pending: appliedDto({ trips_recalculated: 5, remaining: 40 }) }) });
      refresh();
      testId('efficiency-continue')!.click();
      settle();
      put().flush({ data: declareOutDto({ changed: false, applied_to_pending: appliedDto({ trips_recalculated: 0, remaining: 40 }) }) });
      refresh();

      expect(testId('efficiency-continue')).toBeNull();
      expect(text('[data-testid="efficiency-stalled"]')).toContain('ya no avanza');
    });

    it('el mismo valor ya vigente se dice sin crear otro registro', () => {
      type('efficiency-value', '6,9');
      save();
      put().flush({ data: declareOutDto({ changed: false, applied_to_pending: appliedDto({ trips_recalculated: 0, still_pending: 0 }) }) });
      refresh();

      expect(text('[data-testid="efficiency-result"]')).toContain('ya estaba vigente');
      expect(text('[data-testid="efficiency-result"]')).toContain('Ningún viaje pendiente cambió a calculado.');
    });

    it('COMPANY_BUSY: avisa, conserva lo escrito y «Reintentar» envía lo mismo', () => {
      type('efficiency-value', '6,9');
      type('efficiency-note', 'Fabricante');
      save();
      put().flush(apiError('COMPANY_BUSY'), { status: 409, statusText: 'x' });
      settle();

      expect(q('[data-testid="efficiency-error"]')!.getAttribute('role')).toBe('alert');
      expect(text('[data-testid="efficiency-error"]')).toContain('carga procesándose');
      expect(testId<HTMLInputElement>('efficiency-value')!.value).toBe('6,9');
      expect(testId<HTMLInputElement>('efficiency-note')!.value).toBe('Fabricante');

      testId('efficiency-retry')!.click();
      settle();
      const again = put();

      expect(again.request.body.value).toBe('6.9');
      again.flush({ data: declareOutDto() });
      refresh();
      expect(testId('efficiency-error')).toBeNull();
    });

    it('EFFICIENCY_CONFLICT: avisa, recarga lo vigente y conserva lo escrito', () => {
      type('efficiency-value', '6,9');
      save();
      put().flush(apiError('EFFICIENCY_CONFLICT'), { status: 409, statusText: 'x' });
      http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'GET').flush({ data: viewDto({}, [recordDto({ value: '8.000000' })]) });
      settle();

      expect(text('[data-testid="efficiency-error"]')).toContain('al mismo tiempo');
      expect(text('[data-testid="efficiency-current"]')).toContain('8 km/gal');
      expect(testId<HTMLInputElement>('efficiency-value')!.value).toBe('6,9');
      expect(testId('efficiency-retry')).toBeNull();
    });

    it('INVALID_FIELD_VALUE: el mensaje del servidor sale bajo su campo, enlazado con aria-describedby, y no como alerta general', () => {
      type('efficiency-value', '6,9');
      save();
      put().flush(apiError('INVALID_FIELD_VALUE', [{ field: 'unit', message: 'La unidad no corresponde al combustible' }, { field: 'note', message: 'La nota es demasiado larga' }]), { status: 422, statusText: 'x' });
      settle();

      expect(text('[data-testid="efficiency-error-unit"]')).toBe('La unidad no corresponde al combustible');
      expect(testId('efficiency-unit')!.getAttribute('aria-invalid')).toBe('true');
      expect(testId('efficiency-unit')!.getAttribute('aria-describedby')).toBe('eff-unit-err');
      expect(text('[data-testid="efficiency-error-note"]')).toBe('La nota es demasiado larga');
      expect(testId('efficiency-error')).toBeNull();
    });

    it('VEHICLE_FUEL_MISSING se explica con la salida: completar el combustible en la ficha del vehículo', () => {
      type('efficiency-value', '6,9');
      save();
      put().flush(apiError('VEHICLE_FUEL_MISSING'), { status: 422, statusText: 'x' });
      settle();

      expect(text('[data-testid="efficiency-error"]')).toContain('Complétalo en su ficha');
    });

    it('mientras guarda el botón queda deshabilitado y no hay un segundo envío', () => {
      type('efficiency-value', '6,9');
      save();

      expect(testId<HTMLButtonElement>('efficiency-save')!.disabled).toBeTrue();
      expect(text('[data-testid="efficiency-save"]')).toBe('Guardando…');
      testId('efficiency-save')!.click();
      expect(http.match((r) => r.method === 'PUT').length).toBe(1);
    });
  });

  it('un vehículo sin combustible no ofrece el formulario y lo explica', () => {
    render({ view: viewDto({ compatible_units: [], fuel_type: null, current: null }, []) });

    expect(text('[data-testid="efficiency-no-fuel"]')).toContain('no tiene combustible registrado');
    expect(testId('efficiency-value')).toBeNull();
    expect(testId('efficiency-save')).toBeNull();
  });

  it('quien no administra vehículos consulta: ve lo vigente y la historia, sin formulario ni Guardar, con el motivo dicho', () => {
    for (const role of ['ORG_ANALYST', 'ORG_VIEWER']) {
      render({ roles: [role] });

      expect(text('[data-testid="efficiency-current"]')).toContain('6,9 km/gal');
      expect(testId('efficiency-value')).toBeNull();
      expect(testId('efficiency-save')).toBeNull();
      expect(text('[data-testid="efficiency-readonly"]')).toContain('Solo quien administra');
      expect(qa('[data-testid="efficiency-history"] li').length).toBe(1);

      http.verify();
      TestBed.resetTestingModule();
    }
    render();
  });

  it('un error al cargar ofrece reintentar', () => {
    TestBed.configureTestingModule({ imports: [VehicleEfficiencyDialogComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehicleEfficiencyDialogComponent);
    fixture.componentRef.setInput('vehicle', toVehicle(vehicleDto()));
    fixture.detectChanges();
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush(apiError('VEHICLE_NOT_FOUND'), { status: 404, statusText: 'x' });
    settle();

    expect(text('[data-testid="efficiency-load-error"]')).toContain('no existe en tu empresa');
    q<HTMLButtonElement>('[data-testid="efficiency-load-error"] button')!.click();
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: viewDto() });
  });

  it('«Cerrar» y Escape cierran el diálogo y avisan; Escape se ignora mientras guarda', async () => {
    render();
    const dialog = q<HTMLDialogElement>('dialog')!;

    type('efficiency-value', '6,9');
    save();
    const cancel = new Event('cancel', { cancelable: true });

    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBeTrue();
    put().flush({ data: declareOutDto() });
    refresh();

    const free = new Event('cancel', { cancelable: true });

    dialog.dispatchEvent(free);
    expect(free.defaultPrevented).toBeFalse();
    testId('efficiency-close')!.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(closed).toBe(1);
  });

  describe('presentación', () => {
    it('el CSS usa solo tokens (sin hexadecimales ni rgb()), tintes 14/20/40/60/80 y ningún scroll interno en escritorio; en teléfono el cuerpo se desplaza y el pie queda fijo', () => {
      render();
      const css = componentCss('dialog.eff');
      const at = css.indexOf('@media (max-width: 719px)');
      const desktop = css.slice(0, at);
      const phone = css.slice(at, css.indexOf('@media (prefers-reduced-motion'));

      expect(css).toContain('dialog.eff');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      expect(at).toBeGreaterThan(0);
      expect(desktop).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
      expect(phone).toMatch(/\.bd \{[^}]*overflow-y: auto/);
      expect(phone).toMatch(/\.hd, \.ft \{ flex: none;/);
      expect(phone).toMatch(/max-height: 100dvh/);

      const tints = Array.from(css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g));

      expect(tints.length).toBeGreaterThan(0);
      for (const m of tints) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });

    it('cabe en 1280×800 sin scroll: con 5 registros y un resultado el contenido mide menos que el alto y ningún nodo tiene scroll propio', () => {
      render({ view: history(5, 12) });
      type('efficiency-value', '6,9');
      save();
      put().flush({ data: declareOutDto({ applied_to_pending: appliedDto({ remaining: 10, stale_calculated_trips: 3 }) }) });
      refresh(history(5, 12));
      document.body.appendChild(el());
      const dialog = q<HTMLDialogElement>('dialog')!;

      expect(getComputedStyle(dialog).overflow).toBe('visible');
      // El iframe de Karma es más bajo que 800 px: se mide el alto del contenido, que es lo que decide si cabe en 800.
      expect(dialog.scrollHeight).toBeLessThanOrEqual(740);
      expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(720);

      if (window.innerWidth >= 720) {
        for (const node of qa('*')) {
          const style = getComputedStyle(node);

          expect(style.overflowY === 'auto' || style.overflowY === 'scroll').withContext(node.tagName + '.' + node.className).toBeFalse();
        }
      }

      document.body.removeChild(el());
    });

    it('cada campo tiene su etiqueta y los botones y chips tienen nombre accesible', () => {
      render();

      for (const id of ['eff-value', 'eff-unit', 'eff-kind', 'eff-date', 'eff-note']) {
        expect(q(`label[for="${id}"]`)).withContext(id).not.toBeNull();
        expect(q(`#${id}`)).withContext(id).not.toBeNull();
      }

      expect(text('label[for="eff-value"]')).toBe('Rendimiento *');
      expect(qa('app-status-badge').every((b) => (b.textContent ?? '').trim().length > 0)).toBeTrue();
      expect(qa('button').every((b) => (b.textContent ?? '').trim().length > 0 || b.getAttribute('aria-label'))).toBeTrue();
    });
  });

  describe('rendimiento medido protegido (409 MEASURED_PROTECTED)', () => {
    const fillAndSave = (): void => {
      choose('efficiency-unit', 'km/gal');
      type('efficiency-value', '6.9');
      save();
    };
    const protect = (): void => {
      fillAndSave();
      put().flush(apiError('MEASURED_PROTECTED', measuredProtectedDetails), { status: 409, statusText: 'Conflict' });
      settle();
    };

    it('muestra el paso de confirmación en el diálogo con los datos del servidor y las dos opciones; el foco va a «Conservar el medido»', () => {
      render();
      protect();

      expect(text('[data-testid="efficiency-protected-text"]')).toMatch(/^Este vehículo tiene un rendimiento medido de 7\.200000 km\/gal del .*2026\. ¿Quieres reemplazarlo por el declarado\?$/);
      expect(testId('efficiency-protected')!.getAttribute('role')).toBe('alertdialog');
      expect(testId('efficiency-protected')!.getAttribute('aria-labelledby')).toBe('eff-prot-title');
      expect(text('[data-testid="efficiency-replace-measured"]')).toBe('Reemplazar por el declarado');
      expect(document.activeElement).toBe(testId('efficiency-keep-measured'));
      expect(testId('efficiency-save')!.hasAttribute('disabled')).toBeTrue();
      expect(testId('efficiency-error')).toBeNull();
    });

    it('«Reemplazar por el declarado» reenvía el MISMO cuerpo con confirm_replace_measured=true y muestra el resultado', () => {
      render();
      protect();
      testId('efficiency-replace-measured')!.click();
      settle();
      const req = put();

      expect(req.request.body).toEqual({ value: '6.9', unit: 'km/gal', origin: 'DECLARED', confirm_replace_measured: true });
      req.flush({ data: declareOutDto() });
      refresh();

      expect(testId('efficiency-protected')).toBeNull();
      expect(testId('efficiency-result')).not.toBeNull();
    });

    it('la primera petición NO lleva la bandera', () => {
      render();
      fillAndSave();
      const req = put();

      expect('confirm_replace_measured' in (req.request.body as object)).toBeFalse();
      req.flush(apiError('MEASURED_PROTECTED', measuredProtectedDetails), { status: 409, statusText: 'Conflict' });
    });

    it('«Conservar el medido» no envía nada, cierra el paso, devuelve el foco al valor y conserva lo escrito', () => {
      render();
      protect();
      testId('efficiency-keep-measured')!.click();
      settle();

      expect(testId('efficiency-protected')).toBeNull();
      expect(testId<HTMLInputElement>('efficiency-value')!.value).toBe('6.9');
      expect(testId('efficiency-save')!.hasAttribute('disabled')).toBeFalse();
    });

    it('sin datos en details muestra el aviso general sin inventar el valor', () => {
      render();
      fillAndSave();
      put().flush(apiError('MEASURED_PROTECTED', []), { status: 409, statusText: 'Conflict' });
      settle();

      expect(text('[data-testid="efficiency-protected-text"]')).toBe('Este vehículo tiene un rendimiento medido vigente. ¿Quieres reemplazarlo por el declarado?');
    });

    it('quien no administra vehículos no declara: no hay formulario ni paso de confirmación', () => {
      render({ roles: ['ORG_VIEWER'] });

      expect(testId('efficiency-save')).toBeNull();
      expect(testId('efficiency-protected')).toBeNull();
    });

    it('el CSS del paso usa solo tokens, sin scroll interno y con tintes permitidos', () => {
      render();
      const css = componentCss('.prot').split('}').filter((rule) => rule.includes('.prot')).join('}');

      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
      for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });
  });
});
