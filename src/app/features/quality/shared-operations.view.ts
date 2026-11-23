import { SelectionResult, SharedCandidate, SharedCandidateFilter, SharedDecision, SharedDecisionResult, Side } from '../../domain/models/reconciliation';
import { unitLabel } from '../../shared/ui/footprint.format';
import { fuelLabel } from '../vehicles/vehicles.labels';
import { placeText, tripDateText } from './duplicates.view';

export type SharedFieldKey = 'date' | 'plate' | 'serviceId' | 'route' | 'weight' | 'fuel' | 'consumption' | 'distance' | 'emissions' | 'row';

/** Un dato mostrado de un lado del par. `value` es `null` cuando el lado no puede mostrarlo (nunca se inventa). */
export interface SharedFieldView {
  readonly key: SharedFieldKey;
  readonly label: string;
  readonly own: string;
  /** `null`: la otra empresa no dejó ver este dato (sin consentimiento de ambas o el campo no se comparte). */
  readonly other: string | null;
  readonly differs: boolean;
}

const NONE = '—';
const NUMBER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const amount = (value: number | null): string => (value === null ? NONE : NUMBER.format(value));
const plural = (n: number, one: string, many: string): string => `${NUMBER.format(n)} ${n === 1 ? one : many}`;
const place = (value: { label: string | null }): string => (value.label ? placeText(value.label) : NONE);
const quantityText = (value: { quantity: number | null; unit: string | null }): string => (value.quantity === null ? NONE : `${amount(value.quantity)}${value.unit ? ` ${unitLabel(value.unit)}` : ''}`);
const dateText = (iso: string | null): string => (iso ? tripDateText(iso) : NONE);

/** Nombre claro de cada campo de la evidencia (el servidor solo da nombres de campo, nunca valores). */
export const EVIDENCE_LABELS: Readonly<Record<string, string>> = {
  service_id: 'ID de servicio',
  origin: 'Origen',
  destination: 'Destino',
  weight: 'Peso',
  fuel: 'Combustible',
  consumption: 'Consumo',
  distance: 'Distancia',
  kg_co2: 'Emisiones (kg CO₂)',
  ambiguous_group: 'Viajes repetidos ese día',
};

/** Explicación llana de los campos de evidencia que la necesitan. */
export const AMBIGUOUS_NOTE = 'Hay varios viajes iguales ese día; el emparejamiento es por orden y hay que revisarlo.';

/** Campos en conflicto de una operación (`conflict_fields`), con el nombre que ve la persona. */
export const CONFLICT_LABELS: Readonly<Record<string, string>> = {
  fuel_type: 'Combustible',
  co2_kg: 'Emisiones (kg CO₂)',
  distance_km: 'Distancia',
  consumption: 'Consumo',
};

/** Qué fila de la tarjeta destaca cada nombre de campo del servidor. */
const FIELD_KEYS: Readonly<Record<string, readonly SharedFieldKey[]>> = {
  service_id: ['serviceId'],
  origin: ['route'],
  destination: ['route'],
  weight: ['weight'],
  fuel: ['fuel'],
  fuel_type: ['fuel'],
  consumption: ['consumption'],
  distance: ['distance'],
  distance_km: ['distance'],
  kg_co2: ['emissions'],
  co2_kg: ['emissions'],
};

const labelList = (fields: readonly string[], labels: Readonly<Record<string, string>>): string[] => fields.map((field) => labels[field] ?? field);

export const evidenceLabels = (fields: readonly string[]): string[] => labelList(fields, EVIDENCE_LABELS);
export const conflictLabels = (fields: readonly string[]): string[] => labelList(fields, CONFLICT_LABELS);

/**
 * Los datos de la declaración propia (completa) y, solo si la otra empresa los dejó ver, los de ella. Lo que el servidor marca como distinto
 * o en conflicto se destaca. Sin `counterpart` ningún valor ajeno aparece: `other` queda en `null`, nunca se rellena.
 */
