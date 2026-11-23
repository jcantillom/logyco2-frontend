/** Conciliación de viajes entre empresas vinculadas: autorizaciones por vínculo y bandeja de operaciones compartidas. */

/** Lado del par canónico (`A`/`B`): `mySide` de cada candidato dice cuál es el de la propia empresa. */
export type Side = 'A' | 'B';

export type ReconciliationLinkStatus = 'ACTIVE' | 'ENDED';

/** Lo que la empresa propia permitió. Cambia solo quien administra los vínculos de esa empresa. */
export interface OwnConsent {
  readonly matchingEnabled: boolean;
  readonly shareResults: boolean;
  /** Última vez que se cambió; `null` si nunca se ha tocado. */
  readonly updatedAt: string | null;
}

/** De la otra empresa solo se conocen los dos interruptores, nada más. */
export interface CounterpartConsent {
  readonly matchingEnabled: boolean;
  readonly shareResults: boolean;
}

export interface ReconciliationLink {
  readonly relationshipId: string;
  readonly status: ReconciliationLinkStatus;
  readonly relationshipType: string;
  readonly ourRole: 'CONTRACTOR' | 'PROVIDER';
  readonly counterpart: { readonly id: string; readonly name: string };
  readonly myConsent: OwnConsent;
  readonly counterpartConsent: CounterpartConsent;
  /** Vínculo vigente y ambas empresas permitieron buscar coincidencias. */
  readonly matchingActive: boolean;
  /** Ambas empresas permitieron compartir los resultados. */
  readonly resultsShared: boolean;
  readonly canScan: boolean;
  /** Solo en la respuesta de cambiar una autorización: la búsqueda quedó activa y conviene lanzarla. */
  readonly rescanRecommended: boolean;
}

export interface ConsentChange {
  readonly matchingEnabled: boolean;
  readonly shareResults: boolean;
}

export interface RescanResult {
  readonly candidatesCreated: number;
  /** `false` si se agotó el tiempo: repetir continúa donde quedó. */
  readonly completed: boolean;
}

export type CandidateStatus = 'POSSIBLE_MATCH' | 'CONFIRMED_MATCH' | 'CONFLICTING_DATA' | 'DISTINCT';
export type CandidateRule = 'M1' | 'M2';
export type CandidateStrength = 'STRONG' | 'WEAK';

/** Qué decide la empresa propia sobre un posible viaje compartido. */
export type SharedDecision = 'SAME' | 'DISTINCT' | 'NEEDS_INFO' | 'KEEP_PENDING';

/** Nombres de campo que el servidor usa en la evidencia y en los conflictos (nunca valores). */
export type EvidenceField = 'service_id' | 'origin' | 'destination' | 'weight' | 'fuel' | 'consumption' | 'distance' | 'kg_co2';

export interface SharedPlace {
  readonly code: string | null;
  readonly label: string | null;
}

export interface SharedQuantity {
  readonly quantity: number | null;
  readonly unit: string | null;
}

/** La declaración propia, completa. Los decimales llegan como texto y se convierten una sola vez; `null` si el dato no existe. */
export interface OwnDeclaration {
  readonly tripId: string;
  readonly importFileId: string;
  readonly rowNumber: number;
  readonly serviceId: string | null;
  readonly cargoTon: number | null;
  readonly tripDate: string | null;
  readonly plate: string | null;
  readonly origin: SharedPlace;
  readonly destination: SharedPlace;
  readonly fuelType: string | null;
  readonly consumption: SharedQuantity;
  readonly distanceKm: number | null;
  readonly kgCo2: number | null;
}

/** Lo que la otra empresa dejó ver. Existe solo si ambas permitieron compartir resultados; la placa viene enmascarada. */
export interface CounterpartDeclaration {
  readonly tripDate: string | null;
  readonly origin: SharedPlace;
  readonly destination: SharedPlace;
  readonly fuelType: string | null;
  readonly consumption: SharedQuantity;
  readonly distanceKm: number | null;
  readonly kgCo2: number | null;
  readonly plateMasked: string | null;
}

export interface SharedOperation {
  readonly id: string;
  readonly policy: string;
  readonly mySelection: Side | null;
  readonly counterpartSelection: Side | null;
  readonly effectiveSelection: Side | null;
  readonly state: 'PENDING' | 'EFFECTIVE';
}

/**
 * Qué se sabe de las cifras de un par confirmado: `identical` coinciden, `conflict` difieren, `not_shared` no se comparan porque las dos
 * empresas no comparten resultados, `null` el par sigue pendiente.
 */
export type DataComparison = 'identical' | 'conflict' | 'not_shared';

export interface SharedCandidate {
  readonly id: string;
  readonly relationshipId: string;
  readonly status: CandidateStatus;
  readonly rule: CandidateRule;
  readonly strength: CandidateStrength;
  readonly disagreement: boolean;
  readonly mySide: Side;
  readonly counterpartName: string;
  readonly matches: readonly string[];
  readonly differs: readonly string[];
  readonly conflictFields: readonly string[];
  readonly myDecision: SharedDecision | null;
  readonly counterpartDecision: SharedDecision | null;
  readonly own: OwnDeclaration;
  readonly counterpart: CounterpartDeclaration | null;
  readonly operation: SharedOperation | null;
  readonly dataComparison: DataComparison | null;
  /** Otro par con uno de estos viajes ya se decidió: este queda de solo lectura. */
  readonly superseded: boolean;
}

export interface SharedCandidateFilter {
  readonly status?: CandidateStatus;
  readonly relationshipId?: string;
}

export interface DecidedItem {
  readonly id: string;
  readonly status: CandidateStatus;
  readonly myDecision: SharedDecision | null;
  readonly disagreement: boolean;
  readonly conflictFields: readonly string[];
}

export interface SharedDecisionResult {
  readonly updated: number;
  readonly unchanged: number;
  /** Pares que pasaron a coincidencia confirmada con esta decisión (porque la otra empresa ya había confirmado). */
  readonly confirmed: number;
  /** De esos, los que quedaron con datos en conflicto. */
  readonly conflicting: number;
  readonly items: readonly DecidedItem[];
}

export interface SelectionResult {
  readonly updated: number;
  readonly unchanged: number;
  /** Operaciones cuya declaración vigente quedó acordada por ambas empresas. */
  readonly effective: number;
}

/** Máximo de candidatos que admite una decisión. */
export const MAX_SHARED_DECISIONS = 500;
