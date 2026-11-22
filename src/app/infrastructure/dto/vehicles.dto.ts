/** Contratos JSON del backend para vehículos de empresa (`/organizations/{id}/vehicles…`, `vehicle-analyses`, `notifications`). */
export interface VehicleDto {
  readonly id: string;
  readonly plate: string;
  readonly plate_original: string;
  readonly country: string;
  readonly configuration_code: string | null;
  readonly configuration_recognized: boolean;
  readonly vehicle_type: string | null;
  readonly fuel_type: string | null;
  readonly model_year: number | null;
  readonly technology: string | null;
  readonly capacity_tons: number | null;
  readonly ownership: string;
  readonly status: string;
  readonly source: string;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
  readonly created_at: string;
}

export interface VehicleChangeDto {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface VehicleHistoryEntryDto {
  readonly id: string;
  readonly event: string;
  readonly at: string;
  readonly actor_name: string | null;
  readonly changes: readonly VehicleChangeDto[];
  readonly run_id: string | null;
}

export interface VehicleAppearanceDto {
  readonly run_id: string;
  readonly file_name: string;
  readonly at: string;
  readonly occurrences: number;
}

export interface VehicleDetailDto extends VehicleDto {
  readonly history: readonly VehicleHistoryEntryDto[];
  readonly runs: readonly VehicleAppearanceDto[];
}

export interface VehicleSummaryDto {
  readonly registered: number;
  readonly pending_new: number;
  readonly conflicts: number;
  readonly inactive: number;
}

export interface VehicleCreateDto {
  readonly plate: string;
  readonly country?: string;
  readonly configuration_code?: string;
  readonly vehicle_type?: string;
  readonly fuel_type?: string;
  readonly model_year?: number;
  readonly technology?: string;
  readonly capacity_tons?: number;
  readonly ownership?: string;
}

export interface VehiclePatchDto extends Partial<Omit<VehicleCreateDto, 'plate' | 'country'>> {
  readonly status?: string;
  readonly confirm_structural?: boolean;
}

export interface AnalysisCreatedDto {
  readonly id: string;
  readonly status: string;
  readonly duplicate: boolean;
}

export interface AnalysisCountsDto {
  readonly detected: number;
  readonly known: number;
  readonly new: number;
  readonly conflict: number;
  readonly incomplete: number;
  readonly invalid: number;
}

export interface AnalysisSummaryDto {
  readonly id: string;
  readonly file_name: string;
  readonly status: string;
  readonly created_at: string;
  readonly finished_at: string | null;
  readonly counts: AnalysisCountsDto;
  readonly pending: { readonly new: number; readonly conflict: number; readonly incomplete: number; readonly invalid: number };
}

export interface VehicleAnalysisDto {
  readonly id: string;
  readonly file_name: string;
  readonly status: string;
  readonly phase: string | null;
  readonly rows_processed: number;
  readonly rows_total: number | null;
  readonly counts: AnalysisCountsDto;
  readonly error: string | null;
  readonly created_at: string;
  readonly finished_at: string | null;
}

export interface VehicleAttributesDto {
  readonly configuration_code: string | null;
  readonly vehicle_type: string | null;
  readonly fuel_type: string | null;
  readonly model_year: number | null;
  readonly technology: string | null;
  readonly capacity_tons: number | null;
}

export interface FindingDifferenceDto {
  readonly field: string;
  readonly current: unknown;
  readonly incoming: unknown;
  readonly kind: string;
  readonly severity: string;
  readonly recommended_action: string;
}

export interface InFileConflictDto {
  readonly field: string;
  readonly values: readonly { readonly value: unknown; readonly count: number; readonly rows: readonly number[] }[];
  readonly overflow?: boolean;
}

export interface FindingDto {
  readonly id: string;
  readonly plate: string;
  readonly plate_original: string;
  readonly state: string;
  readonly decision: string;
  readonly detected: VehicleAttributesDto;
  readonly current: VehicleAttributesDto | null;
  readonly differences: readonly FindingDifferenceDto[];
  readonly occurrences: number;
  readonly sample_rows: readonly number[];
  readonly in_file_conflict: boolean;
  readonly invalid_reason: string | null;
  readonly in_file_conflicts?: readonly InFileConflictDto[];
  readonly configuration_recognized?: boolean | null;
  readonly unreadable_fields?: readonly string[];
}

export interface ConfirmBodyDto {
  readonly finding_ids?: readonly string[];
  readonly all_new?: boolean;
}

export interface ConfirmResultDto {
  readonly registered: number;
  readonly already_registered: number;
  readonly skipped: number;
}

export interface ResolveBodyDto {
  readonly action: string;
  readonly fields?: readonly string[];
  readonly confirm_structural?: boolean;
}

export interface NotificationDto {
  readonly id: string;
  readonly type: string;
  readonly severity: string;
  readonly title: string;
  readonly description: string;
  readonly created_at: string;
  readonly read: boolean;
  readonly run_id: string | null;
  readonly deep_link: { readonly path: string; readonly query: Readonly<Record<string, string>> | null };
}

export interface UnreadCountDto {
  readonly count: number;
}

export interface ReadAllResultDto {
  readonly updated: number;
}
