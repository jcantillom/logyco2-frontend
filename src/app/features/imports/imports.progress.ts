import { ImportSummary } from '../../domain/models/imports';
import { formatClock, formatDuration } from '../../shared/ui/duration';
import { formatCount } from './imports.labels';

/** El servidor procesa cada carga en dos pasos: leer las filas y calcular las emisiones. */
export const TOTAL_STEPS = 2;

interface Step {
  readonly index: number;
  readonly label: string;
}

const STEPS: Readonly<Record<string, Step>> = {
  READING: { index: 1, label: 'Leyendo filas' },
  CALCULATING: { index: 2, label: 'Calculando emisiones' },
};

/** «Paso 1 de 2 · Leyendo filas»; `null` si la fase no es una de los dos pasos (cola o una fase que el cliente no conoce). */
export function stepText(phase: string | null): string | null {
  const step = phase ? STEPS[phase] : undefined;

  return step ? `Paso ${step.index} de ${TOTAL_STEPS} · ${step.label}` : null;
}

/**
 * Avance general de la carga, de 0 a 99 (100 solo cuando termina): `(paso anterior + fracción del paso actual) / 2`. Es una aproximación con el
 * mismo peso para los dos pasos; nunca retrocede porque la fracción del paso 2 arranca donde termina el paso 1. `null` (indeterminado) si se
 * desconoce el paso o el total de filas.
 */
export function overallPercent(phase: string | null, rowsProcessed: number, rowsTotal: number | null): number | null {
  const step = phase ? STEPS[phase] : undefined;

  if (!step || rowsTotal === null || rowsTotal <= 0) return null;

  const fraction = Math.min(1, Math.max(0, rowsProcessed / rowsTotal));

  return Math.min(99, Math.round(((step.index - 1 + fraction) / TOTAL_STEPS) * 100));
}

const timeOf = (iso: string | null): number | null => {
  const time = iso === null ? Number.NaN : Date.parse(iso);

  return Number.isNaN(time) ? null : time;
};

/** Tiempo transcurrido: desde `startedAt` si ya corre; en cola (o sin `startedAt`) desde `createdAt`. Nunca negativo. */
export function elapsedMs(item: Pick<ImportSummary, 'status' | 'createdAt' | 'startedAt'>, now: number): number {
  const from = timeOf(item.status === 'RUNNING' ? (item.startedAt ?? item.createdAt) : item.createdAt);

  return from === null ? 0 : Math.max(0, now - from);
}

/** Tiempo total de proceso de una carga terminada; `null` si falta alguna marca o no es coherente. */
export function processingMs(item: Pick<ImportSummary, 'startedAt' | 'finishedAt'>): number | null {
  const start = timeOf(item.startedAt);
  const end = timeOf(item.finishedAt);

  return start === null || end === null || end < start ? null : end - start;
}

/** «Procesada en 1 min 50 s»; `null` si no se conoce el tiempo. */
export function processedIn(item: Pick<ImportSummary, 'startedAt' | 'finishedAt'>): string | null {
  const ms = processingMs(item);

  if (ms === null) return null;

  return ms < 1000 ? 'Procesada en menos de 1 s' : `Procesada en ${formatDuration(ms)}`;
}

/** Mínimo de observación del paso y de avance para fiarse del ritmo. */
export const MIN_SPAN_MS = 3000;
export const MIN_FRACTION = 0.02;
/** Peso de la última medición en el ritmo suavizado. */
const SMOOTHING = 0.3;
/** Una estimación mayor a un día se considera absurda. */
const MAX_ETA_MS = 24 * 3_600_000;

interface Sample {
  readonly at: number;
  readonly processed: number;
}

interface Track {
  readonly phase: string;
  readonly first: Sample;
  last: Sample;
  /** Filas por segundo, suavizado. */
  rate: number | null;
}

export interface Estimate {
  readonly rate: number;
  /** Milisegundos que faltan para terminar el PASO ACTUAL; `null` si la cuenta ya no cuadra (se muestra «calculando…»). */
  readonly etaMs: number | null;
}

/**
 * Ritmo y tiempo restante del paso actual de cada carga en proceso, medidos con lo que el navegador observa en cada consulta (no con el reloj del
 * servidor, que puede diferir). El ritmo se suaviza para que la estimación no salte; cada paso empieza de cero.
 */
export class StepMeter {
  private readonly tracks = new Map<string, Track>();

