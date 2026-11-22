import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FootprintPeriod, FootprintSummary } from '../../domain/models/footprint';
import { FootprintCardComponent } from './footprint-card.component';

const month = (m: number, kg: number): FootprintPeriod => {
  const pad = (n: number): string => String(n).padStart(2, '0');

  return { start: `2026-${pad(m)}-01`, end: `2026-${pad(m)}-${pad(new Date(Date.UTC(2026, m, 0)).getUTCDate())}`, kgCo2e: kg };
};

describe('FootprintCardComponent', () => {
  let fixture: ComponentFixture<FootprintCardComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (id: string): string => (el().querySelector(`[data-testid="${id}"]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(inputs: { summary?: FootprintSummary | null; link?: string | null; status?: string; size?: 'md' | 'sm' } = {}): void {
    TestBed.configureTestingModule({ imports: [FootprintCardComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(FootprintCardComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  describe('estado pendiente (hoy no hay cálculo)', () => {
    it('muestra «—», «Se activa al calcular tu huella» y ni periodo, ni variación, ni unidad', () => {
      render();

      expect(el().querySelector('.label')!.textContent).toBe('Huella de carbono');
      expect(text('kpi-value')).toBe('—');
      expect(text('footprint-foot')).toBe('Se activa al calcular tu huella');
      for (const gone of ['footprint-period', 'footprint-variation', 'footprint-note', 'footprint-unit']) expect(el().querySelector(`[data-testid="${gone}"]`)).withContext(gone).toBeNull();
      expect(el().textContent).not.toMatch(/vs\. periodo anterior|kg CO/);
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
    const down: FootprintSummary = { periods: [month(7, 57_850), month(8, 50_745), month(9, 9_000)] };

    it('muestra la cifra grande con su unidad, el periodo, la variación a la baja en aguamarina y el pie', () => {
      render({ summary: down });

      expect(text('kpi-value')).toBe('50.745');
      expect(text('footprint-unit')).toBe('kg CO₂e');
      expect(text('footprint-period')).toBe('Ago 2026');
      expect(text('footprint-variation')).toBe('▼−12,3 %');
      expect(el().querySelector('[data-testid="footprint-variation"]')!.getAttribute('data-direction')).toBe('down');
      expect(text('footprint-delta')).toContain('vs. periodo anterior');
      expect(text('footprint-foot')).toBe('Calculada en el periodo anterior');
    });

    it('si suben las emisiones la insignia es de aviso (naranja) con flecha hacia arriba', () => {
      render({ summary: { periods: [month(7, 10_000), month(8, 10_850), month(9, 1)] } });

      expect(text('footprint-variation')).toBe('▲+8,5 %');
      expect(el().querySelector('[data-testid="footprint-variation"]')!.classList).toContain('up');
    });

    it('sin cambio es neutra', () => {
      render({ summary: { periods: [month(7, 100), month(8, 100), month(9, 1)] } });

      expect(text('footprint-variation')).toBe('■0,0 %');
      expect(el().querySelector('[data-testid="footprint-variation"]')!.classList).toContain('flat');
    });

    it('sin periodo anterior muestra el actual, «Primer periodo calculado» y no hay insignia', () => {
      render({ summary: { periods: [month(9, 7_300)] } });

      expect(text('kpi-value')).toBe('7.300');
      expect(text('footprint-period')).toBe('Sep 2026');
      expect(text('footprint-note')).toBe('Primer periodo calculado');
      expect(text('footprint-foot')).toBe('Calculada en el periodo actual');
      expect(el().querySelector('[data-testid="footprint-variation"]')).toBeNull();
    });

    it('el nombre accesible incluye cifra, periodo y variación', () => {
      render({ summary: down, link: '/cargas' });

      expect(el().querySelector('a')!.getAttribute('aria-label')).toBe('Huella de carbono: 50.745 kg CO₂e, Ago 2026, bajó −12,3 % frente al periodo anterior');
      expect(el().querySelector('.ico')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('una cifra de 7 dígitos con unidad no desborda la tarjeta', () => {
      render({ summary: { periods: [month(7, 3_000_000), month(8, 3_400_000), month(9, 1)] } });
      const host = el();
      host.style.width = '210px';

      expect(text('kpi-value')).toBe('3.400.000');
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    });
  });

  describe('versión compacta (size sm)', () => {
    const data: FootprintSummary = { periods: [month(7, 3_000_000), month(8, 3_400_000), month(9, 1)] };

    it('por defecto es el tamaño normal; con sm añade la clase compacta', () => {
      render({ summary: data });
      expect(el().querySelector('.fp')!.classList).not.toContain('sm');

      fixture.componentRef.setInput('size', 'sm');
      fixture.detectChanges();
      expect(el().querySelector('.fp')!.classList).toContain('sm');
    });

    it('con una cifra habitual mide ≈ 80 px, con el ícono a la izquierda', () => {
      render({ summary: { periods: [month(7, 60_000), month(8, 50_745), month(9, 1)] }, size: 'sm' });
      el().style.width = '230px';
      const card = el().querySelector<HTMLElement>('.fp')!;

      expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(92);
      expect(getComputedStyle(card.querySelector('.ico')!).width).toBe('40px');
      expect(getComputedStyle(card.querySelector('.value')!).fontSize).toBe('24px');
      expect(getComputedStyle(card).paddingTop).toBe('10px');
      expect(getComputedStyle(card).paddingLeft).toBe('14px');
    });

    it('con 7 dígitos y unidad no desborda (la unidad baja de línea si hace falta)', () => {
      render({ summary: data, size: 'sm' });
      el().style.width = '230px';
      const card = el().querySelector<HTMLElement>('.fp')!;

      expect(text('kpi-value')).toBe('3.400.000');
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
      expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(112);
    });

    it('el chip del ícono compacto es el mismo de las demás tarjetas (40 px, radio 12, aro fino, glifo de 20 px)', () => {
      render({ summary: data, size: 'sm' });
      const chip = el().querySelector<HTMLElement>('.ico')!;
      const style = getComputedStyle(chip);

      expect(chip.classList).toContain('chip');
      expect([style.width, style.height, style.borderRadius]).toEqual(['40px', '40px', '12px']);
      expect(style.boxShadow).toContain('inset');
      expect(getComputedStyle(chip.querySelector('svg')!).width).toBe('20px');
      expect(getComputedStyle(chip.querySelector('svg')!).strokeWidth).toBe('1.6px');
    });

    it('con datos el pie va como title de la línea de variación (una sola línea); sin dato sigue el pie «Se activa al calcular tu huella»', () => {
      render({ summary: data, size: 'sm' });

      expect(el().querySelector('[data-testid="footprint-foot"]')).toBeNull();
      expect(el().querySelector('[data-testid="footprint-delta"]')!.getAttribute('title')).toBe('Calculada en el periodo anterior');

      TestBed.resetTestingModule();
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
    render({ summary: { periods: [month(8, 1)] } });
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.badge-v')).join('\n');

    expect(css).toContain('.badge-v');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });
});
