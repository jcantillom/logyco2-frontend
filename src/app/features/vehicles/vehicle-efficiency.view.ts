import { AppError } from '../../core/errors/app-error';
import { AppliedToPending, EfficiencyBasis, EfficiencyDeclaration, EfficiencyEstimate, EfficiencyOrigin, EfficiencyRecord, EstimateApplyResult, EstimateCounts, EstimatePreview, FichaCounts } from '../../domain/models/vehicle-efficiency';
import { Label } from '../../shared/ui/labels';
import { unitLabel } from '../../shared/ui/footprint.format';

const NUMBER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });
const COUNT = new Intl.NumberFormat('es-CO');
const DAY = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

export const NONE = '—';

/** El chip del origen: el color no es la única señal, siempre lleva su texto. */
export const ORIGIN_LABELS: Readonly<Record<EfficiencyOrigin, Label>> = {
  DECLARED: { text: 'Declarado', tone: 'info' },
  MEASURED: { text: 'Medido', tone: 'success' },
  ESTIMATED: { text: 'Estimado', tone: 'neutral' },
};

export const BASIS_LABELS: Readonly<Record<EfficiencyBasis, string>> = { REAL: 'Real', THEORETICAL: 'Teórico' };

/** «Tipo» de la ficha y del formulario: Real y Teórico son declarados; Medido es una medición. Vacío: declarado sin base. */
export type EfficiencyKind = '' | 'REAL' | 'THEORETICAL' | 'MEASURED';

export const KIND_OPTIONS: readonly { readonly value: EfficiencyKind; readonly label: string }[] = [
  { value: '', label: 'Sin indicar' },
  { value: 'REAL', label: 'Real' },
  { value: 'THEORETICAL', label: 'Teórico' },
  { value: 'MEASURED', label: 'Medido' },
];

export function declarationOf(kind: EfficiencyKind, fields: Pick<EfficiencyDeclaration, 'value' | 'unit' | 'note' | 'measuredOn'>): EfficiencyDeclaration {
  return { ...fields, origin: kind === 'MEASURED' ? 'MEASURED' : 'DECLARED', basis: kind === 'MEASURED' ? 'REAL' : kind === '' ? null : kind };
}

/** «6,9 km/gal»: el valor del servidor con su unidad. */
/** Valor tal como lo entrega el servidor (texto) con la unidad rotulada: sin reformatear ni calcular. */
export const rawEfficiencyText = (value: string, unit: string): string => `${value} ${unitLabel(unit)}`;

export const efficiencyText = (value: number, unit: string): string => `${NUMBER.format(value)} ${unitLabel(unit)}`;

/** «15/03/2026» de una fecha o instante ISO (cuenta solo el día); sin fecha, «—». */
export function dayText(iso: string | null): string {
  if (!iso) return NONE;

  const time = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

  return Number.isNaN(time) ? iso : DAY.format(time);
}

/** «Declarado · Teórico»: el origen y, si se indicó, la base. */
export const provenanceText = (origin: EfficiencyOrigin, basis: EfficiencyBasis | null): string => [ORIGIN_LABELS[origin].text, basis ? BASIS_LABELS[basis] : null].filter(Boolean).join(' · ');

/** Una línea de la historia: valor, procedencia, fecha de la medición (si hay) y quién lo declaró. */
export const recordLine = (record: EfficiencyRecord): string =>
  [efficiencyText(record.value, record.unit), provenanceText(record.origin, record.basis), record.measuredOn ? `medido el ${dayText(record.measuredOn)}` : null].filter(Boolean).join(' · ');

export const plural = (count: number, one: string, many: string): string => `${COUNT.format(count)} ${count === 1 ? one : many}`;

/** Lo que el servidor hizo con los pendientes: sus números, sin cálculos de la pantalla. `recalculated` acumula las llamadas de «Continuar». */
export function appliedText(applied: AppliedToPending, recalculated = applied.tripsRecalculated): string {
  const done = recalculated === 0 ? 'Ningún viaje pendiente cambió a calculado' : `${plural(recalculated, 'viaje pendiente ahora calculado', 'viajes pendientes ahora calculados')}`;
  const left = applied.stillPending > 0 ? `; ${plural(applied.stillPending, 'sigue pendiente', 'siguen pendientes')}` : '';

  return `${done}${left}.`;
}

