import { FootprintBucket } from '../../domain/models/footprint';
import { GRANULARITY_TEXT, Granularity } from '../../domain/models/granularity';
import { BarDatum } from '../../shared/ui/charts/bar-chart';
import { FOOTPRINT_UNIT, formatKgCo2, formatKgExact, formatTonnes } from '../../shared/ui/footprint.format';

/** Aclaración de una cubeta parcial (tooltip, tabla y lectores de pantalla). */
export const PARTIAL_BUCKET_HINT = 'Periodo parcial: incluye solo los días dentro del rango elegido';
/** Estado vacío de la serie: el periodo no tiene viajes calculados. */
export const NO_TRIPS_IN_PERIOD = 'Sin viajes calculados en este periodo';

const DAY = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** «11 mar 2026»: día, mes abreviado a tres letras y año (en UTC, sin que la zona horaria mueva el día). */
function dayLabel(time: number): string {
  const parts = DAY.formatToParts(time);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

  return `${part('day')} ${part('month').replace(/\.$/, '').slice(0, 3)} ${part('year')}`;
}
const COUNT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** «3 viajes» / «1 viaje». */
export const tripsText = (trips: number): string => `${COUNT.format(trips)} ${trips === 1 ? 'viaje' : 'viajes'}`;

/** Título de la tarjeta según la granularidad («Emisiones de CO₂ por semana»). */
export const seriesTitle = (granularity: Granularity): string => `Emisiones de CO₂ por ${GRANULARITY_TEXT[granularity].unit}`;

/** Rango que cubre la cubeta, recortado al periodo («1 mar 2026 a 15 mar 2026»); vacío si es un solo día o las fechas no son válidas. */
export function bucketRange(bucket: Pick<FootprintBucket, 'start' | 'end'>): string {
  const a = Date.parse(bucket.start);
  const b = Date.parse(bucket.end);

  return Number.isNaN(a) || Number.isNaN(b) || a === b ? '' : `${dayLabel(a)} a ${dayLabel(b)}`;
}

/** Líneas del tooltip de una cubeta: etiqueta (y rango), kg y t de CO₂, viajes y, si es parcial, la aclaración. */
export function bucketTip(bucket: FootprintBucket): readonly string[] {
  const range = bucketRange(bucket);

  return [range ? `${bucket.label} · ${range}` : bucket.label, `${formatKgExact(bucket.kgCo2)} ${FOOTPRINT_UNIT} · ${formatTonnes(bucket.tCo2)} t`, tripsText(bucket.trips), ...(bucket.partial ? [PARTIAL_BUCKET_HINT] : [])];
}

/** Barras de la serie tal como las entrega el servidor: una por cubeta, las vacías en 0 (el eje es continuo, nada se inventa ni se salta). */
export const seriesBars = (series: readonly FootprintBucket[]): BarDatum[] => series.map((b) => ({ label: b.label, value: b.kgCo2, tip: bucketTip(b), partial: b.partial }));

/** `true` si alguna cubeta tiene viajes calculados (si no, «Sin viajes calculados en este periodo»). */
export const hasSeriesData = (series: readonly FootprintBucket[]): boolean => series.some((b) => b.trips > 0 || b.kgCo2 > 0);

/** Filas de la tabla: ya formateadas para es-CO. */
export interface SeriesRow {
  readonly key: string;
  readonly label: string;
  readonly range: string;
  readonly trips: string;
  readonly kg: string;
  readonly tonnes: string;
  readonly partial: boolean;
}

export const seriesRows = (series: readonly FootprintBucket[]): SeriesRow[] =>
  series.map((b) => ({ key: b.key, label: b.label, range: bucketRange(b), trips: COUNT.format(b.trips), kg: formatKgExact(b.kgCo2), tonnes: formatTonnes(b.tCo2), partial: b.partial }));

/** Frase para el anuncio accesible cuando cambia la serie («Serie semanal: 12 periodos, total 1.826 kg CO₂»). */
export function seriesAnnouncement(granularity: Granularity, count: number, totalKg: number): string {
  return `Serie ${GRANULARITY_TEXT[granularity].adjective}: ${COUNT.format(count)} ${count === 1 ? 'periodo' : 'periodos'}, total ${formatKgCo2(totalKg)} ${FOOTPRINT_UNIT}`;
}