export function sharedFields(item: SharedCandidate): SharedFieldView[] {
  const { own, counterpart } = item;
  const flagged = new Set([...item.differs, ...item.conflictFields].flatMap((field) => FIELD_KEYS[field] ?? []));
  const row = (key: SharedFieldKey, label: string, mine: string, theirs: string | undefined): SharedFieldView => ({ key, label, own: mine, other: counterpart ? (theirs ?? NONE) : null, differs: flagged.has(key) });
  const fields: SharedFieldView[] = [
    row('date', 'Fecha', dateText(own.tripDate), counterpart ? dateText(counterpart.tripDate) : undefined),
    row('plate', 'Placa', own.plate ?? NONE, counterpart?.plateMasked ?? undefined),
  ];

  if (own.serviceId) fields.push({ key: 'serviceId', label: 'ID de servicio', own: own.serviceId, other: null, differs: false });

  fields.push(
    row('route', 'Origen y destino', `${place(own.origin)} → ${place(own.destination)}`, counterpart ? `${place(counterpart.origin)} → ${place(counterpart.destination)}` : undefined),
    row('fuel', 'Combustible', own.fuelType ? fuelLabel(own.fuelType) : NONE, counterpart ? (counterpart.fuelType ? fuelLabel(counterpart.fuelType) : NONE) : undefined),
    row('consumption', 'Consumo', quantityText(own.consumption), counterpart ? quantityText(counterpart.consumption) : undefined),
    row('distance', 'Distancia', own.distanceKm === null ? NONE : `${amount(own.distanceKm)} km`, counterpart ? (counterpart.distanceKm === null ? NONE : `${amount(counterpart.distanceKm)} km`) : undefined),
    row('emissions', 'Emisiones calculadas', own.kgCo2 === null ? NONE : `${amount(own.kgCo2)} kg CO₂`, counterpart ? (counterpart.kgCo2 === null ? NONE : `${amount(counterpart.kgCo2)} kg CO₂`) : undefined),
  );

  if (own.cargoTon !== null) fields.push({ key: 'weight', label: 'Peso de la carga', own: `${amount(own.cargoTon)} t`, other: null, differs: flagged.has('weight') });

  fields.push({ key: 'row', label: 'Fila de tu archivo', own: String(own.rowNumber), other: null, differs: false });

  return fields;
}

/** Los campos que se muestran en el lado de la otra empresa: solo los que ella dejó ver (sin ID de servicio, peso ni fila). */
export const counterpartVisible = (field: SharedFieldView): boolean => field.other !== null;

/** Una frase sobre por qué se propone el par, según la regla y su fuerza. */
export function ruleSentence(item: Pick<SharedCandidate, 'rule' | 'strength'>): string {
  return item.rule === 'M1' ? 'Coinciden el ID de servicio, la fecha y la placa.' : 'Coinciden fecha, placa y ruta; falta un identificador compartido.';
}

export const STRENGTH_LABEL: Readonly<Record<string, string>> = { STRONG: 'Evidencia fuerte', WEAK: 'Evidencia débil' };

export const REASON = 'Se identificó una operación potencialmente coincidente';

export interface StatusView {
  readonly label: string;
  /** Marca que acompaña al color: el estado se entiende sin distinguir colores. */
  readonly glyph: string;
  readonly tone: 'possible' | 'confirmed' | 'conflict' | 'distinct';
}

export const STATUS_VIEWS: Readonly<Record<string, StatusView>> = {
  POSSIBLE_MATCH: { label: 'Posible coincidencia', glyph: '?', tone: 'possible' },
  CONFIRMED_MATCH: { label: 'Coincidencia confirmada', glyph: '✓', tone: 'confirmed' },
  CONFLICTING_DATA: { label: 'Cifras en conflicto', glyph: '!', tone: 'conflict' },
  DISTINCT: { label: 'Viajes distintos', glyph: '≠', tone: 'distinct' },
};

/** Qué devuelve cada filtro: «confirmadas» incluye las que no comparan cifras (sin resultados compartidos); «cifras en conflicto» solo existe si las dos empresas comparten. */
export const STATUS_FILTER_HINT = 'Las coincidencias confirmadas incluyen las que no comparan cifras porque no se comparten resultados. Las cifras en conflicto solo aparecen si ambas empresas comparten resultados.';

export const STATUS_FILTERS: readonly { readonly value: SharedCandidateFilter['status'] | ''; readonly label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'POSSIBLE_MATCH', label: 'Posibles coincidencias' },
  { value: 'CONFLICTING_DATA', label: 'Cifras en conflicto' },
  { value: 'CONFIRMED_MATCH', label: 'Coincidencias confirmadas' },
  { value: 'DISTINCT', label: 'Viajes distintos' },
];

