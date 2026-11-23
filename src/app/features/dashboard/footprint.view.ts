import { Footprint, FootprintPeriod } from '../../domain/models/footprint';
import { periodRangeLabel } from '../../domain/models/period';
import { FOOTPRINT_UNIT, coverageHint, coverageLine, coverageShort, formatKgCo2, noEmissionsReason, tripsInScope, withPossibleDuplicates } from '../../shared/ui/footprint.format';

export type FootprintDirection = 'down' | 'up' | 'flat';
const DAY_MS = 86_400_000;

const PERCENT = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Variación porcentual con un decimal y signo explícito («−12,3 %», «+8,5 %»); `0,0 %` es neutro. */
export function variationOf(shown: number, base: number): { text: string; direction: FootprintDirection } {
  const pct = Math.round(((shown - base) / base) * 1000) / 10;

  if (pct === 0) return { text: `${PERCENT.format(0)} %`, direction: 'flat' };

  return pct < 0 ? { text: `−${PERCENT.format(-pct)} %`, direction: 'down' } : { text: `+${PERCENT.format(pct)} %`, direction: 'up' };
}

const isValid = (period: FootprintPeriod): boolean => Number.isFinite(period.kgCo2) && period.kgCo2 >= 0 && !Number.isNaN(Date.parse(period.start)) && !Number.isNaN(Date.parse(period.end));

/** Los dos periodos son consecutivos: el anterior termina el día en que empieza el otro (o el día anterior). */
const isContiguous = (before: FootprintPeriod, after: FootprintPeriod): boolean => Math.abs(Date.parse(after.start) - Date.parse(before.end)) / DAY_MS <= 1.0001;

/** Qué muestra la tarjeta «Huella de carbono» cuando ya hay emisiones calculadas. */
export interface FootprintView {
  /** «Oct 2026» (o «Ene 2026 a Mar 2026»); `null` con «Todos los periodos» sin fechas. */
  readonly periodLabel: string | null;
  /** Cifra redondeada con separador de miles es-CO («5.588»). */
  readonly value: string;
  readonly unit: string;
  readonly variation: { readonly text: string; readonly direction: FootprintDirection } | null;
  /** Por qué no hay variación: «Sin base de comparación». */
  readonly note: string | null;
  readonly partial: boolean;
  /** Solo si es parcial: «12 de 18 viajes calculados». */
  readonly coverage: string | null;
  /** Solo si es parcial: «12 de 18 viajes» (versión compacta). */
  readonly coverageShort: string | null;
  /** Solo si es parcial: porcentaje por viajes con su aclaración (ayuda y nombre accesible). */
  readonly coverageHint: string | null;
  /** Ayuda y nombre accesible completos: la cobertura (si es parcial) y, si hay viajes retenidos, la frase de posibles duplicados; `null` si no hay ninguna. */
  readonly hint: string | null;
}

/** Hay emisiones calculadas si al menos un viaje se calculó (con 0 viajes el total es 0 pero no es un resultado). */
export const hasEmissions = (footprint: Footprint | null): footprint is Footprint => !!footprint && footprint.totals.tripsCalculated > 0;

/**
 * Variación contra el periodo inmediatamente anterior, con `periods` del servidor (cronológicos, de la misma duración, terminan en `to`): el actual es el
 * que termina en `period.to`; el anterior debe ser contiguo y valer más de 0. Sin base no hay variación ni número inventado.
 */
function variationFrom(footprint: Footprint): { variation: FootprintView['variation']; note: string } {
  const none = { variation: null, note: 'Sin base de comparación' };
  const periods = footprint.periods.filter(isValid).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const shown = periods[periods.length - 1];
  const base = periods[periods.length - 2];

  if (!shown || !base || shown.end !== footprint.period.to || base.kgCo2 === 0 || !isContiguous(base, shown)) return none;

  return { variation: variationOf(footprint.totals.kgCo2, base.kgCo2), note: none.note };
}

/** Lógica pura de la tarjeta. Sin emisiones calculadas devuelve `null` (estado vacío, nunca ceros como resultado). */
export function footprintView(footprint: Footprint | null): FootprintView | null {
  if (!hasEmissions(footprint)) return null;

  const { totals, period } = footprint;
  const { variation, note } = variationFrom(footprint);
  const scope = tripsInScope(totals);

  return {
    periodLabel: period.from && period.to ? periodRangeLabel(period.from, period.to) : null,
    value: formatKgCo2(totals.kgCo2),
    unit: FOOTPRINT_UNIT,
    variation,
    note: variation ? null : note,
    partial: totals.partial,
    coverage: totals.partial ? coverageLine(totals.tripsCalculated, scope) : null,
    coverageShort: totals.partial ? coverageShort(totals.tripsCalculated, scope) : null,
    coverageHint: totals.partial ? coverageHint(totals.tripsCalculated, scope, totals.coverageTripsPct) : null,
    hint: withPossibleDuplicates(totals.partial ? coverageHint(totals.tripsCalculated, scope, totals.coverageTripsPct) : null, totals.tripsPossibleDuplicate),
  };
}

/** Texto del estado vacío cuando hay huella pedida pero ningún viaje calculado: explica por qué si hay viajes sin calcular. */
export function noEmissionsText(footprint: Footprint | null): string {
  if (!footprint) return 'Se activa al calcular tu huella';

  return noEmissionsReason(footprint.totals.tripsPending + footprint.totals.tripsBlocked);
}
