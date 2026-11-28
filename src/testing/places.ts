import { PendingPlaceDto, PlaceCandidateDto, PlaceChoiceDto, PlaceChoiceResultDto, PlaceChoiceUndoResultDto, PlaceCounterpartDto, PlaceResolutionDto } from '../app/infrastructure/dto/places.dto';
import { ORG_ENVIA } from './builders';

/** URL base de los lugares de la empresa de pruebas. */
export const PLACES_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/places`;

export const candidateDto = (overrides: Partial<PlaceCandidateDto> = {}): PlaceCandidateDto => ({
  code: '05664',
  name: 'San Pedro de los Milagros',
  department_code: '05',
  department: 'Antioquia',
  kind: 'MUNICIPALITY',
  matched_name: 'San Pedro de los Milagros',
  match: 'PREFIX',
  in_department: true,
  distance_to_counterparts: [{ counterpart_code: '05001', km: '48.30' }],
  ...overrides,
});

export const counterpartDto = (overrides: Partial<PlaceCounterpartDto> = {}): PlaceCounterpartDto => ({
  code: '05001',
  name: 'Medellín',
  department: 'Antioquia',
  trips: 90,
  trips_with_file_distance: 80,
  avg_file_distance_km: '51.20',
  ...overrides,
});

export const choiceDto = (overrides: Partial<PlaceChoiceDto> = {}): PlaceChoiceDto => ({
  id: 'ch-1',
  place_text: 'SAN PEDRO, ANTIOQUIA',
  place_key: 'san pedro antioquia',
  municipality_code: '05664',
  municipality_name: 'San Pedro de los Milagros',
  department: 'Antioquia',
  chosen_by: 'usr-1',
  chosen_at: '2026-03-02T09:30:00Z',
  note: null,
  ...overrides,
});

export const pendingPlaceDto = (overrides: Partial<PendingPlaceDto> = {}): PendingPlaceDto => ({
  place_text: 'SAN PEDRO, ANTIOQUIA',
  place_key: 'san pedro antioquia',
  reason: 'AMBIGUOUS_MUNICIPALITY',
  reason_label: 'Puede ser más de un municipio',
  trips: 102,
  pending_trips: 102,
  as_origin: 100,
  as_destination: 2,
  candidates: [
    candidateDto(),
    candidateDto({ code: '05665', name: 'San Pedro de Urabá', matched_name: 'San Pedro de Urabá', distance_to_counterparts: [{ counterpart_code: '05001', km: null }] }),
  ],
  counterparts_as_origin: [counterpartDto()],
  counterparts_as_destination: [],
  choice: null,
  ...overrides,
});

export const resolutionDto = (overrides: Partial<PlaceResolutionDto> = {}): PlaceResolutionDto => ({
  pending: [pendingPlaceDto()],
  pending_places: 1,
  pending_trips: 102,
  truncated: false,
  resolved_by_choice: [],
  reprocess_hint: { places: 0, trips: 0 },
  ...overrides,
});

export const choiceResultDto = (overrides: Partial<PlaceChoiceResultDto> = {}): PlaceChoiceResultDto => ({
  choice: choiceDto(),
  created: true,
  changed: true,
  scope: 'IMPORT',
  trips_updated: 102,
  trips_recalculated: 98,
  now_calculated: 95,
  still_pending: 3,
  other_trips_pending: 0,
  ...overrides,
});

export const undoResultDto = (overrides: Partial<PlaceChoiceUndoResultDto> = {}): PlaceChoiceUndoResultDto => ({ removed: true, trips_reverted: 102, trips_recalculated: 95, ...overrides });
