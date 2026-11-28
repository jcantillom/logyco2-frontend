import { ImportFootprint } from './footprint';
import { PlaceResolution } from './places';
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

/** Estado de la confirmación de una carga sin viajes calculables; solo existe en esas cargas (el servidor decide cuáles). */
export interface ImportNotCalculable {
  /** `null` mientras nadie confirmó conservar el archivo. */
  readonly acknowledgedAt: string | null;
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
  /** De `distanceKm`, los km calculados por ruta (aproximados); 0 si no hubo. */
  readonly distanceFromRoutesKm: number;
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
  /** Cuándo empezó a procesarse; `null` mientras está en cola. */
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdByName: string | null;
  readonly headline: ImportHeadline | null;
  /** Ausente mientras la carga no termina (el servidor lo entrega `null`). */
  readonly vehiclesDetected?: VehiclesDetected;
  /** Presente solo si la revisión no dejó ningún viaje calculable (hallazgo `NO_CALCULABLE_TRIPS` del servidor); Angular no recalcula este criterio. */
  readonly notCalculable?: ImportNotCalculable;
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
  /** Hasta 10 textos de ejemplo (p. ej. «Origen: Villa Fantasma, Valle del Cauca»); vacío salvo en algunos hallazgos. */
  readonly examples: readonly string[];
}

/** Distancias por ruta entre municipios (OSRM sobre OpenStreetMap), aproximadas; `null` en la revisión si no se usaron. */
export interface ImportRoutes {
  readonly level: string;
  readonly approximate: boolean;
  readonly provider: string;
  readonly datasetVersion: string;
  readonly pairsTotal: number;
  readonly pairsResolved: number;
  readonly pairsUnresolved: number;
  readonly rowsResolved: number;
  readonly rowsUnresolved: number;
  /** Viajes cuyo municipio se reconoció por su nombre único (sin el departamento). */
  readonly rowsByUniqueName: number;
}

/** Lo que vio el servidor en la columna de carga para proponer kilogramos; todas las cifras son suyas (la pantalla no las deriva). */
export interface CargoUnitEvidence {
  readonly rowsWithCargo: number;
  readonly rowsOverLimit: number;
  readonly shareOverLimitPct: number;
  readonly limitTon: number;
  readonly medianValue: number | null;
  readonly medianAsTonsIfKg: number | null;
  readonly medianCapacityTon: number | null;
  readonly medianPctOfCapacity: number | null;
  readonly rowsWithCapacity: number;
  readonly rowsOverCapacityIfKg: number | null;
  /** `false`: la mediana sale de una muestra determinista (más de 4096 valores). */
  readonly medianExact: boolean;
  readonly rowsStillOutOfRangeIfKg: number;
  readonly totalTonIfKg: number;
  readonly rowsWithCargoIfKg: number;
}

export type CargoUnitStatus = 'KG_LIKELY' | 'AMBIGUOUS';
export type CargoUnitBasis = 'CAPACITY' | 'PLAUSIBLE_RANGE';

/** La columna de carga declara toneladas pero sus valores parecen kilogramos. Solo `KG_LIKELY` se puede confirmar; `AMBIGUOUS` solo informa. */
export interface CargoUnitProposal {
  readonly status: CargoUnitStatus;
  readonly basis: CargoUnitBasis;
  /** Texto del servidor, en español. */
  readonly message: string;
  readonly evidence: CargoUnitEvidence;
}

export type CargoUnit = 'KG' | 'TON';
export type CargoUnitSource = 'HEADER' | 'COMPANY_SETTING' | 'ADMIN';

/** La unidad que esta carga usa para derivar la carga en toneladas (`null` en la revisión = sin confirmar: toneladas como se declaran). */
export interface CargoUnitApplied {
  readonly unit: CargoUnit;
  readonly source: CargoUnitSource;
  readonly confirmedAt: string;
  /** Solo `HEADER`: el encabezado del archivo que declaró los kilogramos. */
  readonly header: string | null;
}

export interface CargoUnitResult {
  readonly unit: CargoUnit;
  readonly confirmedAt: string;
  readonly rowsUpdated: number;
  readonly rowsConverted: number;
  /** `true`: la unidad ya estaba confirmada así y no se recalculó nada. */
  readonly unchanged: boolean;
}

export type EstimationMode = 'OFF' | 'ASK' | 'AUTO';

export interface EfficiencyConsent {
  readonly estimate: boolean;
}

export interface EfficiencyEstimationState {
  readonly platformEnabled: boolean;
  readonly mode: EstimationMode;
  readonly requiresConsent: boolean;
  readonly canEstimate: boolean;
  /** Lo registrado en esta carga (solo ASK); `null` si nadie ha decidido. */
  readonly consent: EfficiencyConsent | null;
}

export interface CoverageCount {
  readonly vehicles: number;
  readonly trips: number;
}

/** Una referencia técnica que estimaría vehículos de la carga; el valor y el rango son los del servidor. */
export interface CoverageReference {
  readonly source: string;
  readonly valueKmPerGal: number | null;
  readonly unit: string;
  readonly uncertaintyLow: number | null;
  readonly uncertaintyHigh: number | null;
  readonly licenceStatus: string;
  readonly vehicles: number;
  readonly trips: number;
  readonly unregisteredVehicles: number;
}

