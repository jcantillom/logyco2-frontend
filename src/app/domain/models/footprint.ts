/** Huella de carbono de un periodo: kg de CO₂ equivalente calculados para el rango `start`–`end` (fechas ISO). */
export interface FootprintPeriod {
  readonly start: string;
  readonly end: string;
  readonly kgCo2e: number;
}

/** Huella calculada de la empresa por periodo, en orden cronológico: el último es el periodo en curso y pueden faltar periodos. */
export interface FootprintSummary {
  readonly periods: readonly FootprintPeriod[];
}

/** Huella de un combustible en el periodo: kg de CO₂ equivalente con el nombre que entrega el servidor. */
export interface FootprintFuelResult {
  readonly fuelCode: string;
  readonly name: string;
  readonly kgCo2e: number;
}

/** Huella del periodo calculado más reciente, por combustible (gasolina, GNC y los demás que existan). */
export type FootprintByFuel = readonly FootprintFuelResult[];

/** Huella de un mes: `month` es `YYYY-MM`. */
export interface FootprintMonth {
  readonly month: string;
  readonly kgCo2e: number;
}

/** Huella por mes del periodo elegido, en orden cronológico (pueden faltar meses). */
export type FootprintMonthly = readonly FootprintMonth[];
