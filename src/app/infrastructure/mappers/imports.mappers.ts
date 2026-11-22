import {
  CandidateDecision,
  ColumnRequirement,
  ImportColumn,
  ImportCounts,
  ImportCreated,
  ImportDetail,
  ImportFormat,
  ImportPeriod,
  ImportReview,
  ImportStatus,
  ImportSummary,
  IssueSeverity,
  PendingReason,
  ReviewIssue,
  VehicleCandidate,
  VehicleCandidateKind,
  VehicleDecisionRequest,
  VehicleDecisionResult,
} from '../../domain/models/imports';
import {
  ImportColumnDto,
  ImportCountsDto,
  ImportCreatedDto,
  ImportPeriodDto,
  ImportDetailDto,
  ImportReviewDto,
  ImportSummaryDto,
  PendingReasonDto,
  ReviewIssueDto,
  VehicleCandidateDto,
  VehicleDecisionBodyDto,
  VehicleDecisionResultDto,
} from '../dto/imports.dto';

const STATUSES: readonly ImportStatus[] = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'];
const FORMATS: readonly ImportFormat[] = ['LOGYCO2_TEMPLATE', 'CARITRANS', 'UNRECOGNIZED'];
const REQUIREMENTS: readonly ColumnRequirement[] = ['REQUIRED', 'CONDITIONAL', 'RECOMMENDED', 'OPTIONAL'];
const SEVERITIES: readonly IssueSeverity[] = ['ERROR', 'WARNING', 'INFO'];

const KINDS: readonly VehicleCandidateKind[] = ['NEW', 'CHANGED', 'UNCHANGED'];
const DECISIONS: readonly CandidateDecision[] = ['PENDING', 'ACCEPTED', 'REJECTED'];

const known = <T extends string>(options: readonly T[], value: string, fallback: T): T => options.find((option) => option === value) ?? fallback;

/** Un estado desconocido no se presenta como terminado bien: se trata como fallido. */
export const importStatus = (value: string): ImportStatus => known(STATUSES, value, 'FAILED');

/** Un formato que no se reconoce se muestra como «No reconocido». */
const importFormat = (value: string): ImportFormat => known(FORMATS, value, 'UNRECOGNIZED');

export function toImportSummary(dto: ImportSummaryDto): ImportSummary {
  return {
    id: dto.id,
    fileName: dto.file_name,
    fileSize: dto.file_size,
    status: importStatus(dto.status),
    phase: dto.phase,
    format: dto.format === null ? null : importFormat(dto.format),
    rowsTotal: dto.rows_total,
    rowsProcessed: dto.rows_processed,
    createdAt: dto.created_at,
    finishedAt: dto.finished_at,
    createdByName: dto.created_by_name,
    headline: dto.headline
      ? {
          rowsRead: dto.headline.rows_read,
          realConsumption: dto.headline.real_consumption,
          estimatedConsumption: dto.headline.estimated_consumption,
          pending: dto.headline.pending,
        }
      : null,
    ...(dto.vehicles_detected
      ? {
          vehiclesDetected: {
            new: dto.vehicles_detected.new,
            changed: dto.vehicles_detected.changed,
            unchanged: dto.vehicles_detected.unchanged,
            pendingDecision: dto.vehicles_detected.pending_decision,
          },
        }
      : {}),
    error: dto.error,
  };
}

const toColumn = (dto: ImportColumnDto): ImportColumn => ({
  field: dto.field,
  label: dto.label,
  // Sin una obligatoriedad reconocible se trata como opcional: no se inventa una exigencia.
  requirement: known(REQUIREMENTS, dto.requirement, 'OPTIONAL'),
  found: dto.found,
  sourceHeader: dto.source_header,
  filledRows: dto.filled_rows,
});

const toReason = (dto: PendingReasonDto): PendingReason => ({ code: dto.code, label: dto.label, rows: dto.rows, sampleRows: dto.sample_rows });

const toIssue = (dto: ReviewIssueDto): ReviewIssue => ({
  code: dto.code,
  // Sin severidad reconocible se muestra la más alta: no se minimiza un hallazgo.
  severity: known(SEVERITIES, dto.severity, 'ERROR'),
  field: dto.field,
  message: dto.message,
  rows: dto.rows,
  sampleRows: dto.sample_rows,
});

