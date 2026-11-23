/** Contratos JSON de `/organizations/{id}/reconciliation…`. Los decimales viajan como texto. */
export interface ReconciliationLinkDto {
  readonly relationship_id: string;
  readonly status: string;
  readonly relationship_type: string;
  readonly our_role: string;
  readonly counterpart: { readonly id: string; readonly name: string };
  readonly my_consent: { readonly matching_enabled: boolean; readonly share_results: boolean; readonly updated_at?: string | null };
  readonly counterpart_consent: { readonly matching_enabled: boolean; readonly share_results: boolean };
  readonly matching_active: boolean;
  readonly results_shared: boolean;
  readonly can_scan: boolean;
  readonly rescan_recommended?: boolean;
}

export interface ConsentBodyDto {
  readonly matching_enabled: boolean;
  readonly share_results: boolean;
}

export interface RescanResultDto {
  readonly candidates_created: number;
  readonly completed: boolean;
}

export interface SharedPlaceDto {
  readonly code: string | null;
  readonly label: string | null;
}

export interface SharedQuantityDto {
  readonly quantity: string | null;
  readonly unit: string | null;
}

export interface OwnDeclarationDto {
  readonly trip_id: string;
  readonly import_file_id: string;
  readonly row_number: number;
  readonly service_id: string | null;
  readonly cargo_ton: string | null;
  readonly trip_date: string | null;
  readonly plate: string | null;
  readonly origin: SharedPlaceDto;
  readonly destination: SharedPlaceDto;
  readonly fuel_type: string | null;
  readonly consumption: SharedQuantityDto;
  readonly distance_km: string | null;
  readonly kg_co2: string | null;
}

export interface CounterpartDeclarationDto {
  readonly trip_date: string | null;
  readonly origin: SharedPlaceDto;
  readonly destination: SharedPlaceDto;
  readonly fuel_type: string | null;
  readonly consumption: SharedQuantityDto;
  readonly distance_km: string | null;
  readonly kg_co2: string | null;
  readonly plate_masked: string | null;
}

export interface SharedOperationDto {
  readonly id: string;
  readonly policy: string;
  readonly my_selection: string | null;
  readonly counterpart_selection: string | null;
  readonly effective_selection: string | null;
  readonly state: string;
}

export interface SharedCandidateDto {
  readonly id: string;
  readonly relationship_id: string;
  readonly status: string;
  readonly rule: string;
  readonly strength: string;
  readonly disagreement: boolean;
  readonly my_side: string;
  readonly counterpart_name: string;
  readonly evidence: { readonly matches: readonly string[]; readonly differs: readonly string[] };
  readonly conflict_fields: readonly string[];
  readonly my_decision: string | null;
  readonly counterpart_decision: string | null;
  readonly own: OwnDeclarationDto;
  readonly counterpart: CounterpartDeclarationDto | null;
  readonly operation: SharedOperationDto | null;
  readonly data_comparison?: string | null;
  readonly superseded?: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface DecideBodyDto {
  readonly candidate_ids: readonly string[];
  readonly decision: string;
}

export interface DecideResultDto {
  readonly updated: number;
  readonly unchanged: number;
  readonly confirmed: number;
  readonly conflicting: number;
  readonly items: readonly { readonly id: string; readonly status: string; readonly my_decision: string | null; readonly disagreement: boolean; readonly conflict_fields: readonly string[] }[];
}

export interface SelectBodyDto {
  readonly operation_ids: readonly string[];
  readonly selection: string;
}

export interface SelectResultDto {
  readonly updated: number;
  readonly unchanged: number;
  readonly effective: number;
}
