import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { FootprintByFuel } from '../../domain/models/footprint';
import { ImportCounts } from '../../domain/models/imports';
import { ROTATION_MS } from '../../shared/ui/rotation';
import { buildFootprint, completeTotals, emptyTotals } from '../../../testing/footprint';
import { dataOriginShare, methodologyRef } from '../../../testing/methodology';
import { ResultCardComponent } from './result-card.component';

const FUELS: FootprintByFuel = [
  { fuelCode: 'GASOLINE_MOTOR', name: 'Gasolina motor', kgCo2: 4_972, consumption: [] },
  { fuelCode: 'NATURAL_GAS', name: 'Gas natural', kgCo2: 2_341, consumption: [] },
  { fuelCode: 'DIESEL_B2', name: 'Diésel B2', kgCo2: 43_432, consumption: [] },
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
    // `byFuel` es atajo de las pruebas: un resultado completo con esos combustibles.
    const { byFuel, ...rest } = inputs;

    if (byFuel) rest['footprint'] = buildFootprint({ byFuel: byFuel as FootprintByFuel, totals: completeTotals() });

    for (const [key, value] of Object.entries(rest)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  beforeEach(() => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList);
  });

  describe('estado pendiente (sin huella pedida)', () => {
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
    it('junto al nombre muestra la participación del combustible en el total y una barra fina de medido y estimado', fakeAsync(() => {
      render({ byFuel: FUELS, counts: COUNTS });

      expect(text('result-share')).toMatch(/^\d+,\d %$/);
      expect(q('[data-testid="result-split"] i.m')).not.toBeNull();
      expect(q('[data-testid="result-split"] i.e')).not.toBeNull();
      expect(q('[data-testid="result-split"]')!.getAttribute('aria-hidden')).toBe('true');
      discardPeriodicTasks();
    }));

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
      render({ byFuel: [{ fuelCode: 'X', name: 'Diésel B2', kgCo2: 3_400_000, consumption: [] }, FUELS[0]], counts: COUNTS });
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
  describe('datos reales de la huella', () => {
    const PARTIAL = buildFootprint({ byFuel: FUELS.map((f) => ({ ...f, consumption: f.fuelCode === 'NATURAL_GAS' ? [{ unit: 'm3', quantity: 560.4 }] : [{ unit: 'gal', quantity: 1_234.6 }] })) });

    it('muestra el consumo de cada combustible con su unidad (gal o m³) junto al nombre', fakeAsync(() => {
      render({ footprint: PARTIAL, counts: COUNTS });

      expect(text('result-fuel-name')).toBe('Gasolina motor · 1.235 gal');
      q<HTMLButtonElement>('[data-testid="result-segment-1"]')!.click();
      settle();
      expect(text('result-fuel-name')).toBe('Gas natural · 560 m³');
      discardPeriodicTasks();
      fixture.destroy();
    }));

    it('con consumo vacío muestra solo el nombre', () => {
      render({ byFuel: [FUELS[0]] });

      expect(text('result-fuel-name')).toBe('Gasolina motor');
      expect(q('[data-testid="result-consumption"]')).toBeNull();
    });

    it('diferencia medido y estimado con una línea corta y la explicación completa en title y texto accesible', fakeAsync(() => {
      render({ footprint: PARTIAL, counts: COUNTS });
      const note = q('[data-testid="result-measured"]')!;

      expect(note.firstChild!.textContent).toBe('Medido 2.499 kg · Estimado 3.089 kg');
      expect(note.getAttribute('title')).toBe('Consumo medido (el que reportaste): 2.499 kg CO₂ en 7 viajes. Consumo estimado (con distancia y rendimiento): 3.089 kg CO₂ en 5 viajes.');
      expect(text('result-measured-hint')).toContain('Consumo medido');
      discardPeriodicTasks();
      fixture.destroy();
    }));

    it('un resultado parcial lleva «Parcial» junto al periodo, con la aclaración de que el porcentaje es por viajes', fakeAsync(() => {
      render({ footprint: PARTIAL, counts: COUNTS, periodLabel: 'Oct 2026 a Nov 2026' });

      expect(text('result-partial')).toBe('Parcial');
      expect(q('[data-testid="result-partial"]')!.getAttribute('title')).toContain('por cantidad de viajes y no necesariamente representa el porcentaje de emisiones cubiertas');
      expect(text('result-partial-hint')).toContain('12 de 18 viajes calculados');
      discardPeriodicTasks();
      fixture.destroy();
    }));

    it('con viajes retenidos la frase va solo en el texto accesible (sin marcador nuevo) y la tarjeta sigue ≤ 215 px', fakeAsync(() => {
      render({ footprint: buildFootprint({ totals: completeTotals({ tripsPossibleDuplicate: 12 }) }), counts: COUNTS });
      el().style.width = '900px';

      expect(text('result-partial-hint')).toBe('12 operaciones por revisar (posibles duplicados) no están sumadas.');
      expect(q('[data-testid="result-partial"]')).toBeNull();
      expect(q('[data-testid="result-partial-hint"]')!.classList).toContain('sr-only');
      expect(q('[data-testid="period-result"]')!.getBoundingClientRect().height).toBeLessThanOrEqual(215);
      discardPeriodicTasks();
      fixture.destroy();
    }));

    it('un resultado completo no lleva «Parcial»', () => {
      render({ byFuel: FUELS.slice(0, 1) });

      expect(q('[data-testid="result-partial"]')).toBeNull();
    });

    it('con huella pero sin viajes calculados es el estado vacío: explica por qué, sin kg ni línea de medido', () => {
      render({ footprint: buildFootprint({ totals: emptyTotals({ tripsPending: 2, tripsBlocked: 1 }), byFuel: [], byMonth: [] }), counts: COUNTS });

      expect(text('result-pending')).toBe('Aún no hay emisiones calculadas: faltan datos en 3 viajes');
      expect(text('result-value')).toBe('—');
      expect(q('[data-testid="result-measured"]')).toBeNull();
      expect(q('[data-testid="result-partial"]')).toBeNull();
    });

    it('mientras carga la huella la mitad izquierda es un esqueleto y la derecha sigue con sus datos', () => {
      render({ footprintStatus: 'loading', counts: COUNTS });

      expect(q('[data-testid="result-fuel"] .skeleton')).not.toBeNull();
      expect(text('result-distance-value')).toBe('1.234.567');
    });

    it('si falla la huella la mitad izquierda ofrece «Reintentar» y la derecha no se afecta', () => {
      render({ footprintStatus: 'error', counts: COUNTS });
      let retried = false;
      fixture.componentInstance.retryFootprint.subscribe(() => (retried = true));
      q<HTMLButtonElement>('[data-testid="result-fuel-error"] button')!.click();

      expect(retried).toBeTrue();
      expect(text('result-distance-value')).toBe('1.234.567');
    });

    it('con 3 combustibles, parcial y la línea de medido sigue midiendo ≤ 215 px', fakeAsync(() => {
      render({ footprint: PARTIAL, counts: COUNTS, periodLabel: 'Ene 2026 a Mar 2026' });
      el().style.width = '540px';

      expect(q('.rc')!.getBoundingClientRect().height).toBeLessThanOrEqual(215);
      discardPeriodicTasks();
      fixture.destroy();
    }));

    it('la rotación de 3 s sigue funcionando con los datos reales', fakeAsync(() => {
      render({ footprint: PARTIAL, counts: COUNTS });
      expect(text('result-fuel-name')).toContain('Gasolina motor');

      tick(ROTATION_MS);
      settle();
      expect(text('result-fuel-name')).toContain('Gas natural');
      discardPeriodicTasks();
      fixture.destroy();
    }));
  });
  describe('entrada a «Metodología y calidad del dato»', () => {
    const withMethodology = (): Record<string, unknown> => ({ footprint: buildFootprint({ totals: completeTotals(), methodology: methodologyRef(), dataOriginShare: dataOriginShare() }), counts: COUNTS });

    it('con la huella lista y los bloques del servidor ofrece un único botón con la versión, el alcance y la unidad en su tooltip', () => {
      render(withMethodology());
      const button = q<HTMLButtonElement>('[data-testid="result-methodology"]');

      expect(button?.textContent?.trim()).toBe('Metodología');
      expect(button?.getAttribute('aria-label')).toBe('Metodología y calidad del dato');
      expect(button?.getAttribute('title')).toBe('Metodología 1.0.0 · Emisiones directas por combustión (TTW), solo CO₂ · kg de CO₂ (no CO₂e)');
      expect(el().querySelectorAll('[data-testid="result-methodology"]').length).toBe(1);
    });

    it('al pulsarlo emite `methodology`', () => {
      render(withMethodology());
      let emitted = 0;

      fixture.componentInstance.methodology.subscribe(() => emitted++);
      q<HTMLButtonElement>('[data-testid="result-methodology"]')!.click();

      expect(emitted).toBe(1);
    });

    it('sin los bloques (servidor antiguo), con error o sin huella no hay botón', () => {
      render({ byFuel: FUELS, counts: COUNTS });
      expect(q('[data-testid="result-methodology"]')).toBeNull();
      fixture.componentRef.setInput('footprint', buildFootprint({ totals: completeTotals(), methodology: methodologyRef() }));
      fixture.componentRef.setInput('footprintStatus', 'error');
      settle();
      expect(q('[data-testid="result-methodology"]')).toBeNull();
      fixture.componentRef.setInput('footprint', null);
      fixture.componentRef.setInput('footprintStatus', 'ready');
      settle();
      expect(q('[data-testid="result-methodology"]')).toBeNull();
    });

    it('el encabezado y su subtítulo no se envuelven (el botón no suma altura)', () => {
      render(withMethodology());
      const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.mlink')).join('\n');

      expect(css).toMatch(/\.sub \{[^}]*flex-wrap: nowrap[^}]*white-space: nowrap/);
      expect(css).toMatch(/\.ht \{[^}]*overflow: hidden/);
    });
  });
});
