import {
  AnalysisCounts,
  AnalysisSummary,
  AnalysisCreated,
  AnalysisStatus,
  ConfirmResult,
  ConfirmSelection,
  DifferenceKind,
  DifferenceSeverity,
  Finding,
  FindingDecision,
  FindingDifference,
  FindingState,
  NewVehicle,
  NotificationItem,
  NotificationSeverity,
  ResolveRequest,
  Vehicle,
  VehicleAnalysis,
  VehicleAppearance,
  VehicleAttributes,
  VehicleChange,
  VehicleChanges,
  VehicleDetail,
  VehicleHistoryEntry,
  VehicleOwnership,
  VehicleStatus,
  VehicleSummary,
  InFileConflict,
} from '../../domain/models/vehicles';
import {
  AnalysisCountsDto,
  AnalysisSummaryDto,
  AnalysisCreatedDto,
  ConfirmBodyDto,
  ConfirmResultDto,
  FindingDifferenceDto,
  FindingDto,
  InFileConflictDto,
  NotificationDto,
  ResolveBodyDto,
  VehicleAnalysisDto,
  VehicleAppearanceDto,
  VehicleAttributesDto,
  VehicleChangeDto,
  VehicleCreateDto,
  VehicleDetailDto,
  VehicleDto,
  VehicleHistoryEntryDto,
  VehiclePatchDto,
  VehicleSummaryDto,
} from '../dto/vehicles.dto';

const OWNERSHIPS: readonly VehicleOwnership[] = ['UNKNOWN', 'OWN', 'CONTRACTED', 'THIRD_PARTY', 'SUBCONTRACTED'];
const ANALYSIS_STATUSES: readonly AnalysisStatus[] = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'];
const FINDING_STATES: readonly FindingState[] = ['NEW', 'CONFLICT', 'INCOMPLETE', 'INVALID', 'KNOWN'];
const FINDING_DECISIONS: readonly FindingDecision[] = ['PENDING', 'CONFIRMED', 'REJECTED', 'DEFERRED'];
const KINDS: readonly DifferenceKind[] = ['STRUCTURAL', 'CHANGEABLE', 'MISSING', 'REFINEMENT', 'UNIT'];
const SEVERITIES: readonly DifferenceSeverity[] = ['HIGH', 'MEDIUM', 'LOW', 'INFO'];
const NOTIFICATION_SEVERITIES: readonly NotificationSeverity[] = ['INFO', 'WARNING', 'SUCCESS'];

const known = <T extends string>(options: readonly T[], value: string, fallback: T): T => options.find((option) => option === value) ?? fallback;

/** Cuerpo JSON solo con los campos informados (el servidor distingue «no enviado» de «vacío»). */
const defined = <T extends object>(body: T): T => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as T;

/** Valor de un campo en el historial o en una diferencia: siempre texto o `null`, venga como venga del servidor. */
const text = (value: unknown): string | null => (value === null || value === undefined || value === '' ? null : String(value));

/** La propiedad nunca se infiere: un valor fuera del catálogo se trata como «sin declarar». */
const ownership = (value: string): VehicleOwnership => known(OWNERSHIPS, value, 'UNKNOWN');

