import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Footprint } from '../../domain/models/footprint';
import { buildFootprint, completeTotals, emptyTotals, footprintTotals } from '../../../testing/footprint';
import { FootprintCardComponent } from './footprint-card.component';

const WITH_VARIATION = buildFootprint({
  periods: [
    { start: '2026-08-01', end: '2026-09-30', kgCo2: 4_000 },
    { start: '2026-10-01', end: '2026-11-30', kgCo2: 5_588.4016 },
  ],
});
const COMPLETE = buildFootprint({ totals: completeTotals(), periods: WITH_VARIATION.periods });

describe('FootprintCardComponent: posibles duplicados', () => {
  it('la frase queda en el título y en el nombre accesible, sin agregar elementos visibles ni cambiar la altura', () => {
    const fixture = (() => {
      TestBed.configureTestingModule({ imports: [FootprintCardComponent], providers: [provideRouter([])] });
      const f = TestBed.createComponent(FootprintCardComponent);

      f.componentRef.setInput('size', 'sm');
      f.componentRef.setInput('footprint', buildFootprint({ totals: completeTotals({ tripsPossibleDuplicate: 12 }) }));
      f.detectChanges();

      return f;
    })();
    const host = fixture.nativeElement as HTMLElement;
    const card = host.querySelector<HTMLElement>('.fp')!;

    expect(host.querySelector('[data-testid="footprint-delta"]')!.getAttribute('title')).toBe('12 operaciones por revisar (posibles duplicados) no están sumadas.');
    expect(card.getAttribute('aria-label')).toContain('12 operaciones por revisar (posibles duplicados) no están sumadas');
    expect(host.querySelector('[data-testid="footprint-partial"]')).toBeNull();
    expect(host.textContent).not.toContain('duplicados');
    expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(92);
  });
});

