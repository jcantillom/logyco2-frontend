import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { EmissionFactorDto } from '../../infrastructure/dto/emissions.dto';
import { EmissionsFacade } from './emissions.facade';
import { API, factorDto, GASOLINE, NATURAL_GAS } from './emissions.fixtures';
import { FactorCardComponent } from './factor-card.component';

describe('FactorCardComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<FactorCardComponent>;
  const el = (): HTMLElement => fixture.nativeElement;
  const text = (id: string): string | null => el().querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
  const choose = (code: string): void => { el().querySelector<HTMLButtonElement>(`[data-testid="fuel-${code}"]`)!.click(); fixture.detectChanges(); };
  const status = (): Element => el().querySelector('[data-testid="factor-status"]')!;

  function render(dto: EmissionFactorDto, others: EmissionFactorDto[] = [GASOLINE(), NATURAL_GAS()]): void {
    TestBed.inject(EmissionsFacade).loadFuels();
    http.expectOne(`${API}/reference/fuels`).flush({ data: [dto, ...others], meta: {} });
    fixture = TestBed.createComponent(FactorCardComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
  });
  afterEach(() => http.verify());

  it('VERIFIED: valor grande con coma decimal y su unidad, el nombre del combustible, la insignia «Verificado» junto al selector y la descripción', () => {
    render(factorDto({ value: '10.1526' }));

    expect(text('factor-value')).toBe('10,1526');
    expect(text('factor-unit')).toBe('kg CO₂/gal');
    expect(text('factor-name')).toBe('Diésel B2');
    expect(status().textContent!.trim()).toBe('Verificado');
    expect(status().classList).toContain('pill');
    expect(el().querySelector('.top')!.contains(status())).toBeTrue();
    expect(el().querySelector('.panel')!.classList).not.toContain('neutral');
    expect(el().textContent).toContain('Este valor permite estimar las emisiones de CO₂ asociadas al consumo de diésel B2');
  });

  it('cada combustible cambia el panel: nombre, valor y unidad con su símbolo (kg CO₂/gal o kg CO₂/m³) y su propia fuente', () => {
    render(factorDto());
    choose('GASOLINE_MOTOR');
    expect(text('factor-name')).toBe('Gasolina motor (sin mezcla)');
    expect(text('factor-value')).toBe('8,2000');
    expect(text('factor-unit')).toBe('kg CO₂/gal');
    expect(text('factor-source')).toBe('Fuente gasolina');

    choose('NATURAL_GAS');
    expect(text('factor-name')).toBe('Gas natural (m³ estándar)');
    expect(text('factor-value')).toBe('1,9000');
    expect(text('factor-unit')).toBe('kg CO₂/m³');
    expect(el().textContent).toContain('asociadas al consumo de gas natural');
  });

  it('PENDING_VALIDATION: el valor con una insignia ámbar suave y nunca la insignia «Verificado»', () => {
    render(factorDto({ verification_status: 'PENDING_VALIDATION', usable_for_calculation: false }));

    expect(status().textContent!.trim()).toBe('Valor configurado — pendiente de validación');
    expect(status().classList).toContain('badge-warning');
    expect(el().querySelector('.pill')).toBeNull();
    expect(el().querySelector('.panel')!.classList).not.toContain('neutral');
    expect(text('factor-value')).toBe('10,1000');
    expect(el().textContent).not.toContain('Verificado');
  });

  it('NOT_CONFIGURED: panel neutro con el icono atenuado, «Factor pendiente de configuración» y sin valor', () => {
    render(factorDto({ value: null, source_name: null, source_document: null, source_url: null, reference_year: null, verification_status: 'NOT_CONFIGURED', usable_for_calculation: false }));

    expect(el().querySelector('.panel')!.classList).toContain('neutral');
    expect(status().textContent!.trim()).toBe('Factor pendiente de configuración');
    expect(el().querySelector('.pill')).toBeNull();
    expect(text('factor-value')).toBeNull();
  });

  it('INVALID_CONFIGURATION: panel neutro con insignia de peligro, el aviso a quien administra y sin valor aunque llegue', () => {
    render(factorDto({ value: '99', verification_status: 'INVALID_CONFIGURATION', usable_for_calculation: false }));

    expect(el().querySelector('.panel')!.classList).toContain('neutral');
    expect(status().classList).toContain('badge-danger');
    expect(status().textContent!.trim()).toBe('Configuración inválida: avisa a quien administra la plataforma');
    expect(text('factor-value')).toBeNull();
    expect(el().textContent).not.toContain('99');
  });

  it('no muestra año de referencia, ayuda ⓘ ni enlaces: Fuente y Documento son texto de hasta dos líneas con título', () => {
    render(factorDto({ source_url: 'https://example.test/fuente', source_name: 'Una fuente con un nombre muy largo '.repeat(6).trim() }));
    const source = el().querySelector<HTMLElement>('[data-testid="factor-source"]')!;

    expect(el().querySelector('a')).toBeNull();
    expect(el().textContent).not.toContain('Consultar fuente');
    expect(el().textContent).not.toContain('Año de referencia');
    expect(el().querySelector('[data-testid="factor-help"]')).toBeNull();
    expect(el().querySelector('[data-testid="factor-equation"]')).toBeNull();
    expect(el().querySelector('[data-testid="factor-caption"]')).toBeNull();
    expect(text('factor-document')).toBe('Documento de prueba');
    expect(getComputedStyle(source).whiteSpace).not.toBe('nowrap');
    expect(getComputedStyle(source).webkitLineClamp).toBe('2');
    expect(source.getAttribute('title')).toBe(source.textContent!.trim());
  });

  it('el selector es un radiogroup: único con tabindex 0 el elegido, indicador deslizante y flechas/Inicio/Fin', () => {
    render(factorDto());
    const group = el().querySelector<HTMLElement>('[role="radiogroup"]')!;
    const radios = (): HTMLButtonElement[] => Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const key = (name: string): void => { radios().find((r) => r.tabIndex === 0)!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); fixture.detectChanges(); };

    expect(group.getAttribute('aria-label')).toBe('Combustible');
    expect(radios().map((r) => r.textContent!.trim())).toEqual(['Diésel B2', 'Gasolina motor', 'Gas natural']);
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    expect(group.querySelector('.thumb')!.getAttribute('aria-hidden')).toBe('true');
    expect(group.style.getPropertyValue('--i')).toBe('0');
    key('ArrowRight');
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(group.style.getPropertyValue('--i')).toBe('1');
    expect(document.activeElement).toBe(radios()[1]);
    key('End');
    expect(text('factor-name')).toBe('Gas natural (m³ estándar)');
    key('ArrowRight');
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
    key('ArrowLeft');
    expect(radios()[2].getAttribute('aria-checked')).toBe('true');
    key('Home');
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
  });

  it('el valor está en una región aria-live y los iconos son planos y decorativos', () => {
    render(factorDto());

    expect(el().querySelector('[data-testid="factor-live"]')!.getAttribute('aria-live')).toBe('polite');
    expect(el().querySelector('[data-testid="factor-live"] [data-testid="factor-value"]')).not.toBeNull();
    expect(el().querySelector('app-icon-3d')).toBeNull();
    expect(el().querySelectorAll('.panel app-glyph svg[aria-hidden="true"]').length).toBeGreaterThan(2);
  });

  it('el icono y el valor forman una composición simétrica: dos mitades iguales, ambos centrados en el mismo eje, con la altura del icono igual a la del bloque del valor', () => {
    render(factorDto());
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('.thumb') && c.includes('.pump'))!;
    const hero = el().querySelector<HTMLElement>('.hero')!;
    const icon = hero.firstElementChild as HTMLElement;
    const main = hero.lastElementChild as HTMLElement;

    expect(css).toMatch(/\.hero[^{]*\{[^}]*--block-h:\s*clamp\(72px, 8\.6vh, 104px\)[^}]*grid-template-columns:\s*1fr 1fr[^}]*align-items:\s*center/);
    expect(css).toMatch(/\.pump[^{]*\{[^}]*justify-self:\s*center[^}]*font-size:\s*var\(--block-h\)/);
    expect(css).toMatch(/\.main[^{]*\{[^}]*justify-self:\s*center[^}]*min-height:\s*var\(--block-h\)[^}]*text-align:\s*center/);
    expect(css).toMatch(/\.hero[^{]*::?before[^{]*\{[^}]*border-left:\s*1px dashed/);
    expect(css).toMatch(/@media \(max-width: 1199px\)[^@]*\.hero[^{]*\{[^}]*grid-template-columns:\s*1fr/);
    expect(icon.tagName.toLowerCase()).toBe('app-glyph');
    expect(icon.getAttribute('name')).toBe('pump');
    expect(main.classList).toContain('main');
    expect(getComputedStyle(hero).display).toBe('grid');
    expect(getComputedStyle(hero).alignItems).toBe('center');
    expect(getComputedStyle(main).textAlign).toBe('center');
    expect(getComputedStyle(main).alignItems).toBe('center');
    expect(Number.parseFloat(getComputedStyle(icon).fontSize)).toBeGreaterThanOrEqual(56);
  });

  it('el fundido al cambiar de combustible solo existe con movimiento permitido y usa opacity y transform', () => {
    render(factorDto());
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('.thumb') && c.includes('@keyframes'))!;
    const allowed = css.indexOf('prefers-reduced-motion: no-preference');
    const frame = css.match(/@keyframes [\w-]*swap \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)![0];

    expect(allowed).toBeGreaterThan(-1);
    expect(css.search(/animation:[^;]*swap/)).toBeGreaterThan(allowed);
    expect(frame).toMatch(/opacity/);
    expect(frame).toMatch(/transform/);
    expect(frame).not.toMatch(/\b(left|top|width|height|margin)\s*:/);
    expect(css).not.toMatch(/@keyframes [\w-]*(?:draw|rise)/);
  });

  it('un error de carga muestra el mensaje y permite reintentar', () => {
    TestBed.inject(EmissionsFacade).loadFuels();
    http.expectOne(`${API}/reference/fuels`).flush({}, { status: 500, statusText: 'Server Error' });
    fixture = TestBed.createComponent(FactorCardComponent);
    fixture.detectChanges();

    expect(el().querySelector('[role="alert"]')).not.toBeNull();
    (Array.from(el().querySelectorAll('button')).find((b) => b.textContent!.includes('Reintentar')) as HTMLButtonElement).click();
    http.expectOne(`${API}/reference/fuels`);
  });

  it('mientras carga muestra el estado de carga', () => {
    TestBed.inject(EmissionsFacade).loadFuels();
    fixture = TestBed.createComponent(FactorCardComponent);
    fixture.detectChanges();

    expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();
    http.expectOne(`${API}/reference/fuels`);
  });

  it('el bloque del valor tiene siempre tres líneas: número solo, unidad completa en una línea (sin partirse) y nombre del combustible; el valor se muestra tal como lo envía el servidor', () => {
    render(factorDto({ value: '10.149' }), [GASOLINE({ value: '8.808' }), NATURAL_GAS({ value: '1.980' })]);
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('.thumb') && c.includes('.unit'))!;
    const lines = (): string[] => Array.from(el().querySelectorAll('.main .swap > p')).map((p) => p.getAttribute('data-testid') ?? 'meta');

    expect(lines()).toEqual(['factor-value', 'factor-unit', 'meta']);
    expect(text('factor-value')).toBe('10,149');
    expect(text('factor-unit')).toBe('kg CO₂/gal');
    expect(getComputedStyle(el().querySelector('[data-testid="factor-unit"]')!).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(el().querySelector('[data-testid="factor-value"]')!).whiteSpace).toBe('nowrap');
    expect(css).toMatch(/\.unit[^{]*\{[^}]*white-space:\s*nowrap/);

    choose('NATURAL_GAS');
    expect(lines()).toEqual(['factor-value', 'factor-unit', 'meta']);
    expect(text('factor-value')).toBe('1,980');
    expect(text('factor-unit')).toBe('kg CO₂/m³');
    expect(getComputedStyle(el().querySelector('[data-testid="factor-value"]')!).textAlign).toBe('center');
  });
});
