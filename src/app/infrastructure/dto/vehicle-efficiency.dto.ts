/** Contratos JSON del backend para el rendimiento por vehículo (`/organizations/{id}/vehicles/…/efficiency`). Los decimales llegan como texto. */
export interface EfficiencySummaryDto {
  readonly value: string;
  readonly unit: string;
  readonly origin: string;
  readonly basis: string | null;
  readonly source_kind: string;
  readonly measured_on: string | null;
  readonly declared_at: string;
}

export interface EfficiencyRecordDto {
  readonly id: string;
  readonly value: string;
  readonly unit: string;
  readonly origin: string;
  readonly basis: string | null;
  readonly source_kind: string;
  readonly note: string | null;
  readonly measured_on: string | null;
  readonly declared_by_name: string | null;
  readonly declared_at: string;
  readonly is_current: boolean;
  readonly superseded_at: string | null;
}

export interface EfficiencyViewDto {
  readonly vehicle_id: string;
  readonly plate: string;
  readonly fuel_type: string | null;
  readonly compatible_units: readonly string[];
  readonly current: EfficiencyRecordDto | null;
  readonly history: readonly EfficiencyRecordDto[];
  readonly pagination: {
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
    readonly total_pages: number;
    readonly has_next: boolean;
    readonly has_previous: boolean;
  };
  readonly estimation_enabled?: boolean;
  readonly estimate?: EfficiencyEstimateDto | null;
  readonly estimate_reason?: string | null;
  readonly estimate_reason_label?: string | null;
}

export interface EfficiencyEstimateDto {
  readonly value: string;
  readonly unit: string;
  readonly source_category: string;
  readonly version_label: string;
  readonly table_ref: string;
  readonly page_ref: string;
  readonly uncertainty_low: string | null;
  readonly uncertainty_high: string | null;
  readonly mapping_confidence: string;
  readonly evidence_level: string;
  readonly source_short_name?: string | null;
  readonly licence_status?: string | null;
  readonly licence_notice?: string | null;
}

export interface DeclareBodyDto {
  readonly value: string;
  readonly unit: string;
  readonly origin: string;
  readonly basis?: string;
  readonly note?: string;
  readonly measured_on?: string;
  readonly confirm_replace_measured?: boolean;
}

export interface AppliedToPendingDto {
  readonly trips_recalculated: number;
  readonly now_calculated: number;
  readonly still_pending: number;
  readonly remaining: number;
  readonly cap: number;
  readonly stale_calculated_trips: number;
}

export interface DeclareOutDto {
  readonly changed: boolean;
  readonly record: EfficiencyRecordDto;
  readonly applied_to_pending: AppliedToPendingDto;
}

export interface ProtectedRowDto {
  readonly row: number;
  readonly plate: string | null;
  readonly status?: string;
  readonly current_record_id?: string;
  readonly current_value: string;
  readonly current_unit: string;
  readonly current_measured_on: string | null;
  readonly new_value: string;
  readonly new_unit: string;
}

export interface FichaPreviewDto {
  readonly token: string;
  readonly expires_at: string;
  readonly file_sha256: string;
  readonly counts: {
    readonly rows: number;
    readonly valid: number;
    readonly with_issues: number;
    readonly unchanged: number;
    readonly to_create: number;
    readonly to_replace: number;
    readonly measured_protected?: number;
    readonly pending_trips: number;
  };
  readonly issues: readonly { readonly row: number; readonly plate: string | null; readonly field: string; readonly message: string }[];
  readonly issues_truncated: boolean;
  readonly protected_rows?: readonly ProtectedRowDto[];
  readonly protected_truncated?: boolean;
  readonly max_rows: number;
}

export interface FichaApplyOutDto {
  readonly records_created: number;
  readonly records_replaced: number;
  readonly records_replaced_measured?: number;
  readonly skipped_measured_protected?: number;
  readonly unchanged: number;
  readonly applied_to_pending: AppliedToPendingDto;
}

export interface EstimateBodyDto {
  readonly vehicle_ids?: readonly string[];
  readonly all_pending?: boolean;
  readonly after?: string;
  readonly token?: string;
}

export interface EstimateRejectionDto {
  readonly reason: string;
  readonly label: string;
  readonly vehicles: number;
}

export interface EstimatePreviewDto {
  readonly token: string;
  readonly expires_at: string;
  readonly scope_sha256: string;
  readonly counts: {
    readonly considered: number;
    readonly unknown_vehicles: number;
    readonly kept_vehicle_efficiency: number;
    readonly already_estimated: number;
    readonly to_create: number;
    readonly to_retire: number;
    readonly rejected: number;
    readonly pending_trips: number;
  };
  readonly rejected_by_reason: readonly EstimateRejectionDto[];
  readonly next_cursor: string | null;
  readonly max_vehicles: number;
  readonly licence_notice?: string | null;
}

export interface EstimateApplyOutDto {
  readonly records_created: number;
  readonly records_retired: number;
  readonly already_estimated: number;
  readonly kept_vehicle_efficiency: number;
  readonly rejected: number;
  readonly rejected_by_reason: readonly EstimateRejectionDto[];
  readonly applied_to_pending: AppliedToPendingDto;
  readonly next_cursor: string | null;
}

export interface EfficiencySettingsDto {
  readonly mode: string;
  readonly platform_enabled: boolean;
  readonly cargo_unit_mode: string;
  readonly options: readonly string[];
  readonly cargo_unit_options: readonly string[];
}

export interface EfficiencySettingsBodyDto {
  readonly mode?: string;
  readonly cargo_unit_mode?: string;
}
