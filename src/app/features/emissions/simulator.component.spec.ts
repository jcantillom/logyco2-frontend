import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { API, factorDto, fuelsDto, NATURAL_GAS, simulationDto } from './emissions.fixtures';
import { EmissionsFacade } from './emissions.facade';
import { CalcSceneComponent } from './calc-scene.component';
import { MIN_TRUCK_ANIMATION_MS, SimulatorComponent } from './simulator.component';

describe('SimulatorComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SimulatorComponent>;
  const el = (): HTMLElement => fixture.nativeElement;
  const text = (id: string): string | null => el().querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;

  function fill(distance: string, efficiency: string): void {
    for (const [id, value] of [['sim-distance', distance], ['sim-efficiency', efficiency]]) {
      const input = el().querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  }
  function submit(): void {
    el().querySelector<HTMLButtonElement>('[data-testid="simulate"]')!.click();
    fixture.detectChanges();
  }
  const blur = (id: string): void => { el().querySelector<HTMLInputElement>(`#${id}`)!.dispatchEvent(new Event('blur')); fixture.detectChanges(); };
  const chooseFuel = (code: string): void => { el().querySelector<HTMLButtonElement>(`[data-testid="sim-fuel-${code}"]`)!.click(); fixture.detectChanges(); };

  let media: jasmine.Spy;

  beforeEach(() => {
    // Por defecto, sin movimiento: el resultado aparece al responder la API (las pruebas de animación activan el movimiento).
    media = spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    TestBed.inject(EmissionsFacade).loadFuels();
    http.expectOne(`${API}/reference/fuels`).flush({ data: fuelsDto(), meta: {} });
    fixture = TestBed.createComponent(SimulatorComponent);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('muestra los campos rotulados, el selector de los tres combustibles y el aviso educativo', () => {
    expect(el().querySelector('label[for="sim-distance"]')!.textContent).toContain('Distancia recorrida (km)');
    expect(el().querySelector('label[for="sim-efficiency"]')!.textContent).toContain('Rendimiento del vehículo (km/gal)');
    const buttons = Array.from(el().querySelectorAll<HTMLButtonElement>('.seg button'));
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Diésel B2', 'Gasolina motor', 'Gas natural']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(text('unit-hint')).toBe('Rendimiento en km/gal');
    expect(el().querySelector('#sim-distance')!.getAttribute('inputmode')).toBe('decimal');
    expect(el().querySelector<HTMLInputElement>('#sim-distance')!.value).toBe('');
    expect(el().querySelector<HTMLInputElement>('#sim-distance')!.placeholder).not.toMatch(/\d/);
    expect(text('recap')).toBe('kg CO₂ = galones (gal) × factor (kg CO₂/gal)');
    expect(Number(getComputedStyle(el().querySelector('[data-testid="recap"]')!).fontWeight)).toBeGreaterThanOrEqual(600);
    expect(el().textContent).toContain('Estimación educativa, no es una medición certificada');
    expect(el().textContent).toContain('No procesa archivos de Excel');
  });

  it('«Calcular» está desactivado mientras el formulario no sea válido, y el formulario se envía con Enter (submit)', () => {
    const button = el().querySelector<HTMLButtonElement>('[data-testid="simulate"]')!;

    expect(button.disabled).toBeTrue();
    expect(button.type).toBe('submit');
    expect(button.closest('form')).not.toBeNull();
    fill('300', '10');
    expect(button.disabled).toBeFalse();
    el().querySelector<HTMLFormElement>('form')!.requestSubmit();
    http.expectOne(`${API}/simulate`).flush({ data: simulationDto(), meta: {} });
  });

  it('mientras se calcula, el botón muestra «Calculando…» con indicador y queda desactivado', () => {
    fill('300', '10');
    submit();
    const button = el().querySelector<HTMLButtonElement>('[data-testid="simulate"]')!;

    expect(button.disabled).toBeTrue();
    expect(button.textContent).toContain('Calculando…');
    expect(button.querySelector('.spin')).not.toBeNull();
    expect(button.getAttribute('aria-busy')).toBe('true');
    http.expectOne(`${API}/simulate`).flush({ data: simulationDto(), meta: {} });
    fixture.detectChanges();
    expect(button.textContent).toContain('Calcular');
    expect(button.getAttribute('aria-busy')).toBe('false');
  });

  it('vacío, cero, negativo, no numérico y sobre el límite no envían nada y explican por qué', () => {
    blur('sim-distance');
    blur('sim-efficiency');
    expect(text('distance-error')).toBe('Ingresa la distancia recorrida.');
    expect(text('efficiency-error')).toBe('Ingresa el rendimiento del vehículo.');

    fill('0', '-5');
    expect(text('distance-error')).toBe('El valor debe ser mayor que cero.');
    expect(text('efficiency-error')).toContain('Escribe solo números');

    fill('abc', '100,5');
    expect(text('distance-error')).toContain('Escribe solo números');
    expect(text('efficiency-error')).toBe('El valor máximo permitido es 100 km/gal.');

    fill('100001', '10');
    expect(text('distance-error')).toBe('El valor máximo permitido es 100.000 km.');
    expect(el().querySelector<HTMLButtonElement>('[data-testid="simulate"]')!.disabled).toBeTrue();

    http.expectNone(`${API}/simulate`);
    expect(el().querySelector('#sim-distance')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('al elegir gas natural el rendimiento pasa a km/m³, el límite lo nombra y la solicitud lleva fuel_code y efficiency', () => {
    expect(el().querySelector('label[for="sim-efficiency"]')!.textContent).toContain('Rendimiento del vehículo (km/gal)');
    chooseFuel('NATURAL_GAS');

    expect(el().querySelector('label[for="sim-efficiency"]')!.textContent).toContain('Rendimiento del vehículo (km/m³)');
    expect(text('efficiency-unit')).toBe('km/m³');
    expect(text('unit-hint')).toBe('Rendimiento en km/m³');
    expect(text('recap')).toBe('kg CO₂ = metros cúbicos (m³) × factor (kg CO₂/m³)');

    fill('300', '101');
    expect(text('efficiency-error')).toBe('El valor máximo permitido es 100 km/m³.');
    fill('300', '12,5');
    submit();
    const request = http.expectOne(`${API}/simulate`);
    expect(request.request.body).toEqual({ fuel_code: 'NATURAL_GAS', distance_km: 300, efficiency: 12.5 });
    request.flush({ data: simulationDto({ fuel_code: 'NATURAL_GAS', volume: '24.0000', volume_unit: 'm3', co2_kg: '45.6000', factor: NATURAL_GAS() }), meta: {} });
    fixture.detectChanges();

    expect(text('result-volume-label')).toBe('Metros cúbicos estimados');
    expect(text('result-volume')).toBe('24,00 m³');
    expect(text('result-co2')).toBe('45,60 kg CO₂');
    expect(text('result-factor')).toBe('1,9000 kg CO₂/m³');
  });

  it('un combustible sin configurar sigue seleccionable y el resultado explica el motivo con el mensaje del servidor', () => {
    chooseFuel('GASOLINE_MOTOR');
    fill('300', '10');
    submit();
    http.expectOne(`${API}/simulate`).flush({
      data: simulationDto({ fuel_code: 'GASOLINE_MOTOR', co2_kg: null, official: false, message: 'Factor pendiente de configuración.', factor: factorDto({ fuel_code: 'GASOLINE_MOTOR', value: null, verification_status: 'NOT_CONFIGURED', usable_for_calculation: false }) }), meta: {},
    });
    fixture.detectChanges();

    expect(text('result-co2-reason')).toContain('factor sin configurar');
    expect(text('result-message-sr')).toBe('Factor pendiente de configuración.');
    expect(text('result-factor-none')).toBe('Sin factor configurado');
  });

  it('la altura del panel de resultados no depende del largo del mensaje del servidor ni de un error', () => {
    const calculate = (message: string | null, status: 'PENDING_VALIDATION' | 'VERIFIED'): number => {
      fill('300', '10');
      submit();
      http.expectOne(`${API}/simulate`).flush({ data: simulationDto({ co2_kg: null, official: false, message, factor: factorDto({ verification_status: status, usable_for_calculation: false }) }), meta: {} });
      fixture.detectChanges();

      return el().querySelector('[data-testid="simulation-result"]')!.getBoundingClientRect().height;
    };
    const long = 'El factor de emisión de Diésel B2 está pendiente de validación, por eso no se muestran emisiones de CO₂ oficiales. El volumen sí se estima. '.repeat(3).trim();
    const shortHeight = calculate('Corto.', 'PENDING_VALIDATION');
    const longHeight = calculate(long, 'PENDING_VALIDATION');

    expect(longHeight).toBe(shortHeight);
    expect(text('result-co2-blocked')).toBe('No disponible');
    expect(text('result-message-sr')).toBe(long);
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('errline'))!;
    expect(css).toMatch(/\.results[^{]*,[^{]*\.errline[^{]*\{\s*height: clamp\(/);
  });

  it('un error se muestra en una sola línea con puntos suspensivos y el texto completo accesible', () => {
    fill('300', '10');
    submit();
    http.expectOne(`${API}/simulate`).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const line = el().querySelector<HTMLElement>('[data-testid="simulation-error"]')!;

    expect(line.getAttribute('role')).toBe('alert');
    expect(line.getAttribute('title')).toBe(line.textContent!.trim());
    expect(el().querySelector('[data-testid="simulation-result"]')).toBeNull();
    expect(getComputedStyle(line.querySelector('span')!).textOverflow).toBe('ellipsis');
  });

  it('hasta calcular, el panel muestra un estado vacío con la indicación y sin cifras', () => {
    expect(text('result-empty')).toBe('Ingresa distancia y rendimiento para ver el resultado');
    expect(el().querySelector('[data-testid="result-empty"]')!.textContent).not.toMatch(/\d/);
    expect(text('result-volume')).toBeNull();
  });

  it('con datos válidos envía los números (acepta coma) y muestra galones, CO₂ y factor del servidor', () => {
    fill('300', '12,5');
    submit();
    const request = http.expectOne(`${API}/simulate`);

    expect(request.request.body).toEqual({ fuel_code: 'DIESEL_B2', distance_km: 300, efficiency: 12.5 });
    request.flush({ data: simulationDto({ volume: '24.0000', co2_kg: '242.4000', factor: factorDto({ value: '10.1000' }) }), meta: {} });
    fixture.detectChanges();

    expect(text('result-volume')).toBe('24,00 gal');
    expect(text('result-volume-label')).toBe('Galones estimados');
    expect(text('result-co2')).toBe('242,40 kg CO₂');
    expect(el().querySelector('[data-testid="result-co2"]')!.classList).toContain('key');
    expect(text('result-factor')).toBe('10,1000 kg CO₂/gal');
  });

  it('sin factor verificado muestra los galones y el mensaje del servidor en lugar del CO₂', () => {
    fill('300', '10');
    submit();
    http.expectOne(`${API}/simulate`).flush({
      data: simulationDto({ co2_kg: null, official: false, message: 'El factor está pendiente de validación.', factor: factorDto({ verification_status: 'PENDING_VALIDATION', usable_for_calculation: false }) }), meta: {},
    });
    fixture.detectChanges();

    expect(text('result-volume')).toBe('30,00 gal');
    expect(text('result-co2')).toBeNull();
    expect(el().querySelector('[data-testid="result-empty"]')).toBeNull();
    expect(text('result-co2-blocked')).toBe('No disponible');
    expect(text('result-co2-reason')).toContain('pendiente de validación');
    expect(text('result-message-sr')).toBe('El factor está pendiente de validación.');
    expect(el().querySelector('[data-testid="result-message"]')).toBeNull();
    el().querySelector<HTMLButtonElement>('[data-testid="why"]')!.click();
    fixture.detectChanges();
    expect(text('result-message')).toBe('El factor está pendiente de validación.');
    expect(el().querySelector('[data-testid="why"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('sin factor configurado indica que no hay factor', () => {
    fill('300', '10');
    submit();
    http.expectOne(`${API}/simulate`).flush({
      data: simulationDto({ co2_kg: null, official: false, message: 'Sin factor.', factor: factorDto({ value: null, verification_status: 'NOT_CONFIGURED', usable_for_calculation: false }) }), meta: {},
    });
    fixture.detectChanges();

    expect(text('result-factor-none')).toBe('Sin factor configurado');
  });

  it('un 422 del servidor se explica con un mensaje amigable en una región de alerta', () => {
    fill('300', '10');
    submit();
    http.expectOne(`${API}/simulate`).flush({ error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 'body.distance_km', type: 'less_than_equal' }] } }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(text('simulation-error')).toBe('Revisa los datos ingresados: hay campos inválidos.');
    expect(el().querySelector('[data-testid="simulation-live"]')!.getAttribute('aria-live')).toBe('polite');
    expect(text('result-volume')).toBeNull();
  });

  it('un error 5xx muestra un mensaje amigable y no un resultado', () => {
    fill('300', '10');
    submit();
    http.expectOne(`${API}/simulate`).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text('simulation-error')).not.toBeNull();
    expect(text('result-volume')).toBeNull();
  });

  describe('animación del camión', () => {
    const request = (): ReturnType<HttpTestingController['expectOne']> => http.expectOne(`${API}/simulate`);
    const scene = (): Element | null => el().querySelector('[data-testid="result-scene"]');
    const panel = (): Element => el().querySelector('[data-testid="simulation-result"]')!;

    beforeEach(() => media.and.returnValue({ matches: false } as MediaQueryList));

    it('mientras la solicitud está pendiente muestra el camión en lugar de las cifras, con aria-busy y el aviso «Calculando…»', fakeAsync(() => {
      fill('300', '10');
      submit();

      expect(scene()).not.toBeNull();
      expect(el().querySelector('[data-testid="calc-scene"]')!.classList).toContain('motion');
      expect(panel().getAttribute('aria-busy')).toBe('true');
      expect(el().querySelector('[role="status"]')!.textContent).toBe('Calculando…');
      expect(el().querySelector('[data-testid="result-volume"]')).toBeNull();
      expect(el().querySelector('[data-testid="result-empty"]')).toBeNull();
      expect(el().querySelector('[data-testid="calc-scene"]')!.textContent).not.toMatch(/\d/);
      request().flush({ data: simulationDto(), meta: {} });
      tick(MIN_TRUCK_ANIMATION_MS);
    }));

    it('respeta el tiempo mínimo aunque la API responda al instante y luego revela exactamente el resultado del servidor', fakeAsync(() => {
      fill('300', '10');
      submit();
      request().flush({ data: simulationDto({ volume: '24.0000', co2_kg: '242.4000' }), meta: {} });
      fixture.detectChanges();

      tick(MIN_TRUCK_ANIMATION_MS - 1);
      fixture.detectChanges();
      expect(scene()).not.toBeNull();
      expect(text('result-volume')).toBeNull();
      expect(el().querySelector<HTMLButtonElement>('[data-testid="simulate"]')!.disabled).toBeTrue();

      tick(1);
      fixture.detectChanges();
      expect(scene()).toBeNull();
      expect(panel().getAttribute('aria-busy')).toBe('false');
      expect(text('result-volume')).toBe('24,00 gal');
      expect(text('result-co2')).toBe('242,40 kg CO₂');
      expect(el().querySelector<HTMLButtonElement>('[data-testid="simulate"]')!.disabled).toBeFalse();
    }));

    it('si la API tarda más que el mínimo, el resultado se muestra al llegar (sin esperas añadidas)', fakeAsync(() => {
      fill('300', '10');
      submit();
      tick(MIN_TRUCK_ANIMATION_MS + 600);
      fixture.detectChanges();
      expect(scene()).not.toBeNull();

      request().flush({ data: simulationDto(), meta: {} });
      fixture.detectChanges();
      expect(scene()).toBeNull();
      expect(text('result-volume')).toBe('30,00 gal');
    }));

    it('un error se muestra al instante, sin esperar el tiempo mínimo', fakeAsync(() => {
      fill('300', '10');
      submit();
      request().flush({}, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(scene()).toBeNull();
      expect(text('simulation-error')).not.toBeNull();
      expect(el().querySelector<HTMLButtonElement>('[data-testid="simulate"]')!.disabled).toBeFalse();
    }));

    it('con «reducir movimiento» no hay animación (camión quieto) ni espera mínima', fakeAsync(() => {
      media.and.returnValue({ matches: true } as MediaQueryList);
      fill('300', '10');
      submit();

      expect(scene()).not.toBeNull();
      expect(el().querySelector('[data-testid="calc-scene"]')!.classList).not.toContain('motion');
      request().flush({ data: simulationDto(), meta: {} });
      fixture.detectChanges();

      expect(scene()).toBeNull();
      expect(text('result-volume')).toBe('30,00 gal');
    }));

    it('la escena ocupa el panel de alto fijo (no cambia su tamaño) y solo anima transform y opacity', () => {
      const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '');
      const own = css.join('\n');

      expect(own).toMatch(/\.scene[^{]*\{[^}]*grid-column: 1\s*\/\s*-1;[^}]*height: 100%/);
      expect(own).toMatch(/\.results[^{]*,[^{]*\.errline[^{]*\{\s*height: clamp\(/);
      const keyframes = own.match(/@keyframes [\w-]*(?:drive|road|spin|puff|reveal) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? [];
      expect(keyframes.length).toBeGreaterThanOrEqual(2);
      for (const frame of keyframes) expect(frame).not.toMatch(/\b(left|top|width|height|margin)\s*:/);
    });

    it('las animaciones del camión (avance, carretera, ruedas y humo) solo usan transform y opacity', () => {
      TestBed.createComponent(CalcSceneComponent).detectChanges();
      const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
      const frames = css.match(/@keyframes [\w-]*(?:drive|road|puff) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? [];

      expect(frames.length).toBe(3);
      for (const frame of frames) expect(frame).not.toMatch(/\b(left|top|right|bottom|width|height|margin)\s*:/);
    });
  });
});
