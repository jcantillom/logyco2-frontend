export type ImportStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ImportFormat = 'LOGYCO2_TEMPLATE' | 'CARITRANS' | 'UNRECOGNIZED';
export type ColumnRequirement = 'REQUIRED' | 'CONDITIONAL' | 'RECOMMENDED' | 'OPTIONAL';
export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO';

/** Cifras de la revisión que se muestran en el historial. */
export interface ImportHeadline {
  readonly rowsRead: number;
  readonly realConsumption: number;
  readonly estimatedConsumption: number;
  readonly pending: number;
}

/** Conteos de los vehículos que propone la carga, contra el inventario vigente. */
export interface VehiclesDetected {
  readonly new: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly pendingDecision: number;
}

/** Filtro del historial por estado; se aplica en el servidor. */
export type ImportFilter = 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'VEHICLES_PENDING';

/** Conteos de las cargas de la empresa por filtro (de una sola consulta, sin recorrer las filas de los archivos). */
export interface ImportCounts {
  readonly total: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly failed: number;
  readonly vehiclesPending: number;
  /** Sumas sobre las cargas terminadas: filas leídas, las que se pueden calcular y las que aún necesitan algún dato. */
  readonly rowsRead: number;
  readonly rowsCalculable: number;
  readonly rowsPending: number;
  /** De las filas calculables, las que traen consumo real y las que se estiman con distancia y rendimiento (real + estimado = calculable). */
  readonly rowsReal: number;
  readonly rowsEstimated: number;
  /** Placas distintas pendientes de decidir: nuevas y con cambios respecto al inventario. */
  readonly vehiclesNewPending: number;
  readonly vehiclesChangedPending: number;
  /** Fecha del primer y del último viaje de las cargas terminadas (`YYYY-MM-DD`); `null` si aún no hay. */
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  /** Kilómetros y toneladas sumados solo sobre los viajes que traen el dato, y cuántos son (del periodo elegido). */
  readonly distanceKm: number;
  readonly cargoTon: number;
  readonly rowsWithDistance: number;
  readonly rowsWithCargo: number;
}

/** Un periodo distinto de las cargas terminadas: del primer al último viaje, con cuántas cargas lo traen y cuántas filas se leyeron. */
export interface ImportPeriod {
  readonly from: string;
  readonly to: string;
  readonly imports: number;
  readonly rowsRead: number;
}

export interface ImportSummary {
  readonly id: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly status: ImportStatus;
  readonly phase: string | null;
  /** `null` mientras el archivo aún no se ha reconocido. */
  readonly format: ImportFormat | null;
  readonly rowsTotal: number | null;
  readonly rowsProcessed: number;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly createdByName: string | null;
  readonly headline: ImportHeadline | null;
  /** Ausente mientras la carga no termina (el servidor lo entrega `null`). */
  readonly vehiclesDetected?: VehiclesDetected;
  /** Motivo de un fallo, en español, tal como lo entrega el servidor. */
  readonly error: string | null;
}

export interface ImportColumn {
  readonly field: string;
  readonly label: string;
  readonly requirement: ColumnRequirement;
  readonly found: boolean;
  readonly sourceHeader: string | null;
  readonly filledRows: number;
}

export interface PendingReason {
  readonly code: string;
  readonly label: string;
  readonly rows: number;
  readonly sampleRows: readonly number[];
}

export interface ReviewIssue {
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly field: string | null;
  readonly message: string;
  readonly rows: number;
  readonly sampleRows: readonly number[];
}

export interface ImportReview {
  readonly format: ImportFormat;
  readonly rowsRead: number;
  readonly columns: readonly ImportColumn[];
  readonly methods: { readonly realConsumption: number; readonly estimatedConsumption: number; readonly pending: number };
  readonly pendingReasons: readonly PendingReason[];
  readonly issues: readonly ReviewIssue[];
  readonly vehicles: { readonly distinctPlates: number; readonly invalidPlates: number };
  readonly trips: { readonly distinctTripIds: number; readonly repeatedTripIds: number };
  /** Fechas del primer y del último viaje de esta carga; `null` si el archivo no las trae. */
  readonly period: { readonly from: string; readonly to: string } | null;
}

export interface ImportDetail extends ImportSummary {
  readonly review: ImportReview | null;
}

export interface ImportCreated {
  readonly id: string;
  readonly status: ImportStatus;
  /** `true` si el mismo archivo ya se había cargado: se devuelve la carga existente. */
  readonly duplicate: boolean;
}

/** La plantilla oficial descargada: el archivo y el nombre con el que se guarda. */
export interface TemplateFile {
  readonly blob: Blob;
  readonly fileName: string;
}

export type VehicleCandidateKind = 'NEW' | 'CHANGED' | 'UNCHANGED';
export type CandidateDecision = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** Atributos que propone el archivo para un vehículo; `null` si no los trae o si trae valores distintos. */
export interface ProposedVehicle {
  readonly configurationCode: string | null;
  readonly modelYear: number | null;
  readonly fuelType: string | null;
  readonly vehicleType: string | null;
}

/** Un campo que cambiaría en un vehículo registrado; la etiqueta viene del servidor. */
export interface CandidateChange {
  readonly field: string;
  readonly label: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** Un campo para el que el archivo trae valores distintos: no se propone. */
export interface CandidateConflict {
  readonly field: string;
  readonly label: string;
}

export interface VehicleCandidate {
  readonly id: string;
  readonly plate: string;
  readonly plateOriginal: string;
  readonly kind: VehicleCandidateKind;
  readonly decision: CandidateDecision;
  readonly proposed: ProposedVehicle;
  /** Nombre en español del combustible propuesto, tal como lo entrega el servidor. */
  readonly fuelLabel: string | null;
  /** Solo en `CHANGED`. */
  readonly changes: readonly CandidateChange[];
  readonly conflicts: readonly CandidateConflict[];
  /** Filas del archivo que usan la placa. */
  readonly tripRows: number;
  /** El vehículo registrado está inactivo: aceptar no lo reactiva. */
  readonly inactive: boolean;
  readonly vehicleId: string | null;
}

/** La decisión recae sobre una lista de candidatos o sobre todos los de un tipo (exactamente uno de los dos). */
export type VehicleDecisionRequest =
  | { readonly decision: 'ACCEPT' | 'REJECT'; readonly candidateIds: readonly string[] }
  | { readonly decision: 'ACCEPT' | 'REJECT'; readonly kind: 'NEW' | 'CHANGED' };

export interface VehicleDecisionResult {
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
  readonly skippedReasons: readonly { readonly code: string; readonly rows: number }[];
}
