import { AppError } from '../../core/errors/app-error';
import { CappedCount, OperationsView, TripPlace, TripQuantity, TripStatus } from '../../domain/models/operations';
import { unitLabel } from '../../shared/ui/footprint.format';
import { placeText } from '../quality/duplicates.view';
import { FUEL_LABELS } from '../vehicles/vehicles.labels';

export const NONE = '—';

const COUNT = new Intl.NumberFormat('es-CO');
const DISTANCE = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const TONS = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const KG = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const FACTOR = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 });
const DAY = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const MOMENT = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

/** Etiquetas de las pestañas (las del diseño; «Inconsistencias» es el estado BLOQUEADO del servidor). */
export const VIEW_LABELS: Readonly<Record<OperationsView, string>> = {
  all: 'Todos los viajes',
  calculated: 'Calculados',
  pending: 'Por completar',
  issues: 'Inconsistencias',
  shared: 'Compartidos',
};

export const STATUS_OPTIONS: readonly { readonly value: 'CALCULATED' | 'PENDING' | 'BLOCKED'; readonly label: string }[] = [
  { value: 'CALCULATED', label: 'Calculado' },
  { value: 'PENDING', label: 'Por completar' },
  { value: 'BLOCKED', label: 'Inconsistencia' },
];

/** Qué viajes entran: los que cuentan por defecto y, con un filtro explícito, los demás con su estado (nunca suman). */
export const DEDUP_OPTIONS: readonly { readonly value: 'counted' | 'duplicates' | 'held' | 'all_states'; readonly label: string }[] = [
  { value: 'counted', label: 'Solo los que cuentan' },
  { value: 'duplicates', label: 'Duplicados confirmados' },
  { value: 'held', label: 'Posibles duplicados retenidos' },
  { value: 'all_states', label: 'Todos, con su estado' },
];

export type Tone = 'success' | 'warning' | 'danger' | 'info';

/** Color del chip por estado; el texto del chip es siempre el del servidor, así que el color no es la única señal. */
export const statusTone = (status: TripStatus): Tone => (status === 'CALCULATED' ? 'success' : status === 'PENDING' ? 'warning' : status === 'BLOCKED' ? 'danger' : 'info');

export const sharedTone = (state: string): Tone => (state === 'CONFIRMED_MATCH' ? 'success' : state === 'CONFLICTING_DATA' ? 'danger' : 'warning');

/** «254» o «10.000+» cuando el conteo llegó acotado. */
export const countText = (count: CappedCount | null | undefined): string => (count ? `${COUNT.format(count.value)}${count.capped ? '+' : ''}` : '');

/** «15/03/2026» de una fecha ISO (solo cuenta el día, sin zona horaria); sin fecha, «—». */
export function dayText(iso: string | null): string {
  if (!iso) return NONE;

  const time = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

  return Number.isNaN(time) ? iso : DAY.format(time);
}

export function momentText(iso: string | null): string {
  if (!iso) return NONE;

  const time = Date.parse(iso);

  return Number.isNaN(time) ? iso : MOMENT.format(time);
}

export const distanceText = (km: number | null): string => (km === null ? NONE : DISTANCE.format(km));
export const tonsText = (tons: number | null): string => (tons === null ? NONE : TONS.format(tons));
export const kgText = (kg: number | null): string => (kg === null ? NONE : KG.format(kg));
export const factorText = (value: number | null): string => (value === null ? NONE : FACTOR.format(value));

/** Combustible en español; un código fuera del vocabulario se muestra tal cual, nunca inventado. */
export const fuelText = (code: string | null): string => (code === null ? NONE : (FUEL_LABELS[code] ?? code));

const placeOrNone = (place: TripPlace): string => (place.label ? placeText(place.label) : NONE);

/** Mensaje del listado: el catálogo compartido pide 3 caracteres, pero aquí el mínimo es 2 (`SEARCH_MIN_LENGTH`). */
export function listErrorText(error: AppError | null): string {
  if (error?.code === 'SEARCH_TOO_SHORT') return 'Escribe al menos 2 caracteres para buscar.';

  return error?.message ?? 'No se pudieron cargar los viajes.';
}

/** Mensaje del detalle: un viaje que ya no existe se dice en singular y con la salida (el catálogo habla de «alguno de los viajes»). */
export function detailErrorText(error: AppError | null): string {
  if (error?.code === 'TRIP_NOT_FOUND' || error?.status === 404) return 'Este viaje ya no está disponible. Actualiza la lista.';

  return error?.message ?? 'No se pudo cargar el detalle del viaje.';
}

/** Origen y destino por separado (para mostrarlos en dos líneas); si falta un extremo se dice «—». */
export const routePlaces = (origin: TripPlace, destination: TripPlace): readonly [string, string] => [placeOrNone(origin), placeOrNone(destination)];

/** «Yumbo» y «Valle del Cauca» de «Yumbo, Valle del Cauca»: el municipio va primero y el departamento queda debajo, atenuado. */
export function splitPlace(text: string): readonly [string, string] {
  const at = text.indexOf(',');

  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + 1).trim()];
}

/** «Yumbo → Palmira»; si falta un extremo se dice «—», no se adivina. */
export const routeText = (origin: TripPlace, destination: TripPlace): string => routePlaces(origin, destination).join(' → ');

/** Una cantidad con su unidad («8 km/gal»); sin cantidad, «—». */
export const quantityText = (value: TripQuantity): string => {
  if (value.quantity === null) return NONE;

  const amount = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 }).format(value.quantity);

  return value.unit ? `${amount} ${unitLabel(value.unit)}` : amount;
};
