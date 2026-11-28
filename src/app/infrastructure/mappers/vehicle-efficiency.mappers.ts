import { FieldIssue } from '../../core/errors/app-error';
import { EstimationMode } from '../../domain/models/imports';
import {
  CargoUnitMode,
  EfficiencySettings,
  EfficiencySettingsChange,
  EfficiencyBasis,
  EfficiencyDeclaration,
  EfficiencyEstimate,
  EfficiencyOrigin,
  EfficiencyRecord,
  EfficiencyView,
  AppliedToPending,
  DeclareResult,
  EstimateApplyResult,
  EstimatePreview,
  EstimateScope,
  FichaApplyResult,
  FichaPreview,
  MeasuredProtection,
  VehicleEfficiency,
} from '../../domain/models/vehicle-efficiency';
import {
  EfficiencySettingsBodyDto,
  EfficiencySettingsDto,
  AppliedToPendingDto,
  DeclareBodyDto,
  DeclareOutDto,
  EfficiencyEstimateDto,
  EfficiencyRecordDto,
  EfficiencySummaryDto,
  EfficiencyViewDto,
  EstimateApplyOutDto,
  EstimateBodyDto,
  EstimatePreviewDto,
  FichaApplyOutDto,
  FichaPreviewDto,
} from '../dto/vehicle-efficiency.dto';

/** Un origen que el cliente no conoce se muestra como declarado: nunca como medido ni estimado. */
export const efficiencyOrigin = (value: string): EfficiencyOrigin => (value === 'MEASURED' || value === 'ESTIMATED' ? value : 'DECLARED');

/** Una base desconocida es «sin indicar»: no se adivina entre real y teórico. */
export const efficiencyBasis = (value: string | null | undefined): EfficiencyBasis | null => (value === 'REAL' || value === 'THEORETICAL' ? value : null);

export const toVehicleEfficiency = (dto: EfficiencySummaryDto | null | undefined): VehicleEfficiency | null =>
  dto
    ? {
        value: Number(dto.value),
        unit: dto.unit,
        origin: efficiencyOrigin(dto.origin),
        basis: efficiencyBasis(dto.basis),
        sourceKind: dto.source_kind,
        measuredOn: dto.measured_on ?? null,
        declaredAt: dto.declared_at,
      }
    : null;

export const toEfficiencyRecord = (dto: EfficiencyRecordDto): EfficiencyRecord => ({
  id: dto.id,
  value: Number(dto.value),
  unit: dto.unit,
  origin: efficiencyOrigin(dto.origin),
  basis: efficiencyBasis(dto.basis),
  sourceKind: dto.source_kind,
  note: dto.note ?? null,
  measuredOn: dto.measured_on ?? null,
  declaredByName: dto.declared_by_name ?? null,
  declaredAt: dto.declared_at,
  isCurrent: dto.is_current,
  supersededAt: dto.superseded_at ?? null,
});

const optionalNumber = (value: string | null | undefined): number | null => (value === null || value === undefined ? null : Number(value));

const toEstimate = (dto: EfficiencyEstimateDto): EfficiencyEstimate => ({
  value: Number(dto.value),
  unit: dto.unit,
  sourceCategory: dto.source_category,
  versionLabel: dto.version_label,
  tableRef: dto.table_ref,
  pageRef: dto.page_ref,
  uncertaintyLow: optionalNumber(dto.uncertainty_low),
  uncertaintyHigh: optionalNumber(dto.uncertainty_high),
  mappingConfidence: dto.mapping_confidence,
  evidenceLevel: dto.evidence_level,
  sourceShortName: dto.source_short_name ?? null,
  licenceStatus: dto.licence_status ?? null,
  licenceNotice: dto.licence_notice ?? null,
});

export const toEfficiencyView = (dto: EfficiencyViewDto): EfficiencyView => ({
  vehicleId: dto.vehicle_id,
  plate: dto.plate,
  fuelType: dto.fuel_type ?? null,
  compatibleUnits: dto.compatible_units,
  current: dto.current ? toEfficiencyRecord(dto.current) : null,
  history: {
    items: dto.history.map(toEfficiencyRecord),
    page: dto.pagination.page,
    pageSize: dto.pagination.page_size,
    total: dto.pagination.total,
    totalPages: dto.pagination.total_pages,
    hasNext: dto.pagination.has_next,
    hasPrevious: dto.pagination.has_previous,
  },
  estimationEnabled: dto.estimation_enabled === true,
  estimate: dto.estimation_enabled === true && dto.estimate ? toEstimate(dto.estimate) : null,
  estimateReason: dto.estimate_reason ?? null,
  estimateReasonLabel: dto.estimate_reason_label ?? null,
});

/** Solo viajan los campos con valor: el servidor distingue «no enviado» de «vacío». */
export function declareBody(declaration: EfficiencyDeclaration): DeclareBodyDto {
  return {
    value: declaration.value,
    unit: declaration.unit,
    origin: declaration.origin,
    ...(declaration.basis ? { basis: declaration.basis } : {}),
    ...(declaration.note ? { note: declaration.note } : {}),
    ...(declaration.measuredOn ? { measured_on: declaration.measuredOn } : {}),
    ...(declaration.confirmReplaceMeasured === true ? { confirm_replace_measured: true } : {}),
  };
}

export const toAppliedToPending = (dto: AppliedToPendingDto): AppliedToPending => ({
  tripsRecalculated: dto.trips_recalculated,
  stillPending: dto.still_pending,
  remaining: dto.remaining,
  cap: dto.cap,
  staleCalculatedTrips: dto.stale_calculated_trips,
});

