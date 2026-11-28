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
    const table = el().querySelector('.sr-only > table')!;

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

    expect(svg.getAttribute('height')).toBe('150');
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0);
  });

  describe('tooltip propio y teclado (serie por granularidad)', () => {
    const PARTIAL = 'Periodo parcial: incluye solo los días dentro del rango elegido';
    const TIPS: BarDatum[] = [
      { label: 'Sem 11', value: 1520.25, partial: true, tip: ['Sem 11', '1.520,25 kg CO₂ · 1,52 t', '12 viajes', PARTIAL] },
      { label: 'Sem 12', value: 0, tip: ['Sem 12', '0 kg CO₂ · 0 t', '0 viajes'] },
      { label: 'Sem 13', value: 310.5, partial: true, tip: ['Sem 13', '310,5 kg CO₂ · 0,31 t', '3 viajes', PARTIAL] },
    ];
    const svg = (): SVGElement => el().querySelector('svg')!;
    const tip = (): string | null => {
      const box = el().querySelector('[data-testid="bar-tip"]');

      return box ? Array.from(box.children).map((c) => c.textContent).join(' | ') : null;
    };
    const key = (name: string): void => {
      svg().dispatchEvent(new KeyboardEvent('keydown', { key: name }));
      fixture.detectChanges();
    };

    it('una barra en cero no se dibuja pero su franja sí responde: el tooltip dice 0', () => {
      render(TIPS);
      const hits = qa('[data-testid="bar-hit"]');

      expect(qa('[data-testid="bar"]').length).toBe(2);
      expect(hits.length).toBe(3);
      hits[1].dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect(tip()).toBe('Sem 12 | 0 kg CO₂ · 0 t | 0 viajes');
    });

    it('pasar el puntero muestra label, kg, t y viajes; salir lo oculta', () => {
      render(TIPS);
      qa('[data-testid="bar-hit"]')[0].dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      expect(tip()).toContain('Sem 11 | 1.520,25 kg CO₂ · 1,52 t | 12 viajes');
      expect(tip()).toContain('Periodo parcial: incluye solo los días dentro del rango elegido');
      expect(el().querySelector('[data-testid="bar-tip"]')!.getAttribute('aria-hidden')).toBe('true');
      svg().dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();
      expect(tip()).toBeNull();
    });

    it('el SVG es un solo punto de tabulación; el foco muestra la primera y las flechas, Inicio, Fin y Escape recorren las barras', () => {
      render(TIPS);

      expect(svg().getAttribute('tabindex')).toBe('0');
      svg().dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();
      expect(tip()).toContain('Sem 11');
      key('ArrowRight');
      expect(tip()).toContain('Sem 12');
      key('ArrowRight');
      key('ArrowRight');
      expect(tip()).toContain('Sem 13');
      key('ArrowLeft');
      expect(tip()).toContain('Sem 12');
      key('Home');
      expect(tip()).toContain('Sem 11');
      key('End');
      expect(tip()).toContain('Sem 13');
      key('Escape');
      expect(tip()).toBeNull();
      expect(qa('[tabindex]').filter((n) => n.getAttribute('tabindex') === '0').length).toBe(1);
    });

    it('sin tooltips (meses de siempre) el SVG no entra en la tabulación y las flechas no hacen nada', () => {
      render(THREE);

      expect(svg().hasAttribute('tabindex')).toBeFalse();
      key('ArrowRight');
      expect(tip()).toBeNull();
      expect(qa('[data-testid="bar-hit"]').length).toBe(0);
    });

    it('las barras parciales llevan trazo discontinuo, su etiqueta va en cursiva y la leyenda explica «Periodo parcial»', () => {
      render(TIPS);

      expect(qa('[data-testid="bar"]').filter((b) => b.classList.contains('partial')).length).toBe(2);
      expect(qa('[data-testid="bar-month"]').filter((b) => b.classList.contains('partial')).length).toBe(2);
      expect(el().querySelector('[data-testid="bar-legend-partial"]')!.textContent).toContain('Periodo parcial');
      expect(getComputedStyle(qa('[data-testid="bar"]')[0]).strokeDasharray).not.toBe('none');
    });

    it('la tabla para lectores de pantalla va recortada en un contenedor: con 20 barras no agranda la página', () => {
      render(Array.from({ length: 20 }, (_, i): BarDatum => ({ label: `${i + 1} mar`, value: i, tip: ['x'] })));
      const box = el().querySelector('.sr-only')!.getBoundingClientRect();

      expect([Math.round(box.width), Math.round(box.height)]).toEqual([1, 1]);
    });

    it('sin barras parciales no hay leyenda de parcial', () => {
      render(THREE);

      expect(el().querySelector('[data-testid="bar-legend-partial"]')).toBeNull();
    });

    it('con 400 barras el SVG sigue ligero (< 1.000 nodos), sin cifras, pistas de fondo ni tendencia, y rotula una de cada N', () => {
      const data = Array.from({ length: 400 }, (_, i): BarDatum => ({ label: `${i + 1} mar`, value: i % 7 === 0 ? 0 : i, tip: [`${i + 1} mar`, 'x', 'y'] }));

      render(data);

      expect(svg().querySelectorAll('*').length).toBeLessThan(1000);
      expect(qa('[data-testid="bar-value"]').length).toBe(0);
      expect(qa('[data-testid="bar-trend"]').length).toBe(0);
      expect(qa('.track').length).toBe(0);
      expect(qa('[data-testid="bar-month"]').length).toBeLessThan(60);
      expect(qa('[data-testid="bar-month"]')[0].textContent).toBe('1 mar');
      expect(el().querySelector('[data-testid="bar-legend"]')!.textContent).not.toContain('Tendencia');
      expect(el().querySelector('[data-testid="bar-table"]')).toBeNull();
      expect(svg().getAttribute('aria-label')).toContain('400 periodos');
      expect(el().scrollWidth).toBeLessThanOrEqual(el().clientWidth);
    });
  });
});