const toReview = (dto: ImportReviewDto): ImportReview => ({
  format: importFormat(dto.format),
  rowsRead: dto.rows_read,
  columns: dto.columns.map(toColumn),
  methods: { realConsumption: dto.methods.real_consumption, estimatedConsumption: dto.methods.estimated_consumption, pending: dto.methods.pending },
  pendingReasons: dto.pending_reasons.map(toReason),
  issues: dto.issues.map(toIssue),
  vehicles: { distinctPlates: dto.vehicles.distinct_plates, invalidPlates: dto.vehicles.invalid_plates },
  trips: { distinctTripIds: dto.trips.distinct_trip_ids, repeatedTripIds: dto.trips.repeated_trip_ids },
  period: dto.period?.from && dto.period.to ? { from: dto.period.from, to: dto.period.to } : null,
});

export const toImportDetail = (dto: ImportDetailDto): ImportDetail => ({ ...toImportSummary(dto), review: dto.review ? toReview(dto.review) : null });

export const toImportPeriod = (dto: ImportPeriodDto): ImportPeriod => ({ from: dto.period_from, to: dto.period_to, imports: dto.imports ?? 0, rowsRead: dto.rows_read ?? 0 });

export const toImportCounts = (dto: ImportCountsDto): ImportCounts => ({
  total: dto.total,
  inProgress: dto.in_progress,
  completed: dto.completed,
  failed: dto.failed,
  vehiclesPending: dto.vehicles_pending,
  rowsRead: dto.rows_read ?? 0,
  rowsCalculable: dto.rows_calculable ?? 0,
  rowsPending: dto.rows_pending ?? 0,
  rowsReal: dto.rows_real ?? 0,
  rowsEstimated: dto.rows_estimated ?? 0,
  vehiclesNewPending: dto.vehicles_new_pending ?? 0,
  vehiclesChangedPending: dto.vehicles_changed_pending ?? 0,
  periodFrom: dto.period_from ?? null,
  periodTo: dto.period_to ?? null,
  distanceKm: dto.distance_km ?? 0,
  cargoTon: dto.cargo_ton ?? 0,
  rowsWithDistance: dto.rows_with_distance ?? 0,
  rowsWithCargo: dto.rows_with_cargo ?? 0,
});

export const toImportCreated = (dto: ImportCreatedDto): ImportCreated => ({ id: dto.id, status: importStatus(dto.status), duplicate: dto.duplicate });

/** Valor de un cambio: siempre texto o `null`, venga como venga del servidor. */
const text = (value: unknown): string | null => (value === null || value === undefined || value === '' ? null : String(value));

export const toVehicleCandidate = (dto: VehicleCandidateDto): VehicleCandidate => ({
  id: dto.id,
  plate: dto.plate,
  plateOriginal: dto.plate_original,
  // Un tipo desconocido se trata como «sin cambios»: no ofrece acciones que el servidor no definió.
  kind: known(KINDS, dto.kind, 'UNCHANGED'),
  // Una decisión desconocida se trata como ya decidida (omitida): nunca se ofrece decidir de nuevo sobre algo que no se entiende.
  decision: known(DECISIONS, dto.decision, 'REJECTED'),
  proposed: {
    configurationCode: dto.proposed.configuration_code,
    modelYear: dto.proposed.model_year,
    fuelType: dto.proposed.fuel_type,
    vehicleType: dto.proposed.vehicle_type,
  },
  fuelLabel: dto.fuel_label ?? null,
  changes: (dto.changes ?? []).map((change) => ({ field: change.field, label: change.label, before: text(change.before), after: text(change.after) })),
  conflicts: dto.conflicts.map((conflict) => ({ field: conflict.field, label: conflict.label })),
  tripRows: dto.trip_rows,
  inactive: dto.inactive,
  vehicleId: dto.vehicle_id,
});

/** Exactamente uno de los dos selectores: la lista de ids o el tipo. */
export const toDecisionBody = (request: VehicleDecisionRequest): VehicleDecisionBodyDto =>
  'candidateIds' in request ? { decision: request.decision, candidate_ids: request.candidateIds } : { decision: request.decision, kind: request.kind };

export const toDecisionResult = (dto: VehicleDecisionResultDto): VehicleDecisionResult => ({
  accepted: dto.accepted,
  rejected: dto.rejected,
  skipped: dto.skipped,
  skippedReasons: dto.skipped_reasons.map((reason) => ({ code: reason.code, rows: reason.rows })),
});
