import { AnalysisStatus, DifferenceSeverity, Finding, FindingDecision, FindingDifference } from '../../domain/models/vehicles';
import { Label } from '../../shared/ui/labels';
import { changeValue, fieldLabel } from './vehicles.labels';

const PHASE_LABELS: Readonly<Record<string, string>> = {
  READING: 'Leyendo el archivo',
  COMPARING: 'Comparando con tu inventario',
  DONE: 'Análisis terminado',
};

/** Fase del análisis en español; sin fase informada, el texto genérico. */
export const phaseLabel = (phase: string | null): string => (phase ? (PHASE_LABELS[phase] ?? 'Procesando') : 'En cola, esperando su turno');

export const ANALYSIS_STATUS_LABELS: Readonly<Record<AnalysisStatus, Label>> = {
  QUEUED: { text: 'En cola', tone: 'neutral' },
  RUNNING: { text: 'Analizando', tone: 'info' },
  COMPLETED: { text: 'Listo', tone: 'success' },
  FAILED: { text: 'Falló', tone: 'danger' },
};

export const SEVERITY_LABELS: Readonly<Record<DifferenceSeverity, Label>> = {
  HIGH: { text: 'Alta', tone: 'danger' },
  MEDIUM: { text: 'Media', tone: 'warning' },
  LOW: { text: 'Baja', tone: 'neutral' },
  INFO: { text: 'Informativa', tone: 'info' },
};

export const DECISION_LABELS: Readonly<Record<FindingDecision, Label | null>> = {
  PENDING: null,
  CONFIRMED: { text: 'Se usó la información del archivo', tone: 'success' },
  REJECTED: { text: 'Se mantuvo la información actual', tone: 'neutral' },
  DEFERRED: { text: 'Pendiente', tone: 'warning' },
};

const RANK: Readonly<Record<DifferenceSeverity, number>> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };

/** «Valor ilegible en el archivo: Combustible, Modelo»; `null` si no hay campos ilegibles. */
export function unreadableNote(finding: Finding): string | null {
  return finding.unreadableFields.length > 0 ? `Valor ilegible en el archivo: ${finding.unreadableFields.map(fieldLabel).join(', ')}` : null;
}

export const OVERFLOW_NOTE = 'Hay más valores distintos de los que se muestran';

/** Un cambio estructural (configuración o tipo) que ya tenía valor: usar el del archivo exige confirmación específica. */
export const isStructural = (difference: FindingDifference): boolean => difference.kind === 'STRUCTURAL' && difference.current !== null && difference.incoming !== null;

/** Hay algo que aplicar: al menos una diferencia trae un valor del archivo. Sin eso «Usar la información del archivo» no tiene efecto. */
export const hasIncomingValue = (finding: Finding): boolean => finding.differences.some((d) => d.incoming !== null);

export const needsStructuralConfirmation = (finding: Finding): boolean => finding.differences.some(isStructural);

/** Frase de la tarjeta de una inconsistencia, armada con los datos del hallazgo (nunca un texto fijo con valores). */
export function conflictSentence(finding: Finding): string {
  if (finding.inFileConflicts.length > 0) return 'El archivo trae valores distintos para esta placa.';

  const compared = finding.differences.filter((d) => d.current !== null && d.incoming !== null).sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const main = compared[0];

  if (!main) return 'El archivo trae información distinta a la registrada. Revisa cuál es correcta.';

  const current = changeValue(main.field, main.current);
  const incoming = changeValue(main.field, main.incoming);

  if (main.field === 'configuration_code') return `Esta placa ya está registrada como ${current}, pero el archivo la identifica como ${incoming}. Revisa cuál información es correcta.`;

  if (main.severity === 'HIGH') return `Esta placa ya está registrada con ${fieldLabel(main.field).toLowerCase()} ${current}, pero el archivo trae ${incoming}. Revisa cuál información es correcta.`;

  return `El archivo trae un dato distinto al registrado: ${fieldLabel(main.field).toLowerCase()} ${current} → ${incoming}. Puede ser un cambio real; decide cuál conservar.`;
}