describe('FootprintCardComponent', () => {
  let fixture: ComponentFixture<FootprintCardComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (id: string): string => (el().querySelector(`[data-testid="${id}"]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(inputs: { footprint?: Footprint | null; link?: string | null; status?: string; size?: 'md' | 'sm' } = {}): void {
    TestBed.configureTestingModule({ imports: [FootprintCardComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(FootprintCardComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  describe('sin emisiones calculadas', () => {
    it('sin huella pedida muestra «—», «Se activa al calcular tu huella» y ni periodo, ni variación, ni unidad', () => {
      render();

      expect(el().querySelector('.label')!.textContent).toBe('Huella de carbono');
      expect(text('kpi-value')).toBe('—');
      expect(text('footprint-foot')).toBe('Se activa al calcular tu huella');
      for (const gone of ['footprint-period', 'footprint-variation', 'footprint-note', 'footprint-unit', 'footprint-partial']) expect(el().querySelector(`[data-testid="${gone}"]`)).withContext(gone).toBeNull();
      expect(el().textContent).not.toMatch(/vs\. periodo anterior|kg CO/);
    });

    it('con huella pero ningún viaje calculado no muestra ceros como resultado: explica por qué faltan datos', () => {
      render({ footprint: buildFootprint({ totals: emptyTotals({ tripsPending: 3, tripsBlocked: 0 }), byMonth: [], byFuel: [] }) });

      expect(text('kpi-value')).toBe('—');
      expect(text('footprint-foot')).toBe('Aún no hay emisiones calculadas: faltan datos en 3 viajes');
      expect(el().textContent).not.toContain('kg CO');
    });

    it('con enlace es un enlace a /cargas y su nombre accesible dice que está sin calcular; sin enlace es un grupo', () => {
      render({ link: '/cargas' });
      const link = el().querySelector('a')!;

      expect(link.getAttribute('href')).toBe('/cargas');
      expect(link.getAttribute('aria-label')).toBe('Huella de carbono: sin calcular. Se activa al calcular tu huella');

      TestBed.resetTestingModule();
      render();
      expect(el().querySelector('a')).toBeNull();
      expect(el().querySelector('[role="group"]')!.getAttribute('aria-label')).toContain('sin calcular');
    });
  });

  describe('con datos', () => {
    it('muestra la cifra del periodo con su unidad kg CO₂, el periodo y la variación al alza en naranja', () => {
      render({ footprint: COMPLETE });

      expect(text('kpi-value')).toBe('5.588');
      expect(text('footprint-unit')).toBe('kg CO₂');
      expect(text('footprint-period')).toBe('Oct 2026 a Nov 2026');
      expect(text('footprint-variation')).toBe('▲+39,7 %');
      expect(el().querySelector('[data-testid="footprint-variation"]')!.classList).toContain('up');
      expect(text('footprint-delta')).toContain('vs. periodo anterior');
      expect(el().querySelector('[data-testid="footprint-partial"]')).toBeNull();
    });

    it('si bajan las emisiones la insignia es aguamarina y sin cambio es neutra', () => {
      render({ footprint: buildFootprint({ totals: completeTotals({ kgCo2: 3_000 }), periods: WITH_VARIATION.periods }) });
      expect(el().querySelector('[data-testid="footprint-variation"]')!.getAttribute('data-direction')).toBe('down');

      TestBed.resetTestingModule();
      render({ footprint: buildFootprint({ totals: completeTotals({ kgCo2: 4_000 }), periods: WITH_VARIATION.periods }) });
      expect(text('footprint-variation')).toBe('■0,0 %');
    });

    it('variación no disponible: dice «Sin base de comparación» y no hay insignia', () => {
      render({ footprint: buildFootprint({ totals: completeTotals(), periods: [] }) });

      expect(text('footprint-note')).toBe('Sin base de comparación');
      expect(el().querySelector('[data-testid="footprint-variation"]')).toBeNull();
    });

    it('sin fechas de periodo (todos los periodos) no hay chip de periodo', () => {
      render({ footprint: buildFootprint({ period: { from: null, to: null }, totals: completeTotals() }) });

      expect(el().querySelector('[data-testid="footprint-period"]')).toBeNull();
    });

    it('el nombre accesible incluye cifra, periodo y variación', () => {
      render({ footprint: COMPLETE, link: '/cargas' });

      expect(el().querySelector('a')!.getAttribute('aria-label')).toBe('Huella de carbono: 5.588 kg CO₂, Oct 2026 a Nov 2026, subió +39,7 % frente al periodo anterior');
      expect(el().querySelector('.ico')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('una cifra de 7 dígitos con unidad no desborda la tarjeta', () => {
      render({ footprint: buildFootprint({ totals: completeTotals({ kgCo2: 3_400_000 }) }) });
      const host = el();
      host.style.width = '210px';

      expect(text('kpi-value')).toBe('3.400.000');
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    });
  });

  describe('resultado parcial', () => {
    it('lleva el marcador «Parcial» y «12 de 18 viajes calculados» (por viajes, no por emisiones)', () => {
      render({ footprint: WITH_VARIATION, size: 'sm' });

      expect(text('footprint-partial')).toBe('Parcial');
      expect(text('footprint-coverage')).toBe('12 de 18 viajes');
      expect(el().querySelector('[data-testid="footprint-delta"]')!.getAttribute('title')).toContain('12 de 18 viajes calculados');
      expect(text('footprint-variation')).toContain('+39,7 %');
    });

    it('el title y el nombre accesible aclaran que el porcentaje es por cantidad de viajes y no necesariamente de emisiones', () => {
      render({ footprint: WITH_VARIATION, link: '/cargas' });
      const hint = 'Resultado parcial: 12 de 18 viajes calculados (66,7 % de los viajes). El porcentaje es por cantidad de viajes y no necesariamente representa el porcentaje de emisiones cubiertas.';

      expect(el().querySelector('[data-testid="footprint-delta"]')!.getAttribute('title')).toBe(hint);
      expect(el().querySelector('a')!.getAttribute('aria-label')).toContain(hint);
    });

    it('sin variación disponible igual muestra la cobertura en lugar de la nota', () => {
      render({ footprint: buildFootprint({ periods: [] }) });

      expect(text('footprint-coverage')).toBe('12 de 18 viajes calculados');
      expect(el().querySelector('[data-testid="footprint-note"]')).toBeNull();
    });
  });

  describe('versión compacta (size sm)', () => {
    const data = buildFootprint({ totals: completeTotals({ kgCo2: 3_400_000 }) });

    it('por defecto es el tamaño normal; con sm añade la clase compacta', () => {
      render({ footprint: data });
      expect(el().querySelector('.fp')!.classList).not.toContain('sm');

      fixture.componentRef.setInput('size', 'sm');
      fixture.detectChanges();
      expect(el().querySelector('.fp')!.classList).toContain('sm');
    });

    it('el título «Huella de carbono» se ve completo (sin chip de periodo que lo recorte); el periodo queda en su title y en el nombre accesible', () => {
      render({ footprint: WITH_VARIATION, size: 'sm', link: '/cargas' });
      el().style.width = '230px';
      const label = el().querySelector<HTMLElement>('.label')!;

      expect(el().querySelector('[data-testid="footprint-period"]')).toBeNull();
      expect(label.textContent).toBe('Huella de carbono');
      expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
      expect(label.getAttribute('title')).toBe('Oct 2026 a Nov 2026');
      expect(el().querySelector('a')!.getAttribute('aria-label')).toContain('Oct 2026 a Nov 2026');
    });

    it('con una cifra habitual mide ≈ 80 px, con el ícono a la izquierda', () => {
      render({ footprint: COMPLETE, size: 'sm' });
      el().style.width = '230px';
      const card = el().querySelector<HTMLElement>('.fp')!;

      expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(92);
      expect(getComputedStyle(card.querySelector('.ico')!).width).toBe('40px');
      expect(getComputedStyle(card.querySelector('.value')!).fontSize).toBe('24px');
      expect(getComputedStyle(card).paddingTop).toBe('10px');
      expect(getComputedStyle(card).paddingLeft).toBe('14px');
    });

    it('un resultado parcial con variación y cobertura sigue midiendo ≤ 92 px', () => {
      render({ footprint: buildFootprint({ totals: footprintTotals({ kgCo2: 50_745 }), periods: WITH_VARIATION.periods }), size: 'sm' });
      el().style.width = '250px';

      expect(el().querySelector<HTMLElement>('.fp')!.getBoundingClientRect().height).toBeLessThanOrEqual(92);
    });

    it('con 7 dígitos y unidad no desborda (la unidad baja de línea si hace falta)', () => {
      render({ footprint: data, size: 'sm' });
      el().style.width = '230px';
      const card = el().querySelector<HTMLElement>('.fp')!;

      expect(text('kpi-value')).toBe('3.400.000');
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
      expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(112);
    });

    it('el chip del ícono compacto es el mismo de las demás tarjetas (40 px, radio 12, aro fino, glifo de 20 px)', () => {
      render({ footprint: data, size: 'sm' });
      const chip = el().querySelector<HTMLElement>('.ico')!;
      const style = getComputedStyle(chip);

      expect(chip.classList).toContain('chip');
      expect([style.width, style.height, style.borderRadius]).toEqual(['40px', '40px', '12px']);
      expect(style.boxShadow).toContain('inset');
      expect(getComputedStyle(chip.querySelector('svg')!).width).toBe('20px');
      expect(getComputedStyle(chip.querySelector('svg')!).strokeWidth).toBe('1.6px');
    });

    it('sin dato sigue el pie «Se activa al calcular tu huella» y mide ≤ 92 px', () => {
      render({ size: 'sm' });

      expect(text('footprint-foot')).toBe('Se activa al calcular tu huella');
      expect(el().querySelector('.fp')!.getBoundingClientRect().height).toBeLessThanOrEqual(92);
    });
  });

  it('muestra un esqueleto al cargar y un error con «Reintentar»', () => {
    render({ status: 'loading' });
    expect(el().querySelector('.skeleton')).not.toBeNull();

    TestBed.resetTestingModule();
    render({ status: 'error' });
    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));
    el().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();

    expect(retried).toBeTrue();
  });

  it('el CSS usa solo tokens: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
    render({ footprint: COMPLETE });
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.badge-v')).join('\n');

    expect(css).toContain('.badge-v');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });
});
