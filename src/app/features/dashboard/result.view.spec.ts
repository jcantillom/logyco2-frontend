import { FootprintByFuel } from '../../domain/models/footprint';
import { ImportCounts } from '../../domain/models/imports';
import { formatKg, formatTons, fuelResults, totalsView } from './result.view';

const counts = (overrides: Partial<ImportCounts> = {}): ImportCounts => ({
  total: 1, inProgress: 0, completed: 1, failed: 0, vehiclesPending: 0, rowsRead: 100, rowsCalculable: 80, rowsPending: 20, rowsReal: 50, rowsEstimated: 30, vehiclesNewPending: 0, vehiclesChangedPending: 0,
  periodFrom: null, periodTo: null, distanceKm: 0, cargoTon: 0, rowsWithDistance: 0, rowsWithCargo: 0, ...overrides,
});

describe('resultado del periodo (lógica pura)', () => {
  describe('fuelResults', () => {
    it('sin dato (null o vacío) no hay combustibles: estado pendiente, sin rotación', () => {
      expect(fuelResults(null)).toEqual([]);
      expect(fuelResults([])).toEqual([]);
    });

    it('formatea kg CO₂ al entero con separador de miles es-CO, con el nombre y en el orden recibido', () => {
      const byFuel: FootprintByFuel = [{ fuelCode: 'GASOLINE_MOTOR', name: 'Gasolina motor', kgCo2e: 43_432.4 }, { fuelCode: 'NATURAL_GAS', name: 'Gas natural', kgCo2e: 2_340.6 }];

      expect(fuelResults(byFuel)).toEqual([
        { fuelCode: 'GASOLINE_MOTOR', name: 'Gasolina motor', value: '43.432', unit: 'kg CO₂' },
        { fuelCode: 'NATURAL_GAS', name: 'Gas natural', value: '2.341', unit: 'kg CO₂' },
      ]);
    });

    it('descarta cifras negativas o no numéricas y soporta 7 dígitos o más', () => {
      const out = fuelResults([{ fuelCode: 'A', name: 'A', kgCo2e: -1 }, { fuelCode: 'B', name: 'B', kgCo2e: Number.NaN }, { fuelCode: 'C', name: 'C', kgCo2e: 3_400_000 }, { fuelCode: 'D', name: 'D', kgCo2e: 0 }]);

      expect(out.map((f) => f.value)).toEqual(['3.400.000', '0']);
      expect(formatKg(12_345_678.5)).toBe('12.345.679');
    });
  });

  describe('formatTons', () => {
    it('hasta un decimal si son menos de 100 t; desde 100 al entero con separador de miles', () => {
      expect(formatTons(0)).toBe('0');
      expect(formatTons(12.5)).toBe('12,5');
      expect(formatTons(48.26)).toBe('48,3');
      expect(formatTons(99.94)).toBe('99,9');
      expect(formatTons(100.4)).toBe('100');
      expect(formatTons(3_400_000.6)).toBe('3.400.001');
    });
  });

  describe('totalsView', () => {
    it('con datos: distancia al entero en km y carga en t, y la cobertura real en viajes', () => {
      const view = totalsView(counts({ distanceKm: 1_234_567.4, cargoTon: 48.26, rowsWithDistance: 3_300_000, rowsWithCargo: 1 }));

      expect(view.distance).toEqual({ value: '1.234.567', unit: 'km', note: 'en 3.300.000 viajes con distancia' });
      expect(view.cargo).toEqual({ value: '48,3', unit: 't', note: 'en 1 viaje con carga' });
    });

    it('sin cargas completadas: «—» y «Sube un archivo para ver…»', () => {
      const view = totalsView(counts({ rowsRead: 0 }));

      expect(view.distance).toEqual({ value: null, unit: 'km', note: 'Sube un archivo para ver la distancia total' });
      expect(view.cargo).toEqual({ value: null, unit: 't', note: 'Sube un archivo para ver la carga transportada' });
    });

    it('con cargas pero sin ese dato en ningún viaje no inventa un 0: «Ningún viaje trae…»', () => {
      const view = totalsView(counts({ distanceKm: 0, rowsWithDistance: 0, cargoTon: 5, rowsWithCargo: 2 }));

      expect(view.distance.value).toBeNull();
      expect(view.distance.note).toBe('Ningún viaje trae distancia');
      expect(view.cargo.value).toBe('5');
    });

    it('sin counts (sin permiso) solo «—» y sin nota', () => {
      expect(totalsView(null)).toEqual({ distance: { value: null, unit: 'km', note: '' }, cargo: { value: null, unit: 't', note: '' } });
    });
  });
});
