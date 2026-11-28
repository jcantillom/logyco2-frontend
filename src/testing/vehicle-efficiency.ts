import { ProtectedRowDto, EfficiencySettingsDto, AppliedToPendingDto, DeclareOutDto, EfficiencyEstimateDto, EfficiencyRecordDto, EfficiencyViewDto, EstimateApplyOutDto, EstimatePreviewDto, FichaApplyOutDto, FichaPreviewDto } from '../app/infrastructure/dto/vehicle-efficiency.dto';
import { VEHICLES_ORG_URL } from './vehicles';

export const EFFICIENCY_URL = (vehicleId = 'veh-1'): string => `${VEHICLES_ORG_URL}/vehicles/${vehicleId}/efficiency`;
export const FICHA_TEMPLATE_URL = `${VEHICLES_ORG_URL}/vehicles/efficiency/template`;
export const FICHA_PREVIEW_URL = `${VEHICLES_ORG_URL}/vehicles/efficiency/ficha/preview`;
export const ESTIMATE_PREVIEW_URL = `${VEHICLES_ORG_URL}/vehicles/efficiency/estimate/preview`;
export const ESTIMATE_APPLY_URL = `${VEHICLES_ORG_URL}/vehicles/efficiency/estimate/apply`;
export const FICHA_APPLY_URL = `${VEHICLES_ORG_URL}/vehicles/efficiency/ficha/apply`;

export const recordDto = (overrides: Partial<EfficiencyRecordDto> = {}): EfficiencyRecordDto => ({
  id: 'rec-1',
  value: '6.900000',
  unit: 'km/gal',
  origin: 'DECLARED',
  basis: 'THEORETICAL',
  source_kind: 'MANUAL',
  note: 'Ficha del fabricante',
  measured_on: '2026-11-01',
  declared_by_name: 'Ana Prueba',
  declared_at: '2026-11-20T15:00:00Z',
  is_current: true,
  superseded_at: null,
  ...overrides,
});

export const viewDto = (overrides: Partial<EfficiencyViewDto> = {}, history: readonly EfficiencyRecordDto[] = [recordDto()]): EfficiencyViewDto => ({
  vehicle_id: 'veh-1',
  plate: 'ABC123',
  fuel_type: 'DIESEL',
  compatible_units: ['km/gal', 'km/l'],
  current: history.find((record) => record.is_current) ?? null,
  history,
  pagination: { page: 1, page_size: 5, total: history.length, total_pages: Math.max(1, Math.ceil(history.length / 5)), has_next: false, has_previous: false },
  ...overrides,
});

export const appliedDto = (overrides: Partial<AppliedToPendingDto> = {}): AppliedToPendingDto => ({
  trips_recalculated: 120,
  now_calculated: 120,
  still_pending: 3,
  remaining: 0,
  cap: 20000,
  stale_calculated_trips: 0,
  ...overrides,
});

export const declareOutDto = (overrides: Partial<DeclareOutDto> = {}): DeclareOutDto => ({ changed: true, record: recordDto(), applied_to_pending: appliedDto(), ...overrides });

export const fichaPreviewDto = (overrides: Partial<FichaPreviewDto> = {}): FichaPreviewDto => ({
  token: 'tok-secreto',
  expires_at: '2026-11-25T16:00:00Z',
  file_sha256: 'abc',
  counts: { rows: 12, valid: 9, with_issues: 3, unchanged: 1, to_create: 8, to_replace: 2, pending_trips: 340 },
  issues: [
    { row: 4, plate: 'ZZZ999', field: 'plate', message: 'Placa no registrada' },
    { row: 7, plate: 'ABC123', field: 'unit', message: 'Unidad incompatible con el combustible' },
    { row: 9, plate: null, field: 'value', message: 'El rendimiento debe ser mayor que 0' },
  ],
  issues_truncated: false,
  max_rows: 20000,
  ...overrides,
});

