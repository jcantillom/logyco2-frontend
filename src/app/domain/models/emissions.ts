/** Familia del vehículo según el catálogo normativo. */
export type VehicleFamily = 'RIGID' | 'TRACTOR' | 'TRAILER' | 'BALANCED_TRAILER';

/** Tipo de remolque tras la designación: `S` semirremolque, `R` remolque con barra de tiro, `B` remolque balanceado. */
export type TrailerKind = 'S' | 'R' | 'B';

export interface VehicleRegulation {
  readonly name: string;
  /** Número de la resolución, si el servidor lo informa. */
  readonly number: string | null;
  readonly entity: string;
  readonly url: string | null;
  readonly inForce: boolean;
  readonly checkedOn: string;
}

export interface GeneralDimensions {
  readonly maxWidthM: number | null;
  readonly maxHeightM: number | null;
  readonly citation: string | null;
}

export interface WeightTolerance {
  readonly description: string;
  readonly citation: string | null;
}

export interface PbvVariant {
  readonly grossWeightKg: number;
  readonly toleranceKg: number;
  readonly note: string;
}

/** Disposición alternativa de ejes de un vehículo (p. ej. «Tándem direccional» del C3). */
export interface AxleLayoutOption {
  readonly id: string;
  readonly label: string;
  readonly truckAxleGroups: readonly number[];
  readonly note: string | null;
}

export interface CodeGuideLetter {
  readonly symbol: string;
  readonly meaning: string;
}

/** Guía para leer los códigos (`C2S1`): significado de las letras y regla de los dígitos. */
export interface CodeGuide {
  readonly letters: readonly CodeGuideLetter[];
  readonly digitRule: string;
  readonly source: string | null;
}

export interface FreightVehicle {
  /** Nombre de uso en la industria (`C2S1`). */
  readonly code: string;
  /** Designación de la norma (`2S1`). */
  readonly designation: string;
  /** Descripción exacta de la clasificación (para el detalle y la tabla). */
  readonly name: string;
  /** Nombre corto para la tarjeta («Camión rígido»). */
  readonly shortName: string;
  readonly family: VehicleFamily;
  readonly truckAxles: number;
  readonly trailerAxles: number;
  /** Ejes del camión o tractocamión por grupo, del delantero al trasero (`[1, 2]` = uno al frente y un tándem atrás). */
  readonly truckAxleGroups: readonly number[];
  readonly trailerAxleGroups: readonly number[];
  /** Disposiciones alternativas de ejes; vacío si solo hay una. */
  readonly layouts: readonly AxleLayoutOption[];
  readonly trailerKind: TrailerKind | null;
  readonly totalAxles: number;
  readonly description: string;
  /** Peso bruto vehicular máximo; `null` si hay varias variantes o no está verificado. */
  readonly grossWeightKg: number | null;
  readonly toleranceKg: number | null;
  readonly pbvVariants: readonly PbvVariant[];
  readonly maxLengthM: number | null;
  readonly citation: string | null;
  readonly verified: boolean;
  readonly notes: string | null;
  /** El servidor marca los vehículos que se destacan en la guía; si no informa nada es `false`. */
  readonly featured: boolean;
}

export interface VehicleCatalog {
  readonly regulation: VehicleRegulation;
  readonly generalDimensions: GeneralDimensions;
  readonly tolerance: WeightTolerance;
  readonly codeGuide: CodeGuide | null;
  readonly items: readonly FreightVehicle[];
}

export type FactorVerification = 'NOT_CONFIGURED' | 'PENDING_VALIDATION' | 'VERIFIED' | 'INVALID_CONFIGURATION';

/** Factor de emisión de CO₂ de un combustible, tal como lo entrega el servidor (el valor es un decimal en texto). */
export interface EmissionFactor {
  readonly fuelCode: string;
  readonly name: string;
  readonly value: string | null;
  /** Unidad del factor (`kg_CO2/gal`, `kg_CO2/m3`). */
  readonly unit: string;
  /** Unidad del volumen consumido (`gal`, `m3`). */
  readonly volumeUnit: string;
  /** Unidad del rendimiento (`km/gal`, `km/m3`). */
  readonly efficiencyUnit: string;
  readonly gas: string;
  readonly sourceName: string | null;
  readonly sourceDocument: string | null;
  readonly sourceUrl: string | null;
  readonly referenceYear: number | null;
  readonly status: FactorVerification;
  readonly usableForCalculation: boolean;
}

export interface SimulationInput {
  readonly fuelCode: string;
  readonly distanceKm: number;
  /** Rendimiento en la unidad del combustible (`km/gal` o `km/m3`). */
  readonly efficiency: number;
}

/** Resultado de la simulación: lo calcula el servidor; el cliente solo lo muestra. */
export interface Simulation {
  readonly fuelCode: string;
  /** Volumen estimado, en `volumeUnit` (decimal en texto). */
  readonly volume: string;
  readonly volumeUnit: string;
  readonly co2Kg: string | null;
  readonly official: boolean;
  readonly message: string | null;
  readonly factor: EmissionFactor;
}
