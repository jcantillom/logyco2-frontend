import { BulkPreview, CompletionField, CompletionResult } from '../../domain/models/operations';
import { kgText } from './operations.view';

/** Títulos de los grupos de datos que van juntos (cantidad y unidad). El texto de cada dato viene del servidor. */
export const GROUP_TITLES: Readonly<Record<CompletionField['group'], string>> = {
  fuel: 'Combustible',
  consumption: 'Consumo',
  efficiency: 'Rendimiento',
  distance: 'Distancia',
};

export interface FieldGroup {
  readonly group: CompletionField['group'];
  readonly title: string;
  readonly fields: readonly CompletionField[];
}

/** Agrupa los datos que pide el servidor conservando su orden de aparición. */
export function groupFields(fields: readonly CompletionField[]): readonly FieldGroup[] {
  const groups = new Map<CompletionField['group'], CompletionField[]>();

  for (const field of fields) groups.set(field.group, [...(groups.get(field.group) ?? []), field]);

  return Array.from(groups, ([group, list]) => ({ group, title: GROUP_TITLES[group], fields: list }));
}

/** Rango del servidor como texto de ayuda: «Mayor que 0 y hasta 100». Solo muestra lo que el servidor dijo. */
export function rangeText(field: CompletionField): string | null {
  if (!field.range) return null;

  const format = (value: string): string => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 }).format(Number(value));

  return `Mayor que ${format(field.range.minExclusive)} y hasta ${format(field.range.max)}`;
}

/** El mensaje anunciado tras guardar: lo que el servidor recalculó, nunca un cálculo de la pantalla. */
export function resultMessage(result: CompletionResult): string {
  if (result.status === 'CALCULATED') return `Calculado: ${kgText(result.kgCo2)} kg CO₂`;

  if (result.status === 'DUPLICATE') return 'Quedó como duplicado: no suma';

  return result.reasonLabel ? `Sigue por completar: ${result.reasonLabel}` : 'Sigue por completar';
}

const COUNT = new Intl.NumberFormat('es-CO');
const plural = (n: number, one: string, many: string): string => `${COUNT.format(n)} ${n === 1 ? one : many}`;

/** «301 viajes de 2 placas: 280 se calcularán y 21 seguirán pendientes». */
export function previewSummary(preview: BulkPreview): string {
  const plates = preview.perPlate.filter((p) => p.affected > 0).length;
  const t = preview.totals;

  return `${plural(t.affected, 'viaje', 'viajes')} de ${plural(plates, 'placa', 'placas')}: ${plural(t.wouldCalculate, 'se calculará', 'se calcularán')} y ${plural(t.wouldRemainPending, 'seguirá pendiente', 'seguirán pendientes')}`;
}

export { plural };
