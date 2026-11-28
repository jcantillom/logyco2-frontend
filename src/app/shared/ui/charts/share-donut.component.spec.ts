import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShareSlice, shareSlices } from './share-chart';
import { ShareDonutComponent } from './share-donut.component';

const SLICES: ShareSlice[] = shareSlices([
  { key: 'DIESEL_B2', label: 'Diésel B2', value: 43_432 },
  { key: 'GASOLINE_MOTOR', label: 'Gasolina motor', value: 4_972 },
  { key: 'NATURAL_GAS', label: 'Gas natural', value: 2_341 },
]);

describe('ShareDonutComponent', () => {
  let fixture: ComponentFixture<ShareDonutComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function render(slices: readonly ShareSlice[] = SLICES): void {
    TestBed.configureTestingModule({ imports: [ShareDonutComponent] });
    fixture = TestBed.createComponent(ShareDonutComponent);
    fixture.componentRef.setInput('slices', slices);
    fixture.detectChanges();
  }

  it('dibuja una porción por combustible y el total en el centro con su unidad', () => {
    render();

    expect(el().querySelectorAll('[data-testid="donut-slice"]').length).toBe(3);
    expect(el().querySelector('[data-testid="donut-total"]')!.textContent).toBe('50.745');
    expect(el().querySelector('.unit')!.textContent).toBe('kg CO₂');
  });

  it('la leyenda es una tabla de filas con punto de color, nombre, % con un decimal y kg', () => {
    render();
    const rows = Array.from(el().querySelectorAll('[data-testid="donut-row"]'));

    expect(rows.map((r) => r.querySelector('.name')!.textContent)).toEqual(['Diésel B2', 'Gasolina motor', 'Gas natural']);
    expect(rows.map((r) => r.querySelector('.pct')!.textContent)).toEqual(['85,6 %', '9,8 %', '4,6 %']);
    expect(rows.map((r) => r.querySelector('.kg')!.textContent)).toEqual(['43.432 kg', '4.972 kg', '2.341 kg']);
    expect(rows.every((r) => r.querySelector('i')!.getAttribute('aria-hidden') === 'true')).toBeTrue();
  });

  it('las participaciones de la leyenda suman exactamente 100,0 %', () => {
    render();
    const total = Array.from(el().querySelectorAll('.pct')).map((p) => Number(p.textContent!.replace(' %', '').replace(',', '.'))).reduce((a, b) => a + b, 0);

    expect(Math.round(total * 10) / 10).toBe(100);
  });

  it('es accesible: role="img" con el resumen y una tabla sr-only', () => {
    render();
    const svg = el().querySelector('svg')!;

    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('Diésel B2 85,6 %, 43.432 kg');
    expect(svg.getAttribute('aria-label')).toContain('Total 50.745 kg CO₂');
    const table = el().querySelector('table.sr-only')!;

    expect(table.querySelector('caption')!.textContent).toBe('Emisiones por tipo de combustible');
    expect(table.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('con «Otros» y 7 dígitos el total y la leyenda no desbordan', () => {
    render(shareSlices([1, 2, 3, 4, 5, 6].map((n) => ({ key: `F${n}`, label: `Combustible ${n}`, value: n * 1_000_000 }))));
    el().style.width = '330px';

    expect(el().querySelectorAll('[data-testid="donut-row"]').length).toBe(5);
    expect(el().querySelector('[data-testid="donut-total"]')!.textContent).toBe('21.000.000');
    expect(el().scrollWidth).toBeLessThanOrEqual(el().clientWidth + 1);
  });

  it('el total cabe dentro del hueco del anillo, también con 7 dígitos y separadores', () => {
    for (const value of [50_745, 1_234_567, 21_000_000]) {
      TestBed.resetTestingModule();
      render(shareSlices([{ key: 'A', label: 'A', value }]));
      const svg = el().querySelector('svg')!;
      const total = el().querySelector<SVGTextElement>('[data-testid="donut-total"]')!;
      const inner = (40 - 14 / 2) * 2; // diámetro interior del anillo, en unidades del viewBox

      expect(total.getBBox().width).toBeLessThanOrEqual(inner - 4);
      expect(svg.getBoundingClientRect().width).toBe(176);
    }
  });

  it('el diámetro es de ≈ 176 px', () => {
    render();

    expect(el().querySelector('svg')!.getBoundingClientRect().width).toBe(176);
  });

  it('usa solo tokens de marca: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
    render();
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('.slice')).join('\n');

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });
});
