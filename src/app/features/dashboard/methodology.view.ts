import { DataOriginBucket } from '../../domain/models/methodology';
import { formatKgExact, formatPct } from '../../shared/ui/footprint.format';

/** Texto de un porcentaje que ya viene redondeado del servidor; `null` (sin total contabilizado) se muestra «—». Aquí solo se da formato. */
export const pctText = (pct: number | null): string => (pct === null ? '—' : `${formatPct(pct)} %`);

export const kgText = (kg: number): string => `${formatKgExact(kg)} kg CO₂`;

export const tripsText = (trips: number): string => `${new Intl.NumberFormat('es-CO').format(trips)} ${trips === 1 ? 'viaje' : 'viajes'}`;

/** Estados de revisión conocidos; uno nuevo del servidor se muestra tal cual. */
const REVIEW_LABELS: Readonly<Record<string, string>> = { PENDING_LOGYCA_APPROVAL: 'Pendiente de aprobación por LOGYCA', APPROVED: 'Aprobada por LOGYCA' };

export const reviewLabel = (status: string): string => REVIEW_LABELS[status] ?? status;

/** Clase de color de cada origen en la barra; una clave desconocida usa el neutro. El color nunca es lo único que identifica al origen: la leyenda lleva el texto. */
const ORIGIN_CLASSES: Readonly<Record<string, string>> = { REAL_CONSUMPTION: 'o1', DECLARED_EFFICIENCY: 'o2', MEASURED_EFFICIENCY: 'o3', REFERENCE_ESTIMATE: 'o4' };

export const originClass = (key: string): string => ORIGIN_CLASSES[key] ?? 'o0';

/** Tramos de la barra: el ancho es el `pct` del servidor (sin recalcular); lo que llega en `null` o en 0 no dibuja tramo. */
export const barSegments = (buckets: readonly DataOriginBucket[]): readonly { readonly key: string; readonly pct: number }[] =>
  buckets.filter((b) => b.pct !== null && b.pct > 0).map((b) => ({ key: b.key, pct: b.pct as number }));

/** Elementos por página de las listas largas de la metodología (sin scroll interno). */
export const FACTORS_PER_PAGE = 4;
export const REFERENCES_PER_PAGE = 2;
export const USED_FACTORS_PER_PAGE = 3;

/** Unidad de un factor: la etiqueta del servidor; el código solo si falta. */
export const factorUnit = (unit: { readonly unitLabel: string | null; readonly unit: string | null }): string => unit.unitLabel || unit.unit || '—';

export const pageCount = (total: number, size: number): number => Math.max(1, Math.ceil(total / size));

export const pageSlice = <T>(items: readonly T[], page: number, size: number): readonly T[] => items.slice(page * size, page * size + size);

/** Navegación de pestañas con teclado (flechas, Inicio, Fin); devuelve el índice nuevo o `null` si la tecla no navega. */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
