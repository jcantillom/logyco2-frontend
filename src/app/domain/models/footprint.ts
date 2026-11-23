/** Consumo de un combustible en el periodo: `unit` es la unidad del factor (`gal` o `m3`). */
export interface FootprintConsumption {
  readonly unit: string;
  readonly quantity: number;
}

/** Huella de un combustible en el periodo: kg de CO₂ con el nombre que entrega el servidor y su consumo por unidad. */
export interface FootprintFuelResult {
  readonly fuelCode: string;
  readonly name: string;
  readonly kgCo2: number;
  readonly consumption: readonly FootprintConsumption[];
}

/** Huella del periodo por combustible (gasolina, GNC y los demás que existan). */
export type FootprintByFuel = readonly FootprintFuelResult[];

/** Huella de un mes: `month` es `YYYY-MM`. Un mes sin viajes calculados no cuenta como dato. */
export interface FootprintMonth {
  readonly month: string;
  readonly kgCo2: number;
  readonly tripsCalculated: number;
}

/** Huella por mes del periodo elegido, en orden cronológico (pueden faltar meses). */
export type FootprintMonthly = readonly FootprintMonth[];

/** Huella de un periodo de igual duración que el elegido (`start`–`end`, fechas ISO), para comparar contra el anterior. */
export interface FootprintPeriod {
  readonly start: string;
  readonly end: string;
  readonly kgCo2: number;
}

/**
 * Totales de huella con el estado de los viajes. La cobertura es por cantidad de viajes y NO necesariamente es el porcentaje de emisiones cubiertas.
 * Los duplicados no entran en la cobertura. `partial` es verdadero cuando hay viajes sin calcular.
 */
export interface FootprintTotals {
  readonly kgCo2: number;
  readonly tripsCalculated: number;
  readonly tripsPending: number;
  readonly tripsBlocked: number;
  readonly tripsDuplicate: number;
  /** Viajes retenidos para revisión: no suman en las emisiones ni en la cobertura hasta que se decida. */
  readonly tripsPossibleDuplicate: number;
  readonly coverageTripsPct: number | null;
  readonly partial: boolean;
  /** kg de CO₂ con consumo medido (reportado) y estimado (distancia y rendimiento), y cuántos viajes son de cada tipo. */
  readonly measuredKgCo2: number;
  readonly estimatedKgCo2: number;
  readonly measuredTrips: number;
  readonly estimatedTrips: number;
}

/** Huella de la empresa en el periodo pedido (`null` en `from`/`to` = todas las cargas). */
export interface Footprint {
  readonly period: { readonly from: string | null; readonly to: string | null };
  readonly totals: FootprintTotals;
  readonly byMonth: FootprintMonthly;
  readonly byFuel: FootprintByFuel;
  /** Hasta 3 periodos contiguos de la misma duración que terminan en `to`, cronológicos y solo con viajes calculados. */
  readonly periods: readonly FootprintPeriod[];
}

/** Huella de UNA carga (bloque `footprint` del detalle); `null` en el detalle si la carga no tiene viajes. */
export interface ImportFootprint {
  readonly kgCo2: number;
  readonly byMonth: FootprintMonthly;
  readonly trips: { readonly calculated: number; readonly pending: number; readonly blocked: number; readonly duplicate: number; readonly possibleDuplicate: number };
  readonly coverageTripsPct: number | null;
  readonly partial: boolean;
  readonly measuredKgCo2: number;
  readonly estimatedKgCo2: number;
  readonly measuredTrips: number;
  readonly estimatedTrips: number;
}
