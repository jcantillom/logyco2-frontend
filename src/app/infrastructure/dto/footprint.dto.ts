import { DataOriginShareDto, InventoryCoverageDto, MethodologyRefDto } from './methodology.dto';

export interface FootprintTotalsDto {
  readonly kg_co2: number;
  readonly trips_calculated: number;
  readonly trips_pending: number;
  readonly trips_blocked: number;
  readonly trips_duplicate: number;
  readonly trips_possible_duplicate?: number;
  readonly coverage_trips_pct: number | null;
  readonly partial: boolean;
  readonly measured_kg_co2: number;
  readonly estimated_kg_co2: number;
  readonly measured_trips: number;
  readonly estimated_trips: number;
  readonly by_origin?: {
    readonly real_consumption: { readonly kg_co2: number; readonly trips: number };
    readonly declared_efficiency: { readonly kg_co2: number; readonly trips: number };
    readonly reference_estimated: { readonly kg_co2: number; readonly trips: number };
    readonly reference_label?: string | null;
  };
}

export interface FootprintMonthDto {
  readonly month: string;
  readonly kg_co2: number;
  readonly trips_calculated: number;
}

export interface FootprintBucketDto {
  readonly key: string;
  readonly label: string;
  readonly start: string;
  readonly end: string;
  readonly kg_co2: number;
  readonly t_co2: number;
  readonly trips: number;
  readonly partial: boolean;
}

export interface FootprintDto {
  readonly period: { readonly from: string | null; readonly to: string | null };
  readonly totals: FootprintTotalsDto;
  readonly by_month: readonly FootprintMonthDto[];
  readonly by_fuel: readonly { readonly fuel_code: string; readonly name: string; readonly kg_co2: number; readonly consumption: readonly { readonly unit: string; readonly quantity: number }[] }[];
  readonly periods: readonly { readonly start: string; readonly end: string; readonly kg_co2: number }[];
  readonly granularity?: string;
  readonly series?: readonly FootprintBucketDto[];
  readonly series_total_kg?: number;
  readonly methodology?: MethodologyRefDto;
  readonly data_origin_share?: DataOriginShareDto;
  readonly inventory_coverage?: InventoryCoverageDto;
}

/** Bloque `footprint` del detalle de una carga. */
export interface ImportFootprintDto {
  readonly kg_co2: number;
  readonly by_month: readonly FootprintMonthDto[];
  readonly trips: { readonly calculated: number; readonly pending: number; readonly blocked: number; readonly duplicate: number; readonly possible_duplicate?: number };
  readonly coverage_trips_pct: number | null;
  readonly partial: boolean;
  readonly measured_kg_co2: number;
  readonly estimated_kg_co2: number;
  readonly measured_trips: number;
  readonly estimated_trips: number;
}
