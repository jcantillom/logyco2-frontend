import { EstimationMode } from './imports';
import { Page } from './pagination';

/** Quién respalda el dato: lo declaró la empresa, lo midió o salió de una referencia técnica (`ESTIMATED`; solo el servidor lo crea, esta pantalla nunca lo envía como declaración). */
export type EfficiencyOrigin = 'DECLARED' | 'MEASURED' | 'ESTIMATED';
export type EfficiencyBasis = 'REAL' | 'THEORETICAL';

/** El rendimiento vigente de un vehículo, tal como llega en el inventario (`null` si no tiene). */
export interface VehicleEfficiency {
  readonly value: number;
  readonly unit: string;
  readonly origin: EfficiencyOrigin;
  readonly basis: EfficiencyBasis | null;
  readonly sourceKind: string;
  readonly measuredOn: string | null;
  readonly declaredAt: string;
}

/** Un registro de la historia del rendimiento del vehículo. */
export interface EfficiencyRecord {
  readonly id: string;
  readonly value: number;
  readonly unit: string;
  readonly origin: EfficiencyOrigin;
  readonly basis: EfficiencyBasis | null;
  readonly sourceKind: string;
  readonly note: string | null;
  readonly measuredOn: string | null;
  readonly declaredByName: string | null;
  readonly declaredAt: string;
  readonly isCurrent: boolean;
  readonly supersededAt: string | null;
}

export interface EfficiencyView {
  readonly vehicleId: string;
  readonly plate: string;
  readonly fuelType: string | null;
  /** Unidades que el servidor acepta para el combustible del vehículo (vacío si no tiene combustible). */
  readonly compatibleUnits: readonly string[];
  readonly current: EfficiencyRecord | null;
  /** La historia, el más reciente primero (incluye el vigente), paginada por el servidor. */
  readonly history: Page<EfficiencyRecord>;
  /** La estimación por referencia está encendida en el servidor (apagada: no se muestra nada de ella). */
  readonly estimationEnabled: boolean;
  /** La sugerencia de la referencia técnica para el vehículo; NO se guarda al consultarla. */
  readonly estimate: EfficiencyEstimate | null;
  /** Por qué no hay sugerencia: código y texto del servidor (`HAS_VEHICLE_EFFICIENCY` si ya tiene un valor declarado o medido). */
  readonly estimateReason: string | null;
  readonly estimateReasonLabel: string | null;
}

/** Lo que estimaría la referencia técnica (teórico). El rango es el de la fuente entre empresas, no un intervalo de confianza. */
export interface EfficiencyEstimate {
  readonly value: number;
  readonly unit: string;
  readonly sourceCategory: string;
  readonly versionLabel: string;
  readonly tableRef: string;
  readonly pageRef: string;
  readonly uncertaintyLow: number | null;
  readonly uncertaintyHigh: number | null;
  readonly mappingConfidence: string;
  readonly evidenceLevel: string;
  /** Nombre corto de la fuente («UPME», «Steer/ANDI»); sin él se asume la referencia de siempre. */
  readonly sourceShortName: string | null;
  readonly licenceStatus: string | null;
  /** Texto del servidor cuando la licencia de la fuente está sin confirmar («solo para pruebas»); `null` si no aplica. */
  readonly licenceNotice: string | null;
}

/** Lo que se declara de un vehículo. `value` viaja tal como se escribió (texto con punto decimal): el servidor valida y convierte. */
export interface EfficiencyDeclaration {
  readonly value: string;
  readonly unit: string;
  readonly origin: 'DECLARED' | 'MEASURED';
  readonly basis: EfficiencyBasis | null;
  readonly note: string | null;
  readonly measuredOn: string | null;
  /** Solo `true` cuando la persona confirmó reemplazar un rendimiento medido vigente por el declarado; ausente = no se envía. */
  readonly confirmReplaceMeasured?: boolean;
}

/** Efecto sobre los viajes pendientes; todos los números los entrega el servidor. */
export interface AppliedToPending {
  /** Viajes que pasaron a calculados en ESTA llamada. */
  readonly tripsRecalculated: number;
  readonly stillPending: number;
  /** Viajes por examinar si se alcanzó el tope por llamada: repetir la misma llamada continúa (idempotente). */
  readonly remaining: number;
  readonly cap: number;
  /** Viajes ya calculados con un rendimiento anterior del vehículo: no se recalculan solos. */
  readonly staleCalculatedTrips: number;
}

export interface DeclareResult {
  /** `false`: el mismo valor, unidad y origen ya estaban vigentes (no se creó otro registro). */
  readonly changed: boolean;
  readonly record: EfficiencyRecord;
  readonly applied: AppliedToPending;
}

export interface FichaIssue {
  readonly row: number;
  readonly plate: string | null;
  readonly field: string;
  readonly message: string;
}

