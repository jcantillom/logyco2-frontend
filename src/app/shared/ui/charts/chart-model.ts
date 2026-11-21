/** Modelo común de los gráficos SVG propios (sin dependencias externas). */
export interface ChartSeries {
  readonly name: string;
  readonly color: string;
  readonly values: readonly number[];
}

export interface DonutSegment {
  readonly label: string;
  /** Texto secundario opcional (p. ej. el código del tipo). */
  readonly detail?: string;
  readonly value: number;
  readonly color: string;
}

/**
 * Colores de series: referencias a tokens `--c-chart-*` de `styles.scss`, así cambian con la paleta
 * activa (marca o clásica). Valen también en atributos SVG (`fill`, `stroke`).
 */
export const CHART_COLORS = {
  green: 'var(--c-chart-1)',
  emerald: 'var(--c-chart-2)',
  lime: 'var(--c-chart-3)',
  petrol: 'var(--c-chart-4)',
  blue: 'var(--c-chart-5)',
  amber: 'var(--c-chart-6)',
  slate: 'var(--c-chart-7)',
} as const;

/** Paso "redondo" (1, 2, 5 × 10ⁿ) cercano a `raw`. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;

  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

/**
 * Eje Y con marcas enteras y sin repetirse: un paso redondo y un tope que es múltiplo del paso
 * (≈4 divisiones). Los conteos nunca bajan de 1.
 */
export function axisFor(peak: number): { step: number; top: number } {
  const value = Math.max(peak, 1);
  const step = Math.max(1, niceStep(value / 4));

  return { step, top: Math.ceil(value / step) * step };
}

/**
 * Eje Y ajustado al rango real de la serie (precios que varían poco: 15.800–16.400 en lugar de 0–20.000): paso redondo,
 * base y tope múltiplos del paso y con un margen para que ningún punto quede sobre el borde.
 */
export function axisFit(low: number, high: number): { step: number; bottom: number; top: number } {
  const spread = high - low > 0 ? high - low : Math.max(Math.abs(high) * 0.02, 1);
  const step = niceStep(spread / 3);
  let bottom = Math.floor(low / step) * step;
  let top = Math.ceil(high / step) * step;

  if (low - bottom < step * 0.15) bottom -= step;
  if (top - high < step * 0.15) top += step;
  if (low >= 0 && bottom < 0) bottom = 0;

  return { step, bottom, top };
}

export function hasData(series: readonly ChartSeries[]): boolean {
  return series.some((s) => s.values.some((v) => v > 0));
}
