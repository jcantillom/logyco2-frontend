import { DuplicateDifference, DuplicateEvidence, DuplicateNote, DuplicateGroup, DuplicateKind, DuplicateLineage, DuplicateResolution, DuplicateResolutionResult, DuplicateTrip, PossibleDuplicate, VehicleDifference } from '../../domain/models/duplicates';
import { DuplicateEvidenceDto, DuplicateResolutionBodyDto, DuplicateResolutionResultDto, DuplicateTripDto, PossibleDuplicateDto } from '../dto/duplicates.dto';

const KINDS: readonly DuplicateKind[] = ['identical', 'correction', 'extra_row', 'ambiguous'];
const NOTES: readonly DuplicateNote[] = ['FUEL_CONFLICT_ANCHOR_FUEL_USED'];
const DIFFERENCES: readonly DuplicateDifference[] = ['fuel_type', 'consumption', 'distance_km', 'efficiency'];

/** Un decimal que llega como texto («300.0000»); vacío o no numérico es «sin dato», nunca 0. */
const decimal = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

/** Linaje solo si trae todas sus cifras: una forma incompleta no se muestra (no se inventan porcentajes). */
const toLineage = (dto: DuplicateEvidenceDto['lineage']): DuplicateLineage | null => {
  const newPct = count(dto?.new_pct);
  const previousPct = count(dto?.previous_pct);
  const rows = count(dto?.rows);

  return dto && newPct !== null && previousPct !== null && rows !== null ? { established: dto.established === true, mutual: dto.mutual === true, rows, newPct, previousPct } : null;
};

const toGroup = (dto: DuplicateEvidenceDto['group']): DuplicateGroup | null => {
  const existing = count(dto?.existing);
  const added = count(dto?.new);

  return existing !== null && added !== null ? { existing, new: added } : null;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

const toVehicleDiffers = (dto: DuplicateEvidenceDto['vehicle_differs']): readonly VehicleDifference[] =>
  Object.entries(dto ?? {}).map(([attribute, pair]) => ({ attribute, anchor: text(pair?.anchor), repeated: text(pair?.this) }));

export const toEvidence = (dto: DuplicateEvidenceDto): DuplicateEvidence => ({
  identical: dto.identical,
  matches: dto.matches ?? [],
  differs: dto.differs ?? [],
  kind: KINDS.find((kind) => kind === dto.kind) ?? null,
  lineage: toLineage(dto.lineage),
  group: toGroup(dto.group),
  idMismatch: dto.id_mismatch === true,
  auto: dto.auto === true,
  vehicleDiffers: toVehicleDiffers(dto.vehicle_differs),
  otherDiffers: dto.other_differs ?? [],
  notes: NOTES.filter((note) => dto.notes?.includes(note)),
});

export const toDuplicateTrip = (dto: DuplicateTripDto): DuplicateTrip => ({
  id: dto.id,
  tripId: dto.trip_id ?? null,
  tripDate: dto.trip_date,
  plate: dto.plate,
  origin: { code: dto.origin.code, label: dto.origin.label },
  destination: { code: dto.destination.code, label: dto.destination.label },
  fuelType: dto.fuel_type,
  consumption: dto.consumption ? { quantity: decimal(dto.consumption.quantity), unit: dto.consumption.unit } : null,
  distanceKm: decimal(dto.distance_km),
  kgCo2: decimal(dto.kg_co2),
  importFileId: dto.import_file_id,
  fileName: dto.file_name,
  rowNumber: dto.row_number ?? null,
});

export const toPossibleDuplicate = (dto: PossibleDuplicateDto): PossibleDuplicate => ({
  id: dto.id,
  rule: dto.rule,
  ruleLabel: dto.rule_label,
  a: toDuplicateTrip(dto.a),
  b: dto.b ? toDuplicateTrip(dto.b) : null,
  differences: (dto.differences ?? []).filter((value): value is DuplicateDifference => DIFFERENCES.includes(value as DuplicateDifference)),
  evidence: dto.evidence ? toEvidence(dto.evidence) : null,
});

export const toResolutionBody = (resolution: DuplicateResolution): DuplicateResolutionBodyDto => ({
  trip_ids: resolution.tripIds,
  decision: resolution.decision,
  ...(resolution.keep ? { keep: resolution.keep } : {}),
});

export const toResolutionResult = (dto: DuplicateResolutionResultDto): DuplicateResolutionResult => ({ resolved: dto.resolved, skipped: dto.skipped, withoutResult: dto.without_result ?? 0 });