/** Un estado desconocido se trata como el más restrictivo (inactivo), nunca como activo. */
const vehicleStatus = (value: string): VehicleStatus => (value === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE');

export function toVehicle(dto: VehicleDto): Vehicle {
  return {
    id: dto.id,
    plate: dto.plate,
    plateOriginal: dto.plate_original,
    country: dto.country,
    configurationCode: dto.configuration_code,
    configurationRecognized: dto.configuration_recognized,
    vehicleType: dto.vehicle_type,
    fuelType: dto.fuel_type,
    modelYear: dto.model_year,
    technology: dto.technology,
    capacityTons: dto.capacity_tons,
    ownership: ownership(dto.ownership),
    status: vehicleStatus(dto.status),
    source: dto.source === 'MANUAL' ? 'MANUAL' : 'IMPORT',
    firstSeenAt: dto.first_seen_at,
    lastSeenAt: dto.last_seen_at,
    createdAt: dto.created_at,
  };
}

const toChange = (dto: VehicleChangeDto): VehicleChange => ({ field: dto.field, before: text(dto.before), after: text(dto.after) });

const toHistoryEntry = (dto: VehicleHistoryEntryDto): VehicleHistoryEntry => ({
  id: dto.id,
  event: dto.event,
  at: dto.at,
  actorName: dto.actor_name,
  changes: dto.changes.map(toChange),
  runId: dto.run_id,
});

const toAppearance = (dto: VehicleAppearanceDto): VehicleAppearance => ({
  runId: dto.run_id,
  fileName: dto.file_name,
  at: dto.at,
  occurrences: dto.occurrences,
});

export function toVehicleDetail(dto: VehicleDetailDto): VehicleDetail {
  return { ...toVehicle(dto), history: dto.history.map(toHistoryEntry), runs: dto.runs.map(toAppearance) };
}

export const toVehicleSummary = (dto: VehicleSummaryDto): VehicleSummary => ({
  registered: dto.registered,
  pendingNew: dto.pending_new,
  conflicts: dto.conflicts,
  inactive: dto.inactive,
});

/** La placa se envía tal como se escribió (recortada): el servidor la normaliza y valida. */
export function vehicleBody(vehicle: NewVehicle): VehicleCreateDto {
  return defined({
    plate: vehicle.plate.trim(),
    country: vehicle.country,
    configuration_code: vehicle.configurationCode,
    vehicle_type: vehicle.vehicleType,
    fuel_type: vehicle.fuelType,
    model_year: vehicle.modelYear,
    technology: vehicle.technology,
    capacity_tons: vehicle.capacityTons,
    ownership: vehicle.ownership,
  });
}

export function vehiclePatchBody(changes: VehicleChanges): VehiclePatchDto {
  return defined({
    configuration_code: changes.configurationCode,
    vehicle_type: changes.vehicleType,
    fuel_type: changes.fuelType,
    model_year: changes.modelYear,
    technology: changes.technology,
    capacity_tons: changes.capacityTons,
    ownership: changes.ownership,
    status: changes.status,
    confirm_structural: changes.confirmStructural,
  });
}

// ---------------------------------------------------------------- análisis

export const toAnalysisCreated = (dto: AnalysisCreatedDto): AnalysisCreated => ({
  id: dto.id,
  status: known(ANALYSIS_STATUSES, dto.status, 'QUEUED'),
  duplicate: dto.duplicate,
});

const toCounts = (dto: AnalysisCountsDto): AnalysisCounts => ({
  detected: dto.detected,
  known: dto.known,
  new: dto.new,
  conflict: dto.conflict,
  incomplete: dto.incomplete,
  invalid: dto.invalid,
});

export const toAnalysisSummary = (dto: AnalysisSummaryDto): AnalysisSummary => ({
  id: dto.id,
  fileName: dto.file_name,
  status: known(ANALYSIS_STATUSES, dto.status, 'FAILED'),
  createdAt: dto.created_at,
  finishedAt: dto.finished_at,
  counts: toCounts(dto.counts),
  pending: { new: dto.pending.new, conflict: dto.pending.conflict, incomplete: dto.pending.incomplete, invalid: dto.pending.invalid },
});

export const toAnalysis = (dto: VehicleAnalysisDto): VehicleAnalysis => ({
  id: dto.id,
  fileName: dto.file_name,
  // Un estado que no se reconoce no se presenta como terminado bien.
  status: known(ANALYSIS_STATUSES, dto.status, 'FAILED'),
  phase: dto.phase,
  rowsProcessed: dto.rows_processed,
  rowsTotal: dto.rows_total,
  counts: toCounts(dto.counts),
  error: dto.error,
  createdAt: dto.created_at,
  finishedAt: dto.finished_at,
});

const toAttributes = (dto: VehicleAttributesDto): VehicleAttributes => ({
  configurationCode: dto.configuration_code,
  vehicleType: dto.vehicle_type,
  fuelType: dto.fuel_type,
  modelYear: dto.model_year,
  technology: dto.technology,
  capacityTons: dto.capacity_tons,
});

const toDifference = (dto: FindingDifferenceDto): FindingDifference => ({
  field: dto.field,
  current: text(dto.current),
  incoming: text(dto.incoming),
  kind: known(KINDS, dto.kind, 'CHANGEABLE'),
  // Sin severidad reconocible se muestra la más alta: no se minimiza una diferencia.
  severity: known(SEVERITIES, dto.severity, 'HIGH'),
  recommendedAction: dto.recommended_action,
});

const toInFileConflict = (dto: InFileConflictDto): InFileConflict => ({
  field: dto.field,
  values: dto.values.map((v) => ({ value: text(v.value), count: v.count, rows: v.rows })),
  overflow: dto.overflow ?? false,
});

export const toFinding = (dto: FindingDto): Finding => ({
  id: dto.id,
  plate: dto.plate,
  plateOriginal: dto.plate_original,
  state: known(FINDING_STATES, dto.state, 'INVALID'),
  decision: known(FINDING_DECISIONS, dto.decision, 'PENDING'),
  detected: toAttributes(dto.detected),
  current: dto.current ? toAttributes(dto.current) : null,
  differences: dto.differences.map(toDifference),
  occurrences: dto.occurrences,
  sampleRows: dto.sample_rows,
  inFileConflict: dto.in_file_conflict,
  invalidReason: dto.invalid_reason,
  inFileConflicts: (dto.in_file_conflicts ?? []).map(toInFileConflict),
  configurationRecognized: dto.configuration_recognized ?? null,
  unreadableFields: dto.unreadable_fields ?? [],
});

export const confirmBody = (selection: ConfirmSelection): ConfirmBodyDto => defined({ finding_ids: selection.findingIds, all_new: selection.allNew });

export const toConfirmResult = (dto: ConfirmResultDto): ConfirmResult => ({
  registered: dto.registered,
  alreadyRegistered: dto.already_registered,
  skipped: dto.skipped,
});

export const resolveBody = (request: ResolveRequest): ResolveBodyDto =>
  defined({ action: request.action, fields: request.fields, confirm_structural: request.confirmStructural });

// ---------------------------------------------------------------- notificaciones

export const toNotification = (dto: NotificationDto): NotificationItem => ({
  id: dto.id,
  type: dto.type,
  severity: known(NOTIFICATION_SEVERITIES, dto.severity, 'INFO'),
  title: dto.title,
  description: dto.description,
  createdAt: dto.created_at,
  read: dto.read,
  runId: dto.run_id,
  deepLink: { path: dto.deep_link.path, query: dto.deep_link.query ?? {} },
});
