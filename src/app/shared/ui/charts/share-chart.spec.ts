import { MAX_SLICES, SHARE_COLORS, largestRemainder, shareSlices } from './share-chart';

const sum = (values: readonly number[]): number => Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;

describe('participaciones de la dona (lógica pura)', () => {
  describe('largestRemainder', () => {
    it('suma exactamente 100,0 con un decimal', () => {
      expect(largestRemainder([1, 1, 1])).toEqual([33.4, 33.3, 33.3]);
      expect(sum(largestRemainder([43_432, 4_972, 2_341]))).toBe(100);
      expect(largestRemainder([43_432, 4_972, 2_341])).toEqual([85.6, 9.8, 4.6]);
    });

    it('un solo valor es 100,0', () => {
      expect(largestRemainder([5])).toEqual([100]);
    });

    it('los empates de resto se reparten en orden', () => {
      expect(largestRemainder([1, 1])).toEqual([50, 50]);
      expect(largestRemainder([1, 1, 1, 1, 1, 1, 1])).toEqual([14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2]);
      expect(sum(largestRemainder([1, 1, 1, 1, 1, 1, 1]))).toBe(100);
    });

    it('con cifras de 7 dígitos o más sigue sumando 100,0', () => {
      const out = largestRemainder([3_400_000, 1_234_567, 99_999_999, 7]);

      expect(sum(out)).toBe(100);
      expect(out.every((p) => Number.isFinite(p) && p >= 0)).toBeTrue();
    });

    it('sin total devuelve ceros', () => {
      expect(largestRemainder([0, 0])).toEqual([0, 0]);
      expect(largestRemainder([])).toEqual([]);
    });
  });

  describe('shareSlices', () => {
    const item = (key: string, value: number) => ({ key, label: key.toUpperCase(), value });

    it('omite los ceros (y negativos o no numéricos) y ordena de mayor a menor', () => {
      const out = shareSlices([item('a', 0), item('b', 10), item('c', 30), item('d', -4), item('e', Number.NaN), item('f', 60)]);

      expect(out.map((s) => s.key)).toEqual(['f', 'c', 'b']);
      expect(out.map((s) => s.pct)).toEqual([60, 30, 10]);
      expect(sum(out.map((s) => s.pct))).toBe(100);
    });

    it('un solo combustible es 100,0 %', () => {
      expect(shareSlices([item('a', 7)]).map((s) => s.pct)).toEqual([100]);
    });

    it('sin valores positivos no hay porciones', () => {
      expect(shareSlices([item('a', 0)])).toEqual([]);
      expect(shareSlices([])).toEqual([]);
    });

    it('con más de 4 combustibles agrupa el resto en «Otros» y suma 100,0', () => {
      const out = shareSlices([item('a', 50), item('b', 20), item('c', 12), item('d', 8), item('e', 6), item('f', 4)]);

      expect(MAX_SLICES).toBe(4);
      expect(out.map((s) => s.label)).toEqual(['A', 'B', 'C', 'D', 'Otros']);
      expect(out[4].value).toBe(10);
      expect(sum(out.map((s) => s.pct))).toBe(100);
    });

    it('exactamente 4 combustibles no genera «Otros»; con 5 el quinto se agrupa', () => {
      expect(shareSlices([item('a', 4), item('b', 3), item('c', 2), item('d', 1)]).length).toBe(4);
      expect(shareSlices([item('a', 5), item('b', 4), item('c', 3), item('d', 2), item('e', 1)]).map((s) => s.label)).toEqual(['A', 'B', 'C', 'D', 'Otros']);
    });

    it('los empates de valor se ordenan por nombre y los colores son de la paleta de marca, distintos entre vecinas', () => {
      const out = shareSlices([item('b', 10), item('a', 10), item('c', 10)]);

      expect(out.map((s) => s.key)).toEqual(['a', 'b', 'c']);
      expect(out.map((s) => s.color)).toEqual(SHARE_COLORS.slice(0, 3));
      expect(SHARE_COLORS[0]).toContain('--c-primary');
      expect(SHARE_COLORS[1]).toContain('--c-secondary');
      expect(SHARE_COLORS[2]).toContain('--c-gray');
      expect(new Set(SHARE_COLORS).size).toBe(SHARE_COLORS.length);
    });

    it('cifras de 7 dígitos suman 100,0', () => {
      expect(sum(shareSlices([item('a', 3_400_000), item('b', 1_234_567), item('c', 99)]).map((s) => s.pct))).toBe(100);
    });
  });
});
