import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { EmissionFactorDto } from '../../infrastructure/dto/emissions.dto';
import { EmissionsFacade } from './emissions.facade';
import { API, factorDto, GASOLINE, NATURAL_GAS } from './emissions.fixtures';
import { FormulasComponent } from './formulas.component';

describe('FormulasComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<FormulasComponent>;
  const el = (): HTMLElement => fixture.nativeElement;
  const text = (id: string): string | null => el().querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
  const help = (n: number): void => { el().querySelector<HTMLButtonElement>(`[data-testid="formula-help-${n}"]`)!.click(); fixture.detectChanges(); };
  const type = (id: string, value: string): void => {
    const input = el().querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  function render(factor: EmissionFactorDto): void {
    TestBed.inject(EmissionsFacade).loadFuels();
    http.expectOne(`${API}/reference/fuels`).flush({ data: [factor, GASOLINE(), NATURAL_GAS()], meta: {} });
    fixture = TestBed.createComponent(FormulasComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
  });
  afterEach(() => http.verify());

  it('muestra las tres fórmulas numeradas con su nombre, maquetadas con fracciones y sin valores precargados', () => {
    render(factorDto());
    const titles = Array.from(el().querySelectorAll('li[data-testid^="formula-"] h3')).map((n) => n.textContent);

    expect(titles).toEqual(['Rendimiento del vehículo', 'Combustible consumido', 'Emisiones de CO₂']);
    expect(el().querySelectorAll('.frac').length).toBe(2);
    expect(el().textContent).toContain('kg CO₂ = Galones × Factor (kg CO₂/gal)');
    expect(el().querySelectorAll('img').length).toBe(0);
    expect(el().querySelectorAll('input').length).toBe(0);
  });

  it('los ejemplos viven en la ayuda ⓘ de cada fórmula, con las variables y unidades y sin valores precargados', () => {
    render(factorDto());
    help(1);
    const dialog = el().querySelector('[data-testid="formula-info"]')!;

    expect(dialog.textContent).toContain('Kilómetros recorridos (km)');
    expect(dialog.textContent).toContain('Galones consumidos (gal)');
    for (const input of Array.from(dialog.querySelectorAll<HTMLInputElement>('input'))) {
      expect(input.value).toBe('');
      expect(input.placeholder).not.toBe('');
    }
    expect(el().querySelector('[data-testid="formula-help-1"]')!.getAttribute('aria-label')).toContain('Rendimiento del vehículo');
  });

  it('la nota al pie aclara las unidades del gas natural', () => {
    render(factorDto());

    expect(text('formulas-footnote')).toBe('Con gas natural el volumen se expresa en m³ estándar y el rendimiento en km/m³.');
  });

  it('aclara, en la ayuda de las fórmulas 1 y 2, que no son secuenciales (y no en la 3)', () => {
    render(factorDto());
    help(1);

    expect(text('formulas-note')).toBe('Usa la 1 si conoces el consumo; usa la 2 si conoces el rendimiento. Sin ninguno de los dos no se puede calcular.');
  });

  it('el ejemplo 1 calcula el rendimiento y el 2 los galones, y ambos se rotulan como ilustración', () => {
    render(factorDto());
    help(1);
    type('ex1-km', '300');
    type('ex1-gal', '25');
    expect(text('example-1')).toBe('Rendimiento: 12 km/gal');
    el().querySelector<HTMLButtonElement>('[data-testid="formula-info-close"]')!.click();
    help(2);
    type('ex2-km', '300');
    type('ex2-eff', '12,5');

    expect(text('example-2')).toBe('Combustible: 24 gal');
    expect(el().textContent).toContain('Ilustración con tus propios números');
    expect(el().textContent).toContain('no es el rendimiento de un camión típico');
  });

  it('un ejemplo con cero, texto o un solo valor no da resultado', () => {
    render(factorDto());
    help(1);
    type('ex1-km', '300');
    type('ex1-gal', '0');

    expect(text('example-1')).toContain('Escribe dos valores mayores que cero');
    type('ex1-gal', 'abc');
    expect(text('example-1')).toContain('Escribe dos valores mayores que cero');
  });

  it('el ejemplo 3 usa el factor solo si el servidor lo da por utilizable', () => {
    render(factorDto({ value: '10.1000' }));
    help(3);
    type('ex3-gal', '30');

    expect(text('example-3')).toBe('Emisiones: 303 kg CO₂');
    expect(el().textContent).toContain('10,1000 kg CO₂/gal');
    expect(el().querySelector('label[for="ex3-gal"]')!.textContent).toBe('Volumen (gal)');
    expect(el().querySelector('[data-testid="formulas-note"]')).toBeNull();
  });

  it('con el factor sin verificar la fórmula 3 queda simbólica, sin campos ni valor', () => {
    render(factorDto({ verification_status: 'PENDING_VALIDATION', usable_for_calculation: false }));
    help(3);

    expect(el().querySelector('#ex3-gal')).toBeNull();
    expect(text('example-3-symbolic')).toContain('se activa cuando el factor del diésel B2 está verificado');
    expect(el().textContent).not.toContain('10,1');
  });

  it('nunca habla de CO₂e', () => {
    render(factorDto());

    expect(el().textContent).not.toMatch(/CO₂e|CO2e/);
  });

  it('el ejemplo 3 sigue el combustible elegido en la tarjeta del factor (unidad de volumen incluida)', () => {
    render(factorDto());
    TestBed.inject(EmissionsFacade).fuelCode.set('NATURAL_GAS');
    help(3);
    type('ex3-gal', '10');

    expect(el().querySelector('label[for="ex3-gal"]')!.textContent).toBe('Volumen (m³)');
    expect(text('example-3')).toBe('Emisiones: 19 kg CO₂');
    expect(el().textContent).toContain('1,9000 kg CO₂/m³');
  });

  it('las fórmulas se muestran en negrita (peso ≥ 600), con la barra de fracción de 2 px y en una sola fila por fórmula', () => {
    render(factorDto());
    const boxes = Array.from(el().querySelectorAll<HTMLElement>('.math'));

    expect(boxes.length).toBe(3);
    for (const box of boxes) expect(Number(getComputedStyle(box).fontWeight)).toBeGreaterThanOrEqual(600);
    const bar = el().querySelector<HTMLElement>('.frac > span:first-child')!;
    expect(getComputedStyle(bar).borderBottomWidth).toBe('2px');
    expect(el().querySelectorAll('li[data-testid^="formula-"]').length).toBe(3);
  });
});
