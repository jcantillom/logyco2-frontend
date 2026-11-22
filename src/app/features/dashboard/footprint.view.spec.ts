import { FootprintPeriod } from '../../domain/models/footprint';
import { footprintView, variationOf } from './footprint.view';

const month = (year: number, m: number, kg: number): FootprintPeriod => {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();

  return { start: `${year}-${pad(m)}-01`, end: `${year}-${pad(m)}-${last}`, kgCo2e: kg };
};

describe('footprintView (lógica pura de la tarjeta «Huella de carbono»)', () => {
  it('sin dato (null, vacío o solo periodos inválidos) no hay vista: estado pendiente', () => {
    expect(footprintView(null)).toBeNull();
    expect(footprintView({ periods: [] })).toBeNull();
    expect(footprintView({ periods: [month(2026, 10, -5), month(2026, 11, Number.NaN)] })).toBeNull();
  });

  it('muestra el periodo anterior al actual (el último cerrado) con su variación contra el que lo precede', () => {
    const view = footprintView({ periods: [month(2026, 8, 60_000), month(2026, 9, 50_745), month(2026, 10, 12_000)] })!;

    expect(view.periodLabel).toBe('Sep 2026');
    expect(view.value).toBe('50.745');
    expect(view.unit).toBe('kg CO₂e');
    expect(view.isPrevious).toBeTrue();
    expect(view.variation).toEqual({ text: '−15,4 %', direction: 'down' });
    expect(view.note).toBeNull();
  });

  it('subir las emisiones es una variación positiva con signo explícito', () => {
    const view = footprintView({ periods: [month(2026, 8, 10_000), month(2026, 9, 10_850), month(2026, 10, 1)] })!;

    expect(view.variation).toEqual({ text: '+8,5 %', direction: 'up' });
  });

  it('sin periodo anterior al actual se muestra el actual y dice «Primer periodo calculado», sin variación', () => {
    const view = footprintView({ periods: [month(2026, 10, 7_300)] })!;

    expect(view.periodLabel).toBe('Oct 2026');
    expect(view.value).toBe('7.300');
    expect(view.isPrevious).toBeFalse();
    expect(view.variation).toBeNull();
    expect(view.note).toBe('Primer periodo calculado');
  });

  it('con dos periodos se muestra el primero (el cerrado) y no hay con qué compararlo', () => {
    const view = footprintView({ periods: [month(2026, 9, 5_000), month(2026, 10, 9_000)] })!;

    expect(view.periodLabel).toBe('Sep 2026');
    expect(view.isPrevious).toBeTrue();
    expect(view.note).toBe('Primer periodo calculado');
    expect(view.variation).toBeNull();
  });

  it('si la base vale 0 no hay variación ni «∞»: «Sin base de comparación»', () => {
    const view = footprintView({ periods: [month(2026, 8, 0), month(2026, 9, 4_000), month(2026, 10, 1)] })!;

    expect(view.variation).toBeNull();
    expect(view.note).toBe('Sin base de comparación');
    expect(JSON.stringify(view)).not.toMatch(/Infinity|∞|NaN/);
  });

  it('si el periodo previo no es consecutivo (hueco) no se compara contra uno lejano', () => {
    const view = footprintView({ periods: [month(2026, 6, 9_000), month(2026, 9, 4_000), month(2026, 10, 1)] })!;

    expect(view.periodLabel).toBe('Sep 2026');
    expect(view.variation).toBeNull();
    expect(view.note).toBe('Sin base de comparación');
  });

  it('un hueco entre el cerrado y el actual no impide mostrar el último registro cerrado', () => {
    const view = footprintView({ periods: [month(2026, 7, 8_000), month(2026, 8, 6_000), month(2026, 10, 1)] })!;

    expect(view.periodLabel).toBe('Ago 2026');
    expect(view.variation).toEqual({ text: '−25,0 %', direction: 'down' });
  });

  it('ordena cronológicamente aunque lleguen desordenados y descarta los periodos imposibles (negativos)', () => {
    const view = footprintView({ periods: [month(2026, 10, 1), month(2026, 8, 100), month(2026, 9, 110), month(2026, 7, -40)] })!;

    expect(view.periodLabel).toBe('Sep 2026');
    expect(view.variation).toEqual({ text: '+10,0 %', direction: 'up' });
  });

  it('una variación que redondea a cero es neutra: «0,0 %»', () => {
    expect(variationOf(100, 100)).toEqual({ text: '0,0 %', direction: 'flat' });
    expect(variationOf(100.02, 100)).toEqual({ text: '0,0 %', direction: 'flat' });
    expect(variationOf(99.96, 100)).toEqual({ text: '0,0 %', direction: 'flat' });
  });

  it('redondea la variación a un decimal con coma y signo menos tipográfico', () => {
    expect(variationOf(87.7, 100)).toEqual({ text: '−12,3 %', direction: 'down' });
    expect(variationOf(108.54, 100)).toEqual({ text: '+8,5 %', direction: 'up' });
    expect(variationOf(1, 3)).toEqual({ text: '−66,7 %', direction: 'down' });
  });

  it('las cifras de 7 dígitos o más llevan separador de miles y redondean al entero', () => {
    const view = footprintView({ periods: [month(2026, 8, 3_100_000), month(2026, 9, 3_400_000.6), month(2026, 10, 1)] })!;

    expect(view.value).toBe('3.400.001');
    expect(view.variation).toEqual({ text: '+9,7 %', direction: 'up' });
    expect(footprintView({ periods: [month(2026, 10, 1_234_567_890)] })!.value).toBe('1.234.567.890');
  });

  it('un periodo sin consumo (0) se muestra como 0 y no rompe nada', () => {
    const view = footprintView({ periods: [month(2026, 9, 0), month(2026, 10, 5)] })!;

    expect(view.value).toBe('0');
    expect(view.note).toBe('Primer periodo calculado');
  });

  it('la etiqueta del periodo usa el formateador compartido: un mes o «Mes a Mes»', () => {
    expect(footprintView({ periods: [month(2026, 10, 1)] })!.periodLabel).toBe('Oct 2026');
    expect(footprintView({ periods: [{ start: '2026-01-01', end: '2026-03-31', kgCo2e: 5 }] })!.periodLabel).toBe('Ene 2026 a Mar 2026');
  });
});
