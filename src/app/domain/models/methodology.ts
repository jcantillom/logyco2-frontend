/** Referencia compacta de la metodología que acompaña a la huella (`methodology` del servidor). */
export interface MethodologyRef {
  readonly id: string;
  readonly version: string;
  readonly scopeLabel: string;
  readonly unit: string;
  /** Hay emisiones contabilizadas con consumo estimado o con rendimiento de referencia. */
  readonly hasEstimates: boolean;
}

/** Reparto de los kg contabilizados de una fuente de referencia. */
export interface DataOriginSource {
  readonly source: string;
  readonly kgCo2: number;
  readonly trips: number;
  /** Ya redondeado por el servidor (suma 100,0); `null` sin total contabilizado. */
  readonly pct: number | null;
}

/** Un origen del dato de energía. `key` es abierto: una clave desconocida se muestra con su etiqueta. */
export interface DataOriginBucket {
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
  readonly kgCo2: number;
  readonly trips: number;
  readonly pct: number | null;
  /** Solo el origen de referencia desglosa por fuente. */
  readonly sources: readonly DataOriginSource[];
}

/** Indicador 1: reparto de los kg contabilizados por el origen del dato. Todo es declarado por la empresa: nunca «verificado». */
export interface DataOriginShare {
  readonly verification: string;
  readonly hasVerifiedData: boolean;
  readonly totalKgCo2: number;
  readonly totalTrips: number;
  readonly rounding: string;
  readonly buckets: readonly DataOriginBucket[];
}

/** Indicador 2: cobertura del inventario. Retenidos, duplicados y anulados van aparte y fuera del denominador. */
export interface InventoryCoverage {
  readonly eligibleTrips: number;
  readonly calculatedTrips: number;
  readonly pendingTrips: number;
  readonly blockedTrips: number;
  readonly coveragePct: number | null;
  readonly excluded: { readonly heldTrips: number; readonly duplicateTrips: number; readonly voidedTrips: number };
  readonly kg: { readonly countedKgCo2: number; readonly heldKgCo2: number; readonly duplicateKgCo2: number; readonly voidedKgCo2: number };
  readonly denominator: string;
  readonly basis: string;
}

export interface ReferenceStandard {
  readonly code: string;
  readonly name: string;
  readonly role: string;
  readonly alignment: string;
}

export interface MethodologyDeclaration {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly reviewStatus: string;
  readonly approvalNote: string;
  readonly referenceStandards: readonly ReferenceStandard[];
  readonly conformityClaims: readonly string[];
  readonly notClaimed: readonly string[];
  readonly scope: { readonly boundary: string; readonly label: string; readonly description: string; readonly included: readonly string[]; readonly excluded: readonly string[] };
  readonly gases: readonly { readonly gas: string; readonly included: boolean; readonly note: string }[];
  readonly unit: { readonly code: string; readonly label: string; readonly statement: string };
  readonly factorPolicy: string;
  readonly activityDataOrigins: readonly { readonly key: string; readonly label: string; readonly meaning: string }[];
  readonly distanceMethod: readonly string[];
  readonly uncertainty: readonly string[];
  readonly limitations: readonly string[];
  readonly estimatesWarning: string;
  readonly dataVerificationStatement: string;
  readonly legalReviewNote: string;
}

/** Un factor de emisión tal como está hoy en las tablas del cálculo. `value` llega como texto exacto del servidor. */
export interface MethodologyFactor {
  readonly fuelCode: string;
  readonly name: string;
  readonly gas: string;
  readonly value: string | null;
  readonly unit: string;
  /** Etiqueta legible de la unidad («kg CO₂/gal»); `null` si el servidor no la envía. */
  readonly unitLabel: string | null;
  readonly sourceName: string | null;
  readonly sourceDocument: string | null;
  readonly sourceUrl: string | null;
  readonly referenceYear: number | null;
  readonly verificationStatus: string;
  readonly usableForCalculation: boolean;
}

/** Un factor que realmente usaron los viajes contabilizados del periodo (copia guardada en cada viaje); un periodo con dos valores lista ambos. */
export interface UsedFactor {
  readonly fuelCode: string;
  readonly value: string;
  readonly unit: string | null;
  readonly unitLabel: string | null;
  readonly sourceName: string | null;
  readonly sourceDocument: string | null;
  readonly referenceYear: number | null;
  readonly trips: number;
  readonly kgCo2: string;
}

export interface Methodology {
  readonly declaration: MethodologyDeclaration;
  readonly factors: readonly MethodologyFactor[];
  /** Factores usados en el periodo pedido; vacío si el servidor no los envía. */
  readonly usedFactors: readonly UsedFactor[];
}
