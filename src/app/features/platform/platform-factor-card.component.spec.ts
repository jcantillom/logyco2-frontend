import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { EmissionFactorDto } from '../../infrastructure/dto/emissions.dto';
import { factorDto, GASOLINE, NATURAL_GAS } from '../emissions/emissions.fixtures';
import { FACTOR_ROTATION_MS, PlatformFactorCardComponent } from './platform-factor-card.component';

const API = 'http://api.test/api/v1/emissions/reference/fuels';

describe('PlatformFactorCardComponent: factor de emisión en el resumen', () => {
  let fixture: ComponentFixture<PlatformFactorCardComponent>;
  let http: HttpTestingController | undefined;
  let media: jasmine.Spy;
  const el = (): HTMLElement => fixture.nativeElement;
  const text = (id: string): string | null => el().querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
  const fuel = (): string | null => text('factor-fuel');
  const settle = (): void => fixture.detectChanges();

  function create(fuels: EmissionFactorDto[] = [factorDto({ value: '10.149' }), GASOLINE({ value: '8.808' }), NATURAL_GAS({ value: '1.980' })], respond = true): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformFactorCardComponent);
    fixture.detectChanges();
    if (respond) http!.expectOne(API).flush({ data: fuels, meta: {} });
    settle();
  }

  beforeEach(() => { media = spyOn(window, 'matchMedia').and.returnValue({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList); });
  afterEach(() => { http?.verify(); http = undefined; });

  it('la constante de rotación es de 3 segundos', () => {
    expect(FACTOR_ROTATION_MS).toBe(3000);
  });

  it('muestra el primer combustible con su nombre, el valor tal como lo envía la API (coma), la unidad sin partirse y la insignia, sin 3D', fakeAsync(() => {
    create();

    expect(fuel()).toBe('Diésel B2');
    expect(text('factor-value')).toBe('10,149');
    expect(text('factor-unit')).toBe('kg CO₂/gal');
    expect(getComputedStyle(el().querySelector('[data-testid="factor-unit"]')!).whiteSpace).toBe('nowrap');
    expect(text('factor-status')).toBe('Verificado');
    expect(el().querySelector('[data-testid="factor-status"]')!.classList).toContain('badge-success');
    expect(el().querySelector('h2')!.textContent).toBe('Factor de emisión');
    expect(el().querySelector('.ico svg')).not.toBeNull();
    discardPeriodicTasks();
  }));

  it('rota cada 3000 ms por los tres combustibles y vuelve al primero, con el valor de la API de cada uno', fakeAsync(() => {
    create();

    tick(FACTOR_ROTATION_MS - 1); settle();
    expect(fuel()).toBe('Diésel B2');
    tick(1); settle();
    expect(fuel()).toBe('Gasolina motor (sin mezcla)');
    expect(text('factor-value')).toBe('8,808');
    tick(FACTOR_ROTATION_MS); settle();
    expect(fuel()).toBe('Gas natural (m³ estándar)');
    expect(text('factor-value')).toBe('1,980');
    expect(text('factor-unit')).toBe('kg CO₂/m³');
    tick(FACTOR_ROTATION_MS); settle();
    expect(fuel()).toBe('Diésel B2');
    discardPeriodicTasks();
  }));

  it('se detiene con el cursor encima y con el foco dentro, y reanuda al salir', fakeAsync(() => {
    create();
    const card = el();

    card.dispatchEvent(new MouseEvent('mouseenter')); settle();
    tick(FACTOR_ROTATION_MS * 2); settle();
    expect(fuel()).toBe('Diésel B2');
    card.dispatchEvent(new MouseEvent('mouseleave')); settle();
    tick(FACTOR_ROTATION_MS); settle();
    expect(fuel()).toBe('Gasolina motor (sin mezcla)');

    card.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); settle();
    tick(FACTOR_ROTATION_MS * 2); settle();
    expect(fuel()).toBe('Gasolina motor (sin mezcla)');
    card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body })); settle();
    tick(FACTOR_ROTATION_MS); settle();
    expect(fuel()).toBe('Gas natural (m³ estándar)');
    discardPeriodicTasks();
  }));

  it('el botón de pausa (aria-pressed) detiene y reanuda la rotación', fakeAsync(() => {
    create();
    const pause = el().querySelector<HTMLButtonElement>('[data-testid="factor-pause"]')!;

    expect(pause.getAttribute('aria-pressed')).toBe('false');
    pause.click(); settle();
    expect(pause.getAttribute('aria-pressed')).toBe('true');
    expect(pause.getAttribute('aria-label')).toBe('Reanudar rotación');
    tick(FACTOR_ROTATION_MS * 3); settle();
    expect(fuel()).toBe('Diésel B2');
    pause.click(); settle();
    tick(FACTOR_ROTATION_MS); settle();
    expect(fuel()).toBe('Gasolina motor (sin mezcla)');
    discardPeriodicTasks();
  }));

  it('los segmentos de la barra son botones: saltan al combustible elegido, lo anuncian con aria-live polite y la rotación automática no anuncia nada', fakeAsync(() => {
    create();
    const live = (): string => el().querySelector('[data-testid="factor-live"]')!.getAttribute('aria-live')!;
    const segs = (): HTMLButtonElement[] => Array.from(el().querySelectorAll<HTMLButtonElement>('.seg'));

    expect(segs().length).toBe(3);
    expect(segs().map((d) => d.getAttribute('aria-label'))).toEqual(['Diésel B2', 'Gasolina motor (sin mezcla)', 'Gas natural (m³ estándar)']);
    expect(live()).toBe('off');
    segs()[2].click(); settle();
    expect(fuel()).toBe('Gas natural (m³ estándar)');
    expect(segs().map((d) => d.getAttribute('aria-current'))).toEqual(['false', 'false', 'true']);
    expect(live()).toBe('polite');
    tick(FACTOR_ROTATION_MS); settle();
    expect(fuel()).toBe('Diésel B2');
    expect(live()).toBe('off');
    discardPeriodicTasks();
  }));

  it('con «reducir movimiento» no rota sola ni anima el progreso, pero los puntos cambian de combustible a mano', fakeAsync(() => {
    media.and.returnValue({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList);
    create();

    tick(FACTOR_ROTATION_MS * 3); settle();
    expect(fuel()).toBe('Diésel B2');
    expect(el().querySelector('.seg.running')).toBeNull();
    el().querySelector<HTMLButtonElement>('[data-testid="factor-segment-1"]')!.click(); settle();
    expect(fuel()).toBe('Gasolina motor (sin mezcla)');
    tick(FACTOR_ROTATION_MS * 2); settle();
    expect(fuel()).toBe('Gasolina motor (sin mezcla)');
  }));

  it('con la pestaña oculta se detiene y al volver continúa', fakeAsync(() => {
    create();
    const hiddenSpy = spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
    const hide = (hidden: boolean): void => { hiddenSpy.and.returnValue(hidden); document.dispatchEvent(new Event('visibilitychange')); settle(); };

    hide(true);
    tick(FACTOR_ROTATION_MS * 3); settle();
    expect(fuel()).toBe('Diésel B2');
    expect(el().querySelector('.seg.running')).toBeNull();

    hide(false);
    tick(FACTOR_ROTATION_MS); settle();
    expect(fuel()).toBe('Gasolina motor (sin mezcla)');
    discardPeriodicTasks();
  }));

  it('al destruir el componente se cancela la cuenta atrás (sin temporizadores pendientes)', fakeAsync(() => {
    create();
    fixture.destroy();

    expect(() => tick(FACTOR_ROTATION_MS * 2)).not.toThrow();
  }));

  it('usa las clases de las tarjetas vecinas (kpi, label, ico, hint) para heredar su rejilla, el cuadro del icono de 54 px y los tamaños, con el icono plano a la derecha', fakeAsync(() => {
    create();
    const card = el().querySelector('section')!;

    expect(card.classList).toContain('kpi');
    expect(card.querySelector('h2')!.classList).toContain('label');
    expect(card.querySelector('h2')!.textContent).toBe('Factor de emisión');
    expect(card.querySelector('.hint [data-testid="factor-fuel"]')).not.toBeNull();
    expect(card.querySelector('.hint [data-testid="factor-status"]')).not.toBeNull();
    const chip = card.querySelector('.ico')!;
    const glyph = chip.querySelector('svg')!;
    const style = getComputedStyle(glyph);
    expect(glyph.classList).not.toContain('i');
    expect(style.width).toBe('19px');
    expect(style.height).toBe('19px');
    expect(style.stroke).not.toBe('none');
    expect(style.strokeWidth).toBe('1.5px');
    expect(style.strokeLinecap).toBe('round');
    expect(style.strokeLinejoin).toBe('round');
    expect(style.fill).not.toBe('none');
    expect(glyph.querySelector('path')!.getAttribute('fill')).toBe('none');
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(card.querySelector('.side')!.contains(chip)).toBeTrue();
    expect(Array.from(card.children).indexOf(card.querySelector('.side')!)).toBeGreaterThan(Array.from(card.children).indexOf(card.querySelector('.vals')!));
    expect(card.querySelector('.pause')!.getAttribute('aria-label')).toBe('Pausar rotación');
    expect(getComputedStyle(card.querySelector('.pause')!).width).toBe('24px');
    expect(card.querySelector('.value')!.classList).toContain('value');
    discardPeriodicTasks();
  }));

  it('el glifo queda centrado en el cuadro del icono (rejilla con place-items centrado, sin relleno y con el svg en bloque)', fakeAsync(() => {
    create();
    const chip = el().querySelector<HTMLElement>('.ico')!;
    const glyph = chip.querySelector('svg')!;
    const style = getComputedStyle(chip);

    expect(style.display).toBe('grid');
    expect(style.placeItems).toMatch(/^center( center)?$/);
    expect(style.padding).toBe('0px');
    expect(getComputedStyle(glyph).display).toBe('block');
    // En la prueba el cuadro no hereda el tamaño global (54 px): se fija para medir el centrado.
    chip.style.width = '54px';
    chip.style.height = '54px';
    const box = chip.getBoundingClientRect();
    const svg = glyph.getBoundingClientRect();
    expect(Math.abs((svg.left + svg.width / 2) - (box.left + box.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs((svg.top + svg.height / 2) - (box.top + box.height / 2))).toBeLessThanOrEqual(1);
    discardPeriodicTasks();
  }));

  it('el indicador de progreso es discreto: tres segmentos cortos de 3 px, a la izquierda bajo el valor, con área de toque ampliada y hasta 100 px en total', fakeAsync(() => {
    create();
    const card = el().querySelector('section')!;
    const segs = Array.from(card.querySelectorAll<HTMLElement>('.bar .seg'));
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('.seg') && c.includes('@keyframes'))!;

    expect(segs.length).toBe(3);
    for (const seg of segs) {
      const style = getComputedStyle(seg);
      expect(style.height).toBe('3px');
      expect(Number.parseFloat(style.width)).toBeLessThanOrEqual(28);
    }
    const bar = card.querySelector<HTMLElement>('.bar')!;
    expect(bar.getBoundingClientRect().width).toBeLessThanOrEqual(100);
    expect(card.querySelector('.vals')!.contains(bar)).toBeTrue();
    expect(css).toMatch(/\.seg[^{]*::?after[^{]*\{[^}]*inset:\s*-11px/);
    tick(FACTOR_ROTATION_MS); settle();
    const done = Array.from(card.querySelectorAll('.seg')).map((s) => s.classList.contains('done'));
    expect(done).toEqual([true, false, false]);
    discardPeriodicTasks();
  }));

  it('estados por combustible: pendiente de validación, sin configurar e inválido', fakeAsync(() => {
    create([
      factorDto({ verification_status: 'PENDING_VALIDATION', usable_for_calculation: false }),
      GASOLINE({ value: null, verification_status: 'NOT_CONFIGURED', usable_for_calculation: false }),
      NATURAL_GAS({ value: '9', verification_status: 'INVALID_CONFIGURATION', usable_for_calculation: false }),
    ]);

    expect(text('factor-status')).toBe('Pendiente de validación');
    expect(el().querySelector('[data-testid="factor-status"]')!.classList).toContain('badge-warning');
    expect(text('factor-value')).toBe('10,1000');
    tick(FACTOR_ROTATION_MS); settle();
    expect(text('factor-status')).toBe('Sin configurar');
    expect(text('factor-message')).toBe('Factor pendiente de configuración');
    expect(text('factor-value')).toBeNull();
    tick(FACTOR_ROTATION_MS); settle();
    expect(text('factor-status')).toBe('Inválido');
    expect(el().querySelector('[data-testid="factor-status"]')!.classList).toContain('badge-danger');
    expect(text('factor-value')).toBeNull();
    expect(el().textContent).not.toContain('9');
    discardPeriodicTasks();
  }));

  it('muestra un esqueleto mientras carga y un error con reintento', fakeAsync(() => {
    create(undefined, false);
    expect(el().querySelector('.skeleton')).not.toBeNull();
    http!.expectOne(API).flush({}, { status: 500, statusText: 'Server Error' });
    settle();

    expect(el().querySelector('[data-testid="factor-error"]')).not.toBeNull();
    el().querySelector<HTMLButtonElement>('[data-testid="factor-error"] button')!.click();
    http!.expectOne(API);
  }));

  it('el estilo usa solo tokens (sin hexadecimales), tintes al 20/40/60/80 % y anima solo transform y opacity', fakeAsync(() => {
    create();
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').find((c) => c.includes('.seg') && c.includes('@keyframes'))!;
    const percents = Array.from(css.matchAll(/color-mix\(in srgb, (?!currentColor)[^,]+ (\d+)%/g)).map((m) => Number(m[1]));

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toContain('--c-primary');
    for (const percent of percents) expect([20, 40, 60, 80]).toContain(percent);
    const frames = css.match(/@keyframes [\w-]*(?:swap|fill) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? [];
    expect(frames.length).toBe(2);
    for (const frame of frames) expect(frame).not.toMatch(/\b(left|top|width|height|margin)\s*:/);
    expect(css.indexOf('prefers-reduced-motion: no-preference')).toBeGreaterThan(-1);
    discardPeriodicTasks();
  }));
});
