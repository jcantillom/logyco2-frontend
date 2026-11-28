import { parseGranularity } from '../../domain/models/granularity';
import { Footprint, FootprintBucket, FootprintMonth, FootprintTotals, ImportFootprint } from '../../domain/models/footprint';
import { FootprintBucketDto, FootprintDto, FootprintMonthDto, FootprintTotalsDto, ImportFootprintDto } from '../dto/footprint.dto';
import { toDataOriginShare, toInventoryCoverage, toMethodologyRef } from './methodology.mappers';

const toMonth = (dto: FootprintMonthDto): FootprintMonth => ({ month: dto.month, kgCo2: dto.kg_co2, tripsCalculated: dto.trips_calculated ?? 0 });

const toBucket = (dto: FootprintBucketDto): FootprintBucket => ({ key: dto.key, label: dto.label, start: dto.start, end: dto.end, kgCo2: dto.kg_co2, tCo2: dto.t_co2, trips: dto.trips ?? 0, partial: dto.partial === true });

const toTotals = (dto: FootprintTotalsDto): FootprintTotals => ({
  kgCo2: dto.kg_co2,
  tripsCalculated: dto.trips_calculated,
  tripsPending: dto.trips_pending,
  tripsBlocked: dto.trips_blocked,
  tripsDuplicate: dto.trips_duplicate,
  tripsPossibleDuplicate: dto.trips_possible_duplicate ?? 0,
  coverageTripsPct: dto.coverage_trips_pct ?? null,
  partial: dto.partial,
  measuredKgCo2: dto.measured_kg_co2,
  estimatedKgCo2: dto.estimated_kg_co2,
  measuredTrips: dto.measured_trips,
  estimatedTrips: dto.estimated_trips,
  byOrigin: dto.by_origin
    ? {
        realConsumption: { kgCo2: dto.by_origin.real_consumption.kg_co2, trips: dto.by_origin.real_consumption.trips },
        declaredEfficiency: { kgCo2: dto.by_origin.declared_efficiency.kg_co2, trips: dto.by_origin.declared_efficiency.trips },
        referenceEstimated: { kgCo2: dto.by_origin.reference_estimated.kg_co2, trips: dto.by_origin.reference_estimated.trips },
        referenceLabel: dto.by_origin.reference_label ?? null,
      }
    : null,
});

export const toFootprint = (dto: FootprintDto): Footprint => ({
  period: { from: dto.period?.from ?? null, to: dto.period?.to ?? null },
  totals: toTotals(dto.totals),
  byMonth: (dto.by_month ?? []).map(toMonth),
  byFuel: (dto.by_fuel ?? []).map((f) => ({ fuelCode: f.fuel_code, name: f.name, kgCo2: f.kg_co2, consumption: (f.consumption ?? []).map((c) => ({ unit: c.unit, quantity: c.quantity })) })),
  periods: (dto.periods ?? []).map((p) => ({ start: p.start, end: p.end, kgCo2: p.kg_co2 })),
  granularity: parseGranularity(dto.granularity),
  series: (dto.series ?? []).map(toBucket),
  seriesTotalKg: dto.series_total_kg ?? dto.totals.kg_co2,
  methodology: toMethodologyRef(dto.methodology),
  dataOriginShare: toDataOriginShare(dto.data_origin_share),
  inventoryCoverage: toInventoryCoverage(dto.inventory_coverage),
});

export const toImportFootprint = (dto: ImportFootprintDto): ImportFootprint => ({
  kgCo2: dto.kg_co2,
  byMonth: (dto.by_month ?? []).map(toMonth),
  trips: { calculated: dto.trips.calculated, pending: dto.trips.pending, blocked: dto.trips.blocked, duplicate: dto.trips.duplicate, possibleDuplicate: dto.trips.possible_duplicate ?? 0 },
  coverageTripsPct: dto.coverage_trips_pct ?? null,
  partial: dto.partial,
  measuredKgCo2: dto.measured_kg_co2,
  estimatedKgCo2: dto.estimated_kg_co2,
  measuredTrips: dto.measured_trips,
  estimatedTrips: dto.estimated_trips,
});
