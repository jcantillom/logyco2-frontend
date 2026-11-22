import { BarBox, barLayout, formatTick, niceTicks } from './bar-chart';

const BOX: BarBox = { width: 560, height: 140, left: 48, right: 6, top: 18, bottom: 22 };

describe('gráfico de barras (lógica pura)', () => {
  describe('niceTicks', () => {
    it('redondea el máximo hacia arriba a 1, 2 o 5 × 10ⁿ con 3–4 divisiones e incluye el 0', () => {
      expect(niceTicks(18_432)).toEqual({ top: 20_000, step: 10_000, values: [0, 10_000, 20_000] });
      expect(niceTicks(16_820).top).toBe(20_000);
      expect(niceTicks(95)).toEqual({ top: 100, step: 50, values: [0, 50, 100] });
      expect(niceTicks(3_400_000).values).toEqual([0, 2_000_000, 4_000_000]);
      expect(niceTicks(7).values).toEqual([0, 5, 10]);
    });

    it('el tope siempre cubre el máximo y las marcas son de 3 a 5', () => {
      for (const max of [1, 3, 12, 99, 101, 4_999, 52_000, 123_456, 9_999_999]) {
        const { top, values } = niceTicks(max);

        expect(top).toBeGreaterThanOrEqual(max);
        expect(values.length).withContext(String(max)).toBeGreaterThanOrEqual(3);
        expect(values.length).withContext(String(max)).toBeLessThanOrEqual(5);
        expect(values[0]).toBe(0);
        expect(values[values.length - 1]).toBe(top);
      }
    });

    it('sin valores (0, negativo o no numérico) el tope es 1', () => {
      for (const max of [0, -5, Number.NaN]) expect(niceTicks(max)).toEqual({ top: 1, step: 1, values: [0, 1] });
    });
  });

  describe('barLayout', () => {
    const data = [{ label: 'Ene 2026', value: 16_820 }, { label: 'Feb 2026', value: 18_432 }, { label: 'Mar 2026', value: 15_493 }];

    it('las alturas son proporcionales al tope del eje y los centros quedan en el medio de cada ranura', () => {
      const layout = barLayout(data, BOX);
      const plotH = 140 - 18 - 22;

      expect(layout.top).toBe(20_000);
      expect(layout.bars.map((b) => Math.round(b.height))).toEqual([Math.round((16_820 / 20_000) * plotH), Math.round((18_432 / 20_000) * plotH), Math.round((15_493 / 20_000) * plotH)]);
      expect(layout.bars[0].y + layout.bars[0].height).toBeCloseTo(18 + plotH, 5);
      const slot = (560 - 48 - 6) / 3;

      expect(layout.bars.map((b) => b.cx)).toEqual([48 + slot / 2, 48 + slot * 1.5, 48 + slot * 2.5]);
      expect(layout.bars.map((b) => b.valueLabel)).toEqual(['16.820', '18.432', '15.493']);
      expect(layout.ticks.map((t) => t.label)).toEqual(['0', '10.000', '20.000']);
      expect(layout.empty).toBeFalse();
    });

    it('la línea de tendencia une los centros de las barras (por su borde superior)', () => {
      const layout = barLayout(data, BOX);

      expect(layout.trend.length).toBe(1);
      expect(layout.trend[0].split(' ').length).toBe(3);
      expect(layout.trend[0].startsWith(`${Math.round(layout.bars[0].cx * 10) / 10},${Math.round(layout.bars[0].cy * 10) / 10}`)).toBeTrue();
    });

    it('una ranura sin dato queda vacía con «—», sin altura, y la tendencia salta el hueco', () => {
      const layout = barLayout([{ label: 'A', value: 10 }, { label: 'B', value: 20 }, { label: 'C', value: null }, { label: 'D', value: 30 }, { label: 'E', value: 40 }], BOX);

      expect(layout.bars[2].valueLabel).toBe('—');
      expect(layout.bars[2].height).toBe(0);
      expect(layout.bars[2].value).toBeNull();
      expect(layout.trend.length).toBe(2);
      expect(layout.trend.map((t) => t.split(' ').length)).toEqual([2, 2]);
    });

    it('una racha de un solo punto no dibuja tendencia; una sola barra tampoco', () => {
      expect(barLayout([{ label: 'A', value: 10 }, { label: 'B', value: null }, { label: 'C', value: 5 }], BOX).trend).toEqual([]);
      expect(barLayout([{ label: 'A', value: 10 }], BOX).trend).toEqual([]);
    });

    it('todas las ranuras sin dato es vacío; los valores negativos o no numéricos cuentan como sin dato', () => {
      expect(barLayout([{ label: 'A', value: null }, { label: 'B', value: null }], BOX).empty).toBeTrue();
      expect(barLayout([{ label: 'A', value: -3 }, { label: 'B', value: Number.NaN }], BOX).empty).toBeTrue();
      expect(barLayout([], BOX).bars).toEqual([]);
    });

    it('un valor en 0 es una barra de altura 0 con su «0» (no es un hueco)', () => {
      const layout = barLayout([{ label: 'A', value: 0 }, { label: 'B', value: 5 }], BOX);

      expect(layout.bars[0].valueLabel).toBe('0');
      expect(layout.bars[0].value).toBe(0);
      expect(layout.empty).toBeFalse();
    });

    it('hasta 24 meses no se solapan: más de 6 etiquetas del eje X se inclinan y las cifras de 7 dígitos se giran si no caben', () => {
      const few = barLayout(data, BOX);
      const twelve = barLayout(Array.from({ length: 12 }, (_, i) => ({ label: `M${i}`, value: 3_400_000 })), BOX);
      const slot = (560 - 48 - 6) / 12;

      expect(few.rotateAxis).toBeFalse();
      expect(few.rotateValues).toBeFalse();
      expect(twelve.rotateAxis).toBeTrue();
      expect(twelve.rotateValues).toBeTrue();
      expect(twelve.bars.every((b) => b.width <= slot)).toBeTrue();
      expect(barLayout(Array.from({ length: 24 }, (_, i) => ({ label: `M${i}`, value: i })), BOX).bars.length).toBe(24);
    });

    it('formatTick usa separador de miles es-CO y 7 dígitos', () => {
      expect(formatTick(3_400_000)).toBe('3.400.000');
      expect(formatTick(12.6)).toBe('13');
    });
  });
});
