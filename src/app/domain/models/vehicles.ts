export type VehicleStatus = 'ACTIVE' | 'INACTIVE';
export type VehicleSource = 'IMPORT' | 'MANUAL';
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
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
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
  readonly runId: string | null;
}

/** Archivo en el que apareció la placa y cuántas veces. */
export interface VehicleAppearance {
  readonly runId: string;
  readonly fileName: string;
  readonly at: string;
  readonly occurrences: number;
}

export interface VehicleDetail extends Vehicle {
  readonly history: readonly VehicleHistoryEntry[];
  readonly runs: readonly VehicleAppearance[];
}

/** Conteos reales del servidor para la empresa. */
export interface VehicleSummary {
  readonly registered: number;
  readonly pendingNew: number;
  readonly conflicts: number;
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

// ---------------------------------------------------------------- análisis de archivos

export type AnalysisStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type FindingState = 'NEW' | 'CONFLICT' | 'INCOMPLETE' | 'INVALID' | 'KNOWN';
export type FindingDecision = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'DEFERRED';
export type DifferenceKind = 'STRUCTURAL' | 'CHANGEABLE' | 'MISSING' | 'REFINEMENT' | 'UNIT';
export type DifferenceSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type ResolveAction = 'KEEP_CURRENT' | 'ACCEPT_INCOMING' | 'DEFER';

export interface AnalysisCreated {
  readonly id: string;
  readonly status: AnalysisStatus;
  /** `true` si el mismo archivo ya se había analizado: se devuelve la corrida existente. */
  readonly duplicate: boolean;
}

export interface AnalysisCounts {
  readonly detected: number;
  readonly known: number;
  readonly new: number;
  readonly conflict: number;
  readonly incomplete: number;
  readonly invalid: number;
}

/** Fila de «Cargas recientes»: conteos de la corrida y lo que sigue pendiente de decidir. */
export interface AnalysisSummary {
  readonly id: string;
  readonly fileName: string;
  readonly status: AnalysisStatus;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly counts: AnalysisCounts;
  readonly pending: Omit<AnalysisCounts, 'detected' | 'known'>;
}

export interface VehicleAnalysis {
  readonly id: string;
  readonly fileName: string;
  readonly status: AnalysisStatus;
  readonly phase: string | null;
  readonly rowsProcessed: number;
  readonly rowsTotal: number | null;
  readonly counts: AnalysisCounts;
  readonly error: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface VehicleAttributes {
  readonly configurationCode: string | null;
  readonly vehicleType: string | null;
  readonly fuelType: string | null;
  readonly modelYear: number | null;
  readonly technology: string | null;
  readonly capacityTons: number | null;
}

export interface FindingDifference {
  readonly field: string;
  readonly current: string | null;
  readonly incoming: string | null;
  readonly kind: DifferenceKind;
  readonly severity: DifferenceSeverity;
  readonly recommendedAction: string;
}

export interface Finding {
  readonly id: string;
  readonly plate: string;
  readonly plateOriginal: string;
  readonly state: FindingState;
  readonly decision: FindingDecision;
  readonly detected: VehicleAttributes;
  readonly current: VehicleAttributes | null;
  readonly differences: readonly FindingDifference[];
  readonly occurrences: number;
  readonly sampleRows: readonly number[];
  readonly inFileConflict: boolean;
  readonly invalidReason: string | null;
  /** Valores en conflicto dentro del propio archivo, con su número de apariciones y filas. */
  readonly inFileConflicts: readonly InFileConflict[];
  /** `null` si el servidor no lo informa. */
  readonly configurationRecognized: boolean | null;
  /** Campos cuya celda del archivo no se pudo leer (ilegible o demasiado larga); vacío si el servidor no lo informa. */
  readonly unreadableFields: readonly string[];
}

export interface InFileConflict {
  readonly field: string;
  readonly values: readonly { readonly value: string | null; readonly count: number; readonly rows: readonly number[] }[];
  /** `true` si el campo traía más valores distintos de los que se listan. */
  readonly overflow: boolean;
}

export interface FindingFilter {
  readonly state?: FindingState;
  readonly decision?: FindingDecision;
}

/** Qué se confirma: hallazgos concretos o todos los vehículos nuevos de la corrida. */
export interface ConfirmSelection {
  readonly findingIds?: readonly string[];
  readonly allNew?: boolean;
}

export interface ConfirmResult {
  readonly registered: number;
  readonly alreadyRegistered: number;
  readonly skipped: number;
}

export interface ResolveRequest {
  readonly action: ResolveAction;
  readonly fields?: readonly string[];
  readonly confirmStructural?: boolean;
}

// ---------------------------------------------------------------- notificaciones de la campana

export type NotificationSeverity = 'INFO' | 'WARNING' | 'SUCCESS';

export interface NotificationLink {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

export interface NotificationItem {
  readonly id: string;
  readonly type: string;
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly description: string;
  readonly createdAt: string;
  readonly read: boolean;
  readonly runId: string | null;
  readonly deepLink: NotificationLink;
}
