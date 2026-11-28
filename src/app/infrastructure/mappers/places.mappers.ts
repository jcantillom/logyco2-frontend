import { PendingPlace, PlaceCandidate, PlaceCandidateKind, PlaceChoice, PlaceChoiceRequest, PlaceChoiceResult, PlaceChoiceUndoResult, PlaceCounterpart, PlaceMatch, PlaceReason, PlaceResolution, PlaceScope, ResolvedByChoice } from '../../domain/models/places';
import {
  CandidateRouteDto,
  PendingPlaceDto,
  PlaceCandidateDto,
  PlaceChoiceBodyDto,
  PlaceChoiceDto,
  PlaceChoiceResultDto,
  PlaceChoiceUndoResultDto,
  PlaceCounterpartDto,
  PlaceResolutionDto,
  ResolvedByChoiceDto,
} from '../dto/places.dto';

const REASONS: readonly PlaceReason[] = ['AMBIGUOUS_MUNICIPALITY', 'UNKNOWN_MUNICIPALITY', 'UNKNOWN_DEPARTMENT'];
const KINDS: readonly PlaceCandidateKind[] = ['MUNICIPALITY', 'CENTRO_POBLADO'];
const MATCHES: readonly PlaceMatch[] = ['EXACT', 'PREFIX', 'CONTAINS'];
const SCOPES: readonly PlaceScope[] = ['IMPORT', 'COMPANY'];

const known = <T extends string>(options: readonly T[], value: string, fallback: T): T => options.find((option) => option === value) ?? fallback;

/** Un decimal que llega como texto («45.20»); vacío o no numérico es «sin dato», nunca 0. */
const decimal = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const toRoute = (dto: CandidateRouteDto) => ({ counterpartCode: dto.counterpart_code, km: decimal(dto.km) });

const toCandidate = (dto: PlaceCandidateDto): PlaceCandidate => ({
  code: dto.code,
  name: dto.name,
  departmentCode: dto.department_code,
  department: dto.department,
  kind: known(KINDS, dto.kind, 'MUNICIPALITY'),
  matchedName: dto.matched_name,
  match: known(MATCHES, dto.match, 'CONTAINS'),
  inDepartment: dto.in_department,
  routes: (dto.distance_to_counterparts ?? []).map(toRoute),
});

const toCounterpart = (dto: PlaceCounterpartDto): PlaceCounterpart => ({
  code: dto.code,
  name: dto.name,
  department: dto.department,
  trips: dto.trips,
  tripsWithFileDistance: dto.trips_with_file_distance,
  avgFileDistanceKm: decimal(dto.avg_file_distance_km),
});

export const toPlaceChoice = (dto: PlaceChoiceDto): PlaceChoice => ({
  id: dto.id,
  placeText: dto.place_text,
  placeKey: dto.place_key,
  municipalityCode: dto.municipality_code,
  municipalityName: dto.municipality_name,
  department: dto.department,
  chosenBy: dto.chosen_by ?? null,
  chosenAt: dto.chosen_at,
  note: dto.note ?? null,
});

const toPending = (dto: PendingPlaceDto): PendingPlace => ({
  placeText: dto.place_text,
  placeKey: dto.place_key,
  // Un motivo nuevo del servidor se trata como el más genérico: sin candidatos propios no se ofrece elegir nada.
  reason: known(REASONS, dto.reason, 'UNKNOWN_MUNICIPALITY'),
  reasonLabel: dto.reason_label,
  trips: dto.trips,
  pendingTrips: dto.pending_trips,
  asOrigin: dto.as_origin,
  asDestination: dto.as_destination,
  candidates: dto.candidates.map(toCandidate),
  counterpartsAsOrigin: dto.counterparts_as_origin.map(toCounterpart),
  counterpartsAsDestination: dto.counterparts_as_destination.map(toCounterpart),
  choice: dto.choice ? toPlaceChoice(dto.choice) : null,
});

const toResolved = (dto: ResolvedByChoiceDto): ResolvedByChoice => ({
  placeText: dto.place_text,
  placeKey: dto.place_key,
  municipalityCode: dto.municipality_code,
  municipalityName: dto.municipality_name,
  department: dto.department,
  trips: dto.trips,
});

export const toPlaceResolution = (dto: PlaceResolutionDto): PlaceResolution => ({
  pending: dto.pending.map(toPending),
  pendingPlaces: dto.pending_places,
  pendingTrips: dto.pending_trips,
  truncated: dto.truncated,
  resolvedByChoice: dto.resolved_by_choice.map(toResolved),
  reprocessHint: { places: dto.reprocess_hint.places, trips: dto.reprocess_hint.trips },
});

/** Sin nota ni carga, esos campos no viajan (el servidor los trata como «sin nota» y «toda la empresa»). */
export const toPlaceChoiceBody = (request: PlaceChoiceRequest): PlaceChoiceBodyDto => ({
  place_text: request.placeText,
  municipality_code: request.municipalityCode,
  ...(request.note ? { note: request.note } : {}),
  ...(request.importFileId ? { import_file_id: request.importFileId } : {}),
});

export const toPlaceChoiceResult = (dto: PlaceChoiceResultDto): PlaceChoiceResult => ({
  choice: toPlaceChoice(dto.choice),
  created: dto.created,
  changed: dto.changed,
  scope: known(SCOPES, dto.scope, 'IMPORT'),
  tripsUpdated: dto.trips_updated,
  tripsRecalculated: dto.trips_recalculated,
  nowCalculated: dto.now_calculated,
  stillPending: dto.still_pending,
  otherTripsPending: dto.other_trips_pending,
});

export const toPlaceChoiceUndoResult = (dto: PlaceChoiceUndoResultDto): PlaceChoiceUndoResult => ({
  removed: dto.removed,
  tripsReverted: dto.trips_reverted,
  tripsRecalculated: dto.trips_recalculated,
});
