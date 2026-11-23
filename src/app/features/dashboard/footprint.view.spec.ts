import { Footprint, FootprintPeriod } from '../../domain/models/footprint';
import { buildFootprint, completeTotals, emptyTotals, footprintTotals } from '../../../testing/footprint';
import { footprintView, noEmissionsText, variationOf } from './footprint.view';

const period = (start: string, end: string, kg: number): FootprintPeriod => ({ start, end, kgCo2: kg });
const prev = period('2026-08-01', '2026-09-30', 4_000);
const current = (kg = 5_588.4016): FootprintPeriod => period('2026-10-01', '2026-11-30', kg);
const withPeriods = (periods: readonly FootprintPeriod[], totals = footprintTotals()): Footprint => buildFootprint({ periods, totals });

describe('footprint.view', () => {
  describe('variationOf', () => {
    it('da signo explícito y un decimal es-CO; lo que redondea a cero es neutro', () => {
      expect(variationOf(87.7, 100)).toEqual({ text: '−12,3 %', direction: 'down' });
      expect(variationOf(108.5, 100)).toEqual({ text: '+8,5 %', direction: 'up' });
      expect(variationOf(100.01, 100)).toEqual({ text: '0,0 %', direction: 'flat' });
    });
  });

  describe('viajes retenidos como posibles duplicados', () => {
    const SENTENCE = '12 operaciones por revisar (posibles duplicados) no están sumadas';

    it('con viajes retenidos agrega una frase a la ayuda, también en un resultado completo, y sin ellos no cambia nada', () => {
      const complete = footprintView(withPeriods([], completeTotals({ tripsPossibleDuplicate: 12 })))!;
      const partial = footprintView(withPeriods([], footprintTotals({ tripsPossibleDuplicate: 12 })))!;

      expect(complete.partial).toBeFalse();
      expect(complete.hint).toBe(`${SENTENCE}.`);
      expect(complete.coverageHint).toBeNull();
      expect(partial.hint).toContain('Resultado parcial: 12 de 18 viajes calculados');
      expect(partial.hint!.endsWith(`${SENTENCE}.`)).toBeTrue();
      expect(footprintView(withPeriods([], completeTotals()))!.hint).toBeNull();
      expect(footprintView(withPeriods([], footprintTotals()))!.hint).toBe(footprintView(withPeriods([], footprintTotals()))!.coverageHint);
    });

    it('en singular dice «1 operación por revisar (posible duplicado) no está sumada»', () => {
      expect(footprintView(withPeriods([], completeTotals({ tripsPossibleDuplicate: 1 })))!.hint).toBe('1 operación por revisar (posible duplicado) no está sumada.');
    });
  });

  describe('footprintView', () => {
    it('sin huella o sin viajes calculados no hay vista (estado vacío, nunca ceros como resultado)', () => {
      expect(footprintView(null)).toBeNull();
      expect(footprintView(buildFootprint({ totals: emptyTotals() }))).toBeNull();
    });

    it('la cifra es el total del periodo, en kg CO₂ (no CO₂e), con separador de miles es-CO', () => {
      const v = footprintView(withPeriods([], completeTotals({ kgCo2: 3_400_000.4 })))!;

      expect(v.value).toBe('3.400.000');
      expect(v.unit).toBe('kg CO₂');
      expect(v.unit).not.toContain('e');
    });

    it('el periodo sale de period.from/to; sin fechas (todos) no hay etiqueta', () => {
      expect(footprintView(withPeriods([]))!.periodLabel).toBe('Oct 2026 a Nov 2026');
      expect(footprintView(buildFootprint({ period: { from: null, to: null } }))!.periodLabel).toBeNull();
    });

    it('la variación compara el total con el periodo contiguo anterior de `periods`', () => {
      const v = footprintView(withPeriods([prev, current()]))!;

      expect(v.variation).toEqual({ text: '+39,7 %', direction: 'up' });
      expect(v.note).toBeNull();
    });

    it('sin periodo anterior, con base 0 o no contiguo no hay variación ni número inventado: «Sin base de comparación»', () => {
      for (const periods of [[], [current()], [period('2026-08-01', '2026-09-30', 0), current()], [period('2026-05-01', '2026-06-30', 4_000), current()]]) {
        const v = footprintView(withPeriods(periods))!;

        expect(v.variation).withContext(JSON.stringify(periods)).toBeNull();
        expect(v.note).toBe('Sin base de comparación');
      }
    });

    it('si el último periodo no termina en `to` (el actual no tiene viajes calculados) no se compara', () => {
      expect(footprintView(withPeriods([period('2026-04-01', '2026-05-31', 10), prev]))!.variation).toBeNull();
    });

    it('un resultado parcial lo dice con «12 de 18 viajes calculados» y la aclaración de que el porcentaje es por viajes, no por emisiones', () => {
      const v = footprintView(withPeriods([]))!;

      expect(v.partial).toBeTrue();
      expect(v.coverage).toBe('12 de 18 viajes calculados');
      expect(v.coverageHint).toContain('66,7 % de los viajes');
      expect(v.coverageHint).toContain('por cantidad de viajes y no necesariamente representa el porcentaje de emisiones cubiertas');
    });

    it('los duplicados no entran en la cobertura', () => {
      const v = footprintView(withPeriods([], footprintTotals({ tripsCalculated: 3, tripsPending: 1, tripsBlocked: 0, tripsDuplicate: 50 })))!;

      expect(v.coverage).toBe('3 de 4 viajes calculados');
    });

    it('un resultado completo no lleva marca de parcial ni línea de cobertura', () => {
      const v = footprintView(withPeriods([], completeTotals()))!;

      expect([v.partial, v.coverage, v.coverageHint]).toEqual([false, null, null]);
    });

    it('descarta periodos inválidos al comparar', () => {
      const v = footprintView(withPeriods([period('no-fecha', 'no-fecha', 1), prev, current(), period('2026-01-01', '2026-02-28', -5)]))!;

      expect(v.variation?.direction).toBe('up');
    });
  });

  describe('noEmissionsText', () => {
    it('sin huella pedida: se activa al calcular; sin viajes por calcular: aún no hay emisiones', () => {
      expect(noEmissionsText(null)).toBe('Se activa al calcular tu huella');
      expect(noEmissionsText(buildFootprint({ totals: emptyTotals({ tripsPending: 0, tripsBlocked: 0 }) }))).toBe('Aún no hay emisiones calculadas');
    });

    it('con viajes pendientes o bloqueados explica por qué', () => {
      expect(noEmissionsText(buildFootprint({ totals: emptyTotals({ tripsPending: 3, tripsBlocked: 2 }) }))).toBe('Aún no hay emisiones calculadas: faltan datos en 5 viajes');
      expect(noEmissionsText(buildFootprint({ totals: emptyTotals({ tripsPending: 1, tripsBlocked: 0 }) }))).toBe('Aún no hay emisiones calculadas: faltan datos en 1 viaje');
    });
  });
});
