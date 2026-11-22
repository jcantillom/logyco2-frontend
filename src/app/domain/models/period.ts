/** Rango de fechas de los viajes de una o varias cargas (fechas ISO `YYYY-MM-DD`): del primer al último viaje leído del Excel. */
export interface PeriodRange {
  readonly from: string;
  readonly to: string;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const MONTH_YEAR = new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' });

interface Month {
  readonly year: number;
  readonly month: number;
}

/** Año y mes calendario de una fecha ISO (solo cuenta el día `YYYY-MM-DD`, sin zona horaria); `null` si no es una fecha válida. */
function monthOf(iso: string): Month | null {
  const match = ISO_DAY.exec(iso);

  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));

  return Number.isNaN(date.getTime()) || date.getUTCMonth() !== Number(match[2]) - 1 ? null : { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

/** Los dos extremos como meses calendario, con el menor primero (si llegan al revés se intercambian); `null` si alguno no es válido. */
function range(from: string, to: string): { first: Month; last: Month } | null {
  const a = monthOf(from);
  const b = monthOf(to);

  if (!a || !b) return null;

  return a.year * 12 + a.month <= b.year * 12 + b.month ? { first: a, last: b } : { first: b, last: a };
}

/** «Ene 2026»: mes abreviado en español con mayúscula inicial y año (`Intl`, en UTC para que la zona horaria no mueva el día). */
function monthYear({ year, month }: Month): string {
  const parts = MONTH_YEAR.formatToParts(new Date(Date.UTC(year, month, 15)));
  // `Intl` abrevia septiembre como «sept»: se fija a tres letras como los demás meses.
  const name = (parts.find((p) => p.type === 'month')?.value ?? '').replace(/\.$/, '').slice(0, 3);

  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** Cuántos meses como máximo se dibujan en una gráfica por mes (los más recientes). */
export const MAX_MONTH_SLOTS = 24;

/**
 * Un mes calendario por ranura (`YYYY-MM`), de `from` a `to` (si llegan al revés se intercambian), limitado a los `limit` meses más recientes. Es el eje X de
 * las gráficas por mes del periodo elegido; con fechas inválidas devuelve vacío.
 */
export function monthSlots(from: string, to: string, limit = MAX_MONTH_SLOTS): string[] {
  const r = range(from, to);

  if (!r) return [];

  const slots: string[] = [];

  for (let i = r.first.year * 12 + r.first.month; i <= r.last.year * 12 + r.last.month; i++) slots.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);

  return slots.slice(-limit);
}

/** «Ene 2026» para un mes `YYYY-MM` (o una fecha ISO que lo empiece); `null` si no es válido. */
export function monthLabel(month: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  const parsed = m ? monthOf(`${m[1]}-${m[2]}-01`) : null;

  return parsed ? monthYear(parsed) : null;
}

/** Meses calendario que abarca el rango, contando ambos extremos (nov–ene = 3); `null` con fechas inválidas. */
export function periodMonths(from: string, to: string): number | null {
  const r = range(from, to);

  return r ? (r.last.year - r.first.year) * 12 + (r.last.month - r.first.month) + 1 : null;
}

/**
 * Tipo de periodo según los meses calendario que abarcan las fechas leídas del Excel: 1 «Mensual», 3 «Trimestral», 6 «Semestral», 12 «Anual» y
 * cualquier otro «N meses». No se supone que el periodo empiece en un trimestre o semestre calendario: solo cuenta cuántos meses abarca.
 */
export function periodKind(from: string, to: string): string | null {
  const months = periodMonths(from, to);

  if (months === null) return null;

  return ({ 1: 'Mensual', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' } as Record<number, string>)[months] ?? `${months} meses`;
}

/** «Ene 2026 a Mar 2026»; si ambos extremos caen en el mismo mes, solo «Nov 2026»; `null` con fechas inválidas. */
export function periodRangeLabel(from: string, to: string): string | null {
  const r = range(from, to);

  if (!r) return null;

  const first = monthYear(r.first);
  const last = monthYear(r.last);

  return first === last ? first : `${first} a ${last}`;
}