  /** Registra una consulta: cada carga `RUNNING` con avance nuevo aporta una medición; las demás se olvidan. */
  observe(items: readonly ImportSummary[], now: number): void {
    const running = new Set<string>();

    for (const item of items) {
      if (item.status !== 'RUNNING' || !item.phase) continue;

      running.add(item.id);
      const track = this.tracks.get(item.id);
      const sample: Sample = { at: now, processed: item.rowsProcessed };

      if (!track || track.phase !== item.phase || sample.processed < track.last.processed) {
        this.tracks.set(item.id, { phase: item.phase, first: sample, last: sample, rate: null });
        continue;
      }

      if (sample.processed === track.last.processed || now <= track.last.at) continue;

      const instant = (sample.processed - track.last.processed) / ((now - track.last.at) / 1000);

      track.rate = track.rate === null ? instant : SMOOTHING * instant + (1 - SMOOTHING) * track.rate;
      track.last = sample;
    }

    for (const id of [...this.tracks.keys()]) if (!running.has(id)) this.tracks.delete(id);
  }

  /** Ritmo y tiempo restante, o `null` mientras no sea fiable (menos de 3 s observados o menos de 2 % del paso). */
  estimate(item: Pick<ImportSummary, 'id' | 'phase' | 'rowsTotal'>, now: number): Estimate | null {
    const track = this.tracks.get(item.id);
    const total = item.rowsTotal;

    if (!track || track.phase !== item.phase || total === null || total <= 0 || track.rate === null || track.rate <= 0) return null;

    if (track.last.at - track.first.at < MIN_SPAN_MS || track.last.processed / total < MIN_FRACTION) return null;

    const remaining = Math.max(0, total - track.last.processed);
    const eta = (remaining / track.rate) * 1000 - Math.max(0, now - track.last.at);

    return { rate: track.rate, etaMs: remaining === 0 ? 0 : eta > 0 && eta <= MAX_ETA_MS ? eta : null };
  }
}

const RATE = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** «≈ 12.400 filas/s»: el ritmo se redondea para no parpadear con cada decena. */
export function rateText(rate: number): string {
  const rounded = rate >= 1000 ? Math.round(rate / 100) * 100 : rate >= 100 ? Math.round(rate / 10) * 10 : rate >= 1 ? Math.round(rate) : rate;

  return `≈ ${rate >= 1 ? formatCount(rounded) : RATE.format(rounded)} filas/s`;
}

/** «quedan ≈ 38 s»; pasado el minuto, de 5 en 5 s. */
export function etaText(etaMs: number): string {
  const seconds = Math.max(1, Math.ceil(etaMs / 1000));

  return `quedan ≈ ${formatDuration((seconds >= 60 ? Math.ceil(seconds / 5) * 5 : seconds) * 1000)}`;
}

export interface LiveRow {
  /** Reloj «01:12» (o «1:02:05»). */
  readonly clock: string;
  /** El mismo tiempo en palabras, para el nombre accesible del reloj. */
  readonly clockSpoken: string;
  /** Paso actual completo («Paso 1 de 2 · Leyendo filas»); es lo único que se anuncia a los lectores de pantalla. */
  readonly step: string | null;
  /** Línea compacta: «1/2 · Leyendo filas · 230.000 de 500.000». */
  readonly left: string;
  /** «quedan ≈ 38 s»; «calculando…» mientras no sea fiable; vacío si no hay paso conocido. */
  readonly eta: string;
  /** Texto completo para el `title`: paso, filas, ritmo y restante. */
  readonly title: string;
}

/** Lo que muestra la fila de una carga en proceso en este instante. */
export function liveRow(item: ImportSummary, now: number, meter: StepMeter): LiveRow {
  const elapsed = elapsedMs(item, now);
  const step = stepText(item.phase);
  const index = item.phase ? STEPS[item.phase] : undefined;
  const rows = item.rowsTotal === null ? '' : `${formatCount(Math.min(item.rowsProcessed, item.rowsTotal))} de ${formatCount(item.rowsTotal)}`;
  const estimate = step ? meter.estimate(item, now) : null;
  const eta = !step ? '' : !estimate ? 'calculando…' : estimate.etaMs === null ? 'calculando…' : estimate.etaMs === 0 ? 'finalizando…' : etaText(estimate.etaMs);
  const left = index ? [`${index.index}/${TOTAL_STEPS} · ${index.label}`, rows].filter(Boolean).join(' · ') : '';
  const title = [step, rows && `${rows} filas`, estimate && rateText(estimate.rate), eta].filter(Boolean).join(' · ');

  return { clock: formatClock(elapsed), clockSpoken: formatDuration(elapsed), step, left, eta, title };
}

/** «En cola · esperando 00:12» (desde la subida). */
export const queuedText = (item: Pick<ImportSummary, 'status' | 'createdAt' | 'startedAt'>, now: number): string => `En cola · esperando ${formatClock(elapsedMs(item, now))}`;
