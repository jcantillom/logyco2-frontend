import { fuelSlices } from './emissions-charts.view';

describe('gráficas de emisiones (lógica pura)', () => {
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
