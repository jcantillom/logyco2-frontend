import { DuplicateEvidenceDto } from './duplicates.dto';

/** Contratos JSON de `/organizations/{id}/operations/trips…`. Los decimales viajan como texto. */
export interface OperationPlaceDto {
  readonly code: string | null;
  readonly label: string | null;
}

export interface OperationQuantityDto {
  readonly quantity: string | null;
  readonly unit: string | null;
}

export interface OperationSharedDto {
  readonly state: string;
  readonly label: string;
}

export interface OperationTripDto {
  readonly id: string;
  readonly trip_id: string | null;
  readonly trip_date: string | null;
  readonly plate: string | null;
  readonly origin: OperationPlaceDto;
  readonly destination: OperationPlaceDto;
  readonly distance_km: string | null;
  readonly cargo_ton: string | null;
  readonly cargo_converted_from_kg?: boolean;
  readonly fuel_type: string | null;
  readonly kg_co2: string | null;
  readonly status: string;
  readonly state_label: string;
  readonly reason: string | null;
  readonly reason_label: string | null;
  readonly dedup_status: string;
  readonly import_file_id: string;
  readonly file_name: string;
  readonly row_number: number;
  readonly vehicle: { readonly configuration_code: string | null } | null;
  readonly shared: OperationSharedDto | null;
  readonly corrected?: boolean;
  readonly source?: 'FILE' | 'MANUAL';
}

export interface CappedCountDto {
  readonly value: number;
  readonly capped: boolean;
}

export interface OperationsPageDto {
  readonly data: readonly OperationTripDto[];
  readonly meta: {
    readonly next_cursor: string | null;
    readonly limit: number;
    readonly total_capped?: CappedCountDto | null;
    readonly request_id?: string | null;
  };
}

export interface TabCountsDto {
  readonly all: CappedCountDto;
  readonly calculated: CappedCountDto;
  readonly pending: CappedCountDto;
  readonly issues: CappedCountDto;
  readonly shared: CappedCountDto;
}

export interface TripDetailDto {
  readonly identity: {
    readonly id: string;
    readonly trip_id: string | null;
    readonly service_id: string | null;
    readonly row_number: number;
    readonly import_file_id: string;
    readonly file_name: string;
    readonly created_at: string;
    readonly calculated_at: string | null;
    readonly source?: 'FILE' | 'MANUAL';
    readonly registered_by_name?: string | null;
  };
  readonly trip_date: string | null;
  readonly cargo_ton: string | null;
  readonly cargo_converted_from_kg?: boolean;
  readonly fuel_type: string | null;
  readonly status: string;
  readonly state_label: string;
  readonly reason: string | null;
  readonly reason_label: string | null;
  readonly plate: string | null;
  readonly vehicle: {
    readonly plate: string | null;
    readonly configuration_code: string | null;
    readonly vehicle_type: string | null;
    readonly model_year: number | null;
    readonly fuel_type: string | null;
    readonly capacity_tons: string | null;
  } | null;
  readonly route: {
    readonly origin: OperationPlaceDto;
    readonly destination: OperationPlaceDto;
    readonly distance_km: string | null;
    readonly distance_source: string | null;
    readonly distance_source_label: string | null;
  };
  readonly energy: {
    readonly method: string | null;
    readonly method_label: string | null;
    readonly consumption: OperationQuantityDto;
    readonly volume_normalized: OperationQuantityDto;
    readonly efficiency: OperationQuantityDto;
    readonly efficiency_label?: string | null;
    readonly vehicle_efficiency?: {
      readonly id: string;
      readonly value: string;
      readonly unit: string;
      readonly origin: string;
      readonly basis: string | null;
      readonly note: string | null;
      readonly measured_on: string | null;
      readonly declared_by_name: string | null;
      readonly declared_at: string;
      readonly is_current: boolean;
    } | null;
  };
  readonly emissions: {
    readonly kg_co2: string;
    readonly method: string;
    readonly factor: {
      readonly value: string | null;
      readonly unit: string | null;
      readonly fuel_code: string | null;
      readonly source_name: string | null;
      readonly source_document: string | null;
      readonly reference_year: number | null;
    };
  } | null;
  readonly dedup: {
    readonly status: string;
    readonly status_label: string;
    readonly rule: string | null;
    readonly rule_label: string | null;
    readonly evidence?: DuplicateEvidenceDto | null;
    readonly resolved_by_name: string | null;
    readonly resolved_at: string | null;
    readonly duplicate_of: {
      readonly id: string;
      readonly trip_date: string | null;
      readonly plate: string | null;
      readonly import_file_id: string;
      readonly file_name: string;
    } | null;
  };
  readonly shared: OperationSharedDto | null;
  readonly history: readonly { readonly event: string; readonly label: string; readonly at: string }[];
  readonly completable?: boolean;
  readonly voidable?: boolean;
  readonly void_blocked_reason?: string | null;
  readonly missing_fields?: readonly string[];
  readonly correction_version?: number;
  readonly corrected?: { readonly at: string; readonly by_name: string | null } | null;
  readonly declared?: {
    readonly fields: readonly string[];
    readonly fuel_type: string | null;
    readonly consumption: OperationQuantityDto;
    readonly efficiency: OperationQuantityDto;
    readonly distance_km: string | null;
  } | null;
}

