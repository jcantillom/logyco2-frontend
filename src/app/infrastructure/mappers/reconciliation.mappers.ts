import {
  CandidateStatus,
  CounterpartDeclaration,
  DataComparison,
  DecidedItem,
  OwnDeclaration,
  ReconciliationLink,
  RescanResult,
  SelectionResult,
  SharedCandidate,
  SharedDecision,
  SharedDecisionResult,
  SharedOperation,
  SharedPlace,
  SharedQuantity,
  Side,
} from '../../domain/models/reconciliation';
import {
  CounterpartDeclarationDto,
  DecideResultDto,
  OwnDeclarationDto,
  ReconciliationLinkDto,
  RescanResultDto,
  SelectResultDto,
  SharedCandidateDto,
  SharedOperationDto,
  SharedPlaceDto,
  SharedQuantityDto,
} from '../dto/reconciliation.dto';

/** Un decimal que llega como texto («415.5000»); vacío o no numérico es «sin dato», nunca 0. */
const decimal = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const side = (value: string | null): Side | null => (value === 'A' || value === 'B' ? value : null);

const STATUSES: readonly CandidateStatus[] = ['POSSIBLE_MATCH', 'CONFIRMED_MATCH', 'CONFLICTING_DATA', 'DISTINCT'];
const DECISIONS: readonly SharedDecision[] = ['SAME', 'DISTINCT', 'NEEDS_INFO', 'KEEP_PENDING'];

/** Un estado que el cliente no conoce se trata como «posible coincidencia»: es el único que se puede decidir y no afirma nada resuelto. */
const status = (value: string): CandidateStatus => STATUSES.find((option) => option === value) ?? 'POSSIBLE_MATCH';
const decision = (value: string | null): SharedDecision | null => DECISIONS.find((option) => option === value) ?? null;

const COMPARISONS: readonly DataComparison[] = ['identical', 'conflict', 'not_shared'];

/** Un valor que el cliente no conoce es «sin dato»: nunca se afirma que las cifras coinciden ni que difieren. */
const comparison = (value: string | null): DataComparison | null => COMPARISONS.find((option) => option === value) ?? null;

const place = (dto: SharedPlaceDto): SharedPlace => ({ code: dto.code ?? null, label: dto.label ?? null });
const quantity = (dto: SharedQuantityDto): SharedQuantity => ({ quantity: decimal(dto.quantity), unit: dto.unit ?? null });

export const toReconciliationLink = (dto: ReconciliationLinkDto): ReconciliationLink => ({
  relationshipId: dto.relationship_id,
  status: dto.status === 'ENDED' ? 'ENDED' : 'ACTIVE',
  relationshipType: dto.relationship_type,
  ourRole: dto.our_role === 'PROVIDER' ? 'PROVIDER' : 'CONTRACTOR',
  counterpart: { id: dto.counterpart.id, name: dto.counterpart.name },
  myConsent: { matchingEnabled: dto.my_consent.matching_enabled, shareResults: dto.my_consent.share_results, updatedAt: dto.my_consent.updated_at ?? null },
  counterpartConsent: { matchingEnabled: dto.counterpart_consent.matching_enabled, shareResults: dto.counterpart_consent.share_results },
  matchingActive: dto.matching_active,
  resultsShared: dto.results_shared,
  canScan: dto.can_scan,
  rescanRecommended: dto.rescan_recommended ?? false,
});

export const toRescanResult = (dto: RescanResultDto): RescanResult => ({ candidatesCreated: dto.candidates_created, completed: dto.completed });

const toOwn = (dto: OwnDeclarationDto): OwnDeclaration => ({
  tripId: dto.trip_id,
  importFileId: dto.import_file_id,
  rowNumber: dto.row_number,
  serviceId: dto.service_id ?? null,
  cargoTon: decimal(dto.cargo_ton),
  tripDate: dto.trip_date ?? null,
  plate: dto.plate ?? null,
  origin: place(dto.origin),
  destination: place(dto.destination),
  fuelType: dto.fuel_type ?? null,
  consumption: quantity(dto.consumption),
  distanceKm: decimal(dto.distance_km),
  kgCo2: decimal(dto.kg_co2),
});

const toCounterpart = (dto: CounterpartDeclarationDto): CounterpartDeclaration => ({
  tripDate: dto.trip_date ?? null,
  origin: place(dto.origin),
  destination: place(dto.destination),
  fuelType: dto.fuel_type ?? null,
  consumption: quantity(dto.consumption),
  distanceKm: decimal(dto.distance_km),
  kgCo2: decimal(dto.kg_co2),
  plateMasked: dto.plate_masked ?? null,
});

export const toSharedOperation = (dto: SharedOperationDto): SharedOperation => ({
  id: dto.id,
  policy: dto.policy,
  mySelection: side(dto.my_selection),
  counterpartSelection: side(dto.counterpart_selection),
  effectiveSelection: side(dto.effective_selection),
  state: dto.state === 'EFFECTIVE' ? 'EFFECTIVE' : 'PENDING',
});

export const toSharedCandidate = (dto: SharedCandidateDto): SharedCandidate => ({
  id: dto.id,
  relationshipId: dto.relationship_id,
  status: status(dto.status),
  rule: dto.rule === 'M1' ? 'M1' : 'M2',
  strength: dto.strength === 'STRONG' ? 'STRONG' : 'WEAK',
  disagreement: dto.disagreement,
  mySide: dto.my_side === 'B' ? 'B' : 'A',
  counterpartName: dto.counterpart_name,
  matches: dto.evidence?.matches ?? [],
  differs: dto.evidence?.differs ?? [],
  conflictFields: dto.conflict_fields ?? [],
  myDecision: decision(dto.my_decision),
  counterpartDecision: decision(dto.counterpart_decision),
  own: toOwn(dto.own),
  counterpart: dto.counterpart ? toCounterpart(dto.counterpart) : null,
  operation: dto.operation ? toSharedOperation(dto.operation) : null,
  dataComparison: comparison(dto.data_comparison ?? null),
  superseded: dto.superseded ?? false,
});

const toDecidedItem = (dto: DecideResultDto['items'][number]): DecidedItem => ({
  id: dto.id,
  status: status(dto.status),
  myDecision: decision(dto.my_decision),
  disagreement: dto.disagreement,
  conflictFields: dto.conflict_fields ?? [],
});

export const toDecisionResult = (dto: DecideResultDto): SharedDecisionResult => ({
  updated: dto.updated,
  unchanged: dto.unchanged,
  confirmed: dto.confirmed,
  conflicting: dto.conflicting,
  items: (dto.items ?? []).map(toDecidedItem),
});

export const toSelectionResult = (dto: SelectResultDto): SelectionResult => ({ updated: dto.updated, unchanged: dto.unchanged, effective: dto.effective });