export const fichaApplyDto = (overrides: Partial<FichaApplyOutDto> = {}): FichaApplyOutDto => ({ records_created: 8, records_replaced: 2, unchanged: 1, applied_to_pending: appliedDto(), ...overrides });

/** Un cuerpo de error del backend. */
export const apiError = (code: string, details: readonly { field: string; message: string; type?: string }[] = []): { error: { code: string; message: string; details: typeof details } } => ({
  error: { code, message: 'texto del servidor que nunca se muestra', details },
});

export const xlsxFile = (name = 'ficha.xlsx', size = 20): File => new File([new Uint8Array(size)], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

export const estimateDto = (overrides: Partial<EfficiencyEstimateDto> = {}): EfficiencyEstimateDto => ({
  value: '6.900000',
  unit: 'km/gal',
  source_category: '3SX',
  version_label: 'UPME 2025',
  table_ref: 'Tabla 2.8',
  page_ref: 'PDF p. 32',
  uncertainty_low: '5.600000',
  uncertainty_high: '9.200000',
  mapping_confidence: 'APPROXIMATE',
  evidence_level: 'LOW',
  ...overrides,
});

/** Un rendimiento sin valor propio con la estimación encendida y su sugerencia. */
export const suggestionView = (overrides: Partial<EfficiencyViewDto> = {}): EfficiencyViewDto => ({
  ...viewDto({}, []),
  estimation_enabled: true,
  estimate: estimateDto(),
  estimate_reason: null,
  estimate_reason_label: null,
  ...overrides,
});

export const estimatePreviewDto = (overrides: Partial<EstimatePreviewDto> = {}): EstimatePreviewDto => ({
  token: 'tok-estimar',
  expires_at: '2026-11-26T16:00:00Z',
  scope_sha256: 'abc',
  counts: { considered: 40, unknown_vehicles: 0, kept_vehicle_efficiency: 5, already_estimated: 2, to_create: 25, to_retire: 0, rejected: 8, pending_trips: 900 },
  rejected_by_reason: [{ reason: 'FUEL_NOT_COVERED', label: 'El combustible no tiene referencia', vehicles: 8 }],
  next_cursor: null,
  max_vehicles: 500,
  ...overrides,
});

export const estimateApplyDto = (overrides: Partial<EstimateApplyOutDto> = {}): EstimateApplyOutDto => ({
  records_created: 25,
  records_retired: 0,
  already_estimated: 2,
  kept_vehicle_efficiency: 5,
  rejected: 8,
  rejected_by_reason: [],
  applied_to_pending: appliedDto(),
  next_cursor: null,
  ...overrides,
});

export const SETTINGS_URL = `${VEHICLES_ORG_URL}/vehicles/efficiency/settings`;

export const settingsDto = (overrides: Partial<EfficiencySettingsDto> = {}): EfficiencySettingsDto => ({ mode: 'ASK', platform_enabled: true, cargo_unit_mode: 'ASK', options: ['OFF', 'ASK', 'AUTO'], cargo_unit_options: ['ASK', 'AUTO_KG'], ...overrides });

export const protectedRowDto = (overrides: Partial<ProtectedRowDto> = {}): ProtectedRowDto => ({
  row: 5,
  plate: 'ABC123',
  status: 'MEASURED_PROTECTED',
  current_record_id: 'rec-m1',
  current_value: '7.200000',
  current_unit: 'km/gal',
  current_measured_on: '2026-10-01',
  new_value: '6.900000',
  new_unit: 'km/gal',
  ...overrides,
});

/** Los `details` de un 409 `MEASURED_PROTECTED`: todos `measured_protected`, con el dato como texto en `message`. */
export const measuredProtectedDetails = [
  { field: 'protected_rows', message: '1', type: 'measured_protected' },
  { field: 'current_measured.id', message: 'rec-m1', type: 'measured_protected' },
  { field: 'current_measured.value', message: '7.200000', type: 'measured_protected' },
  { field: 'current_measured.unit', message: 'km/gal', type: 'measured_protected' },
  { field: 'current_measured.measured_on', message: '2026-10-01', type: 'measured_protected' },
];
