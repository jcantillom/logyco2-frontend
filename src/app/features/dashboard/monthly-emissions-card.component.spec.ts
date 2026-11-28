import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildBucket } from '../../../testing/footprint';
import { FootprintBucket } from '../../domain/models/footprint';
import { MonthlyEmissionsCardComponent } from './monthly-emissions-card.component';

const MONTHS: FootprintBucket[] = [
  buildBucket({ key: '2026-01', label: 'ene 2026', start: '2026-01-01', end: '2026-01-31', kgCo2: 16_820, tCo2: 16.82, trips: 4 }),
  buildBucket({ key: '2026-02', label: 'feb 2026', start: '2026-02-01', end: '2026-02-28', kgCo2: 18_432, tCo2: 18.432, trips: 5 }),
  buildBucket({ key: '2026-03', label: 'mar 2026', start: '2026-03-01', end: '2026-03-31', kgCo2: 15_493, tCo2: 15.493, trips: 3 }),
];
const ZEROS = MONTHS.map((b) => ({ ...b, kgCo2: 0, tCo2: 0, trips: 0 }));

describe('MonthlyEmissionsCardComponent', () => {
  let fixture: ComponentFixture<MonthlyEmissionsCardComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(inputs: Record<string, unknown> = {}): void {
    TestBed.configureTestingModule({ imports: [MonthlyEmissionsCardComponent] });
    fixture = TestBed.createComponent(MonthlyEmissionsCardComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  it('la cabecera lleva el chip de ícono, el título (por defecto «por mes»), el total del servidor y el periodo elegido', () => {
    render({ series: MONTHS, seriesTotalKg: 50745, periodLabel: 'Ene 2026 a Mar 2026' });
    const chip = q('.hdr .ico')!;

    expect(text('h2')).toBe('Emisiones de CO₂ por mes');
    expect(text('[data-testid="chart-subtitle"]')).toBe('Total 50.745 kg');
    expect(text('[data-testid="chart-period"]')).toBe('Ene 2026 a Mar 2026');
    expect(chip.classList).toContain('chip');
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(chip).width).toBe('34px');
    expect(q('section')!.getAttribute('aria-labelledby')).toBe('mc-title');
  });

  it('sin huella pedida (pendiente) muestra el marco y «Se activa cuando calcules tu huella de CO₂», sin controles ni dibujo', () => {
    render();

    expect(text('[data-testid="chart-message"]')).toBe('Se activa cuando calcules tu huella de CO₂');
    expect(q('app-bar-chart')).toBeNull();
    expect(q('svg[role="img"]')).toBeNull();
    expect(q('[data-testid="granularity-select"]')).toBeNull();
    expect(text('[data-testid="chart-subtitle"]')).toBe('Kg de CO₂');
  });

  it('con datos dibuja una barra por cubeta y no hay marco', () => {
    render({ series: MONTHS, seriesTotalKg: 50745 });

    expect(q('app-bar-chart')).not.toBeNull();
    expect(qa('[data-testid="bar"]').length).toBe(3);
    expect(q('[data-testid="chart-empty"]')).toBeNull();
  });

  it('al cambiar de periodo muestra un esqueleto mientras se recarga y vuelve con las nuevas cubetas', () => {
    render({ series: MONTHS, seriesTotalKg: 1, status: 'ready' });
    fixture.componentRef.setInput('status', 'loading');
    fixture.detectChanges();

    expect(q('[data-testid="chart-skeleton"]')).not.toBeNull();
    expect(q('app-bar-chart')).toBeNull();
    fixture.componentRef.setInput('series', MONTHS.slice(1));
    fixture.componentRef.setInput('status', 'ready');
    fixture.detectChanges();
    expect(qa('[data-testid="bar-month"]').length).toBe(2);
  });

  it('un error ofrece «Reintentar»', () => {
    render({ status: 'error' });
    let retried = false;

    fixture.componentInstance.retry.subscribe(() => (retried = true));
    q<HTMLButtonElement>('[data-testid="chart-error"] button')!.click();
    expect(retried).toBeTrue();
  });

  it('mide 256 px con la gráfica y en el estado pendiente', () => {
    render({ series: MONTHS, seriesTotalKg: 1 });
    el().style.width = '540px';
    fixture.detectChanges();
    expect(Math.round(q('.cc')!.getBoundingClientRect().height)).toBe(256);

    TestBed.resetTestingModule();
    render();
    el().style.width = '540px';
    expect(Math.round(q('.cc')!.getBoundingClientRect().height)).toBe(256);
  });

  it('usa solo tokens: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
    render();
    const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('.pchip')).join('\n');

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, (?!currentColor)[^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });

  describe('marco vacío (pendiente y sin viajes en el periodo)', () => {
    const frame = (): HTMLElement | null => q('[data-testid="bar-frame"]');

    it('dibuja el marco del gráfico: línea base y 3 líneas de rejilla tenues, sin valores, barras ni cifras (decorativo)', () => {
      render();

      expect(frame()!.getAttribute('aria-hidden')).toBe('true');
      expect(frame()!.querySelectorAll('i').length).toBe(3);
      expect(getComputedStyle(frame()!).borderBottomWidth).toBe('1px');
      expect(getComputedStyle(frame()!.querySelector('i')!).borderTopStyle).toBe('dashed');
      expect(q('[data-testid="bar"]')).toBeNull();
      expect(q('.tick')).toBeNull();
      expect(el().textContent).not.toMatch(/\d\.\d{3}/);
    });

    it('con la serie en cero rotula el eje con las cubetas reales y dice «Sin viajes calculados en este periodo»', () => {
      render({ series: ZEROS, seriesTotalKg: 0 });

      expect(qa('[data-testid="frame-months"] span').map((m) => m.textContent)).toEqual(['ene 2026', 'feb 2026', 'mar 2026']);
      expect(text('[data-testid="chart-message"]')).toBe('Sin viajes calculados en este periodo');
      expect(q('app-bar-chart')).toBeNull();
    });

    it('con muchas cubetas solo se rotulan la primera y la última', () => {
      render({ series: Array.from({ length: 14 }, (_, i) => buildBucket({ key: `k${i}`, label: `L${i}`, kgCo2: 0, tCo2: 0, trips: 0 })), seriesTotalKg: 0 });

      expect(qa('[data-testid="frame-months"] span').map((m) => m.textContent)).toEqual(['L0', 'L13']);
    });

    it('sin cubetas (sin viajes con fecha) es solo el marco con la frase, sin etiquetas', () => {
      render({ series: [], seriesTotalKg: 0 });

      expect(frame()).not.toBeNull();
      expect(q('[data-testid="frame-months"]')).toBeNull();
      expect(text('[data-testid="chart-message"]')).toBe('Sin viajes calculados en este periodo');
    });

    it('el texto de estado es el canal accesible (role="status") y el marco no', () => {
      render();

      expect(q('[data-testid="chart-message"]')!.getAttribute('role')).toBe('status');
      expect(frame()!.closest('[role="status"]')).toBeNull();
    });

    it('el esqueleto de carga es distinto del marco estático', () => {
      render({ series: MONTHS, status: 'loading' });

      expect(q('[data-testid="chart-skeleton"]')).not.toBeNull();
      expect(frame()).toBeNull();
    });
  });

  describe('resultado parcial y estado vacío', () => {
    it('un resultado parcial lleva «Parcial» junto al periodo, con la aclaración de que el porcentaje es por viajes', () => {
      render({ series: MONTHS, seriesTotalKg: 1, periodLabel: 'Ene 2026 a Mar 2026', partial: true, partialHint: 'Resultado parcial: 12 de 18 viajes calculados. El porcentaje es por cantidad de viajes.' });

      expect(text('[data-testid="chart-partial"]')).toBe('Parcial');
      expect(q('[data-testid="chart-partial"]')!.getAttribute('title')).toContain('12 de 18 viajes calculados');
      expect(text('[data-testid="chart-partial-hint"]')).toContain('por cantidad de viajes');
    });

    it('un resultado completo no lleva «Parcial»', () => {
      render({ series: MONTHS, seriesTotalKg: 1 });

      expect(q('[data-testid="chart-partial"]')).toBeNull();
    });

    it('la altura de la tarjeta no cambia con el marcador «Parcial» (256 px)', () => {
      render({ series: MONTHS, seriesTotalKg: 1, periodLabel: 'Ene 2026 a Mar 2026', partial: true, partialHint: 'x' });
      el().style.width = '560px';

      expect(q('.cc')!.getBoundingClientRect().height).toBe(256);
    });

    it('con el periodo y «Parcial» el título completo y el total caben sin recortarse a ≈ 450 px', () => {
      render({ series: MONTHS, seriesTotalKg: 5_000_000, periodLabel: 'Ene 2026 a Dic 2026', partial: true, partialHint: 'x', granularity: 'quarter' });
      el().style.width = '450px';
      const h2 = q('h2')!;
      const sub = q('[data-testid="chart-subtitle"]')!;

      expect(h2.scrollWidth).toBeLessThanOrEqual(h2.clientWidth);
      expect(sub.scrollWidth).toBeLessThanOrEqual(sub.clientWidth);
    });
  });

  describe('serie por granularidad', () => {
    const WEEKS: FootprintBucket[] = [
      buildBucket({ key: '2026-W11', label: 'Sem 11', start: '2026-03-11', end: '2026-03-15', kgCo2: 1520.25, tCo2: 1.52025, trips: 12, partial: true }),
      buildBucket({ key: '2026-W12', label: 'Sem 12', start: '2026-03-16', end: '2026-03-22', kgCo2: 0, tCo2: 0, trips: 0 }),
      buildBucket({ key: '2026-W13', label: 'Sem 13', start: '2026-03-23', end: '2026-03-24', kgCo2: 310.5, tCo2: 0.3105, trips: 3, partial: true }),
    ];
    const base = { series: WEEKS, seriesTotalKg: 1830.75, granularity: 'week', periodLabel: 'Mar 2026 a Mar 2026' };
    const select = (): HTMLSelectElement => q<HTMLSelectElement>('[data-testid="granularity-select"]')!;

    it('el título y el apoyo siguen la granularidad y el total es series_total_kg del servidor', () => {
      render(base);

      expect(text('h2')).toBe('Emisiones de CO₂ por semana');
      expect(text('[data-testid="chart-subtitle"]')).toBe('Total 1.831 kg');
    });

    it('por defecto (mensual) el título es el de siempre', () => {
      render({ series: MONTHS, seriesTotalKg: 1 });

      expect(text('h2')).toBe('Emisiones de CO₂ por mes');
      expect(select().value).toBe('month');
    });

    it('dibuja una barra por cubeta con valor, las vacías en cero con su ranura, y las rótula con el servidor', () => {
      render(base);

      expect(qa('[data-testid="bar"]').length).toBe(2);
      expect(qa('[data-testid="bar-hit"]').length).toBe(3);
      expect(qa('[data-testid="bar-month"]').map((n) => n.textContent)).toEqual(['Sem 11', 'Sem 12', 'Sem 13']);
    });

    it('todo en cero es «Sin viajes calculados en este periodo» con el marco, y la sugerencia de cobertura si existe', () => {
      const zero = WEEKS.map((b) => ({ ...b, kgCo2: 0, tCo2: 0, trips: 0 }));

      render({ ...base, series: zero, seriesTotalKg: 0 });
      expect(text('[data-testid="chart-message"]')).toBe('Sin viajes calculados en este periodo');
      expect(q('app-bar-chart')).toBeNull();

      TestBed.resetTestingModule();
      render({ ...base, series: zero, seriesTotalKg: 0, emptyText: 'Aún no hay emisiones calculadas: faltan datos en 4 viajes' });
      expect(text('[data-testid="chart-message"]')).toBe('Sin viajes calculados en este periodo. Aún no hay emisiones calculadas: faltan datos en 4 viajes');
    });

    it('el control lista las seis granularidades y al elegir una emite el cambio (la misma o un valor desconocido no emiten)', () => {
      render(base);
      const emitted: string[] = [];

      fixture.componentInstance.granularityChange.subscribe((g) => emitted.push(g));
      expect(Array.from(select().options).map((o) => o.text)).toEqual(['Diario', 'Semanal', 'Mensual', 'Trimestral', 'Semestral', 'Anual']);
      expect(select().value).toBe('week');
      select().value = 'quarter';
      select().dispatchEvent(new Event('change'));
      select().value = 'week';
      select().dispatchEvent(new Event('change'));
      select().value = 'hostile';
      select().dispatchEvent(new Event('change'));

      expect(emitted).toEqual(['quarter']);
    });

    it('las granularidades deshabilitadas (la rechazada y las más finas) explican por qué (title y texto descrito por aria) y las demás siguen activas', () => {
      render({ ...base, disabled: ['day', 'week'] });

      expect(Array.from(select().options).filter((o) => o.disabled).map((o) => o.value)).toEqual(['day', 'week']);
      expect(select().getAttribute('title')).toContain('Diario, Semanal');
      expect(select().getAttribute('title')).toContain('demasiado largo');
      expect(select().getAttribute('aria-describedby')).toBe(q('[data-testid="granularity-hint"]')!.id);
      expect(text('[data-testid="granularity-hint"]')).toContain('elige una granularidad más amplia');
    });

    it('sin granularidades deshabilitadas no hay descripción ni title', () => {
      render(base);

      expect(select().hasAttribute('aria-describedby')).toBeFalse();
      expect(select().hasAttribute('title')).toBeFalse();
    });

    it('el aviso del servidor sustituye al apoyo con el estilo de alerta y no cambia la altura (256 px)', () => {
      render({ ...base, notice: 'El periodo es demasiado largo para ver la serie diaria. Elige granularidad semanal o mensual, o un periodo más corto.' });
      el().style.width = '540px';

      expect(q('[data-testid="granularity-notice"]')!.getAttribute('role')).toBe('alert');
      expect(q('[data-testid="chart-subtitle"]')).toBeNull();
      expect(q('[data-testid="granularity-notice"]')!.getAttribute('title')).toContain('demasiado largo');
      expect(Math.round(q('.cc')!.getBoundingClientRect().height)).toBe(256);
    });

    describe('vista de tabla', () => {
      const radio = (id: string): HTMLButtonElement => q<HTMLButtonElement>(`[data-testid="${id}"]`)!;
      const press = (k: string): void => {
        (document.activeElement && el().contains(document.activeElement) && document.activeElement.getAttribute('role') === 'radio' ? document.activeElement : radio('view-chart')).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
        fixture.detectChanges();
      };

      it('el interruptor es un radiogroup con «Gráfico» y «Tabla» (aria-checked y tabulación móvil)', () => {
        render(base);

        expect(q('[data-testid="view-switch"]')!.getAttribute('role')).toBe('radiogroup');
        expect(radio('view-chart').getAttribute('role')).toBe('radio');
        expect([radio('view-chart').getAttribute('aria-checked'), radio('view-table').getAttribute('aria-checked')]).toEqual(['true', 'false']);
        expect([radio('view-chart').tabIndex, radio('view-table').tabIndex]).toEqual([0, -1]);
        expect([radio('view-chart').getAttribute('aria-label'), radio('view-table').getAttribute('aria-label')]).toEqual(['Gráfico', 'Tabla']);
      });

      it('las flechas, Inicio y Fin cambian de vista y el foco sigue a la opción', () => {
        render(base);
        press('ArrowRight');

        expect(radio('view-table').getAttribute('aria-checked')).toBe('true');
        expect(radio('view-table').tabIndex).toBe(0);
        expect(document.activeElement === radio('view-table') || !el().isConnected).toBeTrue();
        expect(q('app-bar-chart')).toBeNull();
        expect(q('[data-testid="series-table"]')).not.toBeNull();
        press('ArrowLeft');
        expect(radio('view-chart').getAttribute('aria-checked')).toBe('true');
        expect(q('app-bar-chart')).not.toBeNull();
        press('End');
        expect(q('[data-testid="series-table"]')).not.toBeNull();
        press('Home');
        expect(q('app-bar-chart')).not.toBeNull();
      });

      it('la tabla muestra las mismas cubetas con el total del servidor y la tarjeta mide lo mismo que con el gráfico (256 px)', () => {
        render(base);
        el().style.width = '540px';
        const withChart = Math.round(q('.cc')!.getBoundingClientRect().height);

        radio('view-table').click();
        fixture.detectChanges();

        expect(qa('[data-testid="series-row"]').length).toBe(3);
        expect(text('[data-testid="series-total"]')).toBe('Total 1.830,75 kg CO₂');
        expect(Math.round(q('.cc')!.getBoundingClientRect().height)).toBe(withChart);
        expect(withChart).toBe(256);
      });

      it('con 53 semanas la tabla pagina y la tarjeta sigue en 256 px (sin scroll interno)', () => {
        const weeks = Array.from({ length: 53 }, (_, i) => buildBucket({ key: `w${i}`, label: `Sem ${i + 1}`, kgCo2: i, trips: 1 }));

        render({ ...base, series: weeks, seriesTotalKg: 1378 });
        el().style.width = '540px';
        radio('view-table').click();
        fixture.detectChanges();

        expect(qa('[data-testid="series-row"]').length).toBe(6);
        expect(Math.round(q('.cc')!.getBoundingClientRect().height)).toBe(256);
        const body = q('.cc .body')!;

        expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);
      });

      it('con 53 semanas el gráfico sigue en 256 px', () => {
        const weeks = Array.from({ length: 53 }, (_, i) => buildBucket({ key: `w${i}`, label: `Sem ${i + 1}`, kgCo2: i * 3, trips: 1, partial: i === 0 }));

        render({ ...base, series: weeks, seriesTotalKg: 4000 });
        el().style.width = '540px';
        fixture.detectChanges();

        expect(Math.round(q('.cc')!.getBoundingClientRect().height)).toBe(256);
      });

      it('sin viajes no se ofrece la tabla (el interruptor no aparece)', () => {
        render({ ...base, series: WEEKS.map((b) => ({ ...b, kgCo2: 0, trips: 0 })) });

        expect(q('[data-testid="view-switch"]')).toBeNull();
        expect(q('[data-testid="granularity-select"]')).not.toBeNull();
      });
    });

    it('anuncia con aria-live polite la serie cuando hay datos', () => {
      render(base);

      expect(q('[data-testid="series-live"]')!.getAttribute('aria-live')).toBe('polite');
      expect(text('[data-testid="series-live"]')).toBe('Serie semanal: 3 periodos, total 1.831 kg CO₂');
    });

    it('mientras carga conserva el control (sin saltos) y muestra el esqueleto del alto del gráfico; con error, el reintento', () => {
      render({ ...base, status: 'loading' });

      expect(q('[data-testid="granularity-select"]')).not.toBeNull();
      expect(q<HTMLElement>('[data-testid="chart-skeleton"]')!.style.height).toBe('150px');
      TestBed.resetTestingModule();
      render({ ...base, status: 'error' });
      expect(q('[data-testid="chart-error"]')).not.toBeNull();
      expect(q('[data-testid="granularity-select"]')).not.toBeNull();
    });

    it('el foco visible de los controles usa el anillo de foco de marca', () => {
      render(base);
      const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).join('\n');

      expect(css).toMatch(/select\.gran:focus-visible,\s*\.cc\s+\.seg\s+button:focus-visible\s*\{[^}]*outline: 3px solid var\(--c-focus\)/);
    });
  });
});
