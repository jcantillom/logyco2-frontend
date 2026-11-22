import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { FootprintByFuel } from '../../domain/models/footprint';
import { ImportCounts } from '../../domain/models/imports';
import { ROTATION_MS } from '../../shared/ui/rotation';
import { ResultCardComponent } from './result-card.component';

const FUELS: FootprintByFuel = [
  { fuelCode: 'GASOLINE_MOTOR', name: 'Gasolina motor', kgCo2e: 4_972 },
  { fuelCode: 'NATURAL_GAS', name: 'Gas natural', kgCo2e: 2_341 },
  { fuelCode: 'DIESEL_B2', name: 'Diésel B2', kgCo2e: 43_432 },
];
const COUNTS: ImportCounts = {
  total: 2, inProgress: 0, completed: 2, failed: 0, vehiclesPending: 0, rowsRead: 3_400_000, rowsCalculable: 3_000_000, rowsPending: 400_000, rowsReal: 2_000_000, rowsEstimated: 1_000_000, vehiclesNewPending: 0, vehiclesChangedPending: 0,
  periodFrom: '2026-01-05', periodTo: '2026-03-28', distanceKm: 1_234_567, cargoTon: 48.3, rowsWithDistance: 3_300_000, rowsWithCargo: 2_900_000, distanceFromRoutesKm: 0,
};

