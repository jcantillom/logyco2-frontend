/** Contratos JSON de `/organizations/{id}/imports…`. */
export interface ImportHeadlineDto {
  readonly rows_read: number;
  readonly real_consumption: number;
  readonly estimated_consumption: number;
  readonly pending: number;
}

export interface VehiclesDetectedDto {
  readonly new: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly pending_decision: number;
}

export interface ImportSummaryDto {
  readonly id: string;
  readonly file_name: string;
  readonly file_size: number;
  readonly status: string;
  readonly phase: string | null;
  readonly format: string | null;
  readonly rows_total: number | null;
  readonly rows_processed: number;
  readonly created_at: string;
  readonly finished_at: string | null;
  readonly created_by_name: string | null;
  readonly headline: ImportHeadlineDto | null;
  readonly vehicles_detected?: VehiclesDetectedDto | null;
  readonly error: string | null;
}

export interface ImportCountsDto {
  readonly total: number;
  readonly in_progress: number;
  readonly completed: number;
  readonly failed: number;
  readonly vehicles_pending: number;
  readonly rows_read?: number;
  readonly rows_calculable?: number;
  readonly rows_pending?: number;
  readonly rows_real?: number;
  readonly rows_estimated?: number;
  readonly vehicles_new_pending?: number;
  readonly vehicles_changed_pending?: number;
  readonly period_from?: string | null;
  readonly period_to?: string | null;
  readonly distance_km?: number;
  readonly cargo_ton?: number;
  readonly rows_with_distance?: number;
  readonly rows_with_cargo?: number;
}

export interface ImportPeriodDto {
  readonly period_from: string;
  readonly period_to: string;
  readonly imports?: number;
  readonly rows_read?: number;
}

export interface ImportColumnDto {
  readonly field: string;
  readonly label: string;
  readonly requirement: string;
  readonly found: boolean;
  readonly source_header: string | null;
  readonly filled_rows: number;
}

export interface PendingReasonDto {
  readonly code: string;
  readonly label: string;
  readonly rows: number;
  readonly sample_rows: readonly number[];
}

export interface ReviewIssueDto {
  readonly code: string;
  readonly severity: string;
  readonly field: string | null;
  readonly message: string;
  readonly rows: number;
  readonly sample_rows: readonly number[];
}

export interface ImportReviewDto {
  readonly format: string;
  readonly rows_read: number;
  readonly columns: readonly ImportColumnDto[];
  readonly methods: { readonly real_consumption: number; readonly estimated_consumption: number; readonly pending: number };
  readonly pending_reasons: readonly PendingReasonDto[];
  readonly issues: readonly ReviewIssueDto[];
  readonly vehicles: { readonly distinct_plates: number; readonly invalid_plates: number };
  readonly trips: { readonly distinct_trip_ids: number; readonly repeated_trip_ids: number };
  readonly period?: { readonly from: string | null; readonly to: string | null } | null;
}

export interface ImportDetailDto extends ImportSummaryDto {
  readonly review: ImportReviewDto | null;
}

export interface ImportCreatedDto {
  readonly id: string;
  readonly status: string;
  readonly duplicate: boolean;
}

export interface VehicleCandidateDto {
  readonly id: string;
  readonly plate: string;
  readonly plate_original: string;
  readonly kind: string;
  readonly decision: string;
  readonly proposed: {
    readonly configuration_code: string | null;
    readonly model_year: number | null;
    readonly fuel_type: string | null;
    readonly vehicle_type: string | null;
  };
  readonly fuel_label?: string | null;
  readonly changes?: readonly { readonly field: string; readonly label: string; readonly before: unknown; readonly after: unknown }[];
  readonly conflicts: readonly { readonly field: string; readonly label: string }[];
  readonly trip_rows: number;
  readonly inactive: boolean;
  readonly vehicle_id: string | null;
}

export interface VehicleDecisionBodyDto {
  readonly decision: string;
  readonly candidate_ids?: readonly string[];
  readonly kind?: string;
}

export interface VehicleDecisionResultDto {
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
  readonly skipped_reasons: readonly { readonly code: string; readonly rows: number }[];
}
