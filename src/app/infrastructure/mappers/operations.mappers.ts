import { BulkApplyResult, BulkPreview, BulkScope, CappedCount, CompletionField, CompletionInput, CompletionOutcome, CompletionState, ExportJob, OperationTrip, OperationsPage, SharedState, SharedStateCode, TabCounts, TripDetail, TripPlace, TripQuantity, TripStatus } from '../../domain/models/operations';
import { BulkApplyDto, BulkPreviewDto, BulkScopeDto, CappedCountDto, CompletionFieldDto, CompletionBodyDto, CompletionOutDto, CompletionStateDto, ExportJobDto, OperationPlaceDto, OperationQuantityDto, OperationSharedDto, OperationTripDto, OperationsPageDto, TabCountsDto, TripDetailDto } from '../dto/operations.dto';

/** Un decimal que llega como texto («300.0000»); vacío o no numérico es «sin dato», nunca 0. */
const decimal = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const place = (dto: OperationPlaceDto): TripPlace => ({ code: dto.code ?? null, label: dto.label ?? null });
const quantity = (dto: OperationQuantityDto): TripQuantity => ({ quantity: decimal(dto.quantity), unit: dto.unit ?? null });
const shared = (dto: OperationSharedDto | null | undefined): SharedState | null => (dto ? { state: dto.state as SharedStateCode, label: dto.label } : null);
const capped = (dto: CappedCountDto): CappedCount => ({ value: dto.value, capped: dto.capped === true });

export const toOperationTrip = (dto: OperationTripDto): OperationTrip => ({
  id: dto.id,
  tripId: dto.trip_id ?? null,
  tripDate: dto.trip_date ?? null,
  plate: dto.plate ?? null,
  origin: place(dto.origin),
  destination: place(dto.destination),
  distanceKm: decimal(dto.distance_km),
  cargoTon: decimal(dto.cargo_ton),
  fuelType: dto.fuel_type ?? null,
  kgCo2: decimal(dto.kg_co2),
  status: dto.status as TripStatus,
  stateLabel: dto.state_label,
  reason: dto.reason ?? null,
  reasonLabel: dto.reason_label ?? null,
  dedupStatus: dto.dedup_status,
  importFileId: dto.import_file_id,
  fileName: dto.file_name,
  rowNumber: dto.row_number,
  configurationCode: dto.vehicle?.configuration_code ?? null,
  shared: shared(dto.shared),
  corrected: dto.corrected === true,
});

export const toOperationsPage = (dto: OperationsPageDto): OperationsPage => ({
  items: dto.data.map(toOperationTrip),
  limit: dto.meta.limit,
  nextCursor: dto.meta.next_cursor ?? null,
  total: dto.meta.total_capped ? capped(dto.meta.total_capped) : null,
});

export const toTabCounts = (dto: TabCountsDto): TabCounts => ({
  all: capped(dto.all),
  calculated: capped(dto.calculated),
  pending: capped(dto.pending),
  issues: capped(dto.issues),
  shared: capped(dto.shared),
});

export const toTripDetail = (dto: TripDetailDto): TripDetail => ({
  id: dto.identity.id,
  tripId: dto.identity.trip_id ?? null,
  serviceId: dto.identity.service_id ?? null,
  rowNumber: dto.identity.row_number,
  importFileId: dto.identity.import_file_id,
  fileName: dto.identity.file_name,
  createdAt: dto.identity.created_at,
  calculatedAt: dto.identity.calculated_at ?? null,
  tripDate: dto.trip_date ?? null,
  cargoTon: decimal(dto.cargo_ton),
  fuelType: dto.fuel_type ?? null,
  status: dto.status as TripStatus,
  stateLabel: dto.state_label,
  reason: dto.reason ?? null,
  reasonLabel: dto.reason_label ?? null,
  plate: dto.plate ?? null,
  vehicle: dto.vehicle
    ? {
        plate: dto.vehicle.plate ?? null,
        configurationCode: dto.vehicle.configuration_code ?? null,
        vehicleType: dto.vehicle.vehicle_type ?? null,
        modelYear: dto.vehicle.model_year ?? null,
        fuelType: dto.vehicle.fuel_type ?? null,
        capacityTons: decimal(dto.vehicle.capacity_tons),
      }
    : null,
  origin: place(dto.route.origin),
  destination: place(dto.route.destination),
  distanceKm: decimal(dto.route.distance_km),
  distanceSourceLabel: dto.route.distance_source_label ?? null,
  methodLabel: dto.energy.method_label ?? null,
  consumption: quantity(dto.energy.consumption),
  volumeNormalized: quantity(dto.energy.volume_normalized),
  efficiency: quantity(dto.energy.efficiency),
  emissions: dto.emissions
    ? {
        kgCo2: Number(dto.emissions.kg_co2),
        method: dto.emissions.method,
        factor: {
          value: decimal(dto.emissions.factor.value),
          unit: dto.emissions.factor.unit ?? null,
          fuelCode: dto.emissions.factor.fuel_code ?? null,
          sourceName: dto.emissions.factor.source_name ?? null,
          sourceDocument: dto.emissions.factor.source_document ?? null,
          referenceYear: dto.emissions.factor.reference_year ?? null,
        },
      }
    : null,
  dedup: {
    status: dto.dedup.status,
    statusLabel: dto.dedup.status_label,
    ruleLabel: dto.dedup.rule_label ?? null,
    resolvedByName: dto.dedup.resolved_by_name ?? null,
    resolvedAt: dto.dedup.resolved_at ?? null,
    duplicateOf: dto.dedup.duplicate_of
      ? { id: dto.dedup.duplicate_of.id, tripDate: dto.dedup.duplicate_of.trip_date ?? null, plate: dto.dedup.duplicate_of.plate ?? null, fileName: dto.dedup.duplicate_of.file_name }
      : null,
  },
  shared: shared(dto.shared),
  history: dto.history.map((event) => ({ event: event.event, label: event.label, at: event.at })),
  completable: dto.completable === true,
  missingFields: dto.missing_fields ?? [],
  correctionVersion: dto.correction_version ?? 0,
  corrected: dto.corrected ? { at: dto.corrected.at, byName: dto.corrected.by_name ?? null } : null,
  declared: dto.declared
    ? { fields: dto.declared.fields, fuelType: dto.declared.fuel_type ?? null, consumption: quantity(dto.declared.consumption), efficiency: quantity(dto.declared.efficiency), distanceKm: decimal(dto.declared.distance_km) }
    : null,
});

