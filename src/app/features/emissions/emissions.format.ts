import { CodeGuide, EmissionFactor, FactorVerification, FreightVehicle } from '../../domain/models/emissions';
import { axlesWord } from '../../shared/ui/vehicle-diagram/vehicle-label';

const INTEGER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const DECIMAL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });
const FIXED2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Decimal del servidor con dos decimales («30.0000» → «30,00»); sin valor o inválido devuelve `null`. */
export function formatFixed2(value: string | null): string | null {
  if (value === null) return null;
  const number = Number(value);

  return Number.isFinite(number) ? FIXED2.format(number) : null;
}

/**
 * Decimal tal como lo envía el servidor, con coma decimal y sin perder cifras configuradas («1.980» → «1,980», «10.149» → «10,149»): solo se
 * agrupan los miles de la parte entera. Sin valor o inválido devuelve `null`.
 */
export function formatReceived(value: string | null): string | null {
  if (value === null || !/^\d+(\.\d+)?$/.test(value.trim())) return null;

  const [integer, decimals] = value.trim().split('.');
  const grouped = INTEGER.format(Number(integer));

  return decimals === undefined ? grouped : `${grouped},${decimals}`;
}

export const formatKg = (kg: number): string => `${INTEGER.format(kg)} kg`;
export const formatMeters = (m: number): string => `${DECIMAL.format(m)} m`;

/** Solo se enlaza a direcciones http(s): cualquier otro esquema (`javascript:`, `data:`) no se convierte en enlace. */
export function safeHttpUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** «6 ejes (3 + 3)» cuando hay vehículo tractor y remolque; «2 ejes» en los demás casos. */
export function axlesLabel(vehicle: Pick<FreightVehicle, 'truckAxles' | 'trailerAxles' | 'totalAxles'>): string {
  const total = axlesWord(vehicle.totalAxles);

  return vehicle.truckAxles > 0 && vehicle.trailerAxles > 0 ? `${total} (${vehicle.truckAxles} + ${vehicle.trailerAxles})` : total;
}

export interface FactorStatusView {
  readonly label: string;
  readonly badge: 'badge-success' | 'badge-warning' | 'badge-danger' | 'badge-neutral';
  /** Si el estado permite mostrar el valor. */
  readonly showValue: boolean;
}

export const FACTOR_STATUS: Readonly<Record<FactorVerification, FactorStatusView>> = {
  VERIFIED: { label: 'Verificado', badge: 'badge-success', showValue: true },
  PENDING_VALIDATION: { label: 'Valor configurado — pendiente de validación', badge: 'badge-warning', showValue: true },
  NOT_CONFIGURED: { label: 'Factor pendiente de configuración', badge: 'badge-neutral', showValue: false },
  INVALID_CONFIGURATION: { label: 'Configuración inválida: avisa a quien administra la plataforma', badge: 'badge-danger', showValue: false },
};

/** Estado de verificación de un factor en las tarjetas del resumen: texto corto y color semántico de la insignia. */
export const FACTOR_PILLS: Readonly<Record<FactorVerification, { text: string; badge: string }>> = {
  VERIFIED: { text: 'Verificado', badge: 'badge-success' },
  PENDING_VALIDATION: { text: 'Pendiente de validación', badge: 'badge-warning' },
  NOT_CONFIGURED: { text: 'Sin configurar', badge: 'badge-neutral' },
  INVALID_CONFIGURATION: { text: 'Inválido', badge: 'badge-danger' },
};

/** Unidad legible: `kg_CO2/gal` → «kg CO₂/gal», `kg_CO2/m3` → «kg CO₂/m³», `km/m3` → «km/m³». */
export const unitLabel = (unit: string): string => unit.replace('_CO2', ' CO₂').replace(/m3$/, 'm³');

/** Título del volumen estimado según su unidad: «Galones estimados» o «Metros cúbicos estimados». */
export function volumeTitle(unit: string | null): string {
  if (unit === 'gal') return 'Galones estimados';

  return unit === 'm3' ? 'Metros cúbicos estimados' : 'Volumen estimado';
}

/** Cómo se llama el volumen en la fórmula resumida («galones», «metros cúbicos»). */
export function volumeNoun(unit: string | null): string {
  if (unit === 'gal') return 'galones';

  return unit === 'm3' ? 'metros cúbicos' : 'volumen';
}

/** Nombre corto del combustible para los botones («Gasolina motor (sin mezcla)» → «Gasolina motor»). */
export const shortFuelName = (name: string): string => name.split(' (')[0];

/** Motivo corto por el que no hay CO₂ oficial, según el estado del factor (el texto largo del servidor va aparte, en la ayuda «¿Por qué?»). */
export const BLOCKED_REASON: Readonly<Record<FactorVerification, string>> = {
  PENDING_VALIDATION: 'pendiente de validación',
  NOT_CONFIGURED: 'factor sin configurar',
  INVALID_CONFIGURATION: 'configuración inválida',
  VERIFIED: 'sin cálculo oficial',
};

export const factorValue = (factor: EmissionFactor): string | null => (FACTOR_STATUS[factor.status].showValue ? formatReceived(factor.value) : null);

/** PBV máximo para mostrar: el mayor entre el PBV único y las variantes, solo si el dato está verificado. */
export function pbvMax(vehicle: Pick<FreightVehicle, 'verified' | 'grossWeightKg' | 'pbvVariants'>): number | null {
  if (!vehicle.verified) return null;
  const weights = [...(vehicle.grossWeightKg === null ? [] : [vehicle.grossWeightKg]), ...vehicle.pbvVariants.map((v) => v.grossWeightKg)];

  return weights.length > 0 ? Math.max(...weights) : null;
}

export interface CodeChip {
  readonly symbol: string;
  /** Significado según la guía; `null` si la guía no lo trae (no se inventa). */
  readonly meaning: string | null;
}

/**
 * Parte un código en sus piezas: `C2S1` → `C`, `2`, `S1`; `R2` → `R2`. Cada pieza lleva su significado de la guía: las letras, el de su
 * símbolo; los dígitos sueltos, la regla de los dígitos.
 */
export function decodeCode(code: string, guide: CodeGuide): CodeChip[] {
  const match = /^(C)?(\d+)?([A-Z]\d+)?$/.exec(code);
  if (!match) return [];

  const letter = (symbol: string): string | null => guide.letters.find((l) => l.symbol === symbol)?.meaning ?? null;
  const chips: CodeChip[] = [];
  if (match[1]) chips.push({ symbol: 'C', meaning: letter('C') });
  if (match[2]) chips.push({ symbol: match[2], meaning: guide.digitRule || null });
  if (match[3]) chips.push({ symbol: match[3], meaning: letter(match[3].charAt(0)) });

  return chips;
}
