import { footprintDto, importFootprintDto } from '../../../testing/footprint';
import { toFootprint, toImportFootprint } from './footprint.mappers';

describe('footprint.mappers', () => {
  it('toFootprint pasa de snake_case a camelCase (kg CO₂, no CO₂e) con totales, meses, combustibles y periodos', () => {
    const f = toFootprint(footprintDto());

    expect(f.period).toEqual({ from: '2026-10-01', to: '2026-11-30' });
    expect(f.totals).toEqual({ kgCo2: 5588.4016, tripsCalculated: 12, tripsPending: 4, tripsBlocked: 2, tripsDuplicate: 1, tripsPossibleDuplicate: 0, coverageTripsPct: 66.7, partial: true, measuredKgCo2: 2499.2521, estimatedKgCo2: 3089.1495, measuredTrips: 7, estimatedTrips: 5 });
    expect(f.byMonth[0]).toEqual({ month: '2026-10', kgCo2: 1825.6343, tripsCalculated: 6 });
    expect(f.byFuel[1]).toEqual({ fuelCode: 'NATURAL_GAS', name: 'Gas natural', kgCo2: 1388.3016, consumption: [{ unit: 'm3', quantity: 700 }] });
    expect(f.periods[0]).toEqual({ start: '2026-08-01', end: '2026-09-30', kgCo2: 4000 });
    expect(JSON.stringify(f)).not.toMatch(/co2e/i);
  });

  it('una empresa o periodo vacío da ceros, listas vacías y cobertura nula, sin inventar nada', () => {
    const f = toFootprint(footprintDto({ period: { from: null, to: null }, by_month: [], by_fuel: [], periods: [], totals: { ...footprintDto().totals, kg_co2: 0, trips_calculated: 0, coverage_trips_pct: null, partial: false } }));

    expect(f.period).toEqual({ from: null, to: null });
    expect(f.totals.kgCo2).toBe(0);
    expect(f.totals.coverageTripsPct).toBeNull();
    expect([f.byMonth, f.byFuel, f.periods]).toEqual([[], [], []]);
  });

  it('tolera listas ausentes y consumo ausente (respuestas incompletas)', () => {
    const dto = { ...footprintDto(), by_month: undefined, periods: undefined, by_fuel: [{ fuel_code: 'X', name: 'X', kg_co2: 1 }] } as never;
    const f = toFootprint(dto);

    expect([f.byMonth, f.periods]).toEqual([[], []]);
    expect(f.byFuel[0].consumption).toEqual([]);
  });

  it('los viajes retenidos para revisión se leen de `trips_possible_duplicate` y `possible_duplicate`; un servidor anterior sin ellos cuenta 0', () => {
    expect(toFootprint(footprintDto({ totals: { ...footprintDto().totals, trips_possible_duplicate: 12 } })).totals.tripsPossibleDuplicate).toBe(12);
    expect(toImportFootprint(importFootprintDto({ trips: { calculated: 7, pending: 2, blocked: 1, duplicate: 0, possible_duplicate: 5 } })).trips.possibleDuplicate).toBe(5);

    expect(toFootprint(footprintDto({ totals: { ...footprintDto().totals, trips_possible_duplicate: undefined } })).totals.tripsPossibleDuplicate).toBe(0);
    expect(toImportFootprint(importFootprintDto({ trips: { calculated: 1, pending: 0, blocked: 0, duplicate: 0 } })).trips.possibleDuplicate).toBe(0);
  });

  it('toImportFootprint mapea el bloque de la carga, y cobertura nula se conserva', () => {
    const f = toImportFootprint(importFootprintDto({ coverage_trips_pct: null }));

    expect(f).toEqual({
      kgCo2: 3200.5,
      byMonth: [{ month: '2026-10', kgCo2: 3200.5, tripsCalculated: 7 }],
      trips: { calculated: 7, pending: 2, blocked: 1, duplicate: 0, possibleDuplicate: 0 },
      coverageTripsPct: null,
      partial: true,
      measuredKgCo2: 1200.25,
      estimatedKgCo2: 2000.25,
      measuredTrips: 3,
      estimatedTrips: 4,
    });
  });
});
