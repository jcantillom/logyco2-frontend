import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SETTINGS_URL, settingsDto } from '../../../testing/vehicle-efficiency';
import { viewDto } from '../../../testing/vehicle-efficiency';
import { pagedBody, summaryDto, vehicleDetailDto, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { VehicleDto } from '../../infrastructure/dto/vehicles.dto';
import { catalogDto } from '../emissions/emissions.fixtures';
import { VehiclesComponent } from './vehicles.component';

const EMISSIONS = 'http://api.test/api/v1/emissions';

/** CSS de los componentes ya compilado por Angular, sin los atributos de encapsulación ni saltos de línea. */
const componentCss = (): string[] => Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '));
/** El evento `close` de un `<dialog>` llega en una tarea posterior a `close()`. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25));

describe('VehiclesComponent: Mis vehículos', () => {
  let fixture: ComponentFixture<VehiclesComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const listRequest = (): TestRequest => http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`);

  function render(roles: string[] = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ imports: [VehiclesComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehiclesComponent);
    fixture.detectChanges();
  }

  function init(items: VehicleDto[] = [vehicleDto()], roles: string[] = ['ORG_ADMIN'], total = items.length): void {
    render(roles);
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    listRequest().flush(pagedBody(items, total));
    http.expectOne(`${EMISSIONS}/vehicles`).flush({ data: catalogDto() });
    fixture.detectChanges();
    // Quien administra pregunta con el primer vehículo si la estimación está encendida (apagada en estas pruebas).
    http.match((r) => /\/efficiency$/.test(r.url) && r.params.get('page_size') === '1').forEach((r) => r.flush({ data: viewDto() }));
    fixture.detectChanges();
  }

  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };

  it('muestra el título, el subtítulo y los 2 conteos reales del servidor', () => {
    init();

    expect(text('h1')).toBe('Mis vehículos');
    expect(el().querySelector('app-page-hero p')!.textContent!.length).toBeGreaterThan(10);
    const tiles = Array.from(el().querySelectorAll('[data-testid="vehicle-tiles"] .kpi')).map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
    expect(tiles).toEqual(['Registrados12', 'Inactivos1']);
  });

  it('solo hay dos tarjetas (Registrados e Inactivos) que filtran; ya no existen «Nuevos pendientes» ni «Con inconsistencias»', () => {
    init();

    expect(q('[data-testid="tile-pending"]')).toBeNull();
    expect(q('[data-testid="tile-conflicts"]')).toBeNull();
    expect(el().textContent).not.toMatch(/Nuevos pendientes|Con inconsistencias/);

    click('[data-testid="tile-inactive"]');
    const req = listRequest();
    expect(req.request.params.get('status')).toBe('INACTIVE');
    req.flush(pagedBody([vehicleDto({ status: 'INACTIVE' })]));
    fixture.detectChanges();
    expect(text('tbody tr')).toContain('Inactivo');

    click('[data-testid="tile-registered"]');
    const all = listRequest();
    expect(all.request.params.has('status')).toBeFalse();
    all.flush(pagedBody([vehicleDto()]));
  });

  it('muestra un esqueleto mientras carga el resumen y un error con reintento si falla', () => {
    render();
    expect(el().querySelectorAll('[data-testid="vehicle-tiles"] .skeleton').length).toBe(2);

    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(text('[data-testid="vehicle-tiles"] [role="alert"]')).toContain('Ocurrió un error interno');

    click('[data-testid="vehicle-tiles"] [role="alert"] button');
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="vehicle-tiles"] .kpi').length).toBe(2);
  });

  it('la tabla tiene semántica de tabla, las columnas pedidas y una fila por vehículo con los datos reales', () => {
    init([vehicleDto(), vehicleDto({ id: 'veh-2', plate: 'XYZ987', plate_original: 'XYZ987', configuration_code: 'C1', configuration_recognized: false, fuel_type: 'NATURAL_GAS', model_year: null })]);

    expect(Array.from(el().querySelectorAll('thead th')).map((th) => th.textContent!.trim())).toEqual([
      'Placa', 'Configuración', 'Tipo', 'Combustible', 'Rendimiento', 'Modelo', 'Estado', 'Fecha de registro', 'Acciones',
    ]);
    expect(el().querySelector('table caption')).not.toBeNull();
    const rows = Array.from(el().querySelectorAll('tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('ABC123');
    expect(rows[0].textContent).toContain('Como llegó: abc 123');
    expect(rows[0].textContent).toContain('Diésel');
    expect(rows[0].textContent).toContain('2018');
    expect(rows[0].textContent).toContain('Activo');
    expect(rows[1].textContent).toContain('No reconocida');
    expect(rows[1].textContent).toContain('Gas natural');
    expect(rows[1].textContent).not.toContain('Como llegó');
    const detail = rows[0].querySelector('[data-testid="view-detail"]')!;

    expect(detail.getAttribute('title')).toBe('Ver detalle');
    expect(detail.querySelector('svg')).not.toBeNull();
    expect(detail.getAttribute('aria-label')).toBe('Ver detalle de ABC123');
  });

  describe('rendimiento por vehículo', () => {
    const efficiency = (overrides: Record<string, unknown> = {}) => ({ value: '6.900000', unit: 'km/gal', origin: 'DECLARED', basis: 'THEORETICAL', source_kind: 'MANUAL', measured_on: null, declared_at: '2026-11-20T15:00:00Z', ...overrides });
    const cell = (row: number): string => (el().querySelectorAll('[data-testid="efficiency-cell"]')[row].textContent ?? '').replace(/\s+/g, ' ').trim();

    it('cada fila muestra el valor con su unidad y un chip de origen (Declarado o Medido), o «Sin rendimiento» en texto atenuado, sin tarjetas nuevas', () => {
      init([vehicleDto({ efficiency: efficiency() }), vehicleDto({ id: 'veh-2', plate: 'XYZ987', efficiency: efficiency({ origin: 'MEASURED', basis: 'REAL', value: '7.250000', unit: 'km/l' }) }), vehicleDto({ id: 'veh-3', plate: 'JJJ111' })]);

      expect(cell(0)).toBe('6,9 km/galDeclarado');
      expect(cell(1)).toBe('7,25 km/lMedido');
      expect(cell(2)).toBe('Sin rendimiento');
      expect(el().querySelectorAll('[data-testid="efficiency-cell"] app-status-badge').length).toBe(2);
      expect(q('[data-testid="efficiency-none"]')!.classList).toContain('muted');
      expect(el().querySelectorAll('[data-testid="vehicle-tiles"] .kpi').length).toBe(2);
    });

    it('cada fila tiene una acción con nombre accesible que abre «Rendimiento del vehículo» y devuelve el foco al cerrarse', async () => {
      init();
      document.body.appendChild(el());
      const button = q<HTMLButtonElement>('[data-testid="open-efficiency"]')!;

      expect(button.getAttribute('aria-label')).toBe('Rendimiento de ABC123');
      expect(button.getAttribute('title')).toBe('Rendimiento');
      button.focus();
      button.click();
      fixture.detectChanges();
      http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles/veh-1/efficiency`).flush({ data: viewDto() });
      fixture.detectChanges();

      expect(q<HTMLDialogElement>('[data-testid="efficiency-dialog"]')!.open).toBeTrue();
      q<HTMLButtonElement>('[data-testid="efficiency-close"]')!.click();
      await settle();
      fixture.detectChanges();

      expect(q('[data-testid="efficiency-dialog"]')).toBeNull();
      expect(document.activeElement).toBe(button);
      document.body.removeChild(el());
    });

    it('quien solo consulta (analista, lector) ve la columna y abre la vista de consulta, pero no tiene «Ficha de rendimiento»', () => {
      for (const role of ['ORG_ANALYST', 'ORG_VIEWER']) {
        init([vehicleDto({ efficiency: efficiency() })], [role]);

        expect(cell(0)).toBe('6,9 km/galDeclarado');
        expect(q('[data-testid="open-efficiency"]')).not.toBeNull();
        expect(q('[data-testid="open-ficha"]')).toBeNull();
        http.verify();
        TestBed.resetTestingModule();
      }

      init();
    });

    it('«Ficha de rendimiento» (solo ORG_ADMIN) abre el diálogo de la ficha y devuelve el foco a su botón', async () => {
      init();
      document.body.appendChild(el());
      const button = q<HTMLButtonElement>('[data-testid="open-ficha"]')!;

      expect(button.textContent).toContain('Ficha de rendimiento');
      button.focus();
      button.click();
      fixture.detectChanges();

      const dialog = q<HTMLDialogElement>('[data-testid="ficha-dialog"]')!;

      expect(dialog.open).toBeTrue();
      dialog.close();
      await settle();
      fixture.detectChanges();

      expect(q('[data-testid="ficha-dialog"]')).toBeNull();
      expect(document.activeElement).toBe(button);
      document.body.removeChild(el());
    });
  });

  it('anuncia la cantidad de resultados en una región aria-live', () => {
    init([vehicleDto(), vehicleDto({ id: 'veh-2' })], ['ORG_ADMIN'], 2);

    expect(q('[data-testid="results-live"]')!.getAttribute('aria-live')).toBe('polite');
    expect(text('[data-testid="results-live"]')).toBe('2 vehículos');
  });

  it('la búsqueda por placa espera 300 ms y pide al servidor una sola vez, desde la primera página', fakeAsync(() => {
    init();
    const input = q<HTMLInputElement>('input[type="search"]')!;

    for (const value of ['a', 'ab', 'abc']) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      tick(100);
    }

    http.expectNone((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`);
    tick(300);

    const req = listRequest();
    expect(req.request.params.get('search')).toBe('abc');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(pagedBody([vehicleDto()]));
  }));

  it('los filtros (estado, combustible, configuración) están bajo «Más filtros» y se aplican en el servidor', () => {
    init();
    expect(q('[data-testid="vehicle-filters"]')).toBeNull();
    expect(q('[data-testid="more-filters"]')!.getAttribute('aria-expanded')).toBe('false');

    click('[data-testid="more-filters"]');
    expect(q('[data-testid="more-filters"]')!.getAttribute('aria-expanded')).toBe('true');
    const selects = el().querySelectorAll<HTMLSelectElement>('[data-testid="vehicle-filters"] select');
    expect(Array.from(selects).map((s) => s.getAttribute('aria-label'))).toEqual(['Filtrar por estado', 'Filtrar por combustible', 'Filtrar por configuración']);
    expect(Array.from(selects[1].options).map((o) => o.textContent!.trim())).toEqual(['Todos los combustibles', 'Diésel', 'Gasolina', 'Gas natural', 'Eléctrico', 'Híbrido', 'Otro']);
    expect(Array.from(selects[2].options).map((o) => o.value)).toContain('C2S1');

    selects[1].value = 'GASOLINE';
    selects[1].dispatchEvent(new Event('change'));
    selects[2].value = 'C2';
    const first = listRequest();
    expect(first.request.params.get('fuel')).toBe('GASOLINE');
    first.flush(pagedBody([vehicleDto()]));
    fixture.detectChanges();

    selects[2].dispatchEvent(new Event('change'));
    const second = listRequest();
    expect(second.request.params.get('configuration')).toBe('C2');
    expect(second.request.params.get('fuel')).toBe('GASOLINE');
    second.flush(pagedBody([vehicleDto()]));
    fixture.detectChanges();

    expect(text('[data-testid="more-filters"] i')).toBe('2');
  });

  it('pagina con el componente de la plataforma y conserva los filtros al cambiar de página', () => {
    init([vehicleDto()], ['ORG_ADMIN'], 25);

    expect(text('app-pagination')).toContain('Página 1 de 3 · 25 registros');
    (Array.from(el().querySelectorAll('app-pagination button')).find((b) => b.textContent!.includes('Siguiente')) as HTMLButtonElement).click();

    const req = listRequest();
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('page_size')).toBe('10');
    req.flush(pagedBody([vehicleDto()], 25, 10, 2));
  });

  it('sin vehículos lo dice y, con vehicles:manage, invita a registrar el primero; no hay nada sobre analizar archivos', () => {
    init([], ['ORG_ADMIN']);

    expect(text('[data-testid="vehicles-empty"] h2')).toBe('Aún no tienes vehículos registrados.');
    expect(text('[data-testid="vehicles-empty"] p')).toBe('Registra el primero con «Registrar vehículo».');
    expect(q('[data-testid="register-empty"]')).not.toBeNull();
    expect(text('[data-testid="vehicles-empty"]')).not.toMatch(/archivo|Excel/i);
  });

  it('el espacio vacío de un rol de solo lectura no ofrece acciones', () => {
    init([], ['ORG_VIEWER']);

    expect(text('[data-testid="vehicles-empty"] h2')).toBe('Aún no tienes vehículos registrados.');
    expect(q('[data-testid="register-empty"]')).toBeNull();
    expect(q('[data-testid="register-vehicle"]')).toBeNull();
  });

  it('no existe ninguna función de analizar archivos de Excel en la pantalla', () => {
    init([], ['ORG_ADMIN']);

    expect(q('[data-testid="analyze-file"]')).toBeNull();
    expect(q('[data-testid="analyze-top"]')).toBeNull();
    expect(q('[data-testid="recent-analyses"]')).toBeNull();
    expect(q('[data-testid="analysis-wizard"]')).toBeNull();
    expect(q('input[type="file"]')).toBeNull();
    expect(el().textContent).not.toMatch(/Analizar archivo|Excel|Cargas recientes/);
  });

  it('«Registrar vehículo» solo aparece con vehicles:manage', () => {
    init([vehicleDto()], ['ORG_ADMIN']);
    expect(q('[data-testid="register-vehicle"]')!.textContent).toContain('Registrar vehículo');

    TestBed.resetTestingModule();
    init([vehicleDto()], ['ORG_VIEWER']);
    expect(q('[data-testid="register-vehicle"]')).toBeNull();
  });

  it('con filtros y sin resultados dice «Sin resultados» y permite quitar los filtros', () => {
    init();
    click('[data-testid="tile-inactive"]');
    listRequest().flush(pagedBody([], 0));
    fixture.detectChanges();

    expect(text('[data-testid="vehicles-empty"] h2')).toBe('Sin resultados');

    click('[data-testid="clear-filters"]');
    const req = listRequest();
    expect(req.request.params.has('status')).toBeFalse();
    req.flush(pagedBody([vehicleDto()]));
  });

  it('si la lista falla muestra el error del catálogo con «Reintentar»', () => {
    render();
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    listRequest().flush({ error: { code: 'ORGANIZATION_ACCESS_DENIED' } }, { status: 403, statusText: 'x' });
    http.expectOne(`${EMISSIONS}/vehicles`).flush({ data: catalogDto() });
    fixture.detectChanges();

    expect(text('app-resource-state [role="alert"]')).toContain('No tienes acceso a esta empresa.');
    click('app-resource-state [role="alert"] button');
    listRequest().flush(pagedBody([vehicleDto()]));
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
  });

  it('el detalle se abre en un diálogo nativo, carga el vehículo y devuelve el foco al botón al cerrarse', async () => {
    init();
    const opener = q<HTMLButtonElement>('[data-testid="view-detail"]')!;
    opener.focus();
    opener.click();
    fixture.detectChanges();

    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto() });
    fixture.detectChanges();

    const dialog = q<HTMLDialogElement>('dialog[data-testid="vehicle-detail"]')!;
    expect(dialog.open).toBeTrue();
    expect(dialog.getAttribute('aria-labelledby')).toBe('vehicle-detail-title');
    expect(text('#vehicle-detail-title')).toBe('ABC123');

    const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
    dialog.close();
    await closed;
    fixture.detectChanges();

    expect(q('dialog[data-testid="vehicle-detail"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('al cambiar de empresa se descartan la lista y el detalle abierto', () => {
    init();
    click('[data-testid="view-detail"]');
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`);

    TestBed.inject(SessionStore).setUser(buildUser({ memberships: [membership({ id: '33333333-3333-4333-8333-333333333333', name: 'Otra' }, ['ORG_ADMIN'])] }));
    fixture.detectChanges();

    expect(q('dialog[data-testid="vehicle-detail"]')).toBeNull();
    http.expectOne('http://api.test/api/v1/organizations/33333333-3333-4333-8333-333333333333/vehicles/summary');
  });

  it('en pantallas de menos de 768 px la tabla pasa a tarjetas', () => {
    init();
    const css = componentCss().find((c) => c.includes('.kpi') && c.includes('.tbl'))!;

    expect(css).toMatch(/@media \(max-width: 768px\) \{.*\.tbl thead \{ display: none; \}/);
  });

  it('el CSS (página, detalle y formulario) usa solo tokens de la plataforma: sin hexadecimales y con tintes al 14 % (relleno del icono) o al 20/40/60/80 %', () => {
    init();
    click('[data-testid="view-detail"]');
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto() });
    fixture.detectChanges();
    const markers = (c: string): boolean => c.includes('.kpi') || (c.includes('.confirm') && c.includes('.fixed')) || c.includes('dialog.panel');
    const withDetail = componentCss().filter(markers);
    click('[data-testid="edit-vehicle"]');
    const own = [...new Set([...withDetail, ...componentCss().filter(markers)])];
    const all = own.join('\n');

    expect(own.length).toBeGreaterThanOrEqual(3);
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(all).not.toMatch(/rgb\(/);
    expect(all).toContain('--c-primary');
    expect(all).toContain('--c-head');
    expect(all).toMatch(/\.kpi \.ico \{[^}]*display: grid; place-items: center/);
    expect(all).toMatch(/\.kpi \.ico svg \{[^}]*width: var\(--kpi-glyph, 26px\)[^}]*fill: color-mix\(in srgb, currentColor 14%[^}]*stroke: currentColor; stroke-width: 1\.6/);
    expect(all).not.toMatch(/background[^;}]*--c-secondary/);
    const percents = Array.from(all.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)).map((m) => Number(m[1]));
    for (const percent of percents) expect([14, 20, 40, 60, 80]).withContext(`color-mix ${percent}%`).toContain(percent);
  });

  describe('registrar manualmente', () => {
    const field = (id: string): HTMLInputElement | HTMLSelectElement => q<HTMLInputElement>(`#${id}`)!;
    const set = (id: string, value: string): void => {
      const control = field(id);

      control.value = value;
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
      fixture.detectChanges();
    };
    const submit = (): void => click('[data-testid="save-vehicle"]');

    beforeEach(() => {
      init();
      click('[data-testid="register-vehicle"]');
    });

    it('abre un diálogo modal con la placa obligatoria y las opciones del catálogo (código y nombre) y de combustibles', () => {
      const dialog = q<HTMLDialogElement>('dialog[data-testid="vehicle-form"]')!;

      expect(dialog.open).toBeTrue();
      expect(text('#vehicle-form-title')).toBe('Registrar vehículo');
      expect(text('label[for="vf-plate"]')).toBe('Placa *');
      const config = Array.from((field('vf-config') as HTMLSelectElement).options).map((o) => o.textContent!.trim());
      expect(config[0]).toBe('Sin definir');
      expect(config).toContain('C2 · Camión rígido');
      expect(Array.from((field('vf-fuel') as HTMLSelectElement).options).map((o) => o.textContent!.trim())).toContain('Diésel');
      expect(Array.from((field('vf-ownership') as HTMLSelectElement).options).map((o) => o.textContent!.trim())).toEqual(['Sin declarar', 'Propio', 'Contratado', 'De terceros', 'Subcontratado']);
    });

    it('sin placa o con una placa inválida muestra el mensaje y no envía nada', () => {
      submit();
      expect(text('#vf-plate-err')).toBe('Ingresa la placa.');

      set('vf-plate', 'A!');
      submit();
      expect(text('#vf-plate-err')).toBe('La placa debe tener entre 5 y 12 letras o números.');
      expect(field('vf-plate').getAttribute('aria-invalid')).toBe('true');
      http.expectNone({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` });
    });

    it('valida el año del modelo', () => {
      set('vf-plate', 'ABC123');
      set('vf-year', '1800');
      submit();

      expect(el().textContent).toContain('Ingresa un año entre 1900 y 9999.');
      http.expectNone({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` });
    });

    it('la capacidad solo admite punto decimal: la coma se rechaza con un mensaje claro', () => {
      set('vf-plate', 'ABC123');
      set('vf-capacity', '8,5');
      submit();

      expect(el().textContent).toContain('Usa punto como separador decimal, por ejemplo 8.5 (sin comas).');
      http.expectNone({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` });
    });

    it('refleja los límites del servidor: capacidad > 0, hasta 3 decimales y 10 dígitos; textos hasta 80', () => {
      set('vf-plate', 'ABC123');
      const cases: [string, string][] = [['0', 'La capacidad debe ser mayor que 0.'], ['1.2345', 'Usa hasta 3 decimales.'], ['12345678.123', 'La capacidad admite hasta 10 dígitos en total.'], ['8,5', 'Usa punto como separador decimal']];

      for (const [value, message] of cases) {
        set('vf-capacity', value);
        submit();
        expect(text('#vf-capacity ~ .field-error')).withContext(value).toContain(message);
      }

      set('vf-capacity', '1234567.123');
      expect(text('#vf-capacity ~ .field-error')).toBe('');
      set('vf-year', '10000');
      submit();
      expect(el().textContent).toContain('Ingresa un año entre 1900 y 9999.');
      expect(field('vf-type').getAttribute('maxlength')).toBe('80');
      expect(field('vf-tech').getAttribute('maxlength')).toBe('80');
      http.expectNone({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` });
    });

    it('la tecnología es opcional y se envía cuando se escribe', () => {
      set('vf-plate', 'ABC123');
      set('vf-tech', 'Euro VI');
      submit();

      const req = http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` });
      expect(req.request.body).toEqual({ plate: 'ABC123', technology: 'Euro VI' });
      req.flush({ data: vehicleDto() });
    });

    it('envía el registro con el contrato, cierra el diálogo y refresca el resumen y la lista', async () => {
      set('vf-plate', ' abc123 ');
      set('vf-config', 'C2');
      set('vf-type', 'Camión');
      set('vf-fuel', 'DIESEL');
      set('vf-year', '2020');
      set('vf-capacity', '8.5');
      set('vf-ownership', 'OWN');
      submit();

      const req = http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` });
      expect(req.request.body).toEqual({ plate: 'abc123', configuration_code: 'C2', vehicle_type: 'Camión', fuel_type: 'DIESEL', model_year: 2020, capacity_tons: 8.5, ownership: 'OWN' });
      req.flush({ data: vehicleDto() }, { status: 201, statusText: 'Created' });
      http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
      listRequest().flush(pagedBody([vehicleDto()]));
      await settle();
      fixture.detectChanges();

      expect(q('dialog[data-testid="vehicle-form"]')).toBeNull();
    });

    it('«Sin declarar» no envía la propiedad: nunca se infiere', () => {
      set('vf-plate', 'ABC123');
      submit();

      const req = http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` });
      expect(req.request.body).toEqual({ plate: 'ABC123' });
      req.flush({ data: vehicleDto() });
    });

    it('409 VEHICLE_ALREADY_REGISTERED: «Esta placa ya está registrada en tu empresa» bajo la placa y el diálogo sigue abierto', () => {
      set('vf-plate', 'ABC123');
      submit();
      http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` }).flush({ error: { code: 'VEHICLE_ALREADY_REGISTERED' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('#vf-plate-err')).toBe('Esta placa ya está registrada en tu empresa');
      expect(q<HTMLDialogElement>('dialog[data-testid="vehicle-form"]')!.open).toBeTrue();
      expect(q<HTMLButtonElement>('[data-testid="save-vehicle"]')!.disabled).toBeFalse();
    });

    it('los errores de validación del servidor se señalan en el campo y con el mensaje del catálogo', () => {
      set('vf-plate', 'ABC123');
      submit();
      http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` }).flush(
        { error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.model_year', type: 'less_than_equal' }] } },
        { status: 422, statusText: 'Unprocessable' },
      );
      fixture.detectChanges();

      expect(text('[data-testid="form-error"]')).toBe('Revisa los datos ingresados: hay campos inválidos.');
      expect(el().textContent).toContain('El servidor no aceptó este dato. Revísalo.');
    });

    it('un error de red se muestra sin cerrar el diálogo', () => {
      set('vf-plate', 'ABC123');
      submit();
      http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicles` }).error(new ProgressEvent('error'), { status: 0 } as Partial<HttpErrorResponse>);
      fixture.detectChanges();

      expect(text('[data-testid="form-error"]')).toContain('No fue posible comunicarse con el servidor');
    });
  });

  describe('editar desde el detalle', () => {
    const field = (id: string): HTMLInputElement | HTMLSelectElement => q<HTMLInputElement>(`#${id}`)!;
    const set = (id: string, value: string): void => {
      const control = field(id);

      control.value = value;
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
      fixture.detectChanges();
    };

    beforeEach(() => {
      init();
      click('[data-testid="view-detail"]');
      http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto() });
      fixture.detectChanges();
      click('[data-testid="edit-vehicle"]');
    });

    it('abre el formulario con los datos actuales, la placa fija y sin confirmación mientras no haya cambios estructurales', () => {
      expect(text('#vehicle-form-title')).toBe('Editar vehículo');
      expect(q('#vf-plate')).toBeNull();
      expect(text('.fixed')).toBe('ABC123');
      expect((field('vf-config') as HTMLSelectElement).value).toBe('C2');
      expect(field('vf-year').value).toBe('2018');
      expect(q('[data-testid="confirm-structural"]')).toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="save-vehicle"]')!.disabled).toBeTrue();
      expect(q('dialog[data-testid="vehicle-detail"]')).toBeNull();
    });

    it('un cambio no estructural envía solo ese campo, sin confirm_structural', () => {
      set('vf-fuel', 'GASOLINE');
      click('[data-testid="save-vehicle"]');

      const req = http.expectOne({ method: 'PATCH', url: `${VEHICLES_ORG_URL}/vehicles/veh-1` });
      expect(req.request.body).toEqual({ fuel_type: 'GASOLINE' });
      req.flush({ data: vehicleDto() });
    });

    it('cambiar la configuración exige marcar la confirmación y entonces envía confirm_structural: true', () => {
      set('vf-config', 'C3');

      const save = (): HTMLButtonElement => q<HTMLButtonElement>('[data-testid="save-vehicle"]')!;
      expect(q('[data-testid="confirm-structural"]')).not.toBeNull();
      expect(save().disabled).toBeTrue();

      click('[data-testid="confirm-structural"]');
      expect(save().disabled).toBeFalse();
      click('[data-testid="save-vehicle"]');

      const req = http.expectOne({ method: 'PATCH', url: `${VEHICLES_ORG_URL}/vehicles/veh-1` });
      expect(req.request.body).toEqual({ configuration_code: 'C3', confirm_structural: true });
      req.flush({ data: vehicleDto({ configuration_code: 'C3' }) });
    });

    it('el 422 VEHICLE_STRUCTURAL_CONFIRMATION_REQUIRED se explica con un mensaje claro', () => {
      set('vf-type', 'Tractocamión');
      click('[data-testid="confirm-structural"]');
      click('[data-testid="save-vehicle"]');
      http.expectOne({ method: 'PATCH', url: `${VEHICLES_ORG_URL}/vehicles/veh-1` }).flush(
        { error: { code: 'VEHICLE_STRUCTURAL_CONFIRMATION_REQUIRED' } },
        { status: 422, statusText: 'Unprocessable' },
      );
      fixture.detectChanges();

      expect(text('[data-testid="form-error"]')).toBe('Cambiar la configuración o el tipo del vehículo modifica su estructura. Marca la confirmación para continuar.');
    });

    it('poner el primer valor de un campo estructural vacío no exige confirmación', () => {
      TestBed.resetTestingModule();
      init([vehicleDto()], ['ORG_ADMIN']);
      click('[data-testid="view-detail"]');
      http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto({ configuration_code: null, vehicle_type: null }) });
      fixture.detectChanges();
      click('[data-testid="edit-vehicle"]');
      set('vf-config', 'C3');
      set('vf-type', 'Camión');

      expect(q('[data-testid="confirm-structural"]')).toBeNull();
      click('[data-testid="save-vehicle"]');
      const req = http.expectOne({ method: 'PATCH', url: `${VEHICLES_ORG_URL}/vehicles/veh-1` });
      expect(req.request.body).toEqual({ configuration_code: 'C3', vehicle_type: 'Camión' });
      req.flush({ data: vehicleDto() });
    });

    it('«Editar» no se ofrece sin vehicles:manage', () => {
      TestBed.resetTestingModule();
      init([vehicleDto()], ['ORG_VIEWER']);
      click('[data-testid="view-detail"]');
      http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto() });
      fixture.detectChanges();

      expect(q('[data-testid="edit-vehicle"]')).toBeNull();
    });
  });

  it('en la lista, un vehículo registrado desde Excel indica su origen y uno manual no', () => {
    init([vehicleDto({ id: 'v-1', plate: 'ABC123', source: 'IMPORT' }), vehicleDto({ id: 'v-2', plate: 'DEF456', plate_original: 'DEF456', source: 'MANUAL' })]);

    const rows = Array.from(el().querySelectorAll('[data-testid="vehicle-table"] tbody tr'));
    expect(rows[0].querySelector('[data-testid="source-import"]')!.textContent!.trim()).toBe('Origen: Excel');
    expect(rows[1].querySelector('[data-testid="source-import"]')).toBeNull();
  });
});

describe('VehiclesComponent: estimar rendimiento de pendientes', () => {
  let fixture: ComponentFixture<VehiclesComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function init(roles: string[], enabled: boolean, mode = 'ASK'): void {
    TestBed.configureTestingModule({ imports: [VehiclesComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehiclesComponent);
    fixture.detectChanges();
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    http.expectOne(`${EMISSIONS}/vehicles`).flush({ data: catalogDto() });
    fixture.detectChanges();
    const probes = http.match((r) => /\/efficiency$/.test(r.url));

    probes.forEach((r) => r.flush({ data: viewDto({ estimation_enabled: enabled }) }));
    http.match(SETTINGS_URL).forEach((r) => r.flush({ data: settingsDto({ mode }) }));
    fixture.detectChanges();
    expect(probes.length).toBe(roles.includes('ORG_ADMIN') ? 1 : 0);
  }

  afterEach(() => http.verify());

  it('ORG_ADMIN con la estimación encendida ve «Estimar rendimiento de pendientes» y abre el diálogo con la vista previa', () => {
    init(['ORG_ADMIN'], true);
    const button = el().querySelector<HTMLButtonElement>('[data-testid="open-estimation"]')!;

    expect(button.textContent).toContain('Estimar rendimiento de pendientes');
    button.click();
    fixture.detectChanges();
    expect(http.expectOne(`${VEHICLES_ORG_URL}/vehicles/efficiency/estimate/preview`).request.body).toEqual({ all_pending: true });
    expect(el().querySelector('[data-testid="estimation-dialog"]')).not.toBeNull();
  });

  it('con la estimación apagada en el servidor el botón no existe', () => {
    init(['ORG_ADMIN'], false);

    expect(el().querySelector('[data-testid="open-estimation"]')).toBeNull();
    expect(el().querySelector('[data-testid="open-ficha"]')).not.toBeNull();
  });

  it('con la estimación desactivada para la empresa (OFF) el botón se ve deshabilitado con su nota y no abre nada', () => {
    init(['ORG_ADMIN'], true, 'OFF');
    const button = el().querySelector<HTMLButtonElement>('[data-testid="open-estimation"]')!;

    expect(button.disabled).toBeTrue();
    expect(button.title).toBe('La estimación está desactivada para tu empresa. Actívala en Configuración.');
    button.click();
    http.expectNone(`${VEHICLES_ORG_URL}/vehicles/efficiency/estimate/preview`);
  });

  it('analista y lector no ven el botón ni preguntan por la bandera', () => {
    init(['ORG_ANALYST'], true);

    expect(el().querySelector('[data-testid="open-estimation"]')).toBeNull();
  });
});
