import { EfficiencySummaryDto } from './vehicle-efficiency.dto';

/** Contratos JSON del backend para vehículos de empresa (`/organizations/{id}/vehicles…`). */
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
  readonly technology_original?: string | null;
  readonly capacity_tons: number | null;
  readonly ownership: string;
  readonly status: string;
  readonly source: string;
  readonly created_at: string;
  readonly efficiency?: EfficiencySummaryDto | null;
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
}

export interface VehicleDetailDto extends VehicleDto {
  readonly history: readonly VehicleHistoryEntryDto[];
}

export interface VehicleSummaryDto {
  readonly registered: number;
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
