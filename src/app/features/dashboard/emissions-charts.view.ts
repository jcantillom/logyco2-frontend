import { FootprintByFuel, FootprintMonthly } from '../../domain/models/footprint';
import { monthLabel } from '../../domain/models/period';
import { BarDatum } from '../../shared/ui/charts/bar-chart';
import { ShareSlice, shareSlices } from '../../shared/ui/charts/share-chart';

/** Texto del estado vacío cuando el cálculo de CO₂ todavía no existe. */
export const NO_CALCULATION = 'Se activa cuando calcules tu huella de CO₂';
/** Texto del estado vacío cuando hay cálculo, pero no para el periodo elegido. */
export const NO_PERIOD_DATA = 'No hay cálculo para este periodo';

/**
 * Barras por mes del periodo elegido: una ranura por cada mes de `slots` (`YYYY-MM`), con el mes abreviado y el año («Ene 2026»). Un mes del periodo sin dato
 * queda en `null` (ranura vacía, no un 0 inventado); los meses fuera del periodo se descartan y un mes repetido suma, y un mes sin viajes calculados no es dato. Sin dato (`null`) devuelve vacío.
 */
export function monthlyBars(monthly: FootprintMonthly | null, slots: readonly string[]): BarDatum[] {
  if (!monthly) return [];

  const totals = new Map<string, number>();

  for (const m of monthly) {
    if (!Number.isFinite(m.kgCo2) || m.kgCo2 < 0 || m.tripsCalculated <= 0) continue;

    const key = m.month.slice(0, 7);

    totals.set(key, (totals.get(key) ?? 0) + m.kgCo2);
  }

  return slots.map((slot) => ({ label: monthLabel(slot) ?? slot, value: totals.get(slot) ?? null }));
}

/** `true` si alguna ranura del periodo tiene dato (si no, «No hay cálculo para este periodo»). */
export const hasMonthlyData = (bars: readonly BarDatum[]): boolean => bars.some((b) => b.value !== null);

/** Porciones de la dona por combustible del periodo elegido (mayor resto, «Otros» si hay más de 4, ceros omitidos). */
export function fuelSlices(byFuel: FootprintByFuel | null): ShareSlice[] {
  return shareSlices((byFuel ?? []).map((f) => ({ key: f.fuelCode, label: f.name, value: f.kgCo2 })));
}
