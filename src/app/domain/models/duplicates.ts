/**
 * Regla que retuvo el viaje: R2 misma identidad con valores distintos, R3 líneas repetidas en un archivo, R4 id con placa inválida o sin id e
 * idéntico sin linaje suficiente, R5 sin id: corrección, idéntico retenido o ambiguo, R6 sin id: fila adicional. El servidor puede agregar reglas:
 * una desconocida se trata con una frase neutra.
 */
export type DuplicateRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

/** Solo R4 a R6: qué clase de caso es (idéntico retenido, corrección 1 contra 1, fila adicional o grupo ambiguo). */
export type DuplicateKind = 'identical' | 'correction' | 'extra_row' | 'ambiguous';

/** Cuánto se parecen las dos cargas (porcentajes y cantidad de filas, nunca datos de las filas). */
export interface DuplicateLineage {
  /** Las dos cargas se parecen lo suficiente para considerarlas versiones del mismo archivo. */
  readonly established: boolean;
  /** Se repiten casi por completo entre sí. */
  readonly mutual: boolean;
  readonly rows: number;
  /** % de las filas con clave de la carga nueva que ya estaban en la otra. */
  readonly newPct: number;
  /** % de las filas con clave de la otra carga que están en la nueva. */
  readonly previousPct: number;
}

/** Cuántos viajes con la misma fecha, placa y ruta había en la carga con la que se compara y cuántos trae la nueva. */
export interface DuplicateGroup {
  readonly existing: number;
  readonly new: number;
}

/** Qué valor medible cambia entre los dos viajes; el servidor solo lista los que difieren. */
export type DuplicateDifference = 'fuel_type' | 'consumption' | 'distance_km' | 'efficiency';

/** Qué decide la persona: son el mismo viaje, son viajes distintos o se deja pendiente (sin cambios, queda auditado). */
export type DuplicateDecision = 'SAME_TRIP' | 'DIFFERENT_TRIPS' | 'KEEP_PENDING';

/** Con «mismo viaje» hay que elegir qué versión queda: la anterior (`EXISTING`) o la nueva (`NEW`, una corrección). */
export type DuplicateKeep = 'EXISTING' | 'NEW';

/** Identificador de un viaje tal como lo entrega el servidor (número o UUID): se devuelve sin tocar. */
export type TripId = string | number;

export interface DuplicatePlace {
  readonly code: string;
  readonly label: string;
}

/** Un viaje del par. Los decimales llegan como texto y se convierten una sola vez en el mapper; `null` si el dato no existe. */
export interface DuplicateTrip {
  readonly id: TripId;
  /** Identificador del viaje en el archivo (`id_viaje`); `null` si el archivo no lo trae. */
  readonly tripId: string | null;
  readonly tripDate: string;
  readonly plate: string;
  readonly origin: DuplicatePlace;
  readonly destination: DuplicatePlace;
  readonly fuelType: string;
  readonly consumption: { readonly quantity: number | null; readonly unit: string } | null;
  readonly distanceKm: number | null;
  readonly kgCo2: number | null;
  readonly importFileId: string;
  readonly fileName: string;
  readonly rowNumber: number | null;
}

export interface DuplicateEvidence {
  readonly identical: boolean;
  readonly matches: readonly string[];
  readonly differs: readonly string[];
  /** Solo R4 a R6; `null` si no viene o es de una clase que el cliente no conoce. */
  readonly kind: DuplicateKind | null;
  readonly lineage: DuplicateLineage | null;
  readonly group: DuplicateGroup | null;
  /** Una de las dos versiones trae el id del viaje y la otra no (el archivo ganó o perdió la columna): se comparan por fecha, placa y ruta. */
  readonly idMismatch: boolean;
}

/** Un posible duplicado: `a` es el viaje retenido (el nuevo) y `b` el original con el que se comparó (`null` si ya no existe). */
export interface PossibleDuplicate {
  readonly id: TripId;
  readonly rule: DuplicateRule | string;
  readonly ruleLabel: string;
  readonly a: DuplicateTrip;
  readonly b: DuplicateTrip | null;
  readonly differences: readonly DuplicateDifference[];
  readonly evidence: DuplicateEvidence | null;
}

export interface DuplicateFilter {
  /** Solo los posibles duplicados de una carga. */
  readonly importFileId?: string;
}

/** Decisión sobre uno o varios viajes retenidos (los `a` de los pares; hasta 500 por petición). */
export interface DuplicateResolution {
  readonly tripIds: readonly TripId[];
  readonly decision: DuplicateDecision;
  readonly keep?: DuplicateKeep;
}

export interface DuplicateResolutionResult {
  readonly resolved: number;
  readonly skipped: number;
  /** De los resueltos que siguen vigentes, cuántos todavía no tienen resultado calculado (no suman emisiones hasta que se corrijan sus datos). */
  readonly withoutResult: number;
}

/** Máximo de viajes que admite una resolución. */
export const MAX_DUPLICATE_RESOLUTION = 500;
