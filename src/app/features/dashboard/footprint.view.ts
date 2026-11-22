import { FootprintPeriod, FootprintSummary } from '../../domain/models/footprint';
import { periodRangeLabel } from '../../domain/models/period';

export type FootprintDirection = 'down' | 'up' | 'flat';

/** Qué muestra la tarjeta «Huella de carbono»: el periodo, la cifra y, si hay con qué comparar, la variación. */
export interface FootprintView {
  /** «Oct 2026» (o «Ene 2026 a Mar 2026» si el periodo abarca varios meses), con el formateador compartido de periodos. */
  readonly periodLabel: string;
  /** Cifra redondeada con separador de miles es-CO («50.745»). */
  readonly value: string;
  readonly unit: string;
  /** `true` si el periodo mostrado es el último cerrado; `false` si se muestra el actual por no haber uno anterior. */
  readonly isPrevious: boolean;
  /** Variación contra el periodo inmediatamente anterior al mostrado; `null` si no hay base. */
  readonly variation: { readonly text: string; readonly direction: FootprintDirection } | null;
  /** Por qué no hay variación: «Primer periodo calculado» o «Sin base de comparación». */
  readonly note: string | null;
}

export const FOOTPRINT_UNIT = 'kg CO₂e';
const DAY_MS = 86_400_000;

const COUNT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const isValid = (period: FootprintPeriod): boolean => Number.isFinite(period.kgCo2e) && period.kgCo2e >= 0 && !Number.isNaN(Date.parse(period.start)) && !Number.isNaN(Date.parse(period.end));

/** Variación porcentual con un decimal y signo explícito («−12,3 %», «+8,5 %»); `0,0 %` es neutro. */
export function variationOf(shown: number, base: number): { text: string; direction: FootprintDirection } {
  const pct = Math.round(((shown - base) / base) * 1000) / 10;

  if (pct === 0) return { text: `${PERCENT.format(0)} %`, direction: 'flat' };

  return pct < 0 ? { text: `−${PERCENT.format(-pct)} %`, direction: 'down' } : { text: `+${PERCENT.format(pct)} %`, direction: 'up' };
}

/** Los dos periodos son consecutivos: el anterior termina el día en que empieza el otro (o el día anterior). */
const isContiguous = (before: FootprintPeriod, after: FootprintPeriod): boolean => {
  return Math.abs(Date.parse(after.start) - Date.parse(before.end)) / DAY_MS <= 1.0001;
};

/**
 * Lógica pura de la tarjeta. Se muestra el periodo anterior al actual (el último cerrado) o, si no hay un registro anterior, el actual. La
 * variación compara ese periodo con el inmediatamente anterior; sin base (no existe, no es consecutivo o vale 0) no hay variación ni número.
 * Se descartan periodos con cifras negativas o no numéricas (no pueden existir).
 */
export function footprintView(summary: FootprintSummary | null): FootprintView | null {
  const periods = (summary?.periods ?? []).filter(isValid).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  if (periods.length === 0) return null;

  const isPrevious = periods.length >= 2;
  const index = isPrevious ? periods.length - 2 : 0;
  const shown = periods[index];
  const base = index > 0 ? periods[index - 1] : null;
  const view = { periodLabel: periodRangeLabel(shown.start, shown.end) ?? '', value: COUNT.format(Math.round(shown.kgCo2e)), unit: FOOTPRINT_UNIT, isPrevious };

  if (!base) return { ...view, variation: null, note: 'Primer periodo calculado' };

  if (base.kgCo2e === 0 || !isContiguous(base, shown)) return { ...view, variation: null, note: 'Sin base de comparación' };

  return { ...view, variation: variationOf(shown.kgCo2e, base.kgCo2e), note: null };
}
