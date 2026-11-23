import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FootprintByFuel } from '../../domain/models/footprint';
import { FuelShareCardComponent } from './fuel-share-card.component';

const FUELS: FootprintByFuel = [
  { fuelCode: 'DIESEL_B2', name: 'Diésel B2', kgCo2: 43_432, consumption: [] },
  { fuelCode: 'GASOLINE_MOTOR', name: 'Gasolina motor', kgCo2: 4_972, consumption: [] },
  { fuelCode: 'NATURAL_GAS', name: 'Gas natural', kgCo2: 2_341, consumption: [] },
];

describe('FuelShareCardComponent', () => {
  let fixture: ComponentFixture<FuelShareCardComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(inputs: Record<string, unknown> = {}): void {
    TestBed.configureTestingModule({ imports: [FuelShareCardComponent] });
    fixture = TestBed.createComponent(FuelShareCardComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  it('la cabecera lleva el chip de ícono, el título, la línea de apoyo y el periodo elegido', () => {
    render({ periodLabel: 'Todos los periodos' });

    expect(text('h2')).toBe('Emisiones por tipo de combustible');
    expect(text('.ht p')).toBe('Participación de cada combustible en el periodo elegido');
    expect(text('[data-testid="chart-period"]')).toBe('Todos los periodos');
    expect(q('.hdr .ico')!.classList).toContain('chip');
    expect(q('section')!.getAttribute('aria-labelledby')).toBe('fc-title');
  });

  it('hoy (sin cálculo) muestra «—» y «Se activa cuando calcules tu huella de CO₂» y no dibuja la dona', () => {
    render();

    expect(text('[data-testid="chart-message"]')).toBe('Se activa cuando calcules tu huella de CO₂');
    expect(q('app-share-donut')).toBeNull();
    expect(q('svg[role="img"]')).toBeNull();
  });

  it('con datos del periodo dibuja la dona con el total en el centro y la leyenda', () => {
    render({ byFuel: FUELS });

    expect(text('[data-testid="donut-total"]')).toBe('50.745');
    expect(el().querySelectorAll('[data-testid="donut-row"]').length).toBe(3);
    expect(text('[data-testid="donut-row"]')).toContain('Diésel B2');
    expect(text('[data-testid="donut-row"]')).toContain('85,6 %');
  });

  it('el total y las porciones son los del periodo recibido: al cambiar de periodo cambian', () => {
    render({ byFuel: FUELS });
    fixture.componentRef.setInput('byFuel', [{ fuelCode: 'NATURAL_GAS', name: 'Gas natural', kgCo2: 1_200, consumption: [] }]);
    fixture.detectChanges();

    expect(text('[data-testid="donut-total"]')).toBe('1.200');
    expect(text('[data-testid="donut-row"]')).toContain('100,0 %');
  });

  it('con más de 4 combustibles agrupa «Otros»', () => {
    render({ byFuel: [1, 2, 3, 4, 5, 6].map((n) => ({ fuelCode: `F${n}`, name: `Combustible ${n}`, kgCo2: n * 100 })) });
    const names = Array.from(el().querySelectorAll('[data-testid="donut-row"] .name')).map((n) => n.textContent);

    expect(names).toEqual(['Combustible 6', 'Combustible 5', 'Combustible 4', 'Combustible 3', 'Otros']);
  });

  it('con cálculo pero todos los combustibles en 0 dice «No hay cálculo para este periodo»', () => {
    render({ byFuel: [{ fuelCode: 'A', name: 'A', kgCo2: 0, consumption: [] }] });

    expect(text('[data-testid="chart-message"]')).toBe('No hay cálculo para este periodo');
    expect(q('app-share-donut')).toBeNull();
  });

  it('al cambiar de periodo muestra un esqueleto y un error ofrece «Reintentar»', () => {
    render({ byFuel: FUELS });
    fixture.componentRef.setInput('status', 'loading');
    fixture.detectChanges();
    expect(q('[data-testid="chart-skeleton"]')).not.toBeNull();
    expect(q('app-share-donut')).toBeNull();

    fixture.componentRef.setInput('status', 'error');
    fixture.detectChanges();
    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));
    q<HTMLButtonElement>('[data-testid="chart-error"] button')!.click();
    expect(retried).toBeTrue();
  });

  it('mide ≈ 256 px con la dona y en el estado pendiente', () => {
    render({ byFuel: FUELS });
    el().style.width = '540px';
    fixture.detectChanges();
    const height = q('.cc')!.getBoundingClientRect().height;

    expect(height).toBeGreaterThanOrEqual(250);
    expect(height).toBeLessThanOrEqual(275);

    TestBed.resetTestingModule();
    render();
    el().style.width = '540px';
    expect(Math.round(q('.cc')!.getBoundingClientRect().height)).toBe(256);
  });

  describe('marco vacío (pendiente y sin cálculo en el periodo)', () => {
    const frame = (): HTMLElement | null => q('[data-testid="donut-frame"]');

    it('hoy dibuja un anillo completo del mismo diámetro y grosor que el real, tenue y discontinuo, con «—» y «Sin cálculo» en el centro', () => {
      render();
      const ring = frame()!;

      expect(ring).not.toBeNull();
      expect(ring.getAttribute('aria-hidden')).toBe('true');
      expect(ring.getBoundingClientRect().width).toBe(150);
      expect(ring.querySelector('.track')!.getAttribute('r')).toBe('38');
      expect(getComputedStyle(ring.querySelector('.track')!).strokeWidth).toBe('18px');
      expect(getComputedStyle(ring.querySelector('.edge')!).strokeDasharray).not.toBe('none');
      expect(Array.from(ring.querySelectorAll('text')).map((t) => t.textContent)).toEqual(['—', 'Sin cálculo']);
    });

    it('la leyenda es un esqueleto estático de 3 líneas grises sin textos de combustibles ni animación', () => {
      render();
      const lines = Array.from(el().querySelectorAll<HTMLElement>('[data-testid="legend-frame"] b'));

      expect(lines.length).toBe(3);
      expect(new Set(lines.map((l) => l.style.width)).size).toBe(3);
      expect(lines.every((l) => getComputedStyle(l).animationName === 'none')).toBeTrue();
      expect(q('[data-testid="legend-frame"]')!.textContent!.trim()).toBe('');
      expect(q('[data-testid="legend-frame"]')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('no hay porciones de color, porcentajes, filas de leyenda ni total', () => {
      render();

      expect(q('[data-testid="donut-slice"]')).toBeNull();
      expect(q('[data-testid="donut-row"]')).toBeNull();
      expect(q('[data-testid="donut-total"]')).toBeNull();
      expect(el().textContent).not.toMatch(/\d+,\d\s*%|%/);
    });

    it('el texto de estado es el canal accesible (role="status"): «Se activa cuando calcules tu huella de CO₂»', () => {
      render();

      expect(q('[data-testid="chart-message"]')!.getAttribute('role')).toBe('status');
      expect(text('[data-testid="chart-message"]')).toBe('Se activa cuando calcules tu huella de CO₂');
      expect(frame()!.closest('[role="status"]')).toBeNull();
    });

    it('con cálculo pero sin combustibles en el periodo muestra el mismo marco con «No hay cálculo para este periodo»', () => {
      render({ byFuel: [{ fuelCode: 'A', name: 'A', kgCo2: 0, consumption: [] }] });

      expect(frame()).not.toBeNull();
      expect(text('[data-testid="chart-message"]')).toBe('No hay cálculo para este periodo');
    });

    it('con datos el marco desaparece y se dibuja la dona real', () => {
      render({ byFuel: FUELS });

      expect(frame()).toBeNull();
      expect(q('[data-testid="legend-frame"]')).toBeNull();
      expect(el().querySelectorAll('[data-testid="donut-slice"]').length).toBe(3);
    });

    it('el esqueleto de carga es distinto del marco estático', () => {
      render({ status: 'loading' });

      expect(q('[data-testid="chart-skeleton"]')).not.toBeNull();
      expect(frame()).toBeNull();
    });

    it('usa solo tokens: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
      render();
      const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('.legend-frame')).join('\n');

      expect(css).toContain('.legend-frame');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      for (const m of css.matchAll(/color-mix\(in srgb, (?!currentColor)[^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });
  });
  describe('datos reales y resultado parcial', () => {
    it('un resultado parcial lleva «Parcial» junto al periodo, con la aclaración de que el porcentaje es por viajes', () => {
      render({ byFuel: FUELS, periodLabel: 'Ene 2026 a Mar 2026', partial: true, partialHint: 'Resultado parcial: 12 de 18 viajes calculados. El porcentaje es por cantidad de viajes.' });

      expect(text('[data-testid="chart-partial"]')).toBe('Parcial');
      expect(q('[data-testid="chart-partial"]')!.getAttribute('title')).toContain('12 de 18 viajes calculados');
      expect(text('[data-testid="chart-partial-hint"]')).toContain('por cantidad de viajes');
    });

    it('un resultado completo no lleva «Parcial»', () => {
      render({ byFuel: FUELS });

      expect(q('[data-testid="chart-partial"]')).toBeNull();
    });

    it('con huella pero sin viajes calculados explica por qué en lugar del texto genérico', () => {
      render({ byFuel: [], emptyText: 'Aún no hay emisiones calculadas: faltan datos en 3 viajes' });

      expect(text('[data-testid="chart-message"]')).toBe('Aún no hay emisiones calculadas: faltan datos en 3 viajes');
    });

    it('con viajes retenidos y resultado completo la frase queda solo en texto accesible: sin marcador y a 256 px', () => {
      render({ byFuel: FUELS, periodLabel: 'Ene 2026 a Mar 2026', partial: false, partialHint: '12 operaciones por revisar (posibles duplicados) no están sumadas.' });
      el().style.width = '560px';

      expect(q('[data-testid="chart-partial"]')).toBeNull();
      expect(text('[data-testid="chart-partial-hint"]')).toBe('12 operaciones por revisar (posibles duplicados) no están sumadas.');
      expect(q('.cc')!.getBoundingClientRect().height).toBe(256);
    });

    it('la altura de la tarjeta no cambia con el marcador «Parcial» (256 px)', () => {
      render({ byFuel: FUELS, periodLabel: 'Ene 2026 a Mar 2026', partial: true, partialHint: 'x' });
      el().style.width = '560px';

      expect(q('.cc')!.getBoundingClientRect().height).toBe(256);
    });
  });
});
