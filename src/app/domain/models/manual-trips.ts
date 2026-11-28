import { TripDetail, TripPlace, TripSource, TripStatus } from './operations';
import { EfficiencyBasis, EfficiencyOrigin } from './vehicle-efficiency';

/** Registrar viajes uno a uno (Etapa 2): lo que ofrece el formulario y lo que devuelve el servidor, que es quien calcula todo. */
export interface ManualUnit {
  readonly value: string;
  readonly label: string;
}

export interface ManualFuel {
  readonly value: string;
  readonly label: string;
  /** `false`: el viaje se guarda pero queda sin calcular (sin factor de emisión verificado). */
  readonly hasFactor: boolean;
  readonly consumptionUnits: readonly ManualUnit[];
  readonly efficiencyUnits: readonly ManualUnit[];
}

export interface ManualOptions {
  /** Fechas admitidas (`AAAA-MM-DD`). */
  readonly minDate: string;
  readonly maxDate: string;
  readonly fuels: readonly ManualFuel[];
}

/** Sugerencia explícita: el rendimiento del último viaje calculado de la placa. Nunca se aplica sola. */
export interface ManualLastEfficiency {
  readonly value: string;
  readonly unit: string;
  readonly tripDate: string | null;
}

/** Sugerencia explícita: el rendimiento vigente declarado o medido del vehículo. Se ofrece primero y nunca se aplica sola. */
export interface ManualVehicleEfficiency {
  readonly value: string;
  readonly unit: string;
  readonly origin: EfficiencyOrigin;
  readonly basis: EfficiencyBasis | null;
  readonly declaredAt: string;
}

export interface ManualVehicle {
  readonly plate: string;
  readonly configuration: string | null;
  readonly vehicleType: string | null;
  /** `null`: el vehículo no tiene combustible registrado y el viaje debe indicarlo. */
  readonly fuelType: string | null;
  readonly fuelLabel: string | null;
  readonly active: boolean;
  readonly lastEfficiency: ManualLastEfficiency | null;
  readonly vehicleEfficiency: ManualVehicleEfficiency | null;
}

export interface ManualPlace {
  /** Código DIVIPOLA que se envía al registrar. */
  readonly code: string;
  /** «Municipio, Departamento». */
  readonly label: string;
}

export type RouteUnavailableReason = 'ROUTING_DISABLED' | 'SAME_PLACE' | 'NO_ROUTE' | 'UNAVAILABLE';

/** Distancia por ruta, solo informativa: no viaja al registrar (el servidor la vuelve a resolver). */
export interface RouteDistance {
  readonly available: boolean;
  readonly distanceKm: number | null;
  readonly reason: RouteUnavailableReason | null;
}

export type TemplateMode = 'duplicate' | 'return';

/** Estructura para duplicar un viaje o registrar el de regreso: sin fecha, sin energía y sin distancia. */
export interface ManualTemplate {
  readonly mode: TemplateMode;
  readonly sourceTripRef: string | null;
  readonly plate: string | null;
  readonly plateRegistered: boolean;
  /** `code = null`: el lugar del viaje original no tiene código y se elige de nuevo. */
  readonly origin: TripPlace;
  readonly destination: TripPlace;
  readonly fuelType: string | null;
  readonly consumptionUnit: string | null;
  readonly efficiencyUnit: string | null;
}

export interface ManualQuantity {
  readonly value: string;
  readonly unit: string;
}

/** Lo que la persona escribió: solo lo no vacío viaja. `distanceKm` únicamente si la escribió ella. */
export interface ManualTripInput {
  readonly tripDate: string;
  readonly plate: string;
  readonly origin: string;
  readonly destination: string;
  readonly distanceKm?: string;
  readonly consumption?: ManualQuantity;
  readonly efficiency?: ManualQuantity;
  readonly fuelType?: string;
  readonly cargoTon?: string;
  readonly confirmDistinct?: boolean;
}

export interface ManualResult {
  readonly status: TripStatus;
  readonly reasonLabel: string | null;
  readonly methodLabel: string | null;
  readonly kgCo2: number | null;
  readonly counted: boolean;
  readonly countedNote: string | null;
  readonly completable: boolean;
}

export interface ManualTripOutcome {
  /** `false`: reenvío con la misma clave; es el viaje original, no uno nuevo. */
  readonly created: boolean;
  readonly trip: TripDetail;
  readonly result: ManualResult;
}

/** Un viaje ya registrado con la misma fecha, placa y ruta (`AppError.data` de `MANUAL_TRIP_REPEATED`). */
export interface RepeatedTrip {
  readonly id: string;
  readonly tripId: string | null;
  readonly tripDate: string | null;
  readonly plate: string | null;
  readonly origin: TripPlace;
  readonly destination: TripPlace;
  readonly stateLabel: string;
  readonly source: TripSource;
  readonly kgCo2: number | null;
}

export interface VoidInput {
  readonly reason?: string;
  readonly expectedVersion?: number;
}

export interface VoidOutcome {
  readonly alreadyVoided: boolean;
  readonly trip: TripDetail;
  readonly kgCo2Removed: number | null;
}