const OWN_DECISION: Readonly<Record<SharedDecision, string>> = {
  SAME: 'confirmó que es el mismo viaje',
  DISTINCT: 'confirmó que son viajes distintos',
  NEEDS_INFO: 'solicitó una aclaración',
  KEEP_PENDING: 'lo dejó pendiente',
};

const decisionText = (decision: SharedDecision | null): string => (decision ? OWN_DECISION[decision] : 'pendiente');

export interface BilateralView {
  readonly mine: string;
  readonly other: string;
  /** Hay una explicación adicional: las dos empresas decidieron distinto o la otra pidió una aclaración. */
  readonly note: string | null;
}

/** El estado de las dos decisiones con palabras claras («Tu empresa: pendiente · La otra empresa: ya confirmó que es el mismo viaje»). */
export function bilateralStatus(item: Pick<SharedCandidate, 'myDecision' | 'counterpartDecision' | 'disagreement' | 'status'>): BilateralView {
  const mine = `Tu empresa: ${decisionText(item.myDecision)}`;
  const other = `La otra empresa: ${item.counterpartDecision === 'SAME' ? 'ya confirmó que es el mismo viaje' : decisionText(item.counterpartDecision)}`;
  let note: string | null = null;

  if (item.disagreement) note = 'Las dos empresas decidieron distinto: hace falta ponerse de acuerdo antes de que cambie algo.';
  else if (item.status === 'POSSIBLE_MATCH' && item.counterpartDecision === 'NEEDS_INFO') note = 'La otra empresa pidió una aclaración sobre este viaje.';

  return { mine, other, note };
}

/** Se pueden tomar decisiones solo mientras el par sigue como posible coincidencia (después queda resuelto y es de solo lectura). */
export const isDecidable = (item: Pick<SharedCandidate, 'status' | 'superseded'>): boolean => item.status === 'POSSIBLE_MATCH' && !item.superseded;

export const SUPERSEDED_NOTE = 'Se resolvió otro par con este viaje.';

/** Hay varios viajes iguales ese día: el servidor lo marca en la evidencia y se explica aparte. */
export const isAmbiguous = (item: Pick<SharedCandidate, 'matches' | 'differs'>): boolean => [...item.matches, ...item.differs].includes('ambiguous_group');

/** Línea sobre las cifras de un par confirmado; sin dato, ninguna: nunca se insinúa que coinciden o difieren. */
export function comparisonLine(item: Pick<SharedCandidate, 'dataComparison'>): string | null {
  if (item.dataComparison === 'not_shared') return 'Las cifras no se comparan porque no se comparten resultados entre las dos empresas.';
  if (item.dataComparison === 'identical') return 'Las cifras coinciden.';

  return null;
}

export type SelectionChoice = 'MINE' | 'THEIRS';

/** Traduce «mi declaración» / «la de la otra empresa» al lado `A`/`B` del par canónico, que depende de `mySide`. */
export const sideFor = (mySide: Side, choice: SelectionChoice): Side => (choice === 'MINE' ? mySide : mySide === 'A' ? 'B' : 'A');

/** Cuál declaración dice un lado `A`/`B` desde el punto de vista de la propia empresa. */
export const sideOwner = (mySide: Side, side: Side | null): 'MINE' | 'THEIRS' | null => (side === null ? null : side === mySide ? 'MINE' : 'THEIRS');

const OWNER_TEXT = { MINE: 'tu declaración', THEIRS: 'la declaración de la otra empresa' } as const;

export interface SelectionView {
  readonly mine: string;
  readonly other: string;
  readonly summary: string;
}

/** Estado de la elección de la declaración vigente en un conflicto: qué eligió cada empresa y si ya es efectiva. */
export function selectionStatus(item: SharedCandidate): SelectionView | null {
  const { operation } = item;

  if (!operation) return null;

  const owner = (side: Side | null): string => {
    const who = sideOwner(item.mySide, side);

    return who ? OWNER_TEXT[who] : 'aún no eligió';
  };
  const effective = sideOwner(item.mySide, operation.effectiveSelection);

  return {
    mine: `Tu empresa: ${owner(operation.mySelection)}`,
    other: `La otra empresa: ${owner(operation.counterpartSelection)}`,
    summary:
      operation.state === 'EFFECTIVE' && effective
        ? `Ambas empresas eligieron ${OWNER_TEXT[effective]}: es la vigente. Las dos declaraciones se conservan.`
        : 'Solo se aplica cuando ambas empresas eligen la misma declaración. No se promedia ni se borra nada.',
  };
}

