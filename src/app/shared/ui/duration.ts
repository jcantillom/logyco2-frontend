/** Duraciones en español, puras y sin zona horaria. Las cifras se truncan al segundo (nunca se muestra un tiempo mayor al real). */

const seconds = (ms: number): number => (Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0);

const pad = (value: number): string => String(value).padStart(2, '0');

/** «45 s», «1 min 12 s», «2 min», «1 h 05 min». */
export function formatDuration(ms: number): string {
  const total = seconds(ms);

  if (total < 60) return `${total} s`;

  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  if (hours > 0) return `${hours} h ${pad(minutes)} min`;

  const rest = total % 60;

  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** Reloj «mm:ss»; pasada una hora, «h:mm:ss». */
export function formatClock(ms: number): string {
  const total = seconds(ms);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = total % 60;

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}
