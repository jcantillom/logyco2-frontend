/** Operaciones logísticas: viajes de la empresa con lo que el servidor guardó (nada se calcula en el navegador). Los decimales ya son números; «sin dato» es `null`, nunca 0. */
export type TripStatus = 'CALCULATED' | 'PENDING' | 'BLOCKED' | 'DUPLICATE';
export type OperationsView = 'all' | 'calculated' | 'pending' | 'issues' | 'shared';
/** Qué viajes entran en la lista: los que cuentan (por defecto), los duplicados confirmados, los retenidos por revisar o todos con su estado. */
export type DedupFilter = 'counted' | 'duplicates' | 'held' | 'all_states';
export type SharedStateCode = 'POSSIBLE_MATCH' | 'CONFIRMED_MATCH' | 'CONFLICTING_DATA';

export interface TripPlace {
  readonly code: string | null;
  readonly label: string | null;
}

export interface TripQuantity {
  readonly quantity: number | null;
  readonly unit: string | null;
}

/** Solo el estado de conciliación del lado propio: nunca valores de la otra empresa. */
export interface SharedState {
  readonly state: SharedStateCode;
  readonly label: string;
}

export interface OperationTrip {
  readonly id: string;
  readonly tripId: string | null;
  readonly tripDate: string | null;
  readonly plate: string | null;
  readonly origin: TripPlace;
  readonly destination: TripPlace;
  readonly distanceKm: number | null;
  readonly cargoTon: number | null;
  readonly fuelType: string | null;
  readonly kgCo2: number | null;
  readonly status: TripStatus;
  readonly stateLabel: string;
  /** Código estable del motivo (p. ej. `DISTANCE_WITHOUT_EFFICIENCY`); `null` si no hay. */
  readonly reason: string | null;
  readonly reasonLabel: string | null;
  readonly dedupStatus: string;
  readonly importFileId: string;
  readonly fileName: string;
  readonly rowNumber: number;
  readonly configurationCode: string | null;
  readonly shared: SharedState | null;
  /** El viaje se completó en pantalla (marca barata del listado; quién y cuándo está en el detalle). */
  readonly corrected: boolean;
}

/** Conteo acotado: con `capped` hay más que `value` y se muestra «10.000+». */
export interface CappedCount {
  readonly value: number;
  readonly capped: boolean;
}

/** Una página por cursor: sin páginas numeradas; el total solo llega en la primera página. */
export interface OperationsPage {
  readonly items: readonly OperationTrip[];
  readonly limit: number;
  /** Opaco: se devuelve tal cual, con los MISMOS filtros, para pedir la página siguiente. */
  readonly nextCursor: string | null;
  readonly total: CappedCount | null;
}

export type TabCounts = Readonly<Record<OperationsView, CappedCount>>;

/** Lo que filtra el listado y el resumen de pestañas (`from` y `to` van juntos o ninguno). */
export interface OperationsFilter {
  readonly status?: Exclude<TripStatus, 'DUPLICATE'>;
  readonly fuel?: string;
  readonly importFileId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly dedup?: DedupFilter;
  readonly query?: string;
}

/** El reporte Excel descargado: el archivo y el nombre con el que se guarda. */
export interface ReportFile {
  readonly blob: Blob;
  readonly fileName: string;
}

export interface OperationsListRequest {
  readonly view: OperationsView;
  readonly limit: number;
  readonly cursor?: string | null;
}

export interface TripVehicle {
  readonly plate: string | null;
  readonly configurationCode: string | null;
  readonly vehicleType: string | null;
  readonly modelYear: number | null;
  readonly fuelType: string | null;
  readonly capacityTons: number | null;
}

export interface TripFactor {
  readonly value: number | null;
  readonly unit: string | null;
  readonly fuelCode: string | null;
  readonly sourceName: string | null;
  readonly sourceDocument: string | null;
  readonly referenceYear: number | null;
}

export interface TripEmissions {
  readonly kgCo2: number;
  readonly method: string;
  readonly factor: TripFactor;
}

export interface TripDuplicateOf {
  readonly id: string;
  readonly tripDate: string | null;
  readonly plate: string | null;
  readonly fileName: string;
}

export interface TripDedup {
  readonly status: string;
  readonly statusLabel: string;
  readonly ruleLabel: string | null;
  readonly resolvedByName: string | null;
  readonly resolvedAt: string | null;
  readonly duplicateOf: TripDuplicateOf | null;
}

export interface TripHistoryEvent {
  readonly event: string;
  readonly label: string;
  readonly at: string;
}

