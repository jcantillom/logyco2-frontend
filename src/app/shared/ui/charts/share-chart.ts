/** Un elemento a repartir en una dona (p. ej. un combustible con sus kg). */
export interface ShareItem {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export interface ShareSlice extends ShareItem {
  /** Participación en % con un decimal; las de todas las porciones suman EXACTAMENTE 100,0. */
  readonly pct: number;
  /** Color de la porción (token de marca; ver `SHARE_COLORS`). */
  readonly color: string;
}

/** Clave y rótulo de la porción que agrupa el resto. */
export const OTHERS_KEY = 'OTHERS';
export const OTHERS_LABEL = 'Otros';

/** Cuántas porciones se muestran antes de agrupar el resto en «Otros». */
export const MAX_SLICES = 4;

/** Colores solo de la paleta de marca: naranja, aguamarina y gris, y sus tintas 60/40 % para las siguientes porciones (todas distinguibles entre vecinas). */
export const SHARE_COLORS: readonly string[] = [
  'var(--c-primary)',
  'var(--c-secondary)',
  'var(--c-gray)',
  'color-mix(in srgb, var(--c-primary) 60%, var(--c-sf))',
  'color-mix(in srgb, var(--c-secondary) 60%, var(--c-sf))',
  'color-mix(in srgb, var(--c-gray) 40%, var(--c-sf))',
];

/**
 * Porcentajes con un decimal por el método del mayor resto: se reparten las décimas que sobran entre los mayores restos (empates: la primera), así la suma es
 * exactamente 100,0 sin que ninguna porción cambie más de una décima. Vacío si no hay valores positivos.
 */
export function largestRemainder(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0);

  if (total <= 0) return values.map(() => 0);

  const exact = values.map((v) => (v / total) * 1000);
  const tenths = exact.map(Math.floor);
  let left = 1000 - tenths.reduce((sum, v) => sum + v, 0);
  const order = exact.map((e, i) => ({ i, rest: e - Math.floor(e) })).sort((a, b) => b.rest - a.rest || a.i - b.i);

  for (const { i } of order) {
    if (left <= 0) break;

    tenths[i]++;
    left--;
  }

  return tenths.map((t) => t / 10);
}

/**
 * Porciones de la dona: se omiten los valores en 0 (o negativos o no numéricos), se ordenan de mayor a menor (empates por rótulo) y, si hay más de
 * `MAX_SLICES`, el resto se agrupa en «Otros». Las participaciones suman exactamente 100,0.
 */
export function shareSlices(items: readonly ShareItem[]): ShareSlice[] {
  const valid = items.filter((i) => Number.isFinite(i.value) && i.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'));
  const grouped: ShareItem[] =
    valid.length > MAX_SLICES ? [...valid.slice(0, MAX_SLICES), { key: OTHERS_KEY, label: OTHERS_LABEL, value: valid.slice(MAX_SLICES).reduce((sum, i) => sum + i.value, 0) }] : valid;
  const pcts = largestRemainder(grouped.map((g) => g.value));

  return grouped.map((g, i) => ({ ...g, pct: pcts[i], color: SHARE_COLORS[i % SHARE_COLORS.length] }));
}
