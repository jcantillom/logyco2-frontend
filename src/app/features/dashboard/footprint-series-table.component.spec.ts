import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildBucket } from '../../../testing/footprint';
import { FootprintBucket } from '../../domain/models/footprint';
import { FootprintSeriesTableComponent, SERIES_PAGE_SIZE } from './footprint-series-table.component';

const many = (n: number): FootprintBucket[] => Array.from({ length: n }, (_, i) => buildBucket({ key: `k${i}`, label: `Sem ${i + 1}`, kgCo2: i * 10, tCo2: i / 100, trips: i, partial: i === 0 }));

describe('FootprintSeriesTableComponent', () => {
  let fixture: ComponentFixture<FootprintSeriesTableComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const qa = (s: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(s));
  const q = (s: string): HTMLElement | null => el().querySelector<HTMLElement>(s);
  const text = (s: string): string => (q(s)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(series: readonly FootprintBucket[], total = 5588.4016): void {
    TestBed.configureTestingModule({ imports: [FootprintSeriesTableComponent] });
    fixture = TestBed.createComponent(FootprintSeriesTableComponent);
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('totalKg', total);
    fixture.detectChanges();
  }

  it('es una tabla accesible con título, cabeceras de columna y de fila: periodo, viajes, kg CO₂ y t CO₂', () => {
    render(many(3));

    expect(q('table caption')).not.toBeNull();
    expect(qa('thead th').map((h) => h.textContent)).toEqual(['Periodo', 'Viajes', 'kg CO₂', 't CO₂']);
    expect(qa('thead th').every((h) => h.getAttribute('scope') === 'col')).toBeTrue();
    expect(qa('tbody th').every((h) => h.getAttribute('scope') === 'row')).toBeTrue();
    expect(qa('[data-testid="series-row"]').length).toBe(3);
  });

  it('pagina de a 6 filas con «1–6 de 14» y no hay scroll interno', () => {
    render(many(14));

    expect(SERIES_PAGE_SIZE).toBe(6);
    expect(qa('[data-testid="series-row"]').length).toBe(6);
    expect(text('[data-testid="series-range"]')).toBe('1–6 de 14');
    expect((q('[data-testid="series-prev"]') as HTMLButtonElement).disabled).toBeTrue();
    q('[data-testid="series-next"]')!.click();
    fixture.detectChanges();
    expect(text('[data-testid="series-range"]')).toBe('7–12 de 14');
    q('[data-testid="series-next"]')!.click();
    fixture.detectChanges();
    expect(qa('[data-testid="series-row"]').length).toBe(2);
    expect(text('[data-testid="series-range"]')).toBe('13–14 de 14');
    expect((q('[data-testid="series-next"]') as HTMLButtonElement).disabled).toBeTrue();
    expect(getComputedStyle(q('table')!).overflow).not.toBe('auto');
    expect(getComputedStyle(el()).overflowY).toBe('visible');
  });

  it('con 6 filas o menos no hay paginador', () => {
    render(many(6));

    expect(q('[data-testid="series-next"]')).toBeNull();
  });

  it('el total es series_total_kg del servidor tal cual (no la suma de las cubetas en coma flotante)', () => {
    render([buildBucket({ kgCo2: 0.1 }), buildBucket({ kgCo2: 0.2 })], 0.30000001);

    expect(text('[data-testid="series-total"]')).toBe('Total 0,3 kg CO₂');
  });

  it('marca las cubetas parciales con «Parcial» y la aclaración (title y texto para lectores de pantalla)', () => {
    render(many(2));
    const badge = q('[data-testid="series-partial"]')!;

    expect(badge.textContent).toBe('Parcial');
    expect(badge.getAttribute('title')).toBe('Periodo parcial: incluye solo los días dentro del rango elegido');
    expect(qa('tbody tr')[0].querySelector('.sr-only')!.textContent).toContain('Periodo parcial');
    expect(qa('tbody tr')[1].querySelector('[data-testid="series-partial"]')).toBeNull();
  });

  it('una serie nueva vuelve a la primera página', () => {
    render(many(14));
    q('[data-testid="series-next"]')!.click();
    fixture.detectChanges();
    fixture.componentRef.setInput('series', many(14).map((b) => ({ ...b, key: `n${b.key}` })));
    fixture.detectChanges();

    expect(text('[data-testid="series-range"]')).toBe('1–6 de 14');
  });

  it('las filas miden 20 px: la tabla de 6 filas con su pie cabe en ≈ 170 px', () => {
    render(many(14));
    el().style.width = '460px';

    expect(Math.round(qa('[data-testid="series-row"]')[0].getBoundingClientRect().height)).toBe(20);
    expect(el().getBoundingClientRect().height).toBeLessThanOrEqual(190);
  });
});
