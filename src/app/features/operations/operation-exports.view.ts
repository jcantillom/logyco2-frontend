import { messageFor } from '../../core/errors/error-catalog';
import { ExportJob, ExportJobStatus } from '../../domain/models/operations';
import { Tone } from './operations.view';

const STATUS_LABELS: Readonly<Record<ExportJobStatus, string>> = {
  QUEUED: 'En cola',
  RUNNING: 'Generando',
  COMPLETED: 'Listo',
  FAILED: 'Falló',
  CANCELED: 'Cancelado',
  EXPIRED: 'Vencido',
};

const SIZE = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** En cola o generándose: lo único que se vigila con consultas periódicas y lo único que se puede cancelar. */
export const isActive = (job: Pick<ExportJob, 'status'>): boolean => job.status === 'QUEUED' || job.status === 'RUNNING';

/** «En cola», «Generando 42 %», «Listo», «Falló», «Cancelado» o «Vencido» (el texto lleva siempre el estado: el color no es la única señal). */
export const statusText = (job: Pick<ExportJob, 'status' | 'progress'>): string =>
  job.status === 'RUNNING' ? `${STATUS_LABELS.RUNNING} ${job.progress ?? 0} %` : STATUS_LABELS[job.status];

export const statusTone = (status: ExportJobStatus): Tone =>
  status === 'COMPLETED' ? 'success' : status === 'FAILED' ? 'danger' : status === 'CANCELED' || status === 'EXPIRED' ? 'warning' : 'info';

/** «24,4 MB» / «830 KB»; sin tamaño, vacío. */
export function sizeText(bytes: number | null): string {
  if (bytes === null) return '';

  if (bytes >= 1_000_000) return `${SIZE.format(bytes / 1_000_000)} MB`;

  return `${SIZE.format(Math.max(1, Math.round(bytes / 1000)))} KB`;
}

/** «hace 5 min», «hace 3 h», «hace 2 días»; nunca negativo. */
export function agoText(iso: string, now: number): string {
  const elapsed = Math.max(0, now - Date.parse(iso));

  if (Number.isNaN(elapsed) || elapsed < MINUTE) return 'hace un momento';

  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;

  if (elapsed < DAY) return `hace ${Math.floor(elapsed / HOUR)} h`;

  const days = Math.floor(elapsed / DAY);

  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** «vence en 71 h» / «vence en 25 min»; vacío si no hay plazo. */
export function expiryText(job: Pick<ExportJob, 'status' | 'expiresAt'>, now: number): string {
  if (job.status !== 'COMPLETED' || !job.expiresAt) return '';

  const left = Date.parse(job.expiresAt) - now;

  if (Number.isNaN(left) || left <= 0) return 'vence ahora';

  return left < HOUR ? `vence en ${Math.max(1, Math.floor(left / MINUTE))} min` : `vence en ${Math.floor(left / HOUR)} h`;
}

/** El motivo en español del catálogo (nunca el texto crudo del servidor). */
export const failureText = (job: Pick<ExportJob, 'status' | 'errorCode'>): string =>
  job.status === 'FAILED' ? messageFor(job.errorCode ?? 'EXPORT_FAILED', 500) : '';
