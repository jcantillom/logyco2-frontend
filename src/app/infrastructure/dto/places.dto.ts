export interface CandidateRouteDto {
  readonly counterpart_code: string;
  readonly km: number | string | null;
}

export interface PlaceCandidateDto {
  readonly code: string;
  readonly name: string;
  readonly department_code: string;
  readonly department: string;
  readonly kind: string;
  readonly matched_name: string;
  readonly match: string;
  readonly in_department: boolean;
  readonly distance_to_counterparts?: readonly CandidateRouteDto[];
}

export interface PlaceCounterpartDto {
  readonly code: string;
  readonly name: string;
  readonly department: string;
  readonly trips: number;
  readonly trips_with_file_distance: number;
  readonly avg_file_distance_km: number | string | null;
}

export interface PlaceChoiceDto {
  readonly id: string;
  readonly place_text: string;
  readonly place_key: string;
  readonly municipality_code: string;
  readonly municipality_name: string;
  readonly department: string;
  readonly chosen_by: string | null;
  readonly chosen_at: string;
  readonly note: string | null;
}

export interface PendingPlaceDto {
  readonly place_text: string;
  readonly place_key: string;
  readonly reason: string;
  readonly reason_label: string;
  readonly trips: number;
  readonly pending_trips: number;
  readonly as_origin: number;
  readonly as_destination: number;
  readonly candidates: readonly PlaceCandidateDto[];
  readonly counterparts_as_origin: readonly PlaceCounterpartDto[];
  readonly counterparts_as_destination: readonly PlaceCounterpartDto[];
  readonly choice: PlaceChoiceDto | null;
}

export interface ResolvedByChoiceDto {
  readonly place_text: string;
  readonly place_key: string;
  readonly municipality_code: string;
  readonly municipality_name: string;
  readonly department: string;
  readonly trips: number;
}

export interface PlaceResolutionDto {
  readonly pending: readonly PendingPlaceDto[];
  readonly pending_places: number;
  readonly pending_trips: number;
  readonly truncated: boolean;
  readonly resolved_by_choice: readonly ResolvedByChoiceDto[];
  readonly reprocess_hint: { readonly places: number; readonly trips: number };
}

export interface PlaceChoiceBodyDto {
  readonly place_text: string;
  readonly municipality_code: string;
  readonly note?: string;
  readonly import_file_id?: string;
}

export interface PlaceChoiceResultDto {
  readonly choice: PlaceChoiceDto;
  readonly created: boolean;
  readonly changed: boolean;
  readonly scope: string;
  readonly trips_updated: number;
  readonly trips_recalculated: number;
  readonly now_calculated: number;
  readonly still_pending: number;
  readonly other_trips_pending: number;
}

export interface PlaceChoiceUndoResultDto {
  readonly removed: boolean;
  readonly trips_reverted: number;
  readonly trips_recalculated: number;
}