export const remainingText = (remaining: number): string => `Hasta ${plural(remaining, 'viaje', 'viajes')} por revisar. Continúa para terminar.`;

/** «Continuar» no avanzó: lo que falta no se puede calcular con este rendimiento (sigue pendiente por otro motivo). */
export const STALLED_TEXT = 'Continuar ya no avanza: los viajes que faltan siguen pendientes por otros motivos.';

/** Información, no alarma: lo ya calculado no se recalcula solo. */
export const staleText = (count: number): string =>
  `${plural(count, 'viaje ya calculado usó', 'viajes ya calculados usaron')} un rendimiento anterior; no se recalculan solos.`;

/** Lo que se aplicará al confirmar la ficha: solo números del servidor. */
export function fichaPlanText(counts: FichaCounts): string {
  const trips = counts.pendingTrips === 1 ? '1 viaje pendiente se recalculará' : `${COUNT.format(counts.pendingTrips)} viajes pendientes se recalcularán`;

  if (counts.toCreate > 0) return `Se declarará el rendimiento de ${plural(counts.toCreate, 'vehículo', 'vehículos')}. Hasta ${trips}.`;

  return counts.pendingTrips > 0 ? `Los vehículos de las filas válidas ya tienen ese rendimiento. Hasta ${trips}.` : 'Los vehículos de las filas válidas ya tienen ese rendimiento: no hay nada nuevo que aplicar.';
}

/** Aplicar solo tiene sentido si hay filas válidas y algo que declarar o recalcular. */
/** Con «Reemplazar también los medidos» marcado, las filas protegidas también cuentan como algo que aplicar. */
export const canApplyFicha = (counts: FichaCounts, replaceMeasured = false): boolean => counts.valid > 0 && (counts.toCreate > 0 || counts.pendingTrips > 0 || (replaceMeasured && counts.measuredProtected > 0));

/** Mensaje de un error de esta pantalla: el del catálogo, salvo los que necesitan su contexto. */
export function efficiencyErrorText(error: AppError): string {
  if (error.code === 'MEASURED_PROTECTED') return 'Las filas válidas reemplazarían rendimientos medidos vigentes y no se aplicó nada. Marca «Reemplazar también los rendimientos medidos» si quieres reemplazarlos.';
  if (error.code === 'VEHICLE_FUEL_MISSING') return 'El vehículo no tiene combustible registrado. Complétalo en su ficha para validar la unidad del rendimiento.';

  if (error.code === 'INVALID_FIELD_VALUE' && error.details.length === 0) return 'Hay datos no válidos. Corrígelos y vuelve a guardar.';

  return error.message;
}

/** Códigos que invalidan la vista previa de la ficha: hay que volver a cargar el archivo. */
export const REVIEW_AGAIN_CODES: ReadonlySet<string> = new Set(['FICHA_TOKEN_EXPIRED', 'FICHA_PREVIEW_STALE', 'FICHA_TOKEN_INVALID']);

/** Códigos que invalidan la vista previa de la estimación: hay que revisarla de nuevo (el servidor reutiliza los de la ficha para el token). */
export const ESTIMATE_REVIEW_AGAIN_CODES: ReadonlySet<string> = new Set(['FICHA_TOKEN_EXPIRED', 'FICHA_TOKEN_INVALID', 'ESTIMATE_PREVIEW_STALE']);

/** Aviso fijo de todo lo que sale de la referencia: es teórico, no una medición. */
export const ESTIMATE_THEORETICAL = 'Estimado con referencia UPME (teórico). No es una medición de tu flota.';

const DEFAULT_SOURCE = 'UPME';

/** El aviso teórico con el nombre corto de la fuente que pone el servidor («Estimado con referencia Steer/ANDI (teórico)…»). */
export const estimateTheoreticalText = (estimate: EfficiencyEstimate): string =>
  `Estimado con referencia ${estimate.sourceShortName ?? DEFAULT_SOURCE} (teórico). No es una medición de tu flota.`;

