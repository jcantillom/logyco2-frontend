import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { FreightVehicleDto } from '../../infrastructure/dto/emissions.dto';
import { EmissionsFacade } from './emissions.facade';
import { API, VEHICLES, catalogDto, vehicleDto } from './emissions.fixtures';
import { VehicleCatalogComponent } from './vehicle-catalog.component';

describe('VehicleCatalogComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<VehicleCatalogComponent>;
  const el = (): HTMLElement => fixture.nativeElement;
  const q = <T extends Element = HTMLElement>(selector: string): T => el().querySelector<T>(selector)!;
  const featuredCodes = (): string[] => Array.from(el().querySelectorAll('[data-testid="vehicle-card"] [data-testid="vehicle-code"]')).map((n) => n.textContent!.trim());
  const tableCodes = (): string[] => Array.from(el().querySelectorAll('[data-testid="table-open"]')).map((n) => n.textContent!.trim());
  const click = (selector: string): void => { q(selector).click(); fixture.detectChanges(); };
  const cardFor = (code: string): HTMLElement => Array.from(el().querySelectorAll<HTMLElement>('[data-testid="vehicle-card"]')).find((c) => c.querySelector('[data-testid="vehicle-code"]')!.textContent!.trim() === code)!;
  const closeDialog = async (testId: string): Promise<void> => {
    const closed = new Promise((resolve) => q<HTMLDialogElement>(`[data-testid="${testId}"]`).addEventListener('close', resolve, { once: true }));
    click(`[data-testid="${testId === 'vehicle-detail' ? 'detail-close' : 'table-close'}"]`);
    await closed;
    fixture.detectChanges();
  };

  function render(items: FreightVehicleDto[] = VEHICLES): void {
    TestBed.inject(EmissionsFacade).loadVehicles();
    http.expectOne(`${API}/vehicles`).flush({ data: catalogDto(items), meta: {} });
    fixture = TestBed.createComponent(VehicleCatalogComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
  });
  afterEach(() => http.verify());

  it('la fila muestra solo los vehículos que el servidor marca como destacados, sin fijar códigos', () => {
    render();

    expect(featuredCodes()).toEqual(['C2', 'C3', 'C4', 'C2S1', 'C3S3']);
  });

  it('si ninguno viene destacado se muestran los cinco primeros del catálogo, en su orden', () => {
    render(VEHICLES.map((v) => ({ ...v, featured: undefined })));

    expect(featuredCodes()).toEqual(VEHICLES.slice(0, 5).map((v) => v.code));
  });

  it('cada tarjeta trae código, nombre, ejes y PBV máx. (el mayor de las variantes; «sin dato verificado» si no hay)', () => {
    render([...VEHICLES.slice(0, 3), vehicleDto({ featured: true, code: 'C3S3', name: 'Tractocamión', family: 'TRACTOR', truck_axles: 3, trailer_axles: 3, trailer_kind: 'S', total_axles: 6, gross_weight_kg: null, verified: false })]);
    const text = (code: string, id: string): string => cardFor(code).querySelector(`[data-testid="${id}"]`)!.textContent!.trim();

    expect(text('C2', 'vehicle-pbv')).toBe('PBV máx: 17.000 kg');
    expect(text('C2', 'vehicle-axles')).toBe('2 ejes');
    expect(cardFor('C2').querySelector('h3')!.textContent).toBe('Camión rígido');
    expect(cardFor('C2').textContent).not.toContain('uno delantero');
    expect(text('C4', 'vehicle-pbv')).toBe('PBV máx: 36.000 kg');
    expect(text('C3S3', 'vehicle-axles')).toBe('6 ejes (3 + 3)');
    expect(text('C3S3', 'vehicle-pbv')).toBe('PBV: sin dato verificado');
  });

  it('el subtítulo cita el número de la resolución del servidor', () => {
    render();

    expect(el().textContent).toContain('Algunas configuraciones según la Resolución 20223040045295.');
    expect(el().textContent).toContain('Consulta la tabla completa para ver todas.');
  });

  it('elegir una tarjeta la marca (borde verde) y abre el detalle con PBV, tolerancia, dimensiones y la aclaración de carga útil', () => {
    render();
    const button = cardFor('C2');
    button.focus();
    button.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(cardFor('C3').getAttribute('aria-pressed')).toBe('false');
    const dialog = q<HTMLDialogElement>('[data-testid="vehicle-detail"]');
    expect(dialog.open).toBeTrue();
    expect(q('[data-testid="detail-pbv"]').textContent).toBe('17.000 kg');
    expect(q('[data-testid="detail-tolerance"]').textContent).toBe('500 kg');
    expect(q('[data-testid="detail-length"]').textContent).toBe('12,2 m');
    expect(q('[data-testid="detail-width"]').textContent).toBe('2,6 m');
    expect(q('[data-testid="detail-height"]').textContent).toBe('4,4 m');
    expect(q('[data-testid="detail-pbv-note"]').textContent).toContain('no es la capacidad de carga útil');
    expect(q('[data-testid="detail-citation"]').textContent).toContain('Art. 8');
  });

  it('cerrar el detalle quita el diálogo, desmarca la selección y devuelve el foco a la tarjeta', async () => {
    render();
    const button = cardFor('C3');
    button.focus();
    button.click();
    fixture.detectChanges();
    TestBed.tick();
    await closeDialog('vehicle-detail');

    expect(el().querySelector('[data-testid="vehicle-detail"]')).toBeNull();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('el detalle muestra el nombre completo, decodifica el código y, en el C3, ofrece las dos disposiciones de ejes', () => {
    render();
    cardFor('C3').click();
    fixture.detectChanges();
    TestBed.tick();
    const groupsDrawn = (): number[] => Array.from(el().querySelectorAll('[data-testid="vehicle-detail"] g.axle[data-group]')).map((g) => Number(g.getAttribute('data-group')));

    expect(el().querySelector('[data-testid="vehicle-detail"] h2')!.textContent).toBe('Camión rígido de tres ejes (uno delantero y un tándem trasero)');
    expect(Array.from(el().querySelectorAll('[data-testid="code-decoder"] li b')).map((n) => n.textContent)).toEqual(['C', '3']);
    expect(el().querySelector('[data-testid="code-decoder"]')!.textContent).toContain('Camión');
    expect(groupsDrawn()).toEqual([0, 1, 1]);
    click('[data-testid="layout-tandem_steering"]');
    expect(groupsDrawn()).toEqual([0, 0, 1]);
    expect(q('[data-testid="layout-note"]').textContent).toContain('direccionales');
    click('[data-testid="layout-default"]');
    expect(groupsDrawn()).toEqual([0, 1, 1]);
  });

  it('un vehículo sin disposiciones alternativas no muestra el selector y, sin guía, no hay decodificador', () => {
    TestBed.inject(EmissionsFacade).loadVehicles();
    const dto = catalogDto();
    delete dto.code_guide;
    http.expectOne(`${API}/vehicles`).flush({ data: dto, meta: {} });
    fixture = TestBed.createComponent(VehicleCatalogComponent);
    fixture.detectChanges();
    cardFor('C2').click();
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="layout-default"]')).toBeNull();
    expect(el().querySelector('[data-testid="code-decoder"]')).toBeNull();
  });

  it('el detalle de un vehículo con variantes las lista; sin verificar no inventa PBV', async () => {
    render();
    cardFor('C4').click();
    fixture.detectChanges();
    TestBed.tick();
    expect(el().querySelectorAll('[data-testid="detail-variants"] li').length).toBe(2);
    await closeDialog('vehicle-detail');

    click('[data-testid="open-table"]');
    TestBed.tick();
    const row = Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="table-open"]')).find((b) => b.textContent!.trim() === 'C3R3')!;
    row.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(q('[data-testid="detail-pbv-pending"]').textContent).toContain('no verificado');
    expect(el().querySelector('[data-testid="detail-pbv"]')).toBeNull();
  });

  it('«Ver tabla completa» abre un diálogo con TODAS las configuraciones, sus datos y devuelve el foco al botón al cerrar', async () => {
    render();
    const open = q<HTMLButtonElement>('[data-testid="open-table"]');
    open.focus();
    open.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(q<HTMLDialogElement>('[data-testid="vehicle-table"]').open).toBeTrue();
    expect(tableCodes()).toEqual(VEHICLES.map((v) => v.code));
    expect(q('[data-testid="code-guide"]').textContent).toContain('C = Camión');
    expect(q('[data-testid="code-guide"]').textContent).toContain('S = Semirremolque');
    expect(q('[data-testid="code-guide"]').textContent).toContain('El número indica los ejes de esa parte.');
    expect(el().querySelectorAll('[data-testid="table-row"]')[0].textContent).toContain('uno delantero y uno trasero');
    const row = el().querySelectorAll('[data-testid="table-row"]')[2];
    expect(row.textContent).toContain('36.000 kg');
    expect(row.textContent).toContain('500 kg');
    expect(row.querySelector('svg[role="img"]')).not.toBeNull();
    expect(el().querySelectorAll('[data-testid="table-row"]')[9].textContent).toContain('Sin dato verificado');

    await closeDialog('vehicle-table');
    expect(el().querySelector('[data-testid="vehicle-table"]')).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it('en la tabla los filtros por familia dejan solo esa familia y «Todos» las devuelve', () => {
    render();
    click('[data-testid="open-table"]');

    click('[data-testid="filter-RIGID"]');
    expect(tableCodes()).toEqual(['C2', 'C3', 'C4']);
    click('[data-testid="filter-TRACTOR"]');
    expect(tableCodes()).toEqual(['C2S1', 'C3S3']);
    click('[data-testid="filter-TRAILER"]');
    expect(tableCodes()).toEqual(['C2R2', 'R2', 'C3R3']);
    click('[data-testid="filter-BALANCED_TRAILER"]');
    expect(tableCodes()).toEqual(['C2B1', 'B1']);
    expect(q('[data-testid="filter-BALANCED_TRAILER"]').getAttribute('aria-pressed')).toBe('true');
    click('[data-testid="filter-ALL"]');
    expect(tableCodes().length).toBe(VEHICLES.length);
  });

  it('en la tabla la búsqueda coincide con el código y la designación, sin distinguir mayúsculas', () => {
    render();
    click('[data-testid="open-table"]');
    const type = (value: string): void => { const input = q<HTMLInputElement>('[data-testid="vehicle-search"]'); input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };

    type('c3s');
    expect(tableCodes()).toEqual(['C3S3']);
    type('2S1');
    expect(tableCodes()).toEqual(['C2S1']);
    type('zzz');
    expect(tableCodes()).toEqual([]);
    expect(q('[data-testid="vehicles-empty"]').textContent).toContain('Ningún vehículo');
  });

  it('la fuente normativa va en la tabla completa como enlace externo seguro', () => {
    render();
    click('[data-testid="open-table"]');
    const link = q<HTMLAnchorElement>('[data-testid="regulation"] a');

    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.href).toBe('https://example.test/norma');
    expect(q('[data-testid="regulation"]').textContent).toContain('MinTransporte');
  });

  it('mientras carga no ofrece la tabla completa', () => {
    TestBed.inject(EmissionsFacade).loadVehicles();
    fixture = TestBed.createComponent(VehicleCatalogComponent);
    fixture.detectChanges();

    expect(q<HTMLButtonElement>('[data-testid="open-table"]').disabled).toBeTrue();
    http.expectOne(`${API}/vehicles`);
  });

  describe('efecto 3D de las tarjetas', () => {
    const diagram = (): HTMLElement => cardFor('C2').querySelector('app-vehicle-diagram')!;
    const pointer = (type: string, pointerType: string, x = 10, y = 10): void => {
      cardFor('C2').dispatchEvent(new PointerEvent(type, { pointerType, clientX: x, clientY: y, bubbles: true }));
      fixture.detectChanges();
    };

    it('cada tarjeta es un botón nativo (se abre con clic, Enter o Espacio) con un solo dibujo accesible dentro', () => {
      render();
      const card = cardFor('C2');

      expect(card.tagName).toBe('BUTTON');
      expect(card.getAttribute('type')).toBe('button');
      expect(card.querySelectorAll('svg[role="img"]').length).toBe(1);
      card.click();
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="vehicle-detail"]')).not.toBeNull();
    });

    it('al pasar el ratón las ruedas dan una vuelta y al salir vuelven al reposo', () => {
      render();
      pointer('pointerenter', 'mouse');
      expect(diagram().classList).toContain('spinning');
      pointer('pointerleave', 'mouse');
      expect(diagram().classList).not.toContain('spinning');
    });

    it('el vehículo se inclina con el puntero (máximo 6°) solo con ratón y sin «reducir movimiento»', () => {
      render();
      const host = el().querySelector('app-vehicle-card') as HTMLElement;
      const box = cardFor('C2').getBoundingClientRect();

      pointer('pointermove', 'mouse', box.right, box.bottom);
      expect(host.style.getPropertyValue('--ry')).toBe('6.0deg');
      expect(host.style.getPropertyValue('--rx')).toBe('-6.0deg');
      pointer('pointerleave', 'mouse');
      expect(host.style.getPropertyValue('--ry')).toBe('');

      pointer('pointermove', 'touch', box.right, box.bottom);
      expect(host.style.getPropertyValue('--ry')).toBe('');

      spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
      pointer('pointermove', 'mouse', box.right, box.bottom);
      expect(host.style.getPropertyValue('--ry')).toBe('');
    });

    it('el CSS solo anima transform y box-shadow, y con «reducir movimiento» o sin hover quita la elevación y la inclinación', () => {
      render();
      const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('perspective: 640px'))!;

      expect(css).toMatch(/perspective: 640px/);
      expect(css).toMatch(/transition:\s*transform[^;]*box-shadow/);
      expect(css).toMatch(/@media \(hover: hover\)[\s\S]*--lift: -4px/);
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\), \(hover: none\)[\s\S]*transition: none;[\s\S]*transform: none/);
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
  });
});
