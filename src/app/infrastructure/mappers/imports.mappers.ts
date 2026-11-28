import {
  CandidateDecision,
  CalculableWithEstimation,
  CargoUnit,
  CargoUnitApplied,
  CargoUnitBasis,
  CargoUnitProposal,
  CargoUnitResult,
  CargoUnitSource,
  CargoUnitStatus,
  CoverageCount,
  EfficiencyConsentResult,
  EfficiencyCoverage,
  EstimationMode,
  ColumnRequirement,
  ImportColumn,
  ImportCounts,
  ImportCreated,
  ImportDetail,
  ImportFormat,
  ImportNotCalculable,
  ImportPeriod,
  ImportReview,
  ImportRoutes,
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
import { toImportFootprint } from './footprint.mappers';
import { toPlaceResolution } from './places.mappers';
import {
  CalculableWithEstimationDto,
  CargoUnitAppliedDto,
  CargoUnitProposalDto,
  CargoUnitResultDto,
  CoverageCountDto,
  EfficiencyConsentBodyDto,
  EfficiencyConsentResultDto,
  EfficiencyCoverageDto,
  ImportColumnDto,
  ImportCountsDto,
  ImportCreatedDto,
  ImportPeriodDto,
  ImportDetailDto,
  ImportReviewDto,
  ImportNotCalculableDto,
  ImportRoutesDto,
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

const CARGO_STATUSES: readonly CargoUnitStatus[] = ['KG_LIKELY', 'AMBIGUOUS'];
const CARGO_BASES: readonly CargoUnitBasis[] = ['CAPACITY', 'PLAUSIBLE_RANGE'];
const CARGO_UNITS: readonly CargoUnit[] = ['KG', 'TON'];
const CARGO_SOURCES: readonly CargoUnitSource[] = ['HEADER', 'COMPANY_SETTING', 'ADMIN'];
const MODES: readonly EstimationMode[] = ['OFF', 'ASK', 'AUTO'];

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
    startedAt: dto.started_at ?? null,
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
    ...(dto.not_calculable ? { notCalculable: { acknowledgedAt: dto.not_calculable.acknowledged_at } } : {}),
    error: dto.error,
  };
}

export const toNotCalculable = (dto: ImportNotCalculableDto): ImportNotCalculable => ({ acknowledgedAt: dto.acknowledged_at });

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
  examples: dto.examples ?? [],
});

const toRoutes = (dto: ImportRoutesDto): ImportRoutes => ({
  level: dto.level,
  approximate: dto.approximate,
  provider: dto.provider,
  datasetVersion: dto.dataset_version,
  pairsTotal: dto.pairs_total,
  pairsResolved: dto.pairs_resolved,
  pairsUnresolved: dto.pairs_unresolved,
  rowsResolved: dto.rows_resolved,
  rowsUnresolved: dto.rows_unresolved,
  rowsByUniqueName: dto.rows_by_unique_name ?? 0,
});

/** Un estado desconocido se trata como ambiguo: solo informa y nunca ofrece convertir lo que no se entiende. */
const toCargoProposal = (dto: CargoUnitProposalDto): CargoUnitProposal => ({
  status: known(CARGO_STATUSES, dto.status, 'AMBIGUOUS'),
  basis: known(CARGO_BASES, dto.basis, 'PLAUSIBLE_RANGE'),
  message: dto.message,
  evidence: {
    rowsWithCargo: dto.evidence.rows_with_cargo,
    rowsOverLimit: dto.evidence.rows_over_limit,
    shareOverLimitPct: dto.evidence.share_over_limit_pct,
    limitTon: dto.evidence.limit_ton,
    medianValue: dto.evidence.median_value,
    medianAsTonsIfKg: dto.evidence.median_as_tons_if_kg,
    medianCapacityTon: dto.evidence.median_capacity_ton,
    medianPctOfCapacity: dto.evidence.median_pct_of_capacity,
    rowsWithCapacity: dto.evidence.rows_with_capacity,
    rowsOverCapacityIfKg: dto.evidence.rows_over_capacity_if_kg,
    medianExact: dto.evidence.median_exact,
    rowsStillOutOfRangeIfKg: dto.evidence.rows_still_out_of_range_if_kg,
    totalTonIfKg: dto.evidence.total_ton_if_kg,
    rowsWithCargoIfKg: dto.evidence.rows_with_cargo_if_kg,
  },
});

const toCargoApplied = (dto: CargoUnitAppliedDto): CargoUnitApplied => ({
  unit: known(CARGO_UNITS, dto.unit, 'TON'),
  // Sin una fuente reconocible se atribuye a una persona: no se inventa un automatismo.
  source: known(CARGO_SOURCES, dto.source, 'ADMIN'),
  confirmedAt: dto.confirmed_at,
  header: dto.header ?? null,
});

const count = (dto: CoverageCountDto): CoverageCount => ({ vehicles: dto.vehicles, trips: dto.trips });

