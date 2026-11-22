import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BarDatum } from './bar-chart';
import { BarChartComponent } from './bar-chart.component';

const THREE: BarDatum[] = [{ label: 'Ene 2026', value: 16_820 }, { label: 'Feb 2026', value: 18_432 }, { label: 'Mar 2026', value: 15_493 }];

describe('BarChartComponent', () => {
  let fixture: ComponentFixture<BarChartComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const qa = (selector: string): Element[] => Array.from(el().querySelectorAll(selector));

  function render(data: readonly BarDatum[], inputs: Record<string, unknown> = {}): void {
    TestBed.configureTestingModule({ imports: [BarChartComponent] });
    fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentRef.setInput('data', data);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  it('dibuja una barra por mes con la cifra encima, el mes abreviado con su año y el eje Y con marcas redondas', () => {
    render(THREE);

    expect(qa('[data-testid="bar"]').length).toBe(3);
    expect(qa('[data-testid="bar-value"]').map((t) => t.textContent)).toEqual(['16.820', '18.432', '15.493']);
    expect(qa('[data-testid="bar-month"]').map((t) => t.textContent)).toEqual(['Ene 2026', 'Feb 2026', 'Mar 2026']);
    expect(qa('.tick').map((t) => t.textContent)).toEqual(['0', '10.000', '20.000']);
    expect(el().querySelector('.unit')!.textContent).toBe('kg CO₂');
  });

  it('une los centros de las barras con una línea de tendencia y la leyenda dice «Emisiones (kg CO₂)» y «Tendencia»', () => {
    render(THREE);

    expect(qa('[data-testid="bar-trend"]').length).toBe(1);
    expect(el().querySelector('[data-testid="bar-legend"]')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Emisiones (kg CO₂)Tendencia');
  });

  it('las barras son naranja de marca y la tendencia gris oscuro de marca, sin colores fijos', () => {
    render(THREE);
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('.trend')).join('\n');

    expect(css).toMatch(/\.bar \{[^}]*fill: var\(--c-primary\)/);
    expect(css).toMatch(/\.trend \{[^}]*stroke: var\(--c-head\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });

  it('una ranura sin dato queda vacía con «—» y la tendencia salta el hueco', () => {
    render([{ label: 'A', value: 10 }, { label: 'B', value: 20 }, { label: 'C', value: null }, { label: 'D', value: 30 }, { label: 'E', value: 40 }]);

    expect(qa('[data-testid="bar"]').length).toBe(4);
    expect(qa('[data-testid="bar-empty"]').length).toBe(1);
    expect(qa('[data-testid="bar-trend"]').length).toBe(2);
  });

  it('es accesible: role="img" con el resumen y una tabla sr-only con los mismos datos', () => {
    render([...THREE, { label: 'Abr 2026', value: null }]);
    const svg = el().querySelector('svg')!;

    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Emisiones por mes: Ene 2026 16.820 kg CO₂, Feb 2026 18.432 kg CO₂, Mar 2026 15.493 kg CO₂, Abr 2026 sin dato');
    const table = el().querySelector('table.sr-only')!;

    expect(table.querySelector('caption')!.textContent).toBe('Emisiones por mes');
    expect(Array.from(table.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Ene 202616.820', 'Feb 202618.432', 'Mar 202615.493', 'Abr 2026Sin dato']);
    expect(Array.from(table.querySelectorAll('th[scope="col"]')).map((h) => h.textContent)).toEqual(['Mes', 'kg CO₂']);
  });

  it('con 12 meses no hay scroll: las etiquetas se inclinan, todas quedan dentro del ancho y no se solapan', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ label: `Mes ${i + 1} 2026`, value: 3_400_000 - i * 1000 }));
    render(twelve);
    el().style.width = '560px';
    fixture.detectChanges();
    const months = qa('[data-testid="bar-month"]');
    const svg = el().querySelector('svg')!;

    expect(months.length).toBe(12);
    expect(months.every((m) => m.getAttribute('transform')?.startsWith('rotate(-40'))).toBeTrue();
    expect(qa('[data-testid="bar-value"]').every((v) => v.getAttribute('transform')?.startsWith('rotate(-90'))).toBeTrue();
    expect(svg.getBoundingClientRect().width).toBeLessThanOrEqual(el().clientWidth + 1);
    expect(el().scrollWidth).toBeLessThanOrEqual(el().clientWidth + 1);
    const xs = months.map((m) => Number(m.getAttribute('x')));

    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(30);
  });

  it('con 7 dígitos el eje Y deja sitio a sus etiquetas', () => {
    render([{ label: 'A', value: 3_400_000 }, { label: 'B', value: 1_000_000 }]);
    const tick = el().querySelector<SVGTextElement>('.tick')!;

    expect(qa('.tick').map((t) => t.textContent)).toContain('4.000.000');
    expect(Number(tick.getAttribute('x'))).toBeGreaterThan(40);
  });

  it('el alto del SVG es fijo y el ancho se adapta al contenedor', () => {
    render(THREE);
    const svg = el().querySelector('svg')!;

    expect(svg.getAttribute('height')).toBe('140');
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0);
  });
});
