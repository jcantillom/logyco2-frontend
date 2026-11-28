import { Footprint, FootprintBucket, FootprintTotals, ImportFootprint } from '../app/domain/models/footprint';
import { FootprintBucketDto, FootprintDto, ImportFootprintDto } from '../app/infrastructure/dto/footprint.dto';
import { ORG_ENVIA } from './builders';

/** URL de la huella de la empresa de pruebas (sin query). */
export const FOOTPRINT_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/emissions/footprint`;

/** Totales parciales de ejemplo: 12 de 18 viajes calculados (los 1 duplicados no cuentan). */
export const footprintTotals = (overrides: Partial<FootprintTotals> = {}): FootprintTotals => ({
  kgCo2: 5588.4016,
  tripsCalculated: 12,
  tripsPending: 4,
  tripsBlocked: 2,
  tripsDuplicate: 1,
  tripsPossibleDuplicate: 0,
  coverageTripsPct: 66.7,
  partial: true,
  measuredKgCo2: 2499.2521,
  estimatedKgCo2: 3089.1495,
  measuredTrips: 7,
  estimatedTrips: 5,
  ...overrides,
});

/** Totales de un resultado completo (sin viajes por calcular). */
export const completeTotals = (overrides: Partial<FootprintTotals> = {}): FootprintTotals => footprintTotals({ tripsPending: 0, tripsBlocked: 0, coverageTripsPct: 100, partial: false, ...overrides });

/** Totales de una huella pedida sin ningún viaje calculado (hay viajes pendientes). */
export const emptyTotals = (overrides: Partial<FootprintTotals> = {}): FootprintTotals => footprintTotals({ kgCo2: 0, tripsCalculated: 0, coverageTripsPct: 0, measuredKgCo2: 0, estimatedKgCo2: 0, measuredTrips: 0, estimatedTrips: 0, ...overrides });

/** Cubeta de la serie (dominio): 14 de marzo, 1.520,25 kg, 12 viajes, completa. */
export const buildBucket = (overrides: Partial<FootprintBucket> = {}): FootprintBucket => ({ key: '2026-03-14', label: '14 mar', start: '2026-03-14', end: '2026-03-14', kgCo2: 1520.25, tCo2: 1.52025, trips: 12, partial: false, ...overrides });

export const bucketDto = (overrides: Partial<FootprintBucketDto> = {}): FootprintBucketDto => ({ key: '2026-03-14', label: '14 mar', start: '2026-03-14', end: '2026-03-14', kg_co2: 1520.25, t_co2: 1.52025, trips: 12, partial: false, ...overrides });

export const buildFootprint = (overrides: Partial<Footprint> = {}): Footprint => ({
  period: { from: '2026-10-01', to: '2026-11-30' },
  totals: footprintTotals(),
  byMonth: [
    { month: '2026-10', kgCo2: 1825.6343, tripsCalculated: 6 },
    { month: '2026-11', kgCo2: 3762.7673, tripsCalculated: 6 },
  ],
  byFuel: [
    { fuelCode: 'DIESEL_B2', name: 'Diésel B2', kgCo2: 4200.1, consumption: [{ unit: 'gal', quantity: 410.5 }] },
    { fuelCode: 'NATURAL_GAS', name: 'Gas natural', kgCo2: 1388.3016, consumption: [{ unit: 'm3', quantity: 700 }] },
  ],
  periods: [],
  granularity: 'month',
  series: [
    buildBucket({ key: '2026-10', label: 'oct 2026', start: '2026-10-01', end: '2026-10-31', kgCo2: 1825.6343, tCo2: 1.8256343, trips: 6 }),
    buildBucket({ key: '2026-11', label: 'nov 2026', start: '2026-11-01', end: '2026-11-30', kgCo2: 3762.7673, tCo2: 3.7627673, trips: 6 }),
  ],
  seriesTotalKg: 5588.4016,
  methodology: null,
  dataOriginShare: null,
  inventoryCoverage: null,
  ...overrides,
});

export const footprintDto = (overrides: Partial<FootprintDto> = {}): FootprintDto => ({
  period: { from: '2026-10-01', to: '2026-11-30' },
  totals: {
    kg_co2: 5588.4016,
    trips_calculated: 12,
    trips_pending: 4,
    trips_blocked: 2,
    trips_duplicate: 1,
    trips_possible_duplicate: 0,
    coverage_trips_pct: 66.7,
    partial: true,
    measured_kg_co2: 2499.2521,
    estimated_kg_co2: 3089.1495,
    measured_trips: 7,
    estimated_trips: 5,
  },
  by_month: [
    { month: '2026-10', kg_co2: 1825.6343, trips_calculated: 6 },
    { month: '2026-11', kg_co2: 3762.7673, trips_calculated: 6 },
  ],
  by_fuel: [
    { fuel_code: 'DIESEL_B2', name: 'Diésel B2', kg_co2: 4200.1, consumption: [{ unit: 'gal', quantity: 410.5 }] },
    { fuel_code: 'NATURAL_GAS', name: 'Gas natural', kg_co2: 1388.3016, consumption: [{ unit: 'm3', quantity: 700 }] },
  ],
  periods: [
    { start: '2026-08-01', end: '2026-09-30', kg_co2: 4000 },
    { start: '2026-10-01', end: '2026-11-30', kg_co2: 5588.4016 },
  ],
  granularity: 'month',
  series: [
    bucketDto({ key: '2026-10', label: 'oct 2026', start: '2026-10-01', end: '2026-10-31', kg_co2: 1825.6343, t_co2: 1.8256343, trips: 6 }),
    bucketDto({ key: '2026-11', label: 'nov 2026', start: '2026-11-01', end: '2026-11-30', kg_co2: 3762.7673, t_co2: 3.7627673, trips: 6 }),
  ],
  series_total_kg: 5588.4016,
  ...overrides,
});

/** Huella de una carga (dominio): 7 viajes calculados de 10, un mes con kg. */
export const buildImportFootprint = (overrides: Partial<ImportFootprint> = {}): ImportFootprint => ({
  kgCo2: 3200.5,
  byMonth: [{ month: '2026-10', kgCo2: 3200.5, tripsCalculated: 7 }],
  trips: { calculated: 7, pending: 2, blocked: 1, duplicate: 0, possibleDuplicate: 0 },
  coverageTripsPct: 70,
  partial: true,
  measuredKgCo2: 1200.25,
  estimatedKgCo2: 2000.25,
  measuredTrips: 3,
  estimatedTrips: 4,
  ...overrides,
});

export const importFootprintDto = (overrides: Partial<ImportFootprintDto> = {}): ImportFootprintDto => ({
  kg_co2: 3200.5,
  by_month: [{ month: '2026-10', kg_co2: 3200.5, trips_calculated: 7 }],
  trips: { calculated: 7, pending: 2, blocked: 1, duplicate: 0, possible_duplicate: 0 },
  coverage_trips_pct: 70,
  partial: true,
  measured_kg_co2: 1200.25,
  estimated_kg_co2: 2000.25,
  measured_trips: 3,
  estimated_trips: 4,
  ...overrides,
});