export const toExportJob = (dto: ExportJobDto): ExportJob => ({
  id: dto.id,
  status: dto.status,
  rowsTotal: dto.rows_total,
  rowsDone: dto.rows_done,
  progress: dto.progress ?? null,
  sizeBytes: dto.size_bytes ?? null,
  requestedByName: dto.requested_by_name ?? null,
  createdAt: dto.created_at,
  finishedAt: dto.finished_at ?? null,
  expiresAt: dto.expires_at ?? null,
  errorCode: dto.error_code ?? null,
  downloadable: dto.downloadable,
});

const toCompletionField = (dto: CompletionFieldDto): CompletionField => ({
  name: dto.name,
  label: dto.label,
  kind: dto.kind,
  group: dto.group,
  options: dto.options ?? null,
  range: dto.range ? { minExclusive: dto.range.min_exclusive, max: dto.range.max } : null,
  hint: dto.hint ?? null,
});

export const toCompletionState = (dto: CompletionStateDto): CompletionState => ({
  tripId: dto.trip_id,
  version: dto.version,
  status: dto.status as TripStatus,
  reasonLabel: dto.reason_label ?? null,
  completable: dto.completable === true,
  refusal: dto.refusal?.message ?? null,
  missing: dto.missing ?? [],
  fields: (dto.fields ?? []).map(toCompletionField),
});

/** Arma el cuerpo anidado del PATCH con lo escrito (rutas con punto); lo vacío no se envía y el texto viaja tal cual (el servidor admite la coma decimal). */
export const toCompletionBody = (input: CompletionInput): CompletionBodyDto => {
  const value = (name: string): string | undefined => input.values[name]?.trim() || undefined;
  const pair = <K extends string>(entries: readonly (readonly [K, string | undefined])[]): Partial<Record<K, string>> | undefined => {
    const present = entries.filter((entry): entry is readonly [K, string] => entry[1] !== undefined);

    return present.length ? (Object.fromEntries(present) as Partial<Record<K, string>>) : undefined;
  };
  const consumption = pair([['quantity', value('consumption.quantity')], ['unit', value('consumption.unit')]] as const);
  const efficiency = pair([['value', value('efficiency.value')], ['unit', value('efficiency.unit')]] as const);

  return {
    expected_version: input.expectedVersion,
    ...(value('fuel_type') ? { fuel_type: value('fuel_type') } : {}),
    ...(consumption ? { consumption } : {}),
    ...(efficiency ? { efficiency } : {}),
    ...(value('distance_km') ? { distance_km: value('distance_km') } : {}),
  };
};

export const toCompletionOutcome = (dto: CompletionOutDto): CompletionOutcome => ({
  changed: dto.changed === true,
  version: dto.version,
  trip: toTripDetail(dto.trip),
  result: {
    previousStatus: dto.result.previous_status,
    status: dto.result.status,
    reasonLabel: dto.result.reason_label ?? null,
    methodLabel: dto.result.method_label ?? null,
    kgCo2: decimal(dto.result.kg_co2),
    counted: dto.result.counted === true,
    countedNote: dto.result.counted_note ?? null,
  },
});

export const toBulkScopeBody = (scope: BulkScope): BulkScopeDto => ({
  reason: 'DISTANCE_WITHOUT_EFFICIENCY',
  ...(scope.importFileId ? { import_file_id: scope.importFileId } : {}),
  items: scope.items.map((item) => ({ plate: item.plate, efficiency_value: item.value.trim(), efficiency_unit: item.unit })),
});

export const toBulkPreview = (dto: BulkPreviewDto): BulkPreview => ({
  token: dto.token,
  expiresAt: dto.expires_at,
  cap: dto.cap,
  perPlate: dto.per_plate.map((p) => ({ plate: p.plate ?? null, affected: p.affected, wouldCalculate: p.would_calculate, wouldRemainPending: p.would_remain_pending, held: p.held, skippedIncompatible: p.skipped_incompatible })),
  totals: {
    affected: dto.totals.affected,
    wouldCalculate: dto.totals.would_calculate,
    wouldRemainPending: dto.totals.would_remain_pending,
    held: dto.totals.held,
    skippedIncompatible: dto.totals.skipped_incompatible,
    expectedKgCo2: decimal(dto.totals.expected_kg_co2) ?? 0,
  },
});

export const toBulkApplyResult = (dto: BulkApplyDto): BulkApplyResult => ({
  applied: dto.applied,
  alreadyCompleted: dto.already_completed,
  nowCalculated: dto.now_calculated,
  stillPending: dto.still_pending,
  held: dto.held,
  skippedIncompatible: dto.skipped_incompatible,
});
