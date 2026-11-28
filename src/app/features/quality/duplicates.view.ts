import { DuplicateDecision, DuplicateEvidence, DuplicateKeep, DuplicateKind, DuplicateNote, DuplicateResolutionResult, DuplicateTrip, PossibleDuplicate } from '../../domain/models/duplicates';
import { unitLabel } from '../../shared/ui/footprint.format';
import { FUEL_LABELS } from '../vehicles/vehicles.labels';

export type FieldKey = 'date' | 'plate' | 'tripId' | 'route' | 'fuel' | 'consumption' | 'distance' | 'emissions' | 'file';

/** Un dato comparable del par: lo que muestra cada viaje y si difiere (para destacarlo). */
export interface FieldView {
  readonly key: FieldKey;
  readonly label: string;
  readonly a: string;
  readonly b: string;
  readonly differs: boolean;
}

const NONE = '—';
const NUMBER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Conectores que van en minúscula dentro de un nombre de lugar («Cartagena de Indias»). */
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

/** Los nombres de lugares llegan en mayúsculas del catálogo: se muestran en minúscula con inicial mayúscula en cada palabra («Bogotá, D.C.»). */
export const placeText = (label: string): string =>
  label
    .toLocaleLowerCase('es-CO')
    .replace(/(^|[\s\-(./])(\p{L}+)/gu, (_all, before: string, word: string, offset: number) => (offset > 0 && CONNECTORS.has(word) ? `${before}${word}` : `${before}${word.charAt(0).toLocaleUpperCase('es-CO')}${word.slice(1)}`));

const sentence = (code: string): string => {
  const text = code.replace(/_/g, ' ').toLocaleLowerCase('es-CO');

  return text.charAt(0).toLocaleUpperCase('es-CO') + text.slice(1);
};

/** El viaje tiene resultado calculado (kg CO₂): sin él no suma emisiones aunque se confirme como viaje independiente. */
export const hasResult = (trip: DuplicateTrip | null): boolean => trip !== null && trip.kgCo2 !== null;

/** Combustible en español; un código fuera del vocabulario se muestra legible, nunca inventado. */
export const fuelText = (code: string): string => FUEL_LABELS[code] ?? sentence(code);

/** «14 de oct de 2026» de una fecha ISO; si no se puede leer, el texto del servidor. */
export function tripDateText(iso: string): string {
  const time = Date.parse(iso);

  return Number.isNaN(time) ? iso : DATE.format(time);
}

const amount = (value: number | null): string => (value === null ? NONE : NUMBER.format(value));

const consumptionText = (trip: DuplicateTrip): string => {
  if (!trip.consumption || trip.consumption.quantity === null) return NONE;

  return `${amount(trip.consumption.quantity)} ${unitLabel(trip.consumption.unit)}`;
};

const routeText = (trip: DuplicateTrip): string => `${placeText(trip.origin.label)} → ${placeText(trip.destination.label)}`;

const fileText = (trip: DuplicateTrip): string => (trip.rowNumber === null ? trip.fileName : `${trip.fileName} · fila ${trip.rowNumber}`);

/** Valor que se compara a ciegas (sin redondeos de pantalla): dos viajes difieren si estos valores no coinciden. */
const raw: Readonly<Record<FieldKey, (trip: DuplicateTrip) => unknown>> = {
  date: (t) => t.tripDate.slice(0, 10),
  plate: (t) => t.plate,
  tripId: (t) => t.tripId,
  route: (t) => `${t.origin.code}>${t.destination.code}`,
  fuel: (t) => t.fuelType,
  consumption: (t) => `${t.consumption?.quantity ?? ''} ${t.consumption?.unit ?? ''}`,
  distance: (t) => t.distanceKm,
  emissions: (t) => t.kgCo2,
  file: (t) => `${t.importFileId}#${t.rowNumber ?? ''}`,
};

/** Campos que el servidor marca como distintos (`differences`) y la fila de la tabla que destacan. */
const SERVER_FLAGS: Readonly<Record<string, readonly FieldKey[]>> = { fuel_type: ['fuel'], consumption: ['consumption'], distance_km: ['distance'] };

/**
 * Los datos que se necesitan para decidir, de A (el retenido) y de B (el vigente), en el mismo orden. Un dato se destaca si el servidor lo
 * marca como distinto o si realmente difiere entre los dos viajes. Sin B (ya no existe) no hay nada que destacar.
 */
export function comparisonFields(item: PossibleDuplicate): FieldView[] {
  const { a, b } = item;
  const flagged = new Set(item.differences.flatMap((difference) => SERVER_FLAGS[difference] ?? []));
  const row = (key: FieldKey, label: string, text: (trip: DuplicateTrip) => string): FieldView => ({
    key,
    label,
    a: text(a),
    b: b ? text(b) : NONE,
    differs: b !== null && (flagged.has(key) || raw[key](a) !== raw[key](b)),
  });

  return [
    row('date', 'Fecha', (t) => tripDateText(t.tripDate)),
    row('plate', 'Placa', (t) => t.plate),
    row('tripId', 'Identificador', (t) => t.tripId ?? NONE),
    row('route', 'Origen y destino', routeText),
    row('fuel', 'Combustible', (t) => fuelText(t.fuelType)),
    row('consumption', 'Consumo', consumptionText),
    row('distance', 'Distancia', (t) => (t.distanceKm === null ? NONE : `${amount(t.distanceKm)} km`)),
    row('emissions', 'Emisiones calculadas', (t) => (t.kgCo2 === null ? NONE : `${amount(t.kgCo2)} kg CO₂`)),
    row('file', 'Archivo de origen', fileText),
  ];
}

const HELD = 'Está retenido y no suma hasta que decidas.';

const RULE_SENTENCES: Readonly<Record<string, string>> = {
  R2: 'Tiene el mismo identificador que un viaje ya registrado, pero con valores distintos: puede ser una corrección.',
  R3: 'Aparece repetido dentro del mismo archivo: puede ser el mismo viaje contado dos veces.',
};

/** Frases de los viajes sin identificador (R5 y R6) según la clase de caso que informa el servidor. */
const KIND_SENTENCES: Readonly<Record<DuplicateKind, string>> = {
  correction: `Misma fecha, placa y ruta que un viaje de una carga anterior, pero con valores distintos: parece una corrección. ${HELD}`,
  identical: `Tiene los mismos datos que un viaje de una carga anterior, pero no hay seguridad suficiente de que sea un reenvío de las mismas filas. ${HELD}`,
  extra_row: `Hay una fila más de la que había para esa fecha, placa y ruta: puede ser un viaje real adicional o una repetición. ${HELD}`,
  ambiguous: `Hay varios viajes iguales ese día y no se pueden emparejar con seguridad. ${HELD}`,
};

const GENERIC_SENTENCE = `Podría ser el mismo viaje contado dos veces y no hay datos suficientes para confirmarlo. ${HELD}`;

/**
 * Una frase corta y clara de por qué se retuvo el par, según la regla y, en R4 a R6, la clase de caso. R4 distingue el viaje con identificador
 * pero placa inválida del que no trae identificador. Una regla o una clase que el cliente no conoce da una frase neutra, nunca un error.
 */
export function ruleSentence(item: PossibleDuplicate): string {
  const kind = item.evidence?.kind ?? null;

  if (item.rule === 'R4') {
    return item.a.tripId
      ? `Trae identificador, pero su placa no es válida, así que no se puede confirmar que sea el mismo viaje de otra carga. ${HELD}`
      : `No trae identificador y coincide en fecha, placa y ruta con un viaje de otra carga, pero las dos cargas no se parecen lo suficiente para confirmar que son el mismo viaje. ${HELD}`;
  }

  if (item.rule === 'R5' || item.rule === 'R6') return kind ? KIND_SENTENCES[kind] : item.rule === 'R6' ? KIND_SENTENCES.extra_row : `No trae identificador y se parece a un viaje de una carga anterior, pero no se puede emparejar con seguridad. ${HELD}`;

  return RULE_SENTENCES[item.rule] ?? GENERIC_SENTENCE;
}

/** Frase de la diferencia de id entre las dos versiones (solo R4 a R6); `null` si no aplica. No afirma identidad: solo explica por qué se comparan por fecha, placa y ruta. */
export const idMismatchLine = (evidence: DuplicateEvidence | null): string | null =>
  evidence?.idMismatch ? 'Una de las dos versiones trae el id del viaje y la otra no, por eso se comparan por fecha, placa y ruta.' : null;

const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  tipo_combustible: 'Combustible',
  configuracion_vehiculo: 'Configuración del vehículo',
  modelo_vehiculo: 'Modelo del vehículo',
  tipo_flota: 'Tipo de flota',
  tecnologia_vehiculo: 'Tecnología del vehículo',
  tipo_vehiculo: 'Tipo de vehículo',
  capacidad_toneladas: 'Capacidad (toneladas)',
};

