import { fuelSlices, hasMonthlyData, monthlyBars } from './emissions-charts.view';

describe('gráficas de emisiones (lógica pura)', () => {
  const slots = ['2026-01', '2026-02', '2026-03'];

  describe('monthlyBars', () => {
    it('sin dato (null) no hay barras: estado pendiente', () => {
      expect(monthlyBars(null, slots)).toEqual([]);
    });

    it('una ranura por mes del periodo, con «Ene 2026», y un mes sin dato queda en null (no un 0 inventado)', () => {
      const bars = monthlyBars([{ month: '2026-01', kgCo2: 16_820, tripsCalculated: 1 }, { month: '2026-03', kgCo2: 15_493, tripsCalculated: 1 }], slots);

      expect(bars).toEqual([{ label: 'Ene 2026', value: 16_820 }, { label: 'Feb 2026', value: null }, { label: 'Mar 2026', value: 15_493 }]);
    });

    it('descarta los datos fuera del periodo y suma un mes repetido', () => {
      const bars = monthlyBars([{ month: '2025-12', kgCo2: 999, tripsCalculated: 1 }, { month: '2026-02', kgCo2: 10, tripsCalculated: 1 }, { month: '2026-02-15', kgCo2: 5, tripsCalculated: 1 }, { month: '2027-01', kgCo2: 1, tripsCalculated: 1 }], slots);

      expect(bars.map((b) => b.value)).toEqual([null, 15, null]);
    });

    it('ignora cifras negativas o no numéricas y acepta 7 dígitos', () => {
      const bars = monthlyBars([{ month: '2026-01', kgCo2: -1, tripsCalculated: 1 }, { month: '2026-02', kgCo2: Number.NaN, tripsCalculated: 1 }, { month: '2026-03', kgCo2: 3_400_000, tripsCalculated: 1 }], slots);

      expect(bars.map((b) => b.value)).toEqual([null, null, 3_400_000]);
    });

    it('sin ranuras (sin periodos) no hay barras', () => {
      expect(monthlyBars([{ month: '2026-01', kgCo2: 1, tripsCalculated: 1 }], [])).toEqual([]);
    });

    it('hasMonthlyData distingue «hay algún dato» de «el periodo no tiene cálculo»', () => {
      expect(hasMonthlyData(monthlyBars([{ month: '2026-02', kgCo2: 0, tripsCalculated: 1 }], slots))).toBeTrue();
      expect(hasMonthlyData(monthlyBars([{ month: '2025-01', kgCo2: 5, tripsCalculated: 1 }], slots))).toBeFalse();
      expect(hasMonthlyData([])).toBeFalse();
    });
  });

  describe('fuelSlices', () => {
    it('null o vacío no tiene porciones', () => {
      expect(fuelSlices(null)).toEqual([]);
      expect(fuelSlices([])).toEqual([]);
    });

    it('arma las porciones del periodo con % que suman 100,0, de mayor a menor y sin ceros', () => {
      const slices = fuelSlices([{ fuelCode: 'NATURAL_GAS', name: 'Gas natural', kgCo2: 2_341, consumption: [] }, { fuelCode: 'X', name: 'Cero', kgCo2: 0, consumption: [] }, { fuelCode: 'DIESEL_B2', name: 'Diésel B2', kgCo2: 43_432, consumption: [] }, { fuelCode: 'GASOLINE_MOTOR', name: 'Gasolina motor', kgCo2: 4_972, consumption: [] }]);

      expect(slices.map((s) => s.label)).toEqual(['Diésel B2', 'Gasolina motor', 'Gas natural']);
      expect(slices.map((s) => s.pct)).toEqual([85.6, 9.8, 4.6]);
    });
  });
});
