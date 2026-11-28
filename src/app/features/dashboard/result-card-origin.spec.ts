import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FootprintByOrigin } from '../../domain/models/footprint';
import { toFootprint } from '../../infrastructure/mappers/footprint.mappers';
import { buildFootprint, completeTotals } from '../../../testing/footprint';
import { ResultCardComponent } from './result-card.component';

const BY_ORIGIN: FootprintByOrigin = {
  realConsumption: { kgCo2: 2_499.2521, trips: 7 },
  declaredEfficiency: { kgCo2: 2_689.1495, trips: 3 },
  referenceEstimated: { kgCo2: 400, trips: 2 },
  referenceLabel: 'Estimado (referencia Steer/ANDI)',
};

describe('ResultCardComponent · reparto por origen (referencia técnica)', () => {
  let fixture: ComponentFixture<ResultCardComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = (id: string): HTMLElement | null => el().querySelector<HTMLElement>(`[data-testid="${id}"]`);

  beforeEach(() => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList);
  });

  function render(byOrigin: FootprintByOrigin | null | undefined): void {
    TestBed.configureTestingModule({ imports: [ResultCardComponent] });
    fixture = TestBed.createComponent(ResultCardComponent);
    fixture.componentRef.setInput('footprint', buildFootprint({ totals: completeTotals({ byOrigin }) }));
    fixture.detectChanges();
  }

  it('con viajes de referencia: la línea, el title y el texto accesible usan el rótulo del servidor, con sus cifras', () => {
    render(BY_ORIGIN);
    const note = q('result-measured')!;

    expect(note.firstChild!.textContent).toBe('Medido 2.499 kg · Estimado 3.089 kg · Estimado (referencia Steer/ANDI) 400 kg');
    expect(note.getAttribute('title')).toContain('De lo estimado, 400 kg CO₂ en 2 viajes usan una referencia teórica (Estimado (referencia Steer/ANDI))');
    expect(q('result-measured-hint')!.textContent).toContain('referencia teórica (Estimado (referencia Steer/ANDI))');
  });

  it('el nombre de la fuente lo pone siempre el servidor: otra fuente, otro texto; sin rótulo, uno genérico sin nombre de fuente', () => {
    render({ ...BY_ORIGIN, referenceLabel: 'Estimado (referencia UPME)' });
    expect(q('result-measured')!.firstChild!.textContent).toBe('Medido 2.499 kg · Estimado 3.089 kg · Estimado (referencia UPME) 400 kg');

    TestBed.resetTestingModule();
    render({ ...BY_ORIGIN, referenceLabel: null });
    expect(q('result-measured')!.firstChild!.textContent).toBe('Medido 2.499 kg · Estimado 3.089 kg · Estimado (referencia técnica) 400 kg');
    expect(q('result-measured')!.getAttribute('title')).not.toMatch(/UPME|Steer/);
  });

  it('la barra gana un tercer segmento de referencia sin tocar el alto, con medido y declarado de by_origin', () => {
    render(BY_ORIGIN);
    const bar = q('result-split')!;
    const grows = Array.from(bar.querySelectorAll<HTMLElement>('i')).map((i) => i.style.flexGrow);

    expect(grows.map(parseFloat)).toEqual([2499.25, 2689.15, 400]);
    expect(q('result-split-reference')).not.toBeNull();
    expect(bar.getAttribute('aria-hidden')).toBe('true');
  });

  it('sin viajes de referencia, o sin by_origin (servidor anterior), todo queda exactamente como antes', () => {
    for (const origin of [{ ...BY_ORIGIN, referenceEstimated: { kgCo2: 0, trips: 0 } }, null, undefined]) {
      TestBed.resetTestingModule();
      render(origin);

      expect(q('result-measured')!.firstChild!.textContent).toBe('Medido 2.499 kg · Estimado 3.089 kg');
      expect(q('result-measured')!.getAttribute('title')).not.toContain('UPME');
      expect(q('result-split-reference')).toBeNull();
      expect(el().querySelectorAll('[data-testid="result-split"] i').length).toBe(2);
    }
  });

  it('el mapper lee totals.by_origin tal cual (los tres suman el total del servidor, sin cuentas en el cliente)', () => {
    const footprint = toFootprint({
      period: { from: null, to: null },
      totals: {
        kg_co2: 5_588.4016, trips_calculated: 12, trips_pending: 0, trips_blocked: 0, trips_duplicate: 0, coverage_trips_pct: 100, partial: false,
        measured_kg_co2: 2_499.2521, estimated_kg_co2: 3_089.1495, measured_trips: 7, estimated_trips: 5,
        by_origin: { real_consumption: { kg_co2: 2_499.2521, trips: 7 }, declared_efficiency: { kg_co2: 2_689.1495, trips: 3 }, reference_estimated: { kg_co2: 400, trips: 2 }, reference_label: 'Estimado (referencia Steer/ANDI)' },
      },
      by_month: [], by_fuel: [], periods: [],
    });
    const o = footprint.totals.byOrigin!;

    expect(o).toEqual(BY_ORIGIN);
    expect(o.realConsumption.kgCo2 + o.declaredEfficiency.kgCo2 + o.referenceEstimated.kgCo2).toBeCloseTo(footprint.totals.kgCo2, 3);
    const legacy = toFootprint({
      period: { from: null, to: null },
      totals: { kg_co2: 1, trips_calculated: 1, trips_pending: 0, trips_blocked: 0, trips_duplicate: 0, coverage_trips_pct: 100, partial: false, measured_kg_co2: 1, estimated_kg_co2: 0, measured_trips: 1, estimated_trips: 0 },
      by_month: [], by_fuel: [], periods: [],
    });

    expect(legacy.totals.byOrigin).toBeNull();
  });

  it('solo tokens: la barra usa un token de la plataforma, sin colores literales', () => {
    render(BY_ORIGIN);
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.split i.r')).join('\n');

    expect(css).toContain('.split i.r { background: var(--c-dot-warning); }');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
  });
});