/** Una diferencia de atributo del vehículo lista para mostrar: nombre en español y los dos valores (sin dato = «—»). */
export interface VehicleDifferenceView {
  readonly label: string;
  readonly anchor: string;
  readonly repeated: string;
}

/** Atributos del vehículo que cambian entre el primer registro y el repetido; una clave desconocida se muestra legible, nunca cruda. */
export const vehicleDifferenceViews = (evidence: DuplicateEvidence | null): VehicleDifferenceView[] =>
  (evidence?.vehicleDiffers ?? []).map((item) => ({ label: ATTRIBUTE_LABELS[item.attribute] ?? sentence(item.attribute), anchor: item.anchor ?? NONE, repeated: item.repeated ?? NONE }));

const NOTE_SENTENCES: Readonly<Record<DuplicateNote, string>> = {
  FUEL_CONFLICT_ANCHOR_FUEL_USED: 'El combustible no coincide entre los dos registros del archivo. Para el cálculo se usó el combustible del primer registro; conviene revisar el dato en el archivo de origen.',
};

/** Notas de calidad en español llano; solo las que el cliente conoce. */
export const qualityNoteLines = (evidence: DuplicateEvidence | null): string[] => (evidence?.notes ?? []).map((note) => NOTE_SENTENCES[note]);

