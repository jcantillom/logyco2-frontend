import { ImportFootprintDto } from './footprint.dto';
import { PlaceResolutionDto } from './places.dto';
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

export interface ImportNotCalculableDto {
  readonly acknowledged_at: string | null;
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
  readonly started_at?: string | null;
  readonly finished_at: string | null;
  readonly created_by_name: string | null;
  readonly headline: ImportHeadlineDto | null;
  readonly vehicles_detected?: VehiclesDetectedDto | null;
  readonly not_calculable?: ImportNotCalculableDto | null;
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
  readonly distance_from_routes_km?: number;
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
  readonly examples?: readonly string[];
}

export interface ImportRoutesDto {
  readonly level: string;
  readonly approximate: boolean;
  readonly provider: string;
  readonly dataset_version: string;
  readonly pairs_total: number;
  readonly pairs_resolved: number;
  readonly pairs_unresolved: number;
  readonly rows_resolved: number;
  readonly rows_unresolved: number;
  readonly rows_by_unique_name?: number;
}

export interface CargoUnitEvidenceDto {
  readonly rows_with_cargo: number;
  readonly rows_over_limit: number;
  readonly share_over_limit_pct: number;
  readonly limit_ton: number;
  readonly median_value: number | null;
  readonly median_as_tons_if_kg: number | null;
  readonly median_capacity_ton: number | null;
  readonly median_pct_of_capacity: number | null;
  readonly rows_with_capacity: number;
  readonly rows_over_capacity_if_kg: number | null;
  readonly median_exact: boolean;
  readonly rows_still_out_of_range_if_kg: number;
  readonly total_ton_if_kg: number;
  readonly rows_with_cargo_if_kg: number;
}

export interface CargoUnitProposalDto {
  readonly status: string;
  readonly proposed_unit: string | null;
  readonly declared_unit: string;
  readonly basis: string;
  readonly message: string;
  readonly evidence: CargoUnitEvidenceDto;
}

export interface CargoUnitAppliedDto {
  readonly unit: string;
  readonly source: string;
  readonly confirmed_at: string;
  readonly confirmed_by?: string | null;
  readonly header?: string | null;
}

export interface CargoUnitResultDto {
  readonly unit: string;
  readonly confirmed_at: string;
  readonly rows_updated: number;
  readonly rows_converted: number;
  readonly unchanged: boolean;
}

export interface CoverageCountDto {
  readonly vehicles: number;
  readonly trips: number;
}

export interface CoverageReferenceDto extends CoverageCountDto {
  readonly source: string;
  readonly value_km_per_gal: number | null;
  readonly unit: string;
  readonly uncertainty_low: number | null;
  readonly uncertainty_high: number | null;
  readonly licence_status: string;
  readonly mapping_confidence?: string;
  readonly unregistered_vehicles: number;
}

export interface EfficiencyCoverageDto {
  readonly estimation: {
    readonly platform_enabled: boolean;
    readonly mode: string;
    readonly requires_consent: boolean;
    readonly can_estimate: boolean;
    readonly consent?: { readonly estimate: boolean; readonly mode?: string } | null;
  };
  readonly vehicles_in_file: number;
  readonly with_own_efficiency: CoverageCountDto;
  readonly already_estimated: CoverageCountDto;
  readonly without_efficiency: CoverageCountDto & {
    readonly estimable: CoverageCountDto & { readonly unregistered_vehicles: number; readonly references: readonly CoverageReferenceDto[] };
    readonly blocked_by_licence: CoverageCountDto & { readonly unregistered_vehicles: number; readonly message: string };
    readonly no_reference: CoverageCountDto & { readonly reasons: readonly (CoverageCountDto & { readonly code: string; readonly label: string })[] };
  };
  readonly trips_without_distance: CoverageCountDto;
}

export interface EfficiencyConsentBodyDto {
  readonly estimate_efficiency: boolean;
}

export interface EfficiencyConsentResultDto {
  readonly mode: string;
  readonly estimate_efficiency: boolean;
  readonly vehicles_estimated: number;
  readonly trips_calculated: number;
  readonly trips_still_pending: number;
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
  readonly routes?: ImportRoutesDto | null;
  readonly totals?: { readonly distance_from_routes_km?: number } | null;
  readonly cargo_unit_proposal?: CargoUnitProposalDto | null;
  readonly cargo_unit_applied?: CargoUnitAppliedDto | null;
  readonly efficiency_coverage?: EfficiencyCoverageDto | null;
  readonly place_resolution?: PlaceResolutionDto | null;
}

export interface CalculableWithEstimationDto {
  readonly trips: number;
  readonly vehicles: number;
  readonly already_estimated_trips?: number;
  readonly mode: string;
  readonly requires_consent?: boolean;
  readonly pending_without_distance_or_reference?: number;
}

export interface ImportDetailDto extends ImportSummaryDto {
  readonly review: ImportReviewDto | null;
  readonly calculable_with_estimation?: CalculableWithEstimationDto | null;
  /** Huella de la carga; `null` si no tiene viajes (o es anterior al cálculo). */
  readonly footprint?: ImportFootprintDto | null;
}

export interface ImportCreatedDto {
  readonly id: string;
  readonly status: string;
  readonly duplicate: boolean;
  readonly file_name?: string;
  readonly created_at?: string;
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
    readonly technology?: string | null;
    readonly capacity_tons?: number | null;
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
  readonly estimate_efficiency?: boolean;
}

export interface VehicleDecisionResultDto {
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
  readonly skipped_reasons: readonly { readonly code: string; readonly rows: number }[];
  readonly vehicles_estimated?: number;
  readonly trips_estimated?: number;
  readonly remaining: number;
}
