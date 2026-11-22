import { VehicleOwnership, VehicleSource, VehicleStatus } from '../../domain/models/vehicles';
import { Label } from '../../shared/ui/labels';

export const STATUS_LABELS: Readonly<Record<VehicleStatus, Label>> = {
  ACTIVE: { text: 'Activo', tone: 'success' },
  INACTIVE: { text: 'Inactivo', tone: 'neutral' },
};

/** `UNKNOWN` se muestra «Sin declarar»: la propiedad nunca se deduce de que la placa aparezca en un archivo. */
export const OWNERSHIP_LABELS: Readonly<Record<VehicleOwnership, string>> = {
  UNKNOWN: 'Sin declarar',
  OWN: 'Propio',
  CONTRACTED: 'Contratado',
  THIRD_PARTY: 'De terceros',
  SUBCONTRACTED: 'Subcontratado',
};

export const SOURCE_LABELS: Readonly<Record<VehicleSource, string>> = {
  IMPORT: 'Archivo de operaciones',
  MANUAL: 'Registro manual',
};

/** Tipos de combustible del inventario (vocabulario cerrado del servidor). */
export const FUEL_LABELS: Readonly<Record<string, string>> = {
  DIESEL: 'Diésel',
  GASOLINE: 'Gasolina',
  NATURAL_GAS: 'Gas natural',
  ELECTRIC: 'Eléctrico',
  HYBRID: 'Híbrido',
  OTHER: 'Otro',
};

/** Opciones de los selectores de combustible, en el orden del vocabulario. */
export const FUEL_OPTIONS: readonly { readonly value: string; readonly label: string }[] = Object.entries(FUEL_LABELS).map(([value, label]) => ({ value, label }));

/** Un valor fuera del vocabulario (el servidor guarda texto libre de hasta 80 caracteres) se muestra tal cual. */
export const fuelLabel = (code: string | null): string => (code === null ? '—' : (FUEL_LABELS[code] ?? code));

/** Eventos del historial; uno que el servidor agregue después se rotula de forma genérica. */
const EVENT_LABELS: Readonly<Record<string, string>> = {
  CREATED: 'Registro manual',
  REGISTERED: 'Confirmado desde un análisis de archivo',
  UPDATED: 'Edición manual',
  CONFLICT_RESOLVED: 'Se aceptó el valor del archivo',
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  configuration_code: 'Configuración',
  vehicle_type: 'Tipo',
  fuel_type: 'Combustible',
  model_year: 'Modelo',
  technology: 'Tecnología',
  capacity_tons: 'Capacidad (t)',
  ownership: 'Propiedad',
  status: 'Estado',
};

export const eventLabel = (event: string): string => EVENT_LABELS[event] ?? 'Cambio registrado';
export const fieldLabel = (field: string): string => FIELD_LABELS[field] ?? field;

/** Valor de un campo del historial: la propiedad y el estado se traducen; el resto se muestra tal cual. */
export function changeValue(field: string, value: string | null): string {
  if (value === null) return '—';
  if (field === 'fuel_type') return fuelLabel(value);
  if (field === 'ownership') return OWNERSHIP_LABELS[value as VehicleOwnership] ?? value;
  if (field === 'status') return STATUS_LABELS[value as VehicleStatus]?.text ?? value;

  return value;
}
