/** Lugares por empresa: textos de lugar que el reconocimiento oficial no resuelve y la decisión que la empresa toma sobre cada uno. */

export type PlaceReason = 'AMBIGUOUS_MUNICIPALITY' | 'UNKNOWN_MUNICIPALITY' | 'UNKNOWN_DEPARTMENT';
export type PlaceCandidateKind = 'MUNICIPALITY' | 'CENTRO_POBLADO';
export type PlaceMatch = 'EXACT' | 'PREFIX' | 'CONTAINS';
export type PlaceScope = 'IMPORT' | 'COMPANY';

/** Distancia por ruta (caché del servidor) entre un candidato y otro extremo de sus viajes; `null` si ese par aún no está guardado. */
export interface CandidateRoute {
  readonly counterpartCode: string;
  readonly km: number | null;
}

export interface PlaceCandidate {
  /** DIVIPOLA del municipio oficial; un centro poblado se elige por su municipio padre. */
  readonly code: string;
  readonly name: string;
  readonly departmentCode: string;
  readonly department: string;
  readonly kind: PlaceCandidateKind;
  readonly matchedName: string;
  readonly match: PlaceMatch;
  readonly inDepartment: boolean;
  readonly routes: readonly CandidateRoute[];
}

/** Municipio del otro extremo de los viajes de un lugar, con lo que dice el archivo. */
export interface PlaceCounterpart {
  readonly code: string;
  readonly name: string;
  readonly department: string;
  readonly trips: number;
  readonly tripsWithFileDistance: number;
  readonly avgFileDistanceKm: number | null;
}

export interface PlaceChoice {
  readonly id: string;
  readonly placeText: string;
  readonly placeKey: string;
  readonly municipalityCode: string;
  readonly municipalityName: string;
  readonly department: string;
  /** `null` si la persona que decidió ya no existe. */
  readonly chosenBy: string | null;
  readonly chosenAt: string;
  readonly note: string | null;
}

export interface PendingPlace {
  /** El texto tal como vino en el archivo: se devuelve tal cual al decidir. */
  readonly placeText: string;
  readonly placeKey: string;
  readonly reason: PlaceReason;
  readonly reasonLabel: string;
  readonly trips: number;
  readonly pendingTrips: number;
  readonly asOrigin: number;
  readonly asDestination: number;
  readonly candidates: readonly PlaceCandidate[];
  readonly counterpartsAsOrigin: readonly PlaceCounterpart[];
  readonly counterpartsAsDestination: readonly PlaceCounterpart[];
  /** La empresa ya decidió este texto, pero faltan viajes de otra carga. */
  readonly choice: PlaceChoice | null;
}

export interface ResolvedByChoice {
  readonly placeText: string;
  readonly placeKey: string;
  readonly municipalityCode: string;
  readonly municipalityName: string;
  readonly department: string;
  readonly trips: number;
}

export interface PlaceResolution {
  readonly pending: readonly PendingPlace[];
  readonly pendingPlaces: number;
  readonly pendingTrips: number;
  readonly truncated: boolean;
  readonly resolvedByChoice: readonly ResolvedByChoice[];
  /** Textos sin código que hoy el reconocimiento oficial sí resuelve: reprocesar la carga los completa. */
  readonly reprocessHint: { readonly places: number; readonly trips: number };
}

export interface PlaceChoiceRequest {
  readonly placeText: string;
  readonly municipalityCode: string;
  readonly note: string | null;
  /** Sin él, la decisión se aplica a los viajes de toda la empresa. */
  readonly importFileId: string | null;
}

export interface PlaceChoiceResult {
  readonly choice: PlaceChoice;
  readonly created: boolean;
  readonly changed: boolean;
  readonly scope: PlaceScope;
  readonly tripsUpdated: number;
  readonly tripsRecalculated: number;
  readonly nowCalculated: number;
  readonly stillPending: number;
  readonly otherTripsPending: number;
}

export interface PlaceChoiceUndoResult {
  readonly removed: boolean;
  readonly tripsReverted: number;
  readonly tripsRecalculated: number;
}
