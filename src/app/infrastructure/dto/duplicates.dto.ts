/** Contratos JSON de `/organizations/{id}/emissions/trips/duplicates…`. Los decimales viajan como texto. */
export interface DuplicatePlaceDto {
  readonly code: string;
  readonly label: string;
}

export interface DuplicateTripDto {
  readonly id: string | number;
  readonly trip_id: string | null;
  readonly trip_date: string;
  readonly plate: string;
  readonly origin: DuplicatePlaceDto;
  readonly destination: DuplicatePlaceDto;
  readonly fuel_type: string;
  readonly consumption: { readonly quantity: string | null; readonly unit: string } | null;
  readonly distance_km: string | null;
  readonly kg_co2: string | null;
  readonly import_file_id: string;
  readonly file_name: string;
  readonly row_number: number | null;
}

export interface PossibleDuplicateDto {
  readonly id: string | number;
  readonly rule: string;
  readonly rule_label: string;
  readonly status: string;
  readonly a: DuplicateTripDto;
  readonly b: DuplicateTripDto | null;
  readonly differences: readonly string[];
  readonly evidence: {
    readonly identical: boolean;
    readonly matches: readonly string[];
    readonly differs: readonly string[];
    /** Solo R4 a R6. */
    readonly kind?: string | null;
    readonly lineage?: { readonly established: boolean; readonly mutual: boolean; readonly rows: number; readonly new_pct: number; readonly previous_pct: number } | null;
    readonly group?: { readonly existing: number; readonly new: number } | null;
    /** Solo R4 a R6 y solo cuando es cierto. */
    readonly id_mismatch?: boolean;
  } | null;
}

export interface DuplicateResolutionBodyDto {
  readonly trip_ids: readonly (string | number)[];
  readonly decision: string;
  readonly keep?: string;
}

export interface DuplicateResolutionResultDto {
  readonly resolved: number;
  readonly skipped: number;
  readonly without_result?: number;
}
