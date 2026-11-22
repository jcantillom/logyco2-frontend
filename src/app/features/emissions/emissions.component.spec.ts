import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { EmissionsComponent } from './emissions.component';
import { API, catalogDto, fuelsDto } from './emissions.fixtures';

describe('EmissionsComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<EmissionsComponent>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(EmissionsComponent);
    fixture.detectChanges();
    http.expectOne(`${API}/vehicles`).flush({ data: catalogDto(), meta: {} });
    http.expectOne(`${API}/reference/fuels`).flush({ data: fuelsDto(), meta: {} });
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('muestra el título y el subtítulo directamente sobre las tarjetas, sin fila de pestañas ni enlaces de sección', () => {
    expect(el().querySelector('h1')!.textContent).toBe('Guía de cálculo y vehículos de carga');
    expect(el().textContent).toContain('Conoce los tipos de camiones y cómo LoGyCO₂ calcula las emisiones de CO₂ del transporte de carga');
    expect(el().querySelector('nav')).toBeNull();
    expect(el().querySelector('[role="tablist"], [role="tab"], [aria-current]')).toBeNull();
    expect(el().querySelector('a[href^="#section-"]')).toBeNull();
  });

  it('todas las tarjetas están a la vista y cada una es una sección con nombre (h2 enlazado por aria-labelledby)', () => {
    const sections = Array.from(el().querySelectorAll<HTMLElement>('section.card'));

    expect(sections.map((s) => s.dataset['testid'])).toEqual(['section-vehicles', 'section-formulas', 'section-factor', 'section-calculator', 'section-concepts']);
    for (const section of sections) {
      const heading = el().querySelector(`#${section.getAttribute('aria-labelledby') ?? ''}`);
      expect(heading?.tagName).withContext(section.dataset['testid'] ?? '').toBe('H2');
    }
    expect(el().querySelectorAll('h1').length).toBe(1);
    expect(el().querySelector('[hidden]')).toBeNull();
  });

  it('los componentes de cada sección están en la página', () => {
    for (const tag of ['app-vehicle-catalog', 'app-formulas', 'app-factor-card', 'app-emissions-simulator', 'app-key-concepts']) expect(el().querySelector(tag)).withContext(tag).not.toBeNull();
    expect(el().querySelector('[data-testid="section-calculator"] h2')!.textContent).toBe('Simula las emisiones de un recorrido');
  });

  it('«Conceptos clave» ofrece las tres preguntas', () => {
    const questions = Array.from(el().querySelectorAll('[data-testid="concept"] summary')).map((s) => s.textContent);

    expect(questions).toEqual(['¿Qué es el rendimiento del vehículo?', '¿Qué es el peso bruto vehicular (PBV)?', '¿Qué significa kg CO₂/gal?']);
    expect(el().textContent).toContain('No es la capacidad de carga útil');
  });

  it('define el tablero a pantalla completa: rejilla de alto de ventana en pantallas anchas y altas, y apilado con scroll en las demás', () => {
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').filter((c) => c.includes('section-') || c.includes('minmax(min-content, 1fr)')).join('\n');

    expect(css).toContain('@media (min-width: 1200px) and (min-height: 700px)');
    expect(css).toContain('grid-template-rows: auto auto repeat(2, minmax(min-content, 1fr))');
    expect(css).toContain('@media (max-width: 1199px)');
  });

  it('usa los componentes de la plataforma: «Calcular» es el botón primario, «Ver tabla completa» el secundario, y la cabecera no lleva icono de camión', () => {
    expect(el().querySelector('[data-testid="simulate"]')!.classList).toContain('btn-primary');
    expect(el().querySelector('[data-testid="open-table"]')!.classList).toContain('btn-secondary');
    expect(el().querySelectorAll('app-card-head .ico').length).toBe(5);
    expect(el().querySelector('.head-ico')).toBeNull();
    expect(el().querySelector('header.head svg')).toBeNull();
    expect(el().querySelector('h1')!.parentElement!.parentElement!.firstElementChild).toBe(el().querySelector('h1')!.parentElement);
  });

  it('el CSS de la guía usa la paleta autorizada: tokens de marca, sin hexadecimales, sin --c-accent en los iconos y tintes solo al 20/40/60/80 %', () => {
    const own = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').filter((c) => /section-|\.decoder|\.legend|\.errline|\.arch|\.frac|\.thumb/.test(c) || c.includes('minmax(min-content, 1fr)') || c.includes('clamp(32px, 4.4vh, 40px)'));
    const all = own.join('\n');

    expect(own.length).toBeGreaterThan(0);
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(all).toContain('--c-primary');
    expect(all).not.toMatch(/background[^;}]*--c-secondary/);
    expect(all).not.toMatch(/border[^;}]*--c-secondary/);
    expect(all).toMatch(/\.num[^{]*\{[^}]*--c-primary/);
    expect(all).toMatch(/\.tile[^{]*> app-glyph[^{]*\{[^}]*--c-primary/);
    expect(all).toContain('--c-head');
    const chip = own.find((c) => c.includes('clamp(32px, 4.4vh, 40px)'))!;
    expect(chip).toMatch(/\.ico[^{]*\{[^}]*var\(--c-primary\)/);
    expect(chip).not.toMatch(/\.ico[^{]*\{[^}]*--c-accent/);
    const percents = Array.from(all.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)).map((m) => Number(m[1]));
    expect(percents.length).toBeGreaterThan(5);
    for (const percent of percents) expect([20, 40, 60, 80]).withContext(`color-mix ${percent}%`).toContain(percent);
  });

  it('el selector de combustible del factor y el de la calculadora están sincronizados', () => {
    const pressed = (root: string): string[] => Array.from(el().querySelectorAll<HTMLButtonElement>(`${root} .seg button[aria-pressed="true"], ${root} .seg button[aria-checked="true"]`)).map((b) => b.textContent!.trim());

    expect(pressed('app-factor-card')).toEqual(['Diésel B2']);
    expect(pressed('app-emissions-simulator')).toEqual(['Diésel B2']);

    el().querySelector<HTMLButtonElement>('[data-testid="fuel-NATURAL_GAS"]')!.click();
    fixture.detectChanges();
    expect(pressed('app-emissions-simulator')).toEqual(['Gas natural']);
    expect(el().querySelector('label[for="sim-efficiency"]')!.textContent).toContain('km/m³');

    el().querySelector<HTMLButtonElement>('[data-testid="sim-fuel-GASOLINE_MOTOR"]')!.click();
    fixture.detectChanges();
    expect(pressed('app-factor-card')).toEqual(['Gasolina motor']);
    expect(el().querySelector('[data-testid="factor-name"]')!.textContent).toBe('Gasolina motor (sin mezcla)');
  });

  it('la fila de vehículos toma el alto de su contenido (fila auto) y las dos inferiores se reparten el resto', () => {
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('minmax(min-content, 1fr)'))!;
    const cards = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('perspective: 640px'))!;

    expect(css).toMatch(/grid-template-rows:\s*auto auto repeat\(2, minmax\(min-content, 1fr\)\)/);
    expect(cards).toMatch(/--diagram-max-h:\s*clamp\(40px, 5\.6vh, 64px\)/);
    expect(Array.from(el().querySelectorAll('.page > *')).map((n) => n.tagName.toLowerCase())).toEqual(['header', 'app-vehicle-catalog', 'div', 'div']);
  });
});