/** Un modo desconocido se trata como apagado: no se ofrece estimar lo que no se entiende. */
const toCoverage = (dto: EfficiencyCoverageDto): EfficiencyCoverage => ({
  estimation: {
    platformEnabled: dto.estimation.platform_enabled,
    mode: known(MODES, dto.estimation.mode, 'OFF'),
    requiresConsent: dto.estimation.requires_consent,
    canEstimate: dto.estimation.can_estimate,
    consent: dto.estimation.consent ? { estimate: dto.estimation.consent.estimate } : null,
  },
  vehiclesInFile: dto.vehicles_in_file,
  withOwnEfficiency: count(dto.with_own_efficiency),
  alreadyEstimated: count(dto.already_estimated),
  without: {
    ...count(dto.without_efficiency),
    estimable: {
      ...count(dto.without_efficiency.estimable),
      unregisteredVehicles: dto.without_efficiency.estimable.unregistered_vehicles,
      references: dto.without_efficiency.estimable.references.map((reference) => ({
        source: reference.source,
        valueKmPerGal: reference.value_km_per_gal,
        unit: reference.unit,
        uncertaintyLow: reference.uncertainty_low,
        uncertaintyHigh: reference.uncertainty_high,
        licenceStatus: reference.licence_status,
        vehicles: reference.vehicles,
        trips: reference.trips,
        unregisteredVehicles: reference.unregistered_vehicles,
      })),
    },
    blockedByLicence: { ...count(dto.without_efficiency.blocked_by_licence), unregisteredVehicles: dto.without_efficiency.blocked_by_licence.unregistered_vehicles, message: dto.without_efficiency.blocked_by_licence.message },
    noReference: { ...count(dto.without_efficiency.no_reference), reasons: dto.without_efficiency.no_reference.reasons.map((reason) => ({ code: reason.code, label: reason.label, vehicles: reason.vehicles, trips: reason.trips })) },
  },
  tripsWithoutDistance: count(dto.trips_without_distance),
});

export const toCargoUnitResult = (dto: CargoUnitResultDto): CargoUnitResult => ({
  unit: known(CARGO_UNITS, dto.unit, 'TON'),
  confirmedAt: dto.confirmed_at,
  rowsUpdated: dto.rows_updated,
  rowsConverted: dto.rows_converted,
  unchanged: dto.unchanged,
});

export const toConsentBody = (estimate: boolean): EfficiencyConsentBodyDto => ({ estimate_efficiency: estimate });

export const toConsentResult = (dto: EfficiencyConsentResultDto): EfficiencyConsentResult => ({
  mode: known(MODES, dto.mode, 'OFF'),
  estimateEfficiency: dto.estimate_efficiency,
  vehiclesEstimated: dto.vehicles_estimated,
  tripsCalculated: dto.trips_calculated,
  tripsStillPending: dto.trips_still_pending,
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
  routes: dto.routes ? toRoutes(dto.routes) : null,
  totals: { distanceFromRoutesKm: dto.totals?.distance_from_routes_km ?? 0 },
  cargoUnitProposal: dto.cargo_unit_proposal ? toCargoProposal(dto.cargo_unit_proposal) : null,
  cargoUnitApplied: dto.cargo_unit_applied ? toCargoApplied(dto.cargo_unit_applied) : null,
  efficiencyCoverage: dto.efficiency_coverage ? toCoverage(dto.efficiency_coverage) : null,
  placeResolution: dto.place_resolution ? toPlaceResolution(dto.place_resolution) : null,
});

/** Un modo que no es ASK ni AUTO (u OFF) no se ofrece como estimable: sin bloque. */
const toCalculableWithEstimation = (dto: CalculableWithEstimationDto | null | undefined): CalculableWithEstimation | null =>
  dto && (dto.mode === 'ASK' || dto.mode === 'AUTO')
    ? { trips: dto.trips, vehicles: dto.vehicles, alreadyEstimatedTrips: dto.already_estimated_trips ?? 0, mode: dto.mode, requiresConsent: dto.requires_consent === true, pendingWithoutDistanceOrReference: dto.pending_without_distance_or_reference ?? 0 }
    : null;

export const toImportDetail = (dto: ImportDetailDto): ImportDetail => ({ ...toImportSummary(dto), calculableWithEstimation: toCalculableWithEstimation(dto.calculable_with_estimation), review: dto.review ? toReview(dto.review) : null, footprint: dto.footprint ? toImportFootprint(dto.footprint) : null });

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
  distanceFromRoutesKm: dto.distance_from_routes_km ?? 0,
});

export const toImportCreated = (dto: ImportCreatedDto): ImportCreated => ({ id: dto.id, status: importStatus(dto.status), duplicate: dto.duplicate, fileName: dto.file_name ?? null, createdAt: dto.created_at ?? null });

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
    technology: dto.proposed.technology ?? null,
    capacityTons: dto.proposed.capacity_tons ?? null,
  },
  fuelLabel: dto.fuel_label ?? null,
  changes: (dto.changes ?? []).map((change) => ({ field: change.field, label: change.label, before: text(change.before), after: text(change.after) })),
  conflicts: dto.conflicts.map((conflict) => ({ field: conflict.field, label: conflict.label })),
  tripRows: dto.trip_rows,
  inactive: dto.inactive,
  vehicleId: dto.vehicle_id,
});

/** Exactamente uno de los dos selectores: la lista de ids o el tipo. */
export const toDecisionBody = (request: VehicleDecisionRequest): VehicleDecisionBodyDto => {
  const selector = 'candidateIds' in request ? { decision: request.decision, candidate_ids: request.candidateIds } : { decision: request.decision, kind: request.kind };

  return request.estimateEfficiency === undefined ? selector : { ...selector, estimate_efficiency: request.estimateEfficiency };
};

export const toDecisionResult = (dto: VehicleDecisionResultDto): VehicleDecisionResult => ({
  accepted: dto.accepted,
  rejected: dto.rejected,
  skipped: dto.skipped,
  skippedReasons: dto.skipped_reasons.map((reason) => ({ code: reason.code, rows: reason.rows })),
  vehiclesEstimated: dto.vehicles_estimated ?? 0,
  tripsEstimated: dto.trips_estimated ?? 0,
  remaining: dto.remaining,
});