/** Lo guardado de un viaje, pedido solo al abrir el panel de detalle. */
export interface TripDetail {
  readonly id: string;
  readonly tripId: string | null;
  readonly serviceId: string | null;
  readonly rowNumber: number;
  readonly importFileId: string;
  readonly fileName: string;
  readonly createdAt: string;
  readonly calculatedAt: string | null;
  readonly tripDate: string | null;
  readonly cargoTon: number | null;
  readonly fuelType: string | null;
  readonly status: TripStatus;
  readonly stateLabel: string;
  readonly reason: string | null;
  readonly reasonLabel: string | null;
  readonly plate: string | null;
  readonly vehicle: TripVehicle | null;
  readonly origin: TripPlace;
  readonly destination: TripPlace;
  readonly distanceKm: number | null;
  readonly distanceSourceLabel: string | null;
  readonly methodLabel: string | null;
  readonly consumption: TripQuantity;
  readonly volumeNormalized: TripQuantity;
  readonly efficiency: TripQuantity;
  readonly emissions: TripEmissions | null;
  readonly dedup: TripDedup;
  readonly shared: SharedState | null;
  readonly history: readonly TripHistoryEvent[];
  /** El servidor dice si se puede completar en pantalla (no mira confirmaciones con vinculadas: el guardado sí las rechaza) y qué datos se pueden aportar hoy. */
  readonly completable: boolean;
  readonly missingFields: readonly string[];
  readonly correctionVersion: number;
  readonly corrected: TripCorrected | null;
  readonly declared: TripDeclared | null;
}

export interface TripCorrected {
  readonly at: string;
  /** `null` si la persona ya no existe. */
  readonly byName: string | null;
}

/** Lo que declaró el ARCHIVO: `null` en un campo de `fields` = el archivo no lo traía. Solo lectura. */
export interface TripDeclared {
  readonly fields: readonly string[];
  readonly fuelType: string | null;
  readonly consumption: TripQuantity;
  readonly efficiency: TripQuantity;
  readonly distanceKm: number | null;
}

export type ExportJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'EXPIRED';

/** Un reporte Excel en segundo plano (`/operations/exports`): lo que muestra el panel «Reportes». Nunca rutas del servidor. */
export interface ExportJob {
  readonly id: string;
  readonly status: ExportJobStatus;
  readonly rowsTotal: number;
  readonly rowsDone: number;
  /** 0-100 mientras está en cola o generándose, 100 al completarse; `null` si no aplica (falló, canceló o venció). */
  readonly progress: number | null;
  readonly sizeBytes: number | null;
  readonly requestedByName: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly expiresAt: string | null;
  readonly errorCode: string | null;
  readonly downloadable: boolean;
}

// ------------------------------------------------------------------ completar viajes pendientes (Etapa 1)

export interface CompletionOption {
  readonly value: string;
  readonly label: string;
}

/** Un dato que se puede completar HOY: la pantalla solo lo muestra (etiqueta, opciones y rango vienen del servidor). */
export interface CompletionField {
  /** Ruta con punto del cuerpo del guardado: `fuel_type`, `consumption.quantity`, `consumption.unit`, `efficiency.value`, `efficiency.unit`, `distance_km`. */
  readonly name: string;
  readonly label: string;
  readonly kind: 'number' | 'unit' | 'fuel';
  readonly group: 'fuel' | 'consumption' | 'efficiency' | 'distance';
  readonly options: readonly CompletionOption[] | null;
  readonly range: { readonly minExclusive: string; readonly max: string } | null;
  readonly hint: string | null;
}

export interface CompletionState {
  readonly tripId: string;
  /** Se devuelve como `expectedVersion` al guardar. */
  readonly version: number;
  readonly status: TripStatus;
  readonly reasonLabel: string | null;
  readonly completable: boolean;
  /** Por qué NO se puede completar (texto del servidor). */
  readonly refusal: string | null;
  readonly missing: readonly string[];
  readonly fields: readonly CompletionField[];
}

/** Lo que la persona escribió, por ruta con punto; solo lo no vacío se envía. */
export interface CompletionInput {
  readonly expectedVersion: number;
  readonly values: Readonly<Record<string, string>>;
}

export interface CompletionResult {
  readonly previousStatus: string;
  readonly status: string;
  readonly reasonLabel: string | null;
  readonly methodLabel: string | null;
  readonly kgCo2: number | null;
  readonly counted: boolean;
  readonly countedNote: string | null;
}

export interface CompletionOutcome {
  readonly changed: boolean;
  readonly version: number;
  readonly trip: TripDetail;
  readonly result: CompletionResult;
}

/** Un rendimiento EXPLÍCITO para una placa (nunca se propone ni se pone por defecto). */
export interface BulkEfficiencyItem {
  readonly plate: string;
  readonly value: string;
  readonly unit: string;
}

export interface BulkScope {
  readonly importFileId: string | null;
  readonly items: readonly BulkEfficiencyItem[];
}

export interface BulkPlatePreview {
  readonly plate: string | null;
  readonly affected: number;
  readonly wouldCalculate: number;
  readonly wouldRemainPending: number;
  readonly held: number;
  readonly skippedIncompatible: number;
}

export interface BulkTotals {
  readonly affected: number;
  readonly wouldCalculate: number;
  readonly wouldRemainPending: number;
  readonly held: number;
  readonly skippedIncompatible: number;
  readonly expectedKgCo2: number;
}

export interface BulkPreview {
  /** Confirmación opaca que `apply` exige: vive solo en memoria. */
  readonly token: string;
  readonly expiresAt: string;
  readonly cap: number;
  readonly perPlate: readonly BulkPlatePreview[];
  readonly totals: BulkTotals;
}

export interface BulkApplyResult {
  readonly applied: number;
  readonly alreadyCompleted: number;
  readonly nowCalculated: number;
  readonly stillPending: number;
  readonly held: number;
  readonly skippedIncompatible: number;
}
