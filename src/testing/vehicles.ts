import {
  AnalysisSummaryDto,
  FindingDto,
  NotificationDto,
  VehicleAnalysisDto,
  VehicleDetailDto,
  VehicleDto,
} from '../app/infrastructure/dto/vehicles.dto';
import { ORG_ENVIA } from './builders';

/** URL base de la empresa de pruebas para los endpoints de vehículos. */
export const VEHICLES_ORG_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}`;

/** Respuesta paginada con el sobre del backend. */
export const pagedBody = <T>(items: readonly T[], total = items.length, pageSize = 10, page = 1) => ({
  data: items,
  meta: { pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)), has_next: page * pageSize < total, has_previous: page > 1 } },
});

export const vehicleDto = (overrides: Partial<VehicleDto> = {}): VehicleDto => ({
  id: 'veh-1',
  plate: 'ABC123',
  plate_original: 'abc 123',
  country: 'CO',
  configuration_code: 'C2',
  configuration_recognized: true,
  vehicle_type: 'Camión',
  fuel_type: 'DIESEL',
  model_year: 2018,
  technology: null,
  capacity_tons: 8,
  ownership: 'UNKNOWN',
  status: 'ACTIVE',
  source: 'IMPORT',
  first_seen_at: '2026-03-01T10:00:00Z',
  last_seen_at: '2026-05-02T10:00:00Z',
  created_at: '2026-03-02T10:00:00Z',
  ...overrides,
});

export const vehicleDetailDto = (overrides: Partial<VehicleDetailDto> = {}): VehicleDetailDto => ({
  ...vehicleDto(),
  history: [
    {
      id: 'h-2',
      event: 'UPDATED',
      at: '2026-04-01T09:30:00Z',
      actor_name: 'Ana Prueba',
      changes: [{ field: 'fuel_type', before: 'GASOLINE', after: 'DIESEL' }],
      run_id: null,
    },
    { id: 'h-1', event: 'REGISTERED', at: '2026-03-02T10:00:00Z', actor_name: null, changes: [], run_id: 'run-1' },
  ],
  runs: [{ run_id: 'run-1', file_name: 'operaciones-marzo.xlsx', at: '2026-03-01T10:00:00Z', occurrences: 4 }],
  ...overrides,
});

export const summaryDto = { registered: 12, pending_new: 3, conflicts: 2, inactive: 1 };

export const analysisDto = (overrides: Partial<VehicleAnalysisDto> = {}): VehicleAnalysisDto => ({
  id: 'run-1',
  file_name: 'operaciones-marzo.xlsx',
  status: 'COMPLETED',
  phase: null,
  rows_processed: 100,
  rows_total: 100,
  counts: { detected: 10, known: 5, new: 3, conflict: 1, incomplete: 1, invalid: 0 },
  error: null,
  created_at: '2026-03-01T10:00:00Z',
  finished_at: '2026-03-01T10:05:00Z',
  ...overrides,
});

export const analysisSummaryDto = (overrides: Partial<AnalysisSummaryDto> = {}): AnalysisSummaryDto => ({
  id: 'run-1',
  file_name: 'operaciones-marzo.xlsx',
  status: 'COMPLETED',
  created_at: '2026-03-01T10:00:00Z',
  finished_at: '2026-03-01T10:05:00Z',
  counts: { detected: 10, known: 5, new: 3, conflict: 1, incomplete: 1, invalid: 0 },
  pending: { new: 3, conflict: 1, incomplete: 1, invalid: 0 },
  ...overrides,
});

export const findingDto = (overrides: Partial<FindingDto> = {}): FindingDto => ({
  id: 'f-1',
  plate: 'ABC123',
  plate_original: 'abc123',
  state: 'CONFLICT',
  decision: 'PENDING',
  detected: { configuration_code: 'C3', vehicle_type: null, fuel_type: 'DIESEL', model_year: 2018, technology: null, capacity_tons: null },
  current: { configuration_code: 'C2', vehicle_type: 'Camión', fuel_type: 'DIESEL', model_year: 2018, technology: null, capacity_tons: 8 },
  differences: [{ field: 'configuration_code', current: 'C2', incoming: 'C3', kind: 'STRUCTURAL', severity: 'HIGH', recommended_action: 'KEEP_CURRENT' }],
  occurrences: 7,
  sample_rows: [2, 9],
  in_file_conflict: false,
  invalid_reason: null,
  in_file_conflicts: [{ field: 'configuration_code', values: [{ value: 'C2', count: 5, rows: [2, 3] }, { value: 'C3', count: 2, rows: [9] }] }],
  configuration_recognized: true,
  ...overrides,
});

export const notificationDto = (overrides: Partial<NotificationDto> = {}): NotificationDto => ({
  id: 'n-1',
  type: 'vehicles.new',
  severity: 'INFO',
  title: 'Vehículos nuevos por confirmar',
  description: 'Se detectaron 3 vehículos nuevos.',
  created_at: '2026-03-01T10:05:00Z',
  read: false,
  run_id: 'run-1',
  deep_link: { path: '/vehiculos', query: { analysis: 'run-1' } },
  ...overrides,
});