/** El rendimiento medido vigente que una declaración reemplazaría (409 `MEASURED_PROTECTED`); los valores llegan como texto del servidor. */
export interface MeasuredProtection {
  /** Cuántas filas protegidas informa el servidor (solo en la ficha); `null` si no lo dice. */
  readonly protectedRows: string | null;
  readonly currentId: string | null;
  readonly value: string | null;
  readonly unit: string | null;
  readonly measuredOn: string | null;
}

/** Una fila de la ficha que reemplazaría un rendimiento medido vigente; todo viene del servidor. */
export interface ProtectedRow {
  readonly row: number;
  readonly plate: string | null;
  readonly currentValue: string;
  readonly currentUnit: string;
  readonly currentMeasuredOn: string | null;
  readonly newValue: string;
  readonly newUnit: string;
}

export interface FichaCounts {
  /** Filas válidas que reemplazarían un medido vigente: no se cuentan en `toCreate` ni `toReplace` y NO se reemplazan salvo confirmación. */
  readonly measuredProtected: number;
  readonly rows: number;
  readonly valid: number;
  readonly withIssues: number;
  readonly unchanged: number;
  readonly toCreate: number;
  readonly toReplace: number;
  readonly pendingTrips: number;
}

export interface FichaPreview {
  /** Token de confirmación: vive solo en memoria y se envía junto con el mismo archivo. */
  readonly token: string;
  readonly expiresAt: string;
  readonly counts: FichaCounts;
  /** Las primeras 50 filas con problemas. */
  readonly issues: readonly FichaIssue[];
  readonly issuesTruncated: boolean;
  readonly protectedRows: readonly ProtectedRow[];
  readonly protectedTruncated: boolean;
  readonly maxRows: number;
}

export interface FichaApplyResult {
  readonly recordsCreated: number;
  readonly recordsReplaced: number;
  /** De los reemplazados, los medidos que se reemplazaron por confirmación. */
  readonly recordsReplacedMeasured: number;
  /** Filas válidas que no se aplicaron por proteger un medido vigente (sin confirmación). */
  readonly skippedMeasuredProtected: number;
  readonly unchanged: number;
  readonly applied: AppliedToPending;
}

/** A qué vehículos se aplica la estimación: unos ids o todos los pendientes (por lotes con el cursor del servidor). */
export type EstimateScope = { readonly kind: 'vehicles'; readonly vehicleIds: readonly string[] } | { readonly kind: 'pending'; readonly after: string | null };

export interface EstimateRejection {
  readonly reason: string;
  readonly label: string;
  readonly vehicles: number;
}

export interface EstimateCounts {
  readonly considered: number;
  readonly unknownVehicles: number;
  readonly keptVehicleEfficiency: number;
  readonly alreadyEstimated: number;
  readonly toCreate: number;
  readonly toRetire: number;
  readonly rejected: number;
  /** Viajes pendientes de los vehículos con estimado: cota superior de los que se calcularían. */
  readonly pendingTrips: number;
}

export interface EstimatePreview {
  /** Token de confirmación: vive solo en memoria y se envía junto con el mismo alcance. */
  readonly token: string;
  readonly expiresAt: string;
  readonly counts: EstimateCounts;
  readonly rejectedByReason: readonly EstimateRejection[];
  /** Solo «pendientes»: hay más vehículos por examinar; se pide otra vista previa con este cursor. */
  readonly nextCursor: string | null;
  readonly maxVehicles: number;
  /** Aviso del servidor si alguna estimación sale de una fuente con licencia sin confirmar. */
  readonly licenceNotice: string | null;
}

export interface EstimateApplyResult {
  readonly recordsCreated: number;
  readonly recordsRetired: number;
  readonly alreadyEstimated: number;
  readonly keptVehicleEfficiency: number;
  readonly rejected: number;
  readonly rejectedByReason: readonly EstimateRejection[];
  readonly applied: AppliedToPending;
  readonly nextCursor: string | null;
}

export type CargoUnitMode = 'ASK' | 'AUTO_KG';

/** Ajustes de la empresa para la importación: estimar el rendimiento y convertir la carga de kg a t. Todo lo decide el servidor. */
export interface EfficiencySettings {
  readonly mode: EstimationMode;
  /** La bandera global del servidor manda sobre `mode`: apagada, la estimación no corre aunque el modo sea ASK o AUTO. */
  readonly platformEnabled: boolean;
  readonly cargoUnitMode: CargoUnitMode;
  /** Las opciones que acepta el servidor, en su orden. */
  readonly modeOptions: readonly EstimationMode[];
  readonly cargoUnitOptions: readonly CargoUnitMode[];
}

/** Lo que se cambia: al menos uno; lo omitido no cambia. */
export interface EfficiencySettingsChange {
  readonly mode?: EstimationMode;
  readonly cargoUnitMode?: CargoUnitMode;
}