/** La elección se puede hacer: hay datos en conflicto con operación y ambas empresas dejan ver los valores. */
export const canSelect = (item: SharedCandidate): boolean => item.status === 'CONFLICTING_DATA' && item.dataComparison === 'conflict' && item.operation !== null && item.counterpart !== null;

/** Consecuencia que se explica antes de confirmar. */
export const DECISION_CONSEQUENCE: Readonly<Record<'SAME' | 'DISTINCT', string>> = {
  SAME: 'Ambas empresas conservan sus declaraciones; en un consolidado se contará una sola contribución cuando ambas confirmen. Si la otra empresa todavía no confirma, queda pendiente.',
  DISTINCT: 'Ambas empresas conservan sus declaraciones y se contarán por separado. Si la otra empresa decide lo contrario, quedará marcado como desacuerdo y nada cambiará en los totales.',
};

export const SELECTION_CONSEQUENCE = 'Se conservan las dos declaraciones; no se promedia ni se borra nada. Tu elección solo se aplica cuando la otra empresa elija la misma.';

/** Mensaje de éxito veraz tras decidir: dice cuántos quedaron confirmados y cuándo falta que la otra empresa responda. */
export function decisionMessage(decision: SharedDecision, result: SharedDecisionResult, count: number): string {
  const unchanged = result.unchanged > 0 ? ` ${plural(result.unchanged, 'ya estaba registrado', 'ya estaban registrados')}.` : '';

  if (result.updated === 0) return result.unchanged > 0 ? `No hubo cambios: ${plural(result.unchanged, 'ya estaba registrado', 'ya estaban registrados')}.` : 'No hubo cambios.';

  const disagreement = result.items.filter((item) => item.disagreement).length;
  const waiting = result.items.filter((item) => item.status === 'POSSIBLE_MATCH' && !item.disagreement).length;
  const distinct = result.items.filter((item) => item.status === 'DISTINCT').length;

  if (decision === 'SAME') {
    const parts: string[] = [];

    if (result.confirmed > 0) {
      parts.push(`${plural(result.confirmed, 'coincidencia quedó confirmada', 'coincidencias quedaron confirmadas')} porque la otra empresa ya había confirmado`);
      if (result.conflicting > 0) parts.push(`${plural(result.conflicting, 'quedó', 'quedaron')} en conflicto de cifras`);
    }

    if (waiting > 0) parts.push(`${plural(waiting, 'queda pendiente', 'quedan pendientes')} hasta que la otra empresa confirme`);
    if (disagreement > 0) parts.push(`${plural(disagreement, 'quedó', 'quedaron')} en desacuerdo con la otra empresa`);

    return `Registramos tu confirmación: ${parts.join('; ') || plural(count, 'viaje', 'viajes')}.${unchanged}`;
  }

  if (decision === 'DISTINCT') {
    const parts: string[] = [];

    if (distinct > 0) parts.push(`${plural(distinct, 'quedó', 'quedaron')} como viajes distintos porque la otra empresa también lo confirmó`);
    if (waiting > 0) parts.push(`${plural(waiting, 'queda pendiente', 'quedan pendientes')} hasta que la otra empresa decida`);
    if (disagreement > 0) parts.push(`${plural(disagreement, 'quedó', 'quedaron')} en desacuerdo con la otra empresa`);

    return `Registramos tu decisión: ${parts.join('; ') || plural(count, 'viaje', 'viajes')}.${unchanged}`;
  }

  if (decision === 'NEEDS_INFO') return `Pediste una aclaración sobre ${plural(result.updated, 'viaje', 'viajes')}. La otra empresa lo verá en su bandeja. No cambia ningún total.${unchanged}`;

  return `${result.updated === 1 ? 'Quedó pendiente' : `Quedaron pendientes ${NUMBER.format(result.updated)} viajes`}. No cambia ningún total.${unchanged}`;
}

/** Mensaje de éxito veraz tras elegir la declaración vigente. */
export function selectionMessage(result: SelectionResult): string {
  if (result.effective > 0) return 'Ambas empresas eligieron la misma declaración: quedó como la vigente de la operación. Las dos declaraciones se conservan.';

  if (result.updated > 0) return 'Registramos tu elección. Solo se aplicará cuando la otra empresa elija la misma declaración.';

  return 'No hubo cambios: ya habías elegido esa declaración.';
}
