import { BulkApplyDto, BulkPreviewDto, CappedCountDto, CompletionOutDto, CompletionPlateDto, CompletionPlatesPageDto, CompletionStateDto, ExportJobDto, OperationTripDto, OperationsPageDto, TabCountsDto, TripDetailDto } from '../app/infrastructure/dto/operations.dto';
import { ORG_ENVIA } from './builders';

/** URL base de Operaciones logísticas de la empresa de pruebas (sin query). */
export const OPERATIONS_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/operations/trips`;

/** Un viaje calculado del listado, con decimales como texto y lugares en mayúsculas, como en el servidor. */
export const operationTripDto = (overrides: Partial<OperationTripDto> = {}): OperationTripDto => ({
  id: 'trip-1',
  trip_id: 'VIA-001245',
  trip_date: '2026-03-15',
  plate: 'ABC123',
  origin: { code: '76892', label: 'YUMBO, VALLE DEL CAUCA' },
  destination: { code: '76520', label: 'PALMIRA, VALLE DEL CAUCA' },
  distance_km: '40.0000',
  cargo_ton: '18.0000',
  fuel_type: 'DIESEL',
  kg_co2: '50.7450',
  status: 'CALCULATED',
  state_label: 'Calculado',
  reason: null,
  reason_label: null,
  dedup_status: 'UNIQUE',
  import_file_id: '33333333-3333-4333-8333-333333333333',
  file_name: 'Viajes_marzo.xlsx',
  row_number: 128,
  vehicle: { configuration_code: 'C3S3' },
  shared: null,
  ...overrides,
});

export const operationTripDtos = (count: number, from = 1): OperationTripDto[] =>
  Array.from({ length: count }, (_, i) => operationTripDto({ id: `trip-${from + i}`, trip_id: `VIA-${String(from + i).padStart(6, '0')}`, row_number: from + i }));

export const capped = (value: number, isCapped = false): CappedCountDto => ({ value, capped: isCapped });

/** La respuesta del listado: `total` solo viaja en la primera página (sin cursor). */
export const operationsPageBody = (items: readonly OperationTripDto[], options: { next?: string | null; total?: CappedCountDto | null; limit?: number } = {}): OperationsPageDto => ({
  data: items,
  meta: { next_cursor: options.next ?? null, limit: options.limit ?? 25, ...(options.total ? { total_capped: options.total } : {}), request_id: 'req-1' },
});

export const tabCountsDto = (overrides: Partial<TabCountsDto> = {}): TabCountsDto => ({
  all: capped(254),
  calculated: capped(234),
  pending: capped(12),
  issues: capped(8),
  shared: capped(10000, true),
  ...overrides,
});

/** El detalle de un viaje calculado con todo lo que guarda el servidor. */
export const tripDetailDto = (overrides: Partial<TripDetailDto> = {}): TripDetailDto => ({
  identity: {
    id: 'trip-1',
    trip_id: 'VIA-001245',
    service_id: 'SRV-9',
    row_number: 128,
    import_file_id: '33333333-3333-4333-8333-333333333333',
    file_name: 'Viajes_marzo.xlsx',
    created_at: '2026-03-16T10:00:00Z',
    calculated_at: '2026-03-16T10:05:00Z',
  },
  trip_date: '2026-03-15',
  cargo_ton: '18.0000',
  fuel_type: 'DIESEL',
  status: 'CALCULATED',
  state_label: 'Calculado',
  reason: null,
  reason_label: null,
  plate: 'ABC123',
  vehicle: { plate: 'ABC123', configuration_code: 'C3S3', vehicle_type: 'Tractocamión', model_year: 2019, fuel_type: 'DIESEL', capacity_tons: '32.0000' },
  route: {
    origin: { code: '76892', label: 'YUMBO, VALLE DEL CAUCA' },
    destination: { code: '76520', label: 'PALMIRA, VALLE DEL CAUCA' },
    distance_km: '40.0000',
    distance_source: 'FILE',
    distance_source_label: 'Distancia del archivo',
  },
  energy: {
    method: 'ESTIMATED',
    method_label: 'Estimado',
    consumption: { quantity: '5.0000', unit: 'gal' },
    volume_normalized: { quantity: '5.0000', unit: 'gal' },
    efficiency: { quantity: '8.0000', unit: 'km/gal' },
  },
  emissions: { kg_co2: '50.7450', method: 'ESTIMATED', factor: { value: '10.1490', unit: 'kg CO2/gal', fuel_code: 'DIESEL', source_name: 'UPME', source_document: 'Factores de emisión 2024', reference_year: 2024 } },
  dedup: { status: 'UNIQUE', status_label: 'Único', rule: null, rule_label: null, resolved_by_name: null, resolved_at: null, duplicate_of: null },
  shared: null,
  history: [
    { event: 'CREATED', label: 'Viaje registrado desde la carga', at: '2026-03-16T10:00:00Z' },
    { event: 'CALCULATED', label: 'Emisiones calculadas', at: '2026-03-16T10:05:00Z' },
  ],
  ...overrides,
});

/** URL base de los reportes en segundo plano de la empresa de pruebas. */
export const EXPORTS_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/operations/exports`;

/** Un reporte en segundo plano ya generado (listo para descargar) con lo que entrega el servidor. */
export const exportJobDto = (overrides: Partial<ExportJobDto> = {}): ExportJobDto => ({
  id: 'job-1',
  status: 'COMPLETED',
  rows_total: 250000,
  rows_done: 250000,
  progress: 100,
  size_bytes: 31_457_280,
  requested_by_name: 'Laura Gómez',
  // Con medio paso de margen: «hace 5 min» y «vence en 70 h» no cambian aunque pasen milisegundos entre construir el dato y pintarlo (sin reloj falso).
  created_at: new Date(Date.now() - 5.5 * 60_000).toISOString(),
  finished_at: new Date(Date.now() - 2.5 * 60_000).toISOString(),
  expires_at: new Date(Date.now() + 70.5 * 3_600_000).toISOString(),
  error_code: null,
  downloadable: true,
  filters: { granularity: 'month' },
  ...overrides,
});

