import { OperationPlaceDto, TripDetailDto } from './operations.dto';

/** Contratos JSON de `/organizations/{id}/operations/manual/…`, `POST …/trips` y `POST …/trips/{id}/void`. Los decimales viajan como texto. */
export interface ManualUnitDto {
  readonly value: string;
  readonly label: string;
}

export interface ManualOptionsDto {
  readonly dates: { readonly min: string; readonly max: string };
  readonly fuels: readonly {
    readonly value: string;
    readonly label: string;
    readonly has_factor: boolean;
    readonly consumption_units: readonly ManualUnitDto[];
    readonly efficiency_units: readonly ManualUnitDto[];
  }[];
}

export interface ManualVehicleDto {
  readonly plate: string;
  readonly configuration: string | null;
  readonly vehicle_type: string | null;
  readonly fuel_type: string | null;
  readonly fuel_label: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly last_efficiency: { readonly value: string; readonly unit: string; readonly trip_date: string | null } | null;
  readonly vehicle_efficiency?: { readonly value: string; readonly unit: string; readonly origin: string; readonly basis: string | null; readonly declared_at: string } | null;
}

export interface ManualPlaceDto {
  readonly code: string;
  readonly municipality: string;
  readonly department: string;
  readonly label: string;
}

export interface RouteDistanceDto {
  readonly available: boolean;
  readonly distance_km: string | null;
  readonly source: 'ROUTE' | 'CACHE' | null;
  readonly reason: 'ROUTING_DISABLED' | 'SAME_PLACE' | 'NO_ROUTE' | 'UNAVAILABLE' | null;
}

export interface ManualTemplateDto {
  readonly mode: 'duplicate' | 'return';
  readonly source_trip_id: string;
  readonly source_trip_ref: string | null;
  readonly plate: string | null;
  readonly plate_registered: boolean;
  readonly origin: OperationPlaceDto;
  readonly destination: OperationPlaceDto;
  readonly fuel_type: string | null;
  readonly consumption_unit: string | null;
  readonly efficiency_unit: string | null;
}

export interface ManualTripBodyDto {
  readonly trip_date: string;
  readonly plate: string;
  readonly origin: string;
  readonly destination: string;
  readonly distance_km?: string;
  readonly consumption?: string;
  readonly consumption_unit?: string;
  readonly efficiency?: string;
  readonly efficiency_unit?: string;
  readonly fuel_type?: string;
  readonly cargo_ton?: string;
  readonly confirm_distinct?: boolean;
}

export interface ManualTripOutDto {
  readonly created: boolean;
  readonly trip: TripDetailDto;
  readonly result: {
    readonly status: string;
    readonly reason: string | null;
    readonly reason_label: string | null;
    readonly method_label: string | null;
    readonly kg_co2: string | null;
    readonly counted: boolean;
    readonly counted_note: string | null;
    readonly completable: boolean;
    readonly missing_fields: readonly string[];
  };
}

export interface RepeatedDataDto {
  readonly candidates: readonly {
    readonly id: string;
    readonly trip_id: string | null;
    readonly trip_date: string | null;
    readonly plate: string | null;
    readonly origin: OperationPlaceDto;
    readonly destination: OperationPlaceDto;
    readonly status: string;
    readonly state_label: string;
    readonly source: 'FILE' | 'MANUAL';
    readonly kg_co2: string | null;
  }[];
}

export interface VoidBodyDto {
  readonly reason?: string;
  readonly expected_version?: number;
}

export interface VoidOutDto {
  readonly already_voided: boolean;
  readonly trip: TripDetailDto;
  readonly effect: { readonly counted_before: boolean; readonly counted_after: boolean; readonly kg_co2_removed: string | null };
}