const EVIDENCE_LABELS: Readonly<Record<string, string>> = { LOW: 'evidencia baja', MEDIUM: 'evidencia media', HIGH: 'evidencia alta' };

/** «Referencia UPME: 6,9 km/gal (rango 5,6–9,2) · Tabla 2.8, PDF p. 32»: todo sale del servidor; sin rango no se inventa uno. */
export function estimateText(estimate: EfficiencyEstimate): string {
  const range = estimate.uncertaintyLow !== null && estimate.uncertaintyHigh !== null ? ` (rango ${NUMBER.format(estimate.uncertaintyLow)}–${NUMBER.format(estimate.uncertaintyHigh)})` : '';

  return `Referencia ${estimate.sourceShortName ?? DEFAULT_SOURCE}: ${efficiencyText(estimate.value, estimate.unit)}${range} · ${estimate.tableRef}, ${estimate.pageRef}`;
}

/** «Evidencia baja · equivalencia aproximada»: cuánto respalda la fuente la cifra. */
export const estimateEvidenceText = (estimate: EfficiencyEstimate): string =>
  [EVIDENCE_LABELS[estimate.evidenceLevel] ?? null, estimate.mappingConfidence === 'APPROXIMATE' ? 'equivalencia aproximada' : null].filter(Boolean).join(' · ');

/** Lo que se estimará al confirmar: solo números del servidor. */
export function estimatePlanText(counts: EstimateCounts): string {
  const trips = counts.pendingTrips === 1 ? '1 viaje pendiente se recalculará' : `${COUNT.format(counts.pendingTrips)} viajes pendientes se recalcularán`;

  if (counts.toCreate > 0) return `Se estimará el rendimiento de ${plural(counts.toCreate, 'vehículo', 'vehículos')}. Hasta ${trips}.`;

  return 'Ningún vehículo recibiría un estimado nuevo.';
}

/** Aplicar tiene sentido si hay estimados por crear o por retirar. */
export const canApplyEstimate = (counts: EstimateCounts): boolean => counts.toCreate > 0 || counts.toRetire > 0;

/** Resultado de aplicar: lo guardado (cifras del servidor) o el motivo por el que no se guardó nada. */
export function estimateResultText(result: EstimateApplyResult): string {
  if (result.recordsCreated > 0) return `${plural(result.recordsCreated, 'estimado guardado', 'estimados guardados')}${result.recordsRetired > 0 ? ` y ${plural(result.recordsRetired, 'reemplazado', 'reemplazados')}` : ''}.`;
  if (result.alreadyEstimated > 0) return 'Ese estimado ya estaba vigente: no se creó otro registro.';
  if (result.keptVehicleEfficiency > 0) return 'El vehículo ya tiene un rendimiento declarado o medido: no se cambió.';

  return 'No se guardó ningún estimado.';
}

/** Mensaje de un error de la estimación: el del catálogo, salvo el token (aquí no hay archivo que volver a cargar). */
export function estimateErrorText(error: AppError): string {
  if (ESTIMATE_REVIEW_AGAIN_CODES.has(error.code) && error.code !== 'ESTIMATE_PREVIEW_STALE') return 'La vista previa venció. Revísala de nuevo antes de aplicar.';

  return efficiencyErrorText(error);
}

/** Cuando la vista previa no guarda nada: los motivos con el texto del servidor, o que el vehículo ya tenía valor. */
export function estimatePreviewNote(preview: EstimatePreview): string {
  const reasons = preview.rejectedByReason.map((r) => r.label).filter(Boolean);

  if (reasons.length > 0) return `No se puede estimar: ${reasons.join('; ')}.`;
  if (preview.counts.alreadyEstimated > 0) return 'Ese estimado ya estaba vigente: no se creó otro registro.';
  if (preview.counts.keptVehicleEfficiency > 0) return 'El vehículo ya tiene un rendimiento declarado o medido: no se cambió.';

  return 'No hay nada que estimar para este vehículo.';
}