export interface ExportJobDto {
  readonly id: string;
  readonly status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'EXPIRED';
  readonly rows_total: number;
  readonly rows_done: number;
  readonly progress: number | null;
  readonly size_bytes: number | null;
  readonly requested_by_name: string | null;
  readonly created_at: string;
  readonly finished_at: string | null;
  readonly expires_at: string | null;
  readonly error_code: string | null;
  readonly downloadable: boolean;
  /** Los filtros con los que se pidió el reporte; `granularity` falta en los trabajos anteriores a la hoja «Evolución de emisiones». */
  readonly filters?: Readonly<Record<string, string | null>> | null;
}

// ------------------------------------------------------------------ completar viajes pendientes (Etapa 1)

export interface CompletionFieldDto {
  readonly name: string;
  readonly label: string;
  readonly kind: 'number' | 'unit' | 'fuel';
  readonly group: 'fuel' | 'consumption' | 'efficiency' | 'distance';
  readonly options: readonly { readonly value: string; readonly label: string }[] | null;
  readonly range: { readonly min_exclusive: string; readonly max: string } | null;
  readonly hint: string | null;
}

export interface CompletionStateDto {
  readonly trip_id: string;
  readonly version: number;
  readonly status: string;
  readonly reason: string | null;
  readonly reason_label: string | null;
  readonly completable: boolean;
  readonly refusal: { readonly code: string; readonly message: string } | null;
  readonly missing: readonly string[];
  readonly fields: readonly CompletionFieldDto[];
}

export interface CompletionBodyDto {
  readonly expected_version: number;
  readonly fuel_type?: string;
  readonly consumption?: { readonly quantity?: string; readonly unit?: string };
  readonly efficiency?: { readonly value?: string; readonly unit?: string };
  readonly distance_km?: string;
}

export interface CompletionOutDto {
  readonly changed: boolean;
  readonly version: number;
  readonly trip: TripDetailDto;
  readonly result: {
    readonly previous_status: string;
    readonly status: string;
    readonly reason: string | null;
    readonly reason_label: string | null;
    readonly method_label: string | null;
    readonly kg_co2: string | null;
    readonly counted: boolean;
    readonly counted_note: string | null;
  };
}

export interface BulkScopeDto {
  readonly reason: 'DISTANCE_WITHOUT_EFFICIENCY';
  readonly import_file_id?: string;
  readonly items: readonly { readonly plate: string; readonly efficiency_value: string; readonly efficiency_unit?: string }[];
}

export interface CompletionPlateDto {
  readonly plate: string;
  readonly trips: number;
  readonly fuel_type: string | null;
  readonly fuel_label: string;
  readonly efficiency_unit: string | null;
  readonly unit_options: readonly { readonly value: string; readonly label: string }[];
}

export interface CompletionPlatesPageDto {
  readonly data: readonly CompletionPlateDto[];
  readonly meta: {
    readonly next_cursor: string | null;
    readonly limit: number;
    readonly total_plates?: CappedCountDto | null;
    readonly request_id?: string | null;
  };
}

export interface BulkPlatePreviewDto {
  readonly plate: string | null;
  readonly affected: number;
  readonly would_calculate: number;
  readonly would_remain_pending: number;
  readonly held: number;
  readonly skipped_incompatible: number;
}

export interface BulkPreviewDto {
  readonly token: string;
  readonly expires_at: string;
  readonly cap: number;
  readonly per_plate: readonly BulkPlatePreviewDto[];
  readonly totals: {
    readonly affected: number;
    readonly would_calculate: number;
    readonly would_remain_pending: number;
    readonly held: number;
    readonly skipped_incompatible: number;
    readonly expected_kg_co2: string;
  };
}

export interface BulkApplyDto {
  readonly applied: number;
  readonly already_completed: number;
  readonly now_calculated: number;
  readonly still_pending: number;
  readonly held: number;
  readonly skipped_incompatible: number;
}