export interface CoverageReason {
  readonly code: string;
  readonly label: string;
  readonly vehicles: number;
  readonly trips: number;
}

/** Cobertura del rendimiento de los vehículos de la carga; solo en el detalle de una carga terminada. */
export interface EfficiencyCoverage {
  readonly estimation: EfficiencyEstimationState;
  readonly vehiclesInFile: number;
  readonly withOwnEfficiency: CoverageCount;
  readonly alreadyEstimated: CoverageCount;
  readonly without: CoverageCount & {
    readonly estimable: CoverageCount & { readonly unregisteredVehicles: number; readonly references: readonly CoverageReference[] };
    readonly blockedByLicence: CoverageCount & { readonly unregisteredVehicles: number; readonly message: string };
    readonly noReference: CoverageCount & { readonly reasons: readonly CoverageReason[] };
  };
  /** Viajes que no se calculan aunque se estime el rendimiento: les falta la distancia. */
  readonly tripsWithoutDistance: CoverageCount;
}

/** Resultado de consentir (o no) la estimación del rendimiento de una carga. */
export interface EfficiencyConsentResult {
  readonly mode: EstimationMode;
  readonly estimateEfficiency: boolean;
  readonly vehiclesEstimated: number;
  readonly tripsCalculated: number;
  readonly tripsStillPending: number;
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
  /** Rutas por municipio usadas para calcular distancias; `null` si no se usaron (o la respuesta no las trae). */
  readonly routes: ImportRoutes | null;
  /** Kilómetros de esta carga que salen de las rutas (0 si no hubo). */
  readonly totals: { readonly distanceFromRoutesKm: number };
  /** `null` si la carga no trae valores imposibles como toneladas. */
  readonly cargoUnitProposal: CargoUnitProposal | null;
  /** `null` = nadie confirmó nada: la carga se usa en toneladas, como se declara. */
  readonly cargoUnitApplied: CargoUnitApplied | null;
  /** `null` fuera del detalle de una carga terminada. */
  readonly efficiencyCoverage: EfficiencyCoverage | null;
  /** Lugares sin resolver de esta carga (calculado por el servidor al leer); `null` si la respuesta no lo trae. */
  readonly placeResolution: PlaceResolution | null;
}

/** El archivo, tal como está, no tiene viajes calculables, pero SÍ se pueden calcular estimando el rendimiento con una referencia técnica (teórico). Todas las cifras son del servidor. */
export interface CalculableWithEstimation {
  /** Viajes que se calcularían estimando ahora (0 si ya se estimaron). */
  readonly trips: number;
  readonly vehicles: number;
  readonly alreadyEstimatedTrips: number;
  readonly mode: Exclude<EstimationMode, 'OFF'>;
  /** `true` en ASK sin el consentimiento de esta carga: se da en «Rendimiento de los vehículos». */
  readonly requiresConsent: boolean;
  /** Viajes que seguirían pendientes (sin distancia, sin referencia o con la licencia bloqueada). */
  readonly pendingWithoutDistanceOrReference: number;
}

export interface ImportDetail extends ImportSummary {
  readonly review: ImportReview | null;
  /** `null` si no aplica (la carga se calcula por sí misma, o no es calculable ni estimando); entonces rige el comportamiento de siempre. */
  readonly calculableWithEstimation: CalculableWithEstimation | null;
  /** Huella de CO₂ de esta carga; `null` si aún no se calculó (cargas anteriores al cálculo o sin viajes). */
  readonly footprint: ImportFootprint | null;
}

export interface ImportCreated {
  readonly id: string;
  readonly status: ImportStatus;
  /** `true` si el mismo archivo ya se había cargado: se devuelve la carga existente. */
  readonly duplicate: boolean;
  /** Solo con `duplicate`: nombre y fecha de la carga original, para decir qué archivo ya se había procesado. */
  readonly fileName: string | null;
  readonly createdAt: string | null;
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
  /** Informativas: solo completan un dato que falta y no intervienen en el cálculo. */
  readonly technology: string | null;
  readonly capacityTons: number | null;
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
export type VehicleDecisionRequest = (
  | { readonly decision: 'ACCEPT' | 'REJECT'; readonly candidateIds: readonly string[] }
  | { readonly decision: 'ACCEPT' | 'REJECT'; readonly kind: 'NEW' | 'CHANGED' }
) & {
  /** Consentimiento de estimar el rendimiento de la carga (solo en modo ASK: el servidor lo registra, también un «no»). Ausente = no se envía. */
  readonly estimateEfficiency?: boolean;
};

export interface VehicleDecisionResult {
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
  readonly skippedReasons: readonly { readonly code: string; readonly rows: number }[];
  /** Vehículos que recibieron un rendimiento estimado en esta solicitud y los viajes que quedaron calculados (0 si no se estimó). */
  readonly vehiclesEstimated: number;
  readonly tripsEstimated: number;
  /** Nuevos y con cambios que siguen sin decidir en la carga tras la solicitud. */
  readonly remaining: number;
}
