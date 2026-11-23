import { FootprintFuelResult, FootprintTotals } from '../../domain/models/footprint';

/** Unidad de la huella: solo CO₂ (los factores no incluyen otros gases), nunca CO₂e. */
export const FOOTPRINT_UNIT = 'kg CO₂';
/** Aclaración obligatoria de la cobertura: es por cantidad de viajes. */
export const COVERAGE_CAVEAT = 'El porcentaje es por cantidad de viajes y no necesariamente representa el porcentaje de emisiones cubiertas.';

const COUNT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Cifra con separador de miles es-CO, redondeada al entero. */
export const formatKgCo2 = (kg: number): string => COUNT.format(Math.round(kg));

/** Porcentaje con un decimal es-CO («66,7»). */
export const formatPct = (pct: number): string => PERCENT.format(pct);

/** Cuántos viajes entran en la cobertura: calculados, pendientes y bloqueados (los duplicados se excluyen). */
export const tripsInScope = (t: Pick<FootprintTotals, 'tripsCalculated' | 'tripsPending' | 'tripsBlocked'>): number => t.tripsCalculated + t.tripsPending + t.tripsBlocked;

/** «12 de 18 viajes calculados»: cobertura por cantidad de viajes. */
export const coverageLine = (calculated: number, inScope: number): string => `${COUNT.format(calculated)} de ${COUNT.format(inScope)} ${inScope === 1 ? 'viaje calculado' : 'viajes calculados'}`;

/** «12 operaciones por revisar (posibles duplicados) no están sumadas»; vacío si no hay ninguna retenida. */
export function possibleDuplicatesLine(count: number): string {
  if (count <= 0) return '';

  return count === 1 ? '1 operación por revisar (posible duplicado) no está sumada' : `${COUNT.format(count)} operaciones por revisar (posibles duplicados) no están sumadas`;
}

/** Une el texto de ayuda con la frase de posibles duplicados, si la hay (sin ella devuelve la ayuda tal cual). */
export function withPossibleDuplicates(hint: string | null, count: number): string | null {
  const line = possibleDuplicatesLine(count);

  if (!line) return hint;

  return hint ? `${hint} ${line}.` : `${line}.`;
}

/** «12 de 18 viajes»: la misma cobertura sin la palabra «calculados» (para la tarjeta compacta, donde el marcador «Parcial» ya lo dice). */
export const coverageShort = (calculated: number, inScope: number): string => `${COUNT.format(calculated)} de ${COUNT.format(inScope)} ${inScope === 1 ? 'viaje' : 'viajes'}`;

/** Texto accesible y de ayuda de la cobertura: porcentaje (si hay) y la aclaración de que es por viajes. */
export function coverageHint(calculated: number, inScope: number, pct: number | null): string {
  const share = pct === null ? '' : ` (${PERCENT.format(pct)} % de los viajes)`;

  return `Resultado parcial: ${coverageLine(calculated, inScope)}${share}. ${COVERAGE_CAVEAT}`;
}

/** «Medido 2.499 kg · Estimado 3.089 kg»: de dónde sale el consumo del total (reportado vs. distancia y rendimiento). */
export function measuredEstimatedLine(totals: Pick<FootprintTotals, 'measuredKgCo2' | 'estimatedKgCo2'>): string {
  return `Medido ${formatKgCo2(totals.measuredKgCo2)} kg · Estimado ${formatKgCo2(totals.estimatedKgCo2)} kg`;
}

/** Explicación completa de medido y estimado, para el `title` y el texto accesible. */
export function measuredEstimatedHint(totals: Pick<FootprintTotals, 'measuredKgCo2' | 'estimatedKgCo2' | 'measuredTrips' | 'estimatedTrips'>): string {
  const trips = (n: number): string => `${COUNT.format(n)} ${n === 1 ? 'viaje' : 'viajes'}`;

  return `Consumo medido (el que reportaste): ${formatKgCo2(totals.measuredKgCo2)} kg CO₂ en ${trips(totals.measuredTrips)}. Consumo estimado (con distancia y rendimiento): ${formatKgCo2(totals.estimatedKgCo2)} kg CO₂ en ${trips(totals.estimatedTrips)}.`;
}

const UNIT_LABELS: Readonly<Record<string, string>> = { gal: 'gal', m3: 'm³' };

/** Unidad de consumo para mostrar («gal», «m³»); una unidad desconocida se muestra tal cual. */
export const unitLabel = (unit: string): string => UNIT_LABELS[unit] ?? unit;

/** Consumo del combustible con su unidad («1.234 gal», «560 m³»); vacío si no hay. */
export function consumptionText(fuel: Pick<FootprintFuelResult, 'consumption'>): string {
  return fuel.consumption.filter((c) => Number.isFinite(c.quantity) && c.quantity >= 0).map((c) => `${COUNT.format(Math.round(c.quantity))} ${UNIT_LABELS[c.unit] ?? c.unit}`).join(' · ');
}

/** Por qué todavía no hay emisiones: si hay viajes pendientes o bloqueados, cuántos son; si no, que aún no se calcula nada. */
export function noEmissionsReason(waitingTrips: number): string {
  return waitingTrips > 0 ? `Aún no hay emisiones calculadas: faltan datos en ${COUNT.format(waitingTrips)} ${waitingTrips === 1 ? 'viaje' : 'viajes'}` : 'Aún no hay emisiones calculadas';
}
