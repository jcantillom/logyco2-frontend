import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FootprintMonthly } from '../../domain/models/footprint';
import { MonthlyEmissionsCardComponent } from './monthly-emissions-card.component';

const SLOTS = ['2026-01', '2026-02', '2026-03'];
const DATA: FootprintMonthly = [{ month: '2026-01', kgCo2e: 16_820 }, { month: '2026-02', kgCo2e: 18_432 }, { month: '2026-03', kgCo2e: 15_493 }];

describe('MonthlyEmissionsCardComponent', () => {
  let fixture: ComponentFixture<MonthlyEmissionsCardComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(inputs: Record<string, unknown> = {}): void {
    TestBed.configureTestingModule({ imports: [MonthlyEmissionsCardComponent] });
    fixture = TestBed.createComponent(MonthlyEmissionsCardComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  it('la cabecera lleva el chip de ícono, el título, la línea de apoyo y el periodo elegido', () => {
    render({ slots: SLOTS, periodLabel: 'Ene 2026 a Mar 2026' });
    const chip = q('.hdr .ico')!;

    expect(text('h2')).toBe('Emisiones de CO₂ por mes');
    expect(text('.ht p')).toBe('Kg de CO₂ por mes del periodo elegido');
    expect(text('[data-testid="chart-period"]')).toBe('Ene 2026 a Mar 2026');
    expect(chip.classList).toContain('chip');
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(chip).width).toBe('34px');
    expect(q('section')!.getAttribute('aria-labelledby')).toBe('mc-title');
  });

  it('hoy (sin cálculo) muestra «—» y «Se activa cuando calcules tu huella de CO₂» y no dibuja nada', () => {
    render({ slots: SLOTS });

    expect(text('[data-testid="chart-empty"]')).toContain('—');
    expect(text('[data-testid="chart-message"]')).toBe('Se activa cuando calcules tu huella de CO₂');
    expect(q('app-bar-chart')).toBeNull();
    expect(q('svg[role="img"]')).toBeNull();
    expect(q('[data-testid="bar"]')).toBeNull();
  });

  it('con datos del periodo dibuja las barras de sus meses', () => {
    render({ monthly: DATA, slots: SLOTS });

    expect(q('app-bar-chart')).not.toBeNull();
    expect(el().querySelectorAll('[data-testid="bar"]').length).toBe(3);
    expect(text('[data-testid="chart-empty"]')).toBe('');
  });

  it('un mes del periodo sin dato sale como ranura vacía y los datos fuera del periodo no se dibujan', () => {
    render({ monthly: [{ month: '2026-01', kgCo2e: 10 }, { month: '2025-06', kgCo2e: 99 }], slots: SLOTS });

    expect(el().querySelectorAll('[data-testid="bar"]').length).toBe(1);
    expect(el().querySelectorAll('[data-testid="bar-empty"]').length).toBe(2);
    expect(el().querySelectorAll('[data-testid="bar-month"]').length).toBe(3);
  });

  it('con cálculo pero sin datos para el periodo dice «No hay cálculo para este periodo» (distinto del estado «aún no hay cálculo»)', () => {
    render({ monthly: [{ month: '2025-06', kgCo2e: 99 }], slots: SLOTS });

    expect(text('[data-testid="chart-message"]')).toBe('No hay cálculo para este periodo');
    expect(q('app-bar-chart')).toBeNull();
  });

  it('al cambiar de periodo muestra un esqueleto mientras se recarga y vuelve con los nuevos meses', () => {
    render({ monthly: DATA, slots: SLOTS, status: 'ready' });
    fixture.componentRef.setInput('status', 'loading');
    fixture.detectChanges();

    expect(q('[data-testid="chart-skeleton"]')).not.toBeNull();
    expect(q('app-bar-chart')).toBeNull();

    fixture.componentRef.setInput('slots', ['2026-02', '2026-03']);
    fixture.componentRef.setInput('status', 'ready');
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="bar-month"]').length).toBe(2);
  });

  it('un error ofrece «Reintentar»', () => {
    render({ status: 'error' });
    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));
    q<HTMLButtonElement>('[data-testid="chart-error"] button')!.click();

    expect(retried).toBeTrue();
  });

  it('mide ≈ 256 px con la gráfica y en el estado pendiente', () => {
    render({ monthly: DATA, slots: SLOTS });
    el().style.width = '540px';
    fixture.detectChanges();
    const height = q('.cc')!.getBoundingClientRect().height;

    expect(height).toBeGreaterThanOrEqual(250);
    expect(height).toBeLessThanOrEqual(275);

    TestBed.resetTestingModule();
    render({ slots: SLOTS });
    el().style.width = '540px';
    expect(Math.round(q('.cc')!.getBoundingClientRect().height)).toBe(256);
  });

  it('usa solo tokens: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
    render({ slots: SLOTS });
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('.pchip')).join('\n');

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, (?!currentColor)[^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });

  describe('marco vacío (pendiente y sin cálculo en el periodo)', () => {
    const frame = (): HTMLElement | null => q('[data-testid="bar-frame"]');

    it('hoy dibuja el marco del gráfico: línea base y 3 líneas de rejilla tenues, sin valores en el eje, sin barras ni cifras', () => {
      render({ slots: SLOTS });

      expect(frame()).not.toBeNull();
      expect(frame()!.getAttribute('aria-hidden')).toBe('true');
      expect(frame()!.querySelectorAll('i').length).toBe(3);
      expect(getComputedStyle(frame()!).borderBottomWidth).toBe('1px');
      expect(getComputedStyle(frame()!.querySelector('i')!).borderTopStyle).toBe('dashed');
      expect(q('[data-testid="bar"]')).toBeNull();
      expect(q('[data-testid="bar-value"]')).toBeNull();
      expect(q('.tick')).toBeNull();
      expect(el().textContent).not.toMatch(/\d\.\d{3}/);
    });

    it('las etiquetas de mes salen de las ranuras reales del periodo elegido, con «—» sobre cada ranura vacía', () => {
      render({ slots: SLOTS });

      expect(Array.from(el().querySelectorAll('[data-testid="frame-months"] span')).map((m) => m.textContent)).toEqual(['Ene 2026', 'Feb 2026', 'Mar 2026']);
      expect(el().querySelectorAll('[data-testid="frame-slot"]').length).toBe(3);
      expect(el().querySelector('[data-testid="frame-months"]')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('con muchos meses solo se rotulan el primero y el último y no hay «—» por ranura', () => {
      const many = Array.from({ length: 14 }, (_, i) => `${2025 + Math.floor((i + 3) / 12)}-${String(((i + 3) % 12) + 1).padStart(2, '0')}`);
      render({ slots: many });

      expect(el().querySelectorAll('[data-testid="frame-months"] span').length).toBe(2);
      expect(el().querySelectorAll('[data-testid="frame-slot"]').length).toBe(0);
    });

    it('sin periodos (sin ranuras) es solo el marco con la frase, sin etiquetas', () => {
      render({ slots: [] });

      expect(frame()).not.toBeNull();
      expect(q('[data-testid="frame-months"]')).toBeNull();
      expect(text('[data-testid="chart-message"]')).toBe('Se activa cuando calcules tu huella de CO₂');
    });

    it('el texto de estado es el canal accesible (role="status") y el marco no', () => {
      render({ slots: SLOTS });

      expect(q('[data-testid="chart-message"]')!.getAttribute('role')).toBe('status');
      expect(frame()!.closest('[role="status"]')).toBeNull();
    });

    it('con cálculo pero sin datos del periodo también muestra el marco, con «No hay cálculo para este periodo»', () => {
      render({ monthly: [{ month: '2025-06', kgCo2e: 99 }], slots: SLOTS });

      expect(frame()).not.toBeNull();
      expect(text('[data-testid="chart-message"]')).toBe('No hay cálculo para este periodo');
      expect(q('[data-testid="bar"]')).toBeNull();
    });

    it('con datos el marco desaparece y se dibuja el gráfico real', () => {
      render({ monthly: DATA, slots: SLOTS });

      expect(frame()).toBeNull();
      expect(q('[data-testid="frame-months"]')).toBeNull();
      expect(el().querySelectorAll('[data-testid="bar"]').length).toBe(3);
    });

    it('el esqueleto de carga (animado) es distinto del marco estático', () => {
      render({ slots: SLOTS, status: 'loading' });

      expect(q('[data-testid="chart-skeleton"]')).not.toBeNull();
      expect(frame()).toBeNull();
    });
  });
});
