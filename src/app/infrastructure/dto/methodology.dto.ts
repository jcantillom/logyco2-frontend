export interface MethodologyRefDto {
  readonly id: string;
  readonly version: string;
  readonly scope_label: string;
  readonly unit: string;
  readonly has_estimates?: boolean;
}

export interface DataOriginShareDto {
  readonly verification?: string;
  readonly has_verified_data?: boolean;
  readonly total_kg_co2?: number;
  readonly total_trips?: number;
  readonly rounding?: string;
  readonly buckets?: readonly {
    readonly key: string;
    readonly label?: string;
    readonly meaning?: string;
    readonly kg_co2?: number;
    readonly trips?: number;
    readonly pct?: number | null;
    readonly sources?: readonly { readonly source: string; readonly kg_co2?: number; readonly trips?: number; readonly pct?: number | null }[] | null;
  }[];
}

export interface InventoryCoverageDto {
  readonly eligible_trips?: number;
  readonly calculated_trips?: number;
  readonly pending_trips?: number;
  readonly blocked_trips?: number;
  readonly coverage_pct?: number | null;
  readonly excluded?: { readonly held_trips?: number; readonly duplicate_trips?: number; readonly voided_trips?: number };
  readonly kg?: { readonly counted_kg_co2?: number; readonly held_kg_co2?: number; readonly duplicate_kg_co2?: number; readonly voided_kg_co2?: number };
  readonly denominator?: string;
  readonly basis?: string;
}

export interface MethodologyDeclarationDto {
  readonly id: string;
  readonly name?: string;
  readonly version: string;
  readonly valid_from?: string | null;
  readonly valid_to?: string | null;
  readonly review_status?: string;
  readonly approval_note?: string;
  readonly reference_standards?: readonly { readonly code: string; readonly name?: string; readonly role?: string; readonly alignment?: string }[];
  readonly conformity_claims?: readonly string[];
  readonly not_claimed?: readonly string[];
  readonly emission_scope?: { readonly boundary?: string; readonly label?: string; readonly description?: string; readonly included?: readonly string[]; readonly excluded?: readonly string[] };
  readonly gases?: readonly { readonly gas: string; readonly included?: boolean; readonly note?: string }[];
  readonly unit?: { readonly code?: string; readonly label?: string; readonly statement?: string };
  readonly factor_policy?: string;
  readonly activity_data_origins?: readonly { readonly key: string; readonly label?: string; readonly meaning?: string }[];
  readonly distance_method?: readonly string[];
  readonly uncertainty?: readonly string[];
  readonly limitations?: readonly string[];
  readonly estimates_warning?: string;
  readonly data_verification_statement?: string;
  readonly legal_review_note?: string;
}

export interface MethodologyFactorDto {
  readonly fuel_code: string;
  readonly name?: string;
  readonly gas?: string;
  readonly value?: string | null;
  readonly unit?: string;
  readonly unit_label?: string | null;
  readonly source_name?: string | null;
  readonly source_document?: string | null;
  readonly source_url?: string | null;
  readonly reference_year?: number | null;
  readonly verification_status?: string;
  readonly usable_for_calculation?: boolean;
}

export interface UsedFactorDto {
  readonly fuel_code: string;
  readonly value?: string;
  readonly unit?: string | null;
  readonly unit_label?: string | null;
  readonly source_name?: string | null;
  readonly source_document?: string | null;
  readonly reference_year?: number | null;
  readonly trips?: number;
  readonly kg_co2?: string;
}

/** `data` de `GET /organizations/{org}/emissions/methodology`. */
export interface MethodologyDto {
  readonly current: { readonly declaration: MethodologyDeclarationDto; readonly factors?: readonly MethodologyFactorDto[]; readonly used_factors?: readonly UsedFactorDto[] };
}
