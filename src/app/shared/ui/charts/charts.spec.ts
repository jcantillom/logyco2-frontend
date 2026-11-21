import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartSeries, DonutSegment, axisFor, hasData } from './chart-model';
import { DonutChartComponent } from './donut-chart.component';
import { TrendChartComponent } from './trend-chart.component';

@Component({
  imports: [TrendChartComponent, DonutChartComponent],
  template: `
    <app-trend-chart [labels]="labels" [series]="series" [kind]="kind" ariaLabel="Altas por día" />
    <app-donut-chart [segments]="segments" [centerTotal]="centerTotal" centerLabel="orgs" ariaLabel="Por tipo" />
  `,
})
class HostComponent {
  kind: 'line' | 'bar' = 'line';
  centerTotal: number | null = null;
  labels = ['1 nov', '2 nov', '3 nov'];
  series: ChartSeries[] = [{ name: 'Empresas', color: '#086b50', values: [1, 4, 2] }, { name: 'Usuarios', color: '#2a78c2', values: [0, 7, 3] }];
  segments: DonutSegment[] = [{ label: 'Transportador', value: 3, color: '#086b50' }, { label: 'Generador', value: 1, color: '#2a78c2' }];
}

@Component({
  imports: [TrendChartComponent],
  template: `<app-trend-chart [labels]="labels" [series]="series" [fitRange]="true" [notes]="notes" ariaLabel="Gasolina" />`,
})
class FitHostComponent {
  labels = ['1 oct', '2 oct', '1 nov'];
  series: ChartSeries[] = [{ name: 'Gasolina', color: '#086b50', values: [16331, 16377, 16331] }];
  notes = ['Circular CREG 335 de 2026', 'Circular CREG 360 de 2026 · vs. anterior 0,3 %', null];
}

