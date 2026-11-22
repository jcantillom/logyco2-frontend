const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** «hace un momento», «hace 5 min», «hace 3 h», «hace 2 d»; pasada una semana, la fecha corta. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const time = new Date(iso).getTime();

  if (Number.isNaN(time)) return '';

  const elapsed = Math.max(0, now - time);

  if (elapsed < MINUTE) return 'hace un momento';
  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `hace ${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < 7 * DAY) return `hace ${Math.floor(elapsed / DAY)} d`;

  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}