describe('ResultCardComponent', () => {
  let fixture: ComponentFixture<ResultCardComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (id: string): string => (q(`[data-testid="${id}"]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = (): void => fixture.detectChanges();

  function render(inputs: Record<string, unknown> = {}): void {
    TestBed.configureTestingModule({ imports: [ResultCardComponent] });
    fixture = TestBed.createComponent(ResultCardComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  beforeEach(() => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList);
  });

  describe('estado pendiente (hoy no hay cálculo de CO₂)', () => {
    it('muestra «—» y «Se activa al calcular tu huella», sin segmentos ni pausa ni kg inventados', () => {
      render({ counts: COUNTS });

      expect(text('result-fuel')).toContain('Se activa al calcular tu huella');
      expect(text('result-value')).toBe('—');
      expect(text('result-help')).toBe('Aquí verás tus kg CO₂ por combustible: gasolina, GNC y los demás.');
      expect(q('.wait .leaf')!.getAttribute('aria-hidden')).toBe('true');
      expect(q('[data-testid^="result-segment-"]')).toBeNull();
      expect(q('[data-testid="result-pause"]')).toBeNull();
      expect(el().textContent).not.toMatch(/\d\s*kg CO/);
    });

    it('no rota aunque pase el tiempo (no hay con qué rotar)', fakeAsync(() => {
      render({ counts: COUNTS });
      tick(ROTATION_MS * 3);
      settle();

      expect(text('result-value')).toBe('—');
    }));
  });

  describe('con resultado por combustible', () => {
    it('muestra el primer combustible: kg CO₂ con separador de miles, su nombre y tres segmentos', fakeAsync(() => {
      render({ byFuel: FUELS, counts: COUNTS });

      expect(text('result-value')).toBe('4.972');
      expect(text('result-unit')).toBe('kg CO₂');
      expect(text('result-fuel-name')).toBe('Gasolina motor');
      expect(el().querySelectorAll('[data-testid^="result-segment-"]').length).toBe(3);
      expect(q('[data-testid="result-segment-0"]')!.getAttribute('aria-current')).toBe('true');
      discardPeriodicTasks();
      fixture.destroy();
    }));

    it('rota cada 3000 ms por los combustibles y vuelve al primero', fakeAsync(() => {
      render({ byFuel: FUELS });

      tick(ROTATION_MS - 1); settle();
      expect(text('result-fuel-name')).toBe('Gasolina motor');
      tick(1); settle();
      expect(text('result-fuel-name')).toBe('Gas natural');
      expect(text('result-value')).toBe('2.341');
      tick(ROTATION_MS); settle();
      expect(text('result-fuel-name')).toBe('Diésel B2');
      tick(ROTATION_MS); settle();
      expect(text('result-fuel-name')).toBe('Gasolina motor');
      fixture.destroy();
    }));

    it('el botón de pausa detiene la rotación (aria-pressed) y los segmentos saltan y lo anuncian con aria-live polite', fakeAsync(() => {
      render({ byFuel: FUELS });
      q<HTMLButtonElement>('[data-testid="result-pause"]')!.click();
      settle();
      tick(ROTATION_MS * 3); settle();

      expect(text('result-fuel-name')).toBe('Gasolina motor');
      expect(q('[data-testid="result-pause"]')!.getAttribute('aria-pressed')).toBe('true');
      expect(q('[data-testid="result-pause"]')!.getAttribute('aria-label')).toBe('Reanudar rotación');
      expect(q('[data-testid="result-live"]')!.getAttribute('aria-live')).toBe('off');

      q<HTMLButtonElement>('[data-testid="result-segment-2"]')!.click();
      settle();
      expect(text('result-fuel-name')).toBe('Diésel B2');
      expect(q('[data-testid="result-live"]')!.getAttribute('aria-live')).toBe('polite');
      fixture.destroy();
    }));

    it('se detiene con el cursor encima y con el foco dentro, y reanuda al salir', fakeAsync(() => {
      render({ byFuel: FUELS });
      const host = el();

      host.dispatchEvent(new MouseEvent('mouseenter'));
      settle();
      tick(ROTATION_MS * 2); settle();
      expect(text('result-fuel-name')).toBe('Gasolina motor');

      host.dispatchEvent(new MouseEvent('mouseleave'));
      settle();
      tick(ROTATION_MS); settle();
      expect(text('result-fuel-name')).toBe('Gas natural');

      host.dispatchEvent(new FocusEvent('focusin'));
      settle();
      tick(ROTATION_MS * 2); settle();
      expect(text('result-fuel-name')).toBe('Gas natural');
      host.dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body }));
      settle();
      tick(ROTATION_MS); settle();
      expect(text('result-fuel-name')).toBe('Diésel B2');
      fixture.destroy();
    }));

    it('con un solo combustible no hay segmentos, ni pausa, ni rotación', fakeAsync(() => {
      render({ byFuel: [FUELS[0]] });
      tick(ROTATION_MS * 2); settle();

      expect(text('result-fuel-name')).toBe('Gasolina motor');
      expect(q('[data-testid="result-pause"]')).toBeNull();
      expect(q('[data-testid^="result-segment-"]')).toBeNull();
    }));

    it('con «reducir movimiento» no rota sola pero los segmentos cambian de combustible a mano', fakeAsync(() => {
      (window.matchMedia as jasmine.Spy).and.returnValue({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList);
      render({ byFuel: FUELS });
      tick(ROTATION_MS * 3); settle();
      expect(text('result-fuel-name')).toBe('Gasolina motor');

      q<HTMLButtonElement>('[data-testid="result-segment-1"]')!.click();
      settle();
      expect(text('result-fuel-name')).toBe('Gas natural');
    }));

    it('al destruir se cancela la cuenta atrás (sin temporizadores pendientes)', fakeAsync(() => {
      render({ byFuel: FUELS });
      fixture.destroy();

      expect(() => tick(ROTATION_MS * 2)).not.toThrow();
    }));

    it('una cifra de 7 dígitos con la unidad no desborda la tarjeta', fakeAsync(() => {
      render({ byFuel: [{ fuelCode: 'X', name: 'Diésel B2', kgCo2e: 3_400_000 }, FUELS[0]], counts: COUNTS });
      el().style.width = '300px';
      const card = q('.rc')!;

      expect(text('result-value')).toBe('3.400.000');
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
      discardPeriodicTasks();
      fixture.destroy();
    }));
  });

  describe('mitad derecha: distancia y carga', () => {
    it('muestra la distancia total en km y la carga transportada en t con la cobertura real de cada una', () => {
      render({ counts: COUNTS });

      expect(text('result-distance')).toBe('Distancia total1.234.567kmen 3.300.000 viajes con distancia');
      expect(text('result-cargo')).toBe('Carga transportada48,3ten 2.900.000 viajes con carga');
      expect(q('[data-testid="result-totals"]')!.tagName.toLowerCase()).toBe('dl');
    });

    it('sin cargas muestra «—» y la invitación a subir un archivo', () => {
      render({ counts: { ...COUNTS, rowsRead: 0, distanceKm: 0, cargoTon: 0, rowsWithDistance: 0, rowsWithCargo: 0 } });

      expect(text('result-distance-value')).toBe('—');
      expect(text('result-distance-note')).toBe('Sube un archivo para ver la distancia total');
      expect(text('result-cargo-note')).toBe('Sube un archivo para ver la carga transportada');
    });

    it('sin counts (sin permiso) solo «—»', () => {
      render();

      expect(text('result-distance-value')).toBe('—');
      expect(q('[data-testid="result-distance-note"]')).toBeNull();
    });

    it('esqueleto al cargar y error con «Reintentar»', () => {
      render({ status: 'loading' });
      expect(q('.skeleton')).not.toBeNull();
      expect(q('[data-testid="result-totals"]')).toBeNull();

      TestBed.resetTestingModule();
      render({ status: 'error' });
      let retried = false;
      fixture.componentInstance.retry.subscribe(() => (retried = true));
      q<HTMLButtonElement>('[data-testid="result-error"] button')!.click();
      expect(retried).toBeTrue();
    });
  });

  it('el título lleva el periodo elegido en un chip y la sección tiene nombre accesible', () => {
    render({ counts: COUNTS, periodLabel: 'Ene 2026 a Mar 2026' });

    expect(text('result-period')).toBe('Ene 2026 a Mar 2026');
    expect(q('section')!.getAttribute('aria-labelledby')).toBe('rc-title');
    expect(q('#rc-title')!.textContent).toBe('Resultado del periodo');
    expect(q('[data-testid="result-period"]')).not.toBeNull();

    TestBed.resetTestingModule();
    render({ counts: COUNTS });
    expect(q('[data-testid="result-period"]')).toBeNull();
  });

  describe('estructura', () => {
    it('la cabecera lleva el chip de ícono sobre oscuro (40 px), el título en 1,05 rem y la línea «Huella del periodo» con el chip del periodo', () => {
      render({ counts: COUNTS, periodLabel: 'Ene 2026 a Mar 2026' });
      const chip = q('.head .ico')!;

      expect(chip.classList).toContain('chip');
      expect([getComputedStyle(chip).width, getComputedStyle(chip).borderRadius]).toEqual(['40px', '12px']);
      expect(getComputedStyle(q('h2')!).fontSize).toBe('16.8px');
      expect(text('result-period')).toBe('Ene 2026 a Mar 2026');
      expect(q('.sub')!.textContent).toContain('Huella del periodo');
    });

    it('cada dato de la derecha lleva su ícono en un círculo, la etiqueta, la cifra grande y la cobertura', () => {
      render({ counts: COUNTS });
      const icons = Array.from(el().querySelectorAll<HTMLElement>('.metric .ic'));

      expect(icons.length).toBe(2);
      expect(icons.every((i) => i.getAttribute('aria-hidden') === 'true' && getComputedStyle(i).borderRadius === '50%')).toBeTrue();
      expect(getComputedStyle(icons[0].querySelector('svg')!).width).toBe('18px');
      expect(getComputedStyle(q('.metric .v')!).fontSize).toBe('22.4px');
    });

    it('con resultado por combustible los segmentos son píldoras rotuladas con su nombre completo accesible', fakeAsync(() => {
      render({ byFuel: FUELS });
      const pills = Array.from(el().querySelectorAll<HTMLButtonElement>('.pills .pill'));

      expect(pills.map((p) => p.querySelector('.t')!.textContent)).toEqual(['Gasolina motor', 'Gas natural', 'Diésel B2']);
      expect(pills.map((p) => p.getAttribute('aria-label'))).toEqual(['Gasolina motor', 'Gas natural', 'Diésel B2']);
      expect(getComputedStyle(q('[data-testid="result-value"]')!).fontSize).toBe('40px');
      discardPeriodicTasks();
      fixture.destroy();
    }));

    it('mide ≈ 190–210 px de alto', () => {
      render({ counts: COUNTS, periodLabel: 'Ene 2026 a Mar 2026' });
      el().style.width = '540px';
      const height = q('.rc')!.getBoundingClientRect().height;

      expect(height).toBeGreaterThanOrEqual(185);
      expect(height).toBeLessThanOrEqual(215);
    });
  });

  describe('distancias por ruta', () => {
    const WITH_ROUTES: ImportCounts = { ...COUNTS, distanceFromRoutesKm: 120_000.4 };

    it('con km por ruta lo dice en el título y en la descripción accesible, sin añadir una línea visible', () => {
      render({ counts: WITH_ROUTES });
      const section = q('[data-testid="period-result"]')!;
      const extra = q('[data-testid="result-distance-routes"]')!;

      expect(text('result-distance-note')).toBe('en 3.300.000 viajes con distancia');
      expect(extra.textContent).toBe('de ellos 120.000 km calculados por ruta (aprox.)');
      expect(extra.classList).toContain('sr-only');
      expect(section.getAttribute('aria-describedby')).toBe(extra.id);
      expect(section.getAttribute('title')).toBe('de ellos 120.000 km calculados por ruta (aprox.). Distancias por carretera © colaboradores de OpenStreetMap · DANE DIVIPOLA');
    });

    it('sin km por ruta no hay descripción ni título', () => {
      render({ counts: COUNTS });

      expect(q('[data-testid="result-distance-routes"]')).toBeNull();
      expect(q('[data-testid="period-result"]')!.hasAttribute('title')).toBeFalse();
      expect(q('[data-testid="period-result"]')!.hasAttribute('aria-describedby')).toBeFalse();
    });

    it('la tarjeta conserva su altura (≈ 190–215 px) también con distancias por ruta', () => {
      render({ counts: WITH_ROUTES, periodLabel: 'Ene 2026 a Mar 2026' });
      el().style.width = '540px';
      const height = q('.rc')!.getBoundingClientRect().height;

      expect(height).toBeGreaterThanOrEqual(185);
      expect(height).toBeLessThanOrEqual(215);
    });
  });

  describe('misma receta que «Factor de emisión», en verde autorizado (tarjeta protagonista)', () => {
    const channels = (color: string): number[] => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (color: string): number => {
      const [r, g, b] = channels(color).map((c) => {
        const v = c / 255;

        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);

      return (hi + 0.05) / (lo + 0.05);
    };
    /** Color real de un token: se mide con un elemento de prueba. */
    const token = (name: string): string => {
      const probe = document.createElement('div');

      probe.style.backgroundColor = `var(${name})`;
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();

      return color;
    };
    /** `rgb(r g b)` de mezclar `top` al `percent` % sobre `base`. */
    const mix = (top: string, base: string, percent: number): string => {
      const [t, b] = [channels(top), channels(base)];

      return `rgb(${t.map((c, i) => Math.round((c * percent + b[i] * (100 - percent)) / 100)).join(' ')})`;
    };

    it('es una tarjeta clara (no de fondo sólido): degradado suave de aguamarina en la esquina, filete superior de 3 px en aguamarina pleno y borde fino', () => {
      render({ counts: COUNTS });
      const card = q('.rc')!;
      const style = getComputedStyle(card);

      expect(card.classList).toContain('acard');
      expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(style.backgroundImage).toContain('linear-gradient');
      expect(style.borderTopWidth).toBe('3px');
      expect(style.borderTopColor).toBe(token('--c-secondary'));
      expect(style.borderLeftWidth).toBe('1px');
      expect(style.borderLeftColor).not.toBe(token('--c-secondary'));
      expect(style.boxShadow).not.toBe('none');
    });

    it('comparte la receta con la tarjeta de factor (mismo radio y mismo filete) y solo cambia el color de marca', () => {
      render({ counts: COUNTS });
      const style = getComputedStyle(q('.rc')!);

      expect(style.borderRadius).toBe('18px');
      expect(getComputedStyle(q('.rc')!).getPropertyValue('--card-accent').trim().toLowerCase()).toBe(getComputedStyle(document.documentElement).getPropertyValue('--c-secondary').trim().toLowerCase());
    });

    it('tiene más presencia que la de factor: cifras algo mayores (2,5 rem y 1,4 rem) y sombra más marcada', () => {
      render({ counts: COUNTS });

      expect(getComputedStyle(q('[data-testid="result-value"]')!).fontSize).toBe('40px');
      expect(getComputedStyle(q('.metric .v')!).fontSize).toBe('22.4px');
      expect(getComputedStyle(q('.rc')!).boxShadow).toContain('24px');
    });

    it('el texto pequeño llega a 4,5:1 y las cifras a 3:1 sobre el fondo claro, incluida la esquina teñida de aguamarina', () => {
      render({ counts: COUNTS, periodLabel: 'Ene 2026 a Mar 2026' });
      const base = token('--c-sf');
      const corner = mix(token('--c-secondary'), base, 14);

      for (const background of [base, corner]) {
        for (const selector of ['h2', '.sub', '.metric dt', '.note', '.unit', '.help, .fuel']) {
          const node = q(selector);

          if (node) expect(contrast(getComputedStyle(node).color, background)).withContext(`${selector} sobre ${background}`).toBeGreaterThanOrEqual(4.5);
        }

        for (const selector of ['.metric .v', '[data-testid="result-value"]']) expect(contrast(getComputedStyle(q(selector)!).color, background)).withContext(selector).toBeGreaterThanOrEqual(3);
      }
    });

    it('el glifo de los chips (aguamarina oscuro) contrasta ≥ 3:1 sobre su fondo de aguamarina al 20 %, y el chip del periodo ≥ 4,5:1', () => {
      render({ counts: COUNTS, periodLabel: 'Ene 2026 a Mar 2026' });
      const chipBg = mix(token('--c-secondary'), token('--c-sf'), 20);
      const chip = q('.head .ico.chip')!;
      const period = q('.pchip')!;

      expect(contrast(getComputedStyle(chip).color, chipBg)).toBeGreaterThanOrEqual(3);
      expect(contrast(getComputedStyle(period).color, mix(token('--c-secondary'), token('--c-sf'), 14))).toBeGreaterThanOrEqual(4.5);
      expect(getComputedStyle(chip).width).toBe('40px');
    });

    it('las píldoras activas y las barras de progreso de la rotación son aguamarina', fakeAsync(() => {
      render({ byFuel: FUELS });
      const bar = getComputedStyle(q('.pill[aria-current="true"] i')!);

      expect(bar.backgroundColor).toBe(token('--c-secondary'));
      discardPeriodicTasks();
      fixture.destroy();
    }));

    it('el CSS usa solo tokens: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
      render({ counts: COUNTS });
      const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.halves')).join('\n');

      expect(css).toContain('var(--c-secondary)');
      expect(css).not.toMatch(/background: var\(--c-gray\)/);
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });

    it('el foco de los controles se ve con un contorno de 3 px', () => {
      render({ counts: COUNTS });
      const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.halves')).join('\n');

      expect(css).toContain(':focus-visible');
      expect(css).toContain('outline: 3px solid var(--c-focus)');
    });
  });
});
