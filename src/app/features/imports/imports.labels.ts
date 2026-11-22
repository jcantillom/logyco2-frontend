import { CandidateDecision, ColumnRequirement, ImportFormat, ImportStatus, IssueSeverity, VehiclesDetected } from '../../domain/models/imports';
import { Label } from '../../shared/ui/labels';

const PHASES: Readonly<Record<string, string>> = {
  READING: 'Leyendo el archivo',
  REVIEWING: 'Revisando los datos',
  DONE: 'Revisión terminada',
};

/** Fase de la revisión en español; una fase que el cliente no conoce se muestra con un texto neutro. */
export const phaseLabel = (phase: string | null): string => (phase ? (PHASES[phase] ?? 'Procesando') : 'En cola, esperando su turno');

export const STATUS_LABELS: Readonly<Record<ImportStatus, Label>> = {
  QUEUED: { text: 'En cola', tone: 'neutral' },
  RUNNING: { text: 'Revisando', tone: 'info' },
  COMPLETED: { text: 'Lista', tone: 'success' },
  FAILED: { text: 'Falló', tone: 'danger' },
};

export const FORMAT_LABELS: Readonly<Record<ImportFormat, Label>> = {
  LOGYCO2_TEMPLATE: { text: 'Plantilla LOGYCA', tone: 'success' },
  CARITRANS: { text: 'Formato CARITRANS', tone: 'info' },
  UNRECOGNIZED: { text: 'No reconocido', tone: 'warning' },
};

export const REQUIREMENT_LABELS: Readonly<Record<ColumnRequirement, Label>> = {
  REQUIRED: { text: 'Obligatoria', tone: 'warning' },
  CONDITIONAL: { text: 'Condicional', tone: 'info' },
  RECOMMENDED: { text: 'Recomendada', tone: 'neutral' },
  OPTIONAL: { text: 'Opcional', tone: 'neutral' },
};

export const SEVERITY_LABELS: Readonly<Record<IssueSeverity, Label>> = {
  ERROR: { text: 'Error', tone: 'danger' },
  WARNING: { text: 'Aviso', tone: 'warning' },
  INFO: { text: 'Información', tone: 'info' },
};

/** `true` mientras la carga sigue en cola o en revisión. */
export const isRunning = (status: ImportStatus): boolean => status === 'QUEUED' || status === 'RUNNING';

/** Avance de 0 a 100; `null` (barra indeterminada) cuando el servidor aún no estima el total de filas. */
export function percent(rowsProcessed: number, rowsTotal: number | null): number | null {
  if (rowsTotal === null || rowsTotal <= 0) return null;

  return Math.min(100, Math.round((rowsProcessed / rowsTotal) * 100));
}

/** «Filas de muestra»: «filas 2, 9» o «fila 2». */
export const sampleRows = (rows: readonly number[]): string => (rows.length === 0 ? '' : `${rows.length === 1 ? 'fila' : 'filas'} ${rows.join(', ')}`);

/** Decisión ya tomada sobre un vehículo detectado (`PENDING` no muestra nada). */
export const DECISION_LABELS: Readonly<Record<Exclude<CandidateDecision, 'PENDING'>, Label>> = {
  ACCEPTED: { text: 'Aprobado', tone: 'success' },
  REJECTED: { text: 'Omitido', tone: 'neutral' },
};

/** Motivos por los que una decisión no se aplicó a algunos vehículos; uno que el cliente no conoce se muestra con un texto neutro. */
const SKIPPED_REASONS: Readonly<Record<string, string>> = {
  ALREADY_DECIDED: 'Ya tenían una decisión',
  ALREADY_REGISTERED: 'La placa ya estaba registrada',
  NO_CHANGES: 'No tenían cambios',
};

export const skippedReasonLabel = (code: string): string => SKIPPED_REASONS[code] ?? 'Otro motivo';

/** «2 vehículos nuevos · 1 con cambios», con las cifras que entrega el servidor. */
export const vehiclesSummary = (counts: VehiclesDetected): string => `${counts.new} ${counts.new === 1 ? 'vehículo nuevo' : 'vehículos nuevos'} · ${counts.changed} con cambios`;

/** `true` si la carga propone vehículos nuevos o con cambios y vale la pena ofrecer su revisión. */
export const hasVehiclesToReview = (counts: VehiclesDetected | undefined): counts is VehiclesDetected => !!counts && counts.new + counts.changed > 0;

const COUNT = new Intl.NumberFormat('es-CO');

/** Cifra con separador de miles (512.340): las cargas pueden tener cientos de miles de filas. */
export const formatCount = (value: number): string => COUNT.format(value);

/** Porcentaje entero de una parte sobre el total; nunca redondea a 0 % una parte que existe ni a 100 % una que no es todo. */
export function share(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;

  if (part >= total) return 100;

  return Math.min(99, Math.max(1, Math.round((part / total) * 100)));
}

const SIZE_UNITS = ['KB', 'MB', 'GB'] as const;

/** Tamaño de un archivo legible («20 KB», «3,4 MB»). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${formatCount(bytes)} B`;

  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${SIZE_UNITS[unit]}`;
}

/** Acción concreta, en lenguaje llano, para cada motivo por el que un viaje queda pendiente; el motivo mismo lo redacta el servidor. */
const PENDING_ACTIONS: Readonly<Record<string, string>> = {
  MISSING_DISTANCE_WITH_ROUTE: 'Agrega la distancia en km de cada viaje.',
  DISTANCE_WITHOUT_EFFICIENCY: 'Agrega el rendimiento del vehículo (km por galón, litro o m³).',
  MISSING_ENERGY_DATA: 'Agrega el consumo de combustible, o la distancia y el rendimiento.',
  MISSING_UNIT: 'Indica la unidad correcta (gal, l, m3 o kWh).',
  UNSUPPORTED_UNIT: 'Indica la unidad correcta (gal, l, m3 o kWh).',
  ELECTRIC_NEEDS_KWH: 'Registra el consumo eléctrico en kWh.',
  NO_EMISSION_FACTOR: 'Este combustible aún no tiene factor de emisión verificado: no se puede calcular por ahora.',
  INVALID_VALUES: 'Corrige los valores que no son números o están fuera de rango.',
};

/** Qué hacer para resolver un motivo pendiente; `null` si el cliente no conoce el código (no se inventa una acción). */
export const pendingAction = (code: string): string | null => PENDING_ACTIONS[code] ?? null;

/** «Ej.: filas 4 y 9» (singular: «Ej.: fila 4»); con más de dos, «Ej.: filas 4, 9 y 12». */
export function sampleRowsShort(rows: readonly number[]): string {
  if (rows.length === 0) return '';

  if (rows.length === 1) return `Ej.: fila ${rows[0]}`;

  return `Ej.: filas ${rows.slice(0, -1).join(', ')} y ${rows[rows.length - 1]}`;
}

/** «1 viaje» / «2.645.000 viajes». */
export const tripsCount = (value: number): string => `${formatCount(value)} ${value === 1 ? 'viaje' : 'viajes'}`;
