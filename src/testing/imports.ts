import { CargoUnitAppliedDto, CargoUnitProposalDto, EfficiencyCoverageDto, ImportColumnDto, ImportCountsDto, ImportPeriodDto, ImportDetailDto, ImportReviewDto, ImportSummaryDto, VehicleCandidateDto } from '../app/infrastructure/dto/imports.dto';
import { ORG_ENVIA } from './builders';

/** URL base de las cargas de la empresa de pruebas. */
export const IMPORTS_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/imports`;

export const importSummaryDto = (overrides: Partial<ImportSummaryDto> = {}): ImportSummaryDto => ({
  id: 'imp-1',
  file_name: 'operaciones-marzo.xlsx',
  file_size: 20480,
  status: 'COMPLETED',
  phase: 'DONE',
  format: 'LOGYCO2_TEMPLATE',
  rows_total: 200,
  rows_processed: 200,
  created_at: '2026-03-01T10:00:00Z',
  started_at: '2026-03-01T10:00:05Z',
  finished_at: '2026-03-01T10:02:00Z',
  created_by_name: 'Ana Prueba',
  headline: { rows_read: 200, real_consumption: 120, estimated_consumption: 50, pending: 30 },
  error: null,
  ...overrides,
});

export const importCountsDto = (overrides: Partial<ImportCountsDto> = {}): ImportCountsDto => ({ total: 0, in_progress: 0, completed: 0, failed: 0, vehicles_pending: 0, rows_read: 0, rows_calculable: 0, rows_pending: 0, rows_real: 0, rows_estimated: 0, vehicles_new_pending: 0, vehicles_changed_pending: 0, period_from: null, period_to: null, distance_km: 0, cargo_ton: 0, rows_with_distance: 0, rows_with_cargo: 0, distance_from_routes_km: 0, ...overrides });

export const importPeriodDto = (overrides: Partial<ImportPeriodDto> = {}): ImportPeriodDto => ({ period_from: '2026-01-05', period_to: '2026-03-28', imports: 2, rows_read: 3_400_000, ...overrides });

export const columnDto = (overrides: Partial<ImportColumnDto> = {}): ImportColumnDto => ({
  field: 'placa',
  label: 'Placa del vehículo',
  requirement: 'REQUIRED',
  found: true,
  source_header: 'placa',
  filled_rows: 200,
  ...overrides,
});

export const reviewDto = (overrides: Partial<ImportReviewDto> = {}): ImportReviewDto => ({
  format: 'LOGYCO2_TEMPLATE',
  rows_read: 200,
  columns: [
    columnDto(),
    columnDto({ field: 'distancia_km', label: 'Distancia (km)', requirement: 'CONDITIONAL', source_header: 'distancia_km', filled_rows: 150 }),
    columnDto({ field: 'tipo_operacion', label: 'Tipo de operación', requirement: 'RECOMMENDED', found: false, source_header: null, filled_rows: 0 }),
    columnDto({ field: 'id_servicio', label: 'Identificador del servicio', requirement: 'OPTIONAL', source_header: 'ID servicio', filled_rows: 40 }),
  ],
  methods: { real_consumption: 120, estimated_consumption: 50, pending: 30 },
  pending_reasons: [{ code: 'MISSING_DISTANCE_WITH_ROUTE', label: 'Hay origen y destino pero falta la distancia', rows: 20, sample_rows: [4, 9] }],
  issues: [
    { code: 'INVALID_PLATE', severity: 'WARNING', field: 'placa', message: 'Hay placas con formato inválido.', rows: 3, sample_rows: [7, 8, 12] },
    { code: 'REPEATED_TRIP_ID', severity: 'INFO', field: 'id_viaje', message: 'Hay identificadores de viaje repetidos.', rows: 6, sample_rows: [30] },
    { code: 'UNPARSEABLE_DATE', severity: 'ERROR', field: 'fecha_viaje', message: 'Hay fechas que no se pudieron interpretar.', rows: 1, sample_rows: [50] },
  ],
  vehicles: { distinct_plates: 18, invalid_plates: 3 },
  trips: { distinct_trip_ids: 190, repeated_trip_ids: 5 },
  ...overrides,
});

export const importDetailDto = (overrides: Partial<ImportDetailDto> = {}): ImportDetailDto => ({ ...importSummaryDto(), review: reviewDto(), ...overrides });

export const vehiclesDetectedDto = (overrides: Partial<NonNullable<ImportSummaryDto['vehicles_detected']>> = {}): NonNullable<ImportSummaryDto['vehicles_detected']> => ({
  new: 2,
  changed: 1,
  unchanged: 5,
  pending_decision: 3,
  ...overrides,
});

export const candidateDto = (overrides: Partial<VehicleCandidateDto> = {}): VehicleCandidateDto => ({
  id: 'cand-1',
  plate: 'ABC123',
  plate_original: 'abc 123',
  kind: 'NEW',
  decision: 'PENDING',
  proposed: { configuration_code: 'C3', model_year: 2019, fuel_type: 'DIESEL', vehicle_type: null },
  fuel_label: 'Diésel',
  conflicts: [],
  trip_rows: 12,
  inactive: false,
  vehicle_id: null,
  ...overrides,
});

export const changedCandidateDto = (overrides: Partial<VehicleCandidateDto> = {}): VehicleCandidateDto =>
  candidateDto({
    id: 'cand-2',
    plate: 'XYZ789',
    plate_original: 'XYZ789',
    kind: 'CHANGED',
    vehicle_id: 'veh-9',
    changes: [
      { field: 'fuel_type', label: 'Combustible', before: 'Gasolina', after: 'Diésel' },
      { field: 'model_year', label: 'Modelo', before: 2015, after: 2016 },
    ],
    ...overrides,
  });

/** Propuesta del servidor de leer la carga como kilogramos (`KG_LIKELY` por defecto). */
export const cargoProposalDto = (overrides: Partial<CargoUnitProposalDto> = {}): CargoUnitProposalDto => ({
  status: 'KG_LIKELY',
  proposed_unit: 'KG',
  declared_unit: 'TON',
  basis: 'CAPACITY',
  message: 'La columna parece estar en kilogramos: la mediana equivale al 98 % de la capacidad si fuera kg.',
  evidence: {
    rows_with_cargo: 180,
    rows_over_limit: 178,
    share_over_limit_pct: 98.9,
    limit_ton: 1000,
    median_value: 34440,
    median_as_tons_if_kg: 34.44,
    median_capacity_ton: 35,
    median_pct_of_capacity: 98.4,
    rows_with_capacity: 180,
    rows_over_capacity_if_kg: 0,
    median_exact: true,
    rows_still_out_of_range_if_kg: 2,
    total_ton_if_kg: 6199.2,
    rows_with_cargo_if_kg: 178,
  },
  ...overrides,
});

export const cargoAppliedDto = (overrides: Partial<CargoUnitAppliedDto> = {}): CargoUnitAppliedDto => ({ unit: 'KG', source: 'ADMIN', confirmed_at: '2026-03-02T09:30:00Z', confirmed_by: 'usr-1', header: null, ...overrides });

/** Cobertura con una referencia estimable, otra bloqueada por licencia y viajes sin distancia; modo ASK sin consentimiento. */
export const coverageDto = (overrides: Partial<EfficiencyCoverageDto> = {}): EfficiencyCoverageDto => ({
  estimation: { platform_enabled: true, mode: 'ASK', requires_consent: true, can_estimate: true, consent: null },
  vehicles_in_file: 18,
  with_own_efficiency: { vehicles: 4, trips: 60 },
  already_estimated: { vehicles: 2, trips: 30 },
  without_efficiency: {
    vehicles: 12,
    trips: 110,
    estimable: {
      vehicles: 8,
      trips: 80,
      unregistered_vehicles: 3,
      references: [{ source: 'UPME', value_km_per_gal: 7.5, unit: 'km/gal', uncertainty_low: 6.1, uncertainty_high: 9.4, licence_status: 'UNVERIFIED_TEST_ONLY', mapping_confidence: 'HIGH', vehicles: 8, trips: 80, unregistered_vehicles: 3 }],
    },
    blocked_by_licence: { vehicles: 1, trips: 10, unregistered_vehicles: 0, message: 'La fuente de estos vehículos no tiene la licencia confirmada.' },
    no_reference: { vehicles: 3, trips: 20, reasons: [{ code: 'CONFIGURATION_MISSING', label: 'El vehículo no tiene configuración', vehicles: 3, trips: 20 }] },
  },
  trips_without_distance: { trips: 14, vehicles: 5 },
  ...overrides,
});