export const toDeclareResult = (dto: DeclareOutDto): DeclareResult => ({ changed: dto.changed, record: toEfficiencyRecord(dto.record), applied: toAppliedToPending(dto.applied_to_pending) });

export const toFichaPreview = (dto: FichaPreviewDto): FichaPreview => ({
  token: dto.token,
  expiresAt: dto.expires_at,
  counts: {
    rows: dto.counts.rows,
    valid: dto.counts.valid,
    withIssues: dto.counts.with_issues,
    unchanged: dto.counts.unchanged,
    toCreate: dto.counts.to_create,
    toReplace: dto.counts.to_replace,
    measuredProtected: dto.counts.measured_protected ?? 0,
    pendingTrips: dto.counts.pending_trips,
  },
  issues: dto.issues.map((issue) => ({ row: issue.row, plate: issue.plate ?? null, field: issue.field, message: issue.message })),
  issuesTruncated: dto.issues_truncated,
  protectedRows: (dto.protected_rows ?? []).map((row) => ({
    row: row.row,
    plate: row.plate ?? null,
    currentValue: row.current_value,
    currentUnit: row.current_unit,
    currentMeasuredOn: row.current_measured_on ?? null,
    newValue: row.new_value,
    newUnit: row.new_unit,
  })),
  protectedTruncated: dto.protected_truncated ?? false,
  maxRows: dto.max_rows,
});

export const toFichaApplyResult = (dto: FichaApplyOutDto): FichaApplyResult => ({
  recordsCreated: dto.records_created,
  recordsReplaced: dto.records_replaced,
  recordsReplacedMeasured: dto.records_replaced_measured ?? 0,
  skippedMeasuredProtected: dto.skipped_measured_protected ?? 0,
  unchanged: dto.unchanged,
  applied: toAppliedToPending(dto.applied_to_pending),
});

/** Los dos alcances posibles del cuerpo: unos ids, o todos los pendientes (con el cursor del lote anterior); el token solo en la aplicación. */
export function estimateBody(scope: EstimateScope, token?: string): EstimateBodyDto {
  const base: EstimateBodyDto = scope.kind === 'vehicles' ? { vehicle_ids: scope.vehicleIds } : { all_pending: true, ...(scope.after ? { after: scope.after } : {}) };

  return token ? { ...base, token } : base;
}

export const toEstimatePreview = (dto: EstimatePreviewDto): EstimatePreview => ({
  token: dto.token,
  expiresAt: dto.expires_at,
  counts: {
    considered: dto.counts.considered,
    unknownVehicles: dto.counts.unknown_vehicles,
    keptVehicleEfficiency: dto.counts.kept_vehicle_efficiency,
    alreadyEstimated: dto.counts.already_estimated,
    toCreate: dto.counts.to_create,
    toRetire: dto.counts.to_retire,
    rejected: dto.counts.rejected,
    pendingTrips: dto.counts.pending_trips,
  },
  rejectedByReason: dto.rejected_by_reason.map((r) => ({ reason: r.reason, label: r.label, vehicles: r.vehicles })),
  nextCursor: dto.next_cursor ?? null,
  maxVehicles: dto.max_vehicles,
  licenceNotice: dto.licence_notice ?? null,
});

export const toEstimateApplyResult = (dto: EstimateApplyOutDto): EstimateApplyResult => ({
  recordsCreated: dto.records_created,
  recordsRetired: dto.records_retired,
  alreadyEstimated: dto.already_estimated,
  keptVehicleEfficiency: dto.kept_vehicle_efficiency,
  rejected: dto.rejected,
  rejectedByReason: dto.rejected_by_reason.map((r) => ({ reason: r.reason, label: r.label, vehicles: r.vehicles })),
  applied: toAppliedToPending(dto.applied_to_pending),
  nextCursor: dto.next_cursor ?? null,
});

const MODES: readonly EstimationMode[] = ['OFF', 'ASK', 'AUTO'];
const CARGO_MODES: readonly CargoUnitMode[] = ['ASK', 'AUTO_KG'];

/** Un valor desconocido se trata como el más prudente: sin estimar (`OFF`) y sin convertir sin preguntar (`ASK`); las opciones que no se conocen no se ofrecen. */
export const toEfficiencySettings = (dto: EfficiencySettingsDto): EfficiencySettings => ({
  mode: MODES.find((option) => option === dto.mode) ?? 'OFF',
  platformEnabled: dto.platform_enabled,
  cargoUnitMode: CARGO_MODES.find((option) => option === dto.cargo_unit_mode) ?? 'ASK',
  modeOptions: MODES.filter((option) => dto.options.includes(option)),
  cargoUnitOptions: CARGO_MODES.filter((option) => dto.cargo_unit_options.includes(option)),
});

export const settingsBody = (change: EfficiencySettingsChange): EfficiencySettingsBodyDto => ({
  ...(change.mode ? { mode: change.mode } : {}),
  ...(change.cargoUnitMode ? { cargo_unit_mode: change.cargoUnitMode } : {}),
});

/** Los `details` de un 409 `MEASURED_PROTECTED` (todos de tipo `measured_protected`): cada dato viaja como texto en `message`. Lo que no llega queda en `null`. */
export function toMeasuredProtection(details: readonly FieldIssue[]): MeasuredProtection {
  const of = (name: string): string | null => details.find((detail) => detail.type === 'measured_protected' && detail.field.split('.').slice(-2).join('.') === name)?.message ?? null;

  return { protectedRows: of('protected_rows') ?? details.find((d) => d.field.endsWith('protected_rows'))?.message ?? null, currentId: of('current_measured.id'), value: of('current_measured.value'), unit: of('current_measured.unit'), measuredOn: of('current_measured.measured_on') };
}