/** Un reporte generándose, con avance. */
export const runningExportDto = (done: number, overrides: Partial<ExportJobDto> = {}): ExportJobDto =>
  exportJobDto({ id: 'job-run', status: 'RUNNING', rows_done: done, progress: Math.floor((done * 100) / 250000), size_bytes: null, finished_at: null, expires_at: null, downloadable: false, ...overrides });

export const exportsBody = (...jobs: readonly ExportJobDto[]): { data: readonly ExportJobDto[]; meta: Record<string, never> } => ({ data: jobs, meta: {} });

/** URL del estado/guardado de completar un viaje y base de la vista previa y aplicación en bloque. */
export const completionUrl = (tripId: string): string => `${OPERATIONS_URL}/${tripId}/completion`;
export const COMPLETIONS_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/operations/completions`;

/** Un viaje por completar: falta el rendimiento (valor y unidad), con lo que el servidor entrega para pintar el formulario. */
export const completionStateDto = (overrides: Partial<CompletionStateDto> = {}): CompletionStateDto => ({
  trip_id: 'trip-1',
  version: 0,
  status: 'PENDING',
  reason: 'DISTANCE_WITHOUT_EFFICIENCY',
  reason_label: 'Hay distancia, pero falta el rendimiento del vehículo',
  completable: true,
  refusal: null,
  missing: ['efficiency.value', 'efficiency.unit'],
  fields: [
    { name: 'efficiency.value', label: 'Rendimiento', kind: 'number', group: 'efficiency', options: null, range: { min_exclusive: '0', max: '100' }, hint: 'Kilómetros por unidad de combustible' },
    { name: 'efficiency.unit', label: 'Unidad', kind: 'unit', group: 'efficiency', options: [{ value: 'km/gal', label: 'km/gal' }, { value: 'km/l', label: 'km/l' }], range: null, hint: null },
  ],
  ...overrides,
});

/** Un viaje pendiente del detalle con su estado completable. */
export const pendingTripDetailDto = (overrides: Partial<TripDetailDto> = {}): TripDetailDto =>
  tripDetailDto({
    status: 'PENDING',
    state_label: 'Por completar',
    reason: 'DISTANCE_WITHOUT_EFFICIENCY',
    reason_label: 'Hay distancia, pero falta el rendimiento del vehículo',
    emissions: null,
    energy: { method: null, method_label: null, consumption: { quantity: null, unit: null }, volume_normalized: { quantity: null, unit: null }, efficiency: { quantity: null, unit: null } },
    completable: true,
    missing_fields: ['efficiency.value', 'efficiency.unit'],
    ...overrides,
  });

/** La respuesta de guardar: el viaje ya calculado por el servidor. */
export const completionOutDto = (overrides: Partial<CompletionOutDto> = {}): CompletionOutDto => ({
  changed: true,
  version: 1,
  trip: tripDetailDto({
    corrected: { at: '2026-11-24T10:00:00Z', by_name: 'Laura Gómez' },
    correction_version: 1,
    declared: { fields: ['efficiency.value', 'efficiency.unit'], fuel_type: 'DIESEL', consumption: { quantity: null, unit: null }, efficiency: { quantity: null, unit: null }, distance_km: '40.0000' },
  }),
  result: { previous_status: 'PENDING', status: 'CALCULATED', reason: null, reason_label: null, method_label: 'Estimado', kg_co2: '50.7450', counted: true, counted_note: null },
  ...overrides,
});

export const bulkPreviewDto = (overrides: Partial<BulkPreviewDto> = {}): BulkPreviewDto => ({
  token: 'token-de-confirmacion-1',
  expires_at: '2026-11-24T12:00:00Z',
  cap: 5000,
  per_plate: [
    { plate: 'ABC123', affected: 214, would_calculate: 200, would_remain_pending: 14, held: 3, skipped_incompatible: 0 },
    { plate: 'XYZ987', affected: 87, would_calculate: 80, would_remain_pending: 7, held: 0, skipped_incompatible: 2 },
  ],
  totals: { affected: 301, would_calculate: 280, would_remain_pending: 21, held: 3, skipped_incompatible: 2, expected_kg_co2: '12345.678' },
  ...overrides,
});

export const bulkApplyDto = (overrides: Partial<BulkApplyDto> = {}): BulkApplyDto => ({ applied: 301, already_completed: 0, now_calculated: 280, still_pending: 21, held: 3, skipped_incompatible: 2, ...overrides });

/** Una placa por completar. Sin unidad declarada ofrece las del servidor; con ella no hay opciones que elegir. */
export const completionPlateDto = (n: number, overrides: Partial<CompletionPlateDto> = {}): CompletionPlateDto => ({
  plate: `PLA${String(n).padStart(3, '0')}`,
  trips: 30 + n,
  fuel_type: 'DIESEL',
  fuel_label: 'Diésel',
  efficiency_unit: null,
  unit_options: [{ value: 'km/gal', label: 'km/gal' }, { value: 'km/l', label: 'km/l' }],
  ...overrides,
});

/** La respuesta del listado de placas: `data` + `meta` con cursor y, solo en la primera página, el total. */
export const completionPlatesBody = (plates: readonly CompletionPlateDto[], meta: Partial<CompletionPlatesPageDto['meta']> = {}): CompletionPlatesPageDto => ({
  data: plates,
  meta: { next_cursor: null, limit: 6, total_plates: null, request_id: 'r-1', ...meta },
});