describe('gráficos SVG propios', () => {
  function render(configure: (host: HostComponent) => void = () => undefined) {
    const fixture = TestBed.createComponent(HostComponent);
    configure(fixture.componentInstance);
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('el eje usa marcas enteras y distintas: un paso redondo y un tope múltiplo del paso, nunca menor a 1', () => {
    expect([0, 4, 5, 7, 40, 180].map(axisFor)).toEqual([
      { step: 1, top: 1 }, { step: 1, top: 4 }, { step: 2, top: 6 }, { step: 2, top: 8 }, { step: 10, top: 40 }, { step: 50, top: 200 },
    ]);
  });

  it('las marcas del eje del gráfico no se repiten', () => {
    const { el } = render();

    const ticks = Array.from(el.querySelectorAll('app-trend-chart text.axis-label[text-anchor="end"]')).map((t) => t.textContent);
    expect(ticks).toEqual(['0', '2', '4', '6', '8']); // el máximo de los datos es 7
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it('hasData distingue series vacías de series con datos', () => {
    expect(hasData([{ name: 'a', color: '#000', values: [0, 0] }])).toBeFalse();
    expect(hasData([{ name: 'a', color: '#000', values: [0, 2] }])).toBeTrue();
  });

  it('las marcas del eje con miles se escriben completas («15.000») y el margen izquierdo se ensancha para no recortarlas', () => {
    const { el } = render((host) => (host.series = [{ name: 'Gasolina', color: '#086b50', values: [15900, 16331, 16377] }]));
    const labels = Array.from(el.querySelectorAll('svg text.axis-label[text-anchor="end"]')).map((t) => t.textContent!.trim());
    const grid = Number(el.querySelector('svg line.grid')!.getAttribute('x1'));

    expect(labels).toContain('15.000');
    expect(labels.every((l) => !/^0{3,}$/.test(l))).toBeTrue();
    expect(grid).toBeGreaterThanOrEqual('15.000'.length * 6 + 8); // el texto cabe a la izquierda de la rejilla
  });

  it('con fitRange el eje de líneas se ajusta al rango real y sin él parte de cero; las barras siempre parten de cero', () => {
    const labels = (el: HTMLElement) => Array.from(el.querySelectorAll('svg text.axis-label[text-anchor="end"]')).map((t) => t.textContent!.trim());
    const prices = [{ name: 'Gasolina', color: '#086b50', values: [16331, 16377, 16331] }];
    const fixture = TestBed.createComponent(FitHostComponent);
    fixture.detectChanges();
    const fitted = labels(fixture.nativeElement);
    const { el } = render((host) => (host.series = prices));

    expect(Number(fitted[0].replace('.', ''))).toBeGreaterThan(15000); // base cercana al dato, no 0
    expect(fitted.at(-1)).not.toBe('0');
    expect(labels(el)[0]).toBe('0');
    const bars = render((host) => { host.kind = 'bar'; host.series = prices; });
    expect(labels(bars.el)[0]).toBe('0');
    expect(fixture.nativeElement.querySelector('.tooltip')).toBeNull();
  });

  it('línea: una trayectoria por serie, etiquetas accesibles y tabla equivalente para lectores de pantalla', () => {
    const { el } = render();

    expect(el.querySelectorAll('app-trend-chart path.line').length).toBe(2);
    expect(el.querySelector('app-trend-chart svg')!.getAttribute('aria-label')).toBe('Altas por día');
    const table = el.querySelector('app-trend-chart table.sr-only')!;
    expect(table.querySelectorAll('tbody tr').length).toBe(3);
    expect(table.textContent).toContain('Empresas');
    expect(el.querySelector('app-trend-chart .legend')!.textContent).toContain('Usuarios');
  });

  it('barras: un rectángulo por valor y serie, con altura proporcional', () => {
    const { el } = render((host) => (host.kind = 'bar'));

    const bars = Array.from(el.querySelectorAll('app-trend-chart rect:not(.hit)'));
    expect(bars.length).toBe(6);
    const heights = bars.map((b) => Number(b.getAttribute('height')));
    expect(heights[1]).toBeGreaterThan(heights[0]);  // 4 > 1
    expect(heights[3]).toBe(0);                      // valor 0 → sin altura
  });

  it('al enfocar un punto muestra el valor exacto de cada serie', () => {
    const { fixture, el } = render();

    el.querySelectorAll<SVGRectElement>('app-trend-chart rect.hit')[1].dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const tip = el.querySelector('app-trend-chart .tooltip')!.textContent!.replace(/\s+/g, ' ');
    expect(tip).toContain('2 nov');
    expect(tip).toContain('Empresas: 4');
    expect(tip).toContain('Usuarios: 7');
  });

  it('dona: total en el centro, leyenda con valores y porcentajes', () => {
    const { el } = render();

    const donut = el.querySelector('app-donut-chart')!;
    expect(donut.querySelector('.center')!.textContent).toBe('4');
    expect(donut.textContent).toContain('Transportador');
    expect(donut.textContent).toContain('75%');
    expect(donut.textContent).toContain('25%');
    expect(donut.querySelectorAll('circle.seg').length).toBe(2);
  });

  it('dona: el centro puede mostrar un total propio cuando los segmentos cuentan una misma empresa más de una vez', () => {
    const { el } = render((host) => (host.centerTotal = 3));

    expect(el.querySelector('app-donut-chart .center')!.textContent).toBe('3'); // los segmentos suman 4
  });

  it('dona sin datos: no dibuja segmentos ni porcentajes inventados', () => {
    const { el } = render((host) => (host.segments = [{ label: 'Activas', value: 0, color: '#086b50' }]));

    expect(el.querySelectorAll('app-donut-chart circle.seg').length).toBe(0);
    expect(el.querySelector('app-donut-chart')!.textContent).toContain('—');
  });
});

describe('gráfico que ocupa el alto de su contenedor (modo fill)', () => {
  @Component({
    imports: [TrendChartComponent],
    template: `<div style="display: flex; flex-direction: column; width: 600px; height: 260px"><app-trend-chart [fill]="true" [labels]="['a', 'b', 'c']" [series]="series" ariaLabel="x" /></div>`,
  })
  class FillHostComponent {
    series: ChartSeries[] = [{ name: 'S', color: '#086b50', values: [1, 2, 3] }];
  }

  it('se redibuja con el tamaño real de su contenedor, sin escalar el texto', async () => {
    const fixture = TestBed.createComponent(FillHostComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 80)); // deja actuar al ResizeObserver
    fixture.detectChanges();

    const svg = (fixture.nativeElement as HTMLElement).querySelector('app-trend-chart svg')!;
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(w).toBeGreaterThan(500);
    expect(w).toBeLessThanOrEqual(600);
    expect(h).toBeGreaterThan(150);
    expect(h).toBeLessThanOrEqual(260);
  });

  it('con una sola serie no repite la leyenda en modo fill (ahorra alto)', () => {
    const fixture = TestBed.createComponent(FillHostComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-trend-chart .legend')).toBeNull();
  });
});

describe('eje X con etiquetas de dos líneas (mes y año debajo)', () => {
  @Component({
    imports: [TrendChartComponent],
    template: `<app-trend-chart [labels]="labels" [series]="series" [labelGap]="40" ariaLabel="x" />`,
  })
  class TwoLineHostComponent {
    labels = ['Nov\n2025', 'Dic\n2025', 'Ene\n2026'];
    series: ChartSeries[] = [{ name: 'S', color: '#086b50', values: [1, 2, 3] }];
  }

  it('dibuja el mes y, debajo, el año; y reserva más alto para el eje', () => {
    const fixture = TestBed.createComponent(TwoLineHostComponent);
    fixture.detectChanges();
    const texts = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('svg text.axis-label')).filter((t) => /^(Nov|Dic|Ene|2025|2026)$/.test(t.textContent!.trim()));
    const byX = new Map<string, { y: number; text: string }[]>();
    texts.forEach((t) => byX.set(t.getAttribute('x')!, [...(byX.get(t.getAttribute('x')!) ?? []), { y: Number(t.getAttribute('y')), text: t.textContent!.trim() }]));

    expect(byX.size).toBe(3);
    byX.forEach((lines) => {
      expect(lines.length).toBe(2);
      expect(lines[1].y).toBeGreaterThan(lines[0].y); // el año va debajo del mes
      expect(/^\d{4}$/.test(lines[1].text)).toBeTrue();
    });
  });

});
