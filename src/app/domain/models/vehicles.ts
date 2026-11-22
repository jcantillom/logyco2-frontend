export type VehicleStatus = 'ACTIVE' | 'INACTIVE';
export type VehicleSource = 'MANUAL' | 'IMPORT';
/** Propiedad declarada del vehículo; mientras nadie la declare es `UNKNOWN` (nunca se infiere de que la placa aparezca en un archivo). */
export type VehicleOwnership = 'UNKNOWN' | 'OWN' | 'CONTRACTED' | 'THIRD_PARTY' | 'SUBCONTRACTED';

export interface Vehicle {
  readonly id: string;
  /** Placa normalizada (identidad del vehículo dentro de la empresa). */
  readonly plate: string;
  readonly plateOriginal: string;
  readonly country: string;
  readonly configurationCode: string | null;
  /** `false` si el código de configuración no está en el catálogo normativo. */
  readonly configurationRecognized: boolean;
  readonly vehicleType: string | null;
  readonly fuelType: string | null;
  readonly modelYear: number | null;
  readonly technology: string | null;
  readonly capacityTons: number | null;
  readonly ownership: VehicleOwnership;
  readonly status: VehicleStatus;
  readonly source: VehicleSource;
  readonly createdAt: string;
}

export interface VehicleChange {
  readonly field: string;
  readonly before: string | null;
  readonly after: string | null;
}

export interface VehicleHistoryEntry {
  readonly id: string;
  readonly event: string;
  readonly at: string;
  readonly actorName: string | null;
  readonly changes: readonly VehicleChange[];
}

export interface VehicleDetail extends Vehicle {
  readonly history: readonly VehicleHistoryEntry[];
}

/** Conteos reales del servidor para la empresa. */
export interface VehicleSummary {
  readonly registered: number;
  readonly inactive: number;
}

export interface VehicleFilter {
  readonly search?: string;
  readonly status?: VehicleStatus;
  readonly configuration?: string;
  readonly fuel?: string;
}

export interface NewVehicle {
  readonly plate: string;
  /** ISO 3166-1 alfa-2; el servidor usa `CO` si no se informa. */
  readonly country?: string;
  readonly configurationCode?: string;
  readonly vehicleType?: string;
  readonly fuelType?: string;
  readonly modelYear?: number;
  readonly technology?: string;
  readonly capacityTons?: number;
  readonly ownership?: VehicleOwnership;
}

/** Cambios editables; cambiar configuración o tipo exige `confirmStructural`. */
export interface VehicleChanges {
  readonly configurationCode?: string;
  readonly vehicleType?: string;
  readonly fuelType?: string;
  readonly modelYear?: number;
  readonly technology?: string;
  readonly capacityTons?: number;
  readonly ownership?: VehicleOwnership;
  readonly status?: VehicleStatus;
  readonly confirmStructural?: boolean;
}
