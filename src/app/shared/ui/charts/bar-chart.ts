/** Una barra del gráfico: etiqueta del eje X y valor (`null` = ranura sin dato: se dibuja vacía con «—», no como un 0 inventado). */
export interface BarDatum {
  readonly label: string;
  readonly value: number | null;
}

export interface BarLayoutItem {
  readonly label: string;
  /** `null` si la ranura no tiene dato. */
  readonly value: number | null;
  readonly valueLabel: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Centro de la barra (x) y altura de su borde superior (y): por ahí pasa la línea de tendencia. */
  readonly cx: number;
  readonly cy: number;
}

export interface BarLayout {
  readonly bars: readonly BarLayoutItem[];
  /** Marcas del eje Y, de abajo hacia arriba, con su posición vertical y su etiqueta. */
  readonly ticks: readonly { readonly value: number; readonly y: number; readonly label: string }[];
  readonly top: number;
  /** Tramos de la línea de tendencia (`x,y x,y…`): un tramo por racha de meses con dato; los huecos la cortan. Solo tramos de 2 puntos o más. */
  readonly trend: readonly string[];
  /** Etiquetas del eje X inclinadas (muchos meses) y cifras sobre las barras en vertical (si no caben en horizontal). */
  readonly rotateAxis: boolean;
  readonly rotateValues: boolean;
  /** `true` si ninguna ranura tiene dato (no hay barras que dibujar). */
  readonly empty: boolean;
}

export interface BarBox {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const WHOLE = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
/** Ancho aproximado de un carácter del texto del gráfico (unidades del viewBox), para decidir si las etiquetas caben. */
const CHAR = 5.4;
/** Hasta cuántas etiquetas del eje X caben sin inclinarse. */
const FLAT_AXIS_MAX = 6;

/** Cifra al entero con separador de miles es-CO. */
export const formatTick = (value: number): string => WHOLE.format(Math.round(value));

/** Paso «redondo» (1, 2 o 5 × 10ⁿ) igual o mayor que `raw`. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;

  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

/**
 * Eje Y con 3–4 marcas «bonitas»: el máximo se redondea hacia arriba a un múltiplo de un paso 1, 2 o 5 × 10ⁿ (≈ 3 divisiones). Siempre incluye el 0;
 * sin valores (0 o no numérico) el tope es 1.
 */
export function niceTicks(max: number): { top: number; step: number; values: number[] } {
  const peak = Number.isFinite(max) && max > 0 ? max : 0;
  const step = peak === 0 ? 1 : niceStep(peak / 3);
  const top = peak === 0 ? 1 : Math.ceil(peak / step) * step;
  const values: number[] = [];

  for (let v = 0; v <= top + step / 1000; v += step) values.push(Math.round(v * 1e6) / 1e6);

  return { top, step, values };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/**
 * Geometría pura del gráfico de barras (sin DOM): alturas proporcionales al tope del eje, centros para la línea de tendencia (que salta las ranuras sin dato) y
 * si hay que inclinar o girar las etiquetas para que con hasta 24 meses no se solapen. Los valores negativos o no numéricos se tratan como ranura sin dato.
 */
export function barLayout(data: readonly BarDatum[], box: BarBox): BarLayout {
  const values = data.map((d) => (d.value !== null && Number.isFinite(d.value) && d.value >= 0 ? d.value : null));
  const { top, values: tickValues } = niceTicks(Math.max(0, ...values.map((v) => v ?? 0)));
  const plotW = box.width - box.left - box.right;
  const plotH = box.height - box.top - box.bottom;
  const slot = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.min(slot * 0.62, 56);
  const yOf = (v: number): number => box.top + plotH - (v / top) * plotH;
  const bars = data.map((d, i): BarLayoutItem => {
    const value = values[i];
    const cx = box.left + slot * i + slot / 2;
    const height = value === null ? 0 : (value / top) * plotH;

    return { label: d.label, value, valueLabel: value === null ? '—' : formatTick(value), x: cx - barW / 2, y: value === null ? yOf(0) : yOf(value), width: barW, height, cx, cy: value === null ? yOf(0) : yOf(value) };
  });
  const trend: string[] = [];
  let run: string[] = [];

  for (const bar of bars) {
    if (bar.value === null) {
      if (run.length > 1) trend.push(run.join(' '));

      run = [];
    } else {
      run.push(`${round(bar.cx)},${round(bar.cy)}`);
    }
  }

  if (run.length > 1) trend.push(run.join(' '));

  return {
    bars,
    ticks: tickValues.map((value) => ({ value, y: yOf(value), label: formatTick(value) })),
    top,
    trend,
    rotateAxis: data.length > FLAT_AXIS_MAX,
    rotateValues: bars.some((b) => b.valueLabel.length * CHAR > slot * 0.96),
    empty: values.every((v) => v === null),
  };
}