/** «Resuelto automáticamente» solo cuando el servidor lo marca; una persona nunca aparece así. */
export const isAutoResolved = (evidence: DuplicateEvidence | null): boolean => evidence?.auto === true;

const PCT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** Una línea con cuánto se parecen las dos cargas (solo porcentajes; nunca afirma que sean la misma); `null` si el servidor no trae el linaje. */
export function lineageLine(evidence: DuplicateEvidence | null): string | null {
  const lineage = evidence?.lineage;

  if (!lineage) return null;

  if (!lineage.established) return `Las dos cargas se parecen poco: ${PCT.format(lineage.newPct)} % de las filas de esta ya estaban en la anterior.`;

  return `La carga se parece a una anterior: ${PCT.format(lineage.newPct)} % de sus filas ya estaban en ella y ${PCT.format(lineage.previousPct)} % de las de ella están aquí${lineage.mutual ? '; se repiten casi por completo entre sí' : ''}.`;
}

/** «Para esa fecha, placa y ruta: antes 3 viajes, ahora 4.» Solo con los conteos del grupo. */
export function groupLine(evidence: DuplicateEvidence | null): string | null {
  const group = evidence?.group;

  if (!group) return null;

  const trips = (n: number): string => `${NUMBER.format(n)} ${n === 1 ? 'viaje' : 'viajes'}`;

  return `Para esa fecha, placa y ruta: antes ${trips(group.existing)}, ahora ${NUMBER.format(group.new)}.`;
}

/** Cuántas diferencias hay entre A y B, para el nombre accesible del par. */
export const differingLabels = (fields: readonly FieldView[]): string[] => fields.filter((field) => field.differs).map((field) => field.label);

/** Los omitidos son viajes ya resueltos o de una carga que no terminó de procesarse: se explica sin suponer cuál de los dos. */
const skippedText = (n: number): string => `${NUMBER.format(n)} no se ${n === 1 ? 'pudo' : 'pudieron'} resolver porque ${n === 1 ? 'ya estaba resuelto' : 'ya estaban resueltos'} o su carga no terminó de procesarse.`;

function baseMessage(decision: DuplicateDecision, keep: DuplicateKeep | undefined, result: DuplicateResolutionResult): string {
  const n = result.resolved;
  const N = NUMBER.format(n);
  const skipped = result.skipped > 0 ? ` ${skippedText(result.skipped)}` : '';

  if (n === 0) return result.skipped > 0 ? `No hubo cambios: ${skippedText(result.skipped)}` : 'No hubo cambios.';

  if (decision === 'KEEP_PENDING') {
    return `${n === 1 ? 'Quedó pendiente. Sigue fuera de los totales' : `Quedaron pendientes ${N} operaciones. Siguen fuera de los totales`} hasta que se decida.${skipped}`;
  }

  if (decision === 'DIFFERENT_TRIPS') return `${n === 1 ? 'Listo. El viaje quedó como un viaje independiente' : `Listo. ${N} viajes quedaron como viajes independientes`}.${skipped}`;

  if (keep === 'NEW') {
    return `${n === 1 ? 'Listo. Se conservó el viaje retenido y quedó vigente; el otro queda' : `Listo. En ${N} viajes se conservó el retenido y quedó vigente; los otros quedan`} en el historial y ${n === 1 ? 'ya no suma' : 'ya no suman'}.${skipped}`;
  }

  return `${n === 1 ? 'Listo. Se conservó el viaje vigente; el retenido queda' : `Listo. En ${N} viajes se conservó el vigente; los retenidos quedan`} en el historial y ${n === 1 ? 'no suma' : 'no suman'}.${skipped}`;
}

/**
 * Mensaje de éxito tras decidir, con lo que significó para los totales; avisa si algunos ya estaban resueltos y, si el servidor informa viajes
 * que siguen vigentes sin resultado calculado (`withoutResult`), que todavía no suman emisiones.
 */
export function resolutionMessage(decision: DuplicateDecision, keep: DuplicateKeep | undefined, result: DuplicateResolutionResult): string {
  const base = baseMessage(decision, keep, result);

  if (decision === 'KEEP_PENDING' || result.withoutResult <= 0) return base;

  const n = result.withoutResult;
  const kind = decision === 'DIFFERENT_TRIPS' ? 'independientes' : 'vigentes';

  return `${base} ${NUMBER.format(n)} de los viajes que dejaste como ${kind} todavía ${n === 1 ? 'no tiene' : 'no tienen'} resultado calculado, así que ${n === 1 ? 'no suma' : 'no suman'} emisiones hasta que corrijas sus datos.`;
}
