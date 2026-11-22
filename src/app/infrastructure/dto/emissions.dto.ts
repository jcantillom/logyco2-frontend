export interface VehicleRegulationDto { name: string; number?: string | null; entity: string; url: string | null; in_force: boolean; checked_on: string }
export interface GeneralDimensionsDto { max_width_m: number | null; max_height_m: number | null; citation: string | null }
export interface WeightToleranceDto { description: string; citation: string | null }
export interface PbvVariantDto { gross_weight_kg: number; tolerance_kg: number; note: string }

export interface AxleLayoutDto { id: string; label: string; truck_axle_groups: number[]; note?: string | null }
export interface CodeGuideDto { letters: { symbol: string; meaning: string }[]; digit_rule: string; source?: string | null }

export interface FreightVehicleDto {
  code: string; designation: string; name: string; short_name?: string | null;
  family: 'RIGID' | 'TRACTOR' | 'TRAILER' | 'BALANCED_TRAILER';
  truck_axles: number; trailer_axles: number; truck_axle_groups?: number[] | null; trailer_axle_groups?: number[] | null;
  layouts?: AxleLayoutDto[] | null; trailer_kind: 'S' | 'R' | 'B' | null; total_axles: number;
  description: string; gross_weight_kg: number | null; tolerance_kg: number | null; pbv_variants: PbvVariantDto[];
  max_length_m: number | null; citation: string | null; verified: boolean; notes: string | null; featured?: boolean;
}

export interface VehicleCatalogDto {
  regulation: VehicleRegulationDto; general_dimensions: GeneralDimensionsDto; tolerance: WeightToleranceDto; code_guide?: CodeGuideDto | null; items: FreightVehicleDto[];
}

export interface EmissionFactorDto {
  fuel_code: string; name: string; value: string | null; unit: string; volume_unit: string; efficiency_unit: string; gas: string;
  source_name: string | null; source_document: string | null; source_url: string | null; reference_year: number | null;
  verification_status: 'NOT_CONFIGURED' | 'PENDING_VALIDATION' | 'VERIFIED' | 'INVALID_CONFIGURATION';
  usable_for_calculation: boolean;
}

export interface SimulationRequestDto { fuel_code: string; distance_km: number; efficiency: number }
export interface SimulationDto { fuel_code: string; volume: string; volume_unit: string; co2_kg: string | null; official: boolean; message: string | null; factor: EmissionFactorDto }
