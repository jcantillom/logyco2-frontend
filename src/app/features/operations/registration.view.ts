import { AppError } from '../../core/errors/app-error';
import { ManualFuel, ManualOptions, ManualResult, ManualTripOutcome, ManualVehicle } from '../../domain/models/manual-trips';
import { ORIGIN_LABELS } from '../vehicles/vehicle-efficiency.view';
import { distanceText, dayText, kgText } from './operations.view';

/** El dato del formulario al que corresponde cada nombre del cuerpo del servidor, para mostrar el error bajo el campo correcto. */
export const FIELD_OF_SERVER: Readonly<Record<string, string>> = {
  trip_date: 'date',
  plate: 'vehicle',
  origin: 'origin',
  destination: 'destination',
  distance_km: 'distance',
  consumption: 'value',
  efficiency: 'value',
  consumption_unit: 'unit',
  efficiency_unit: 'unit',
  cargo_ton: 'cargo',
  fuel_type: 'fuel',
};

/** Mensaje de un error de registro: el del catálogo, salvo los que necesitan contexto de esta pantalla. */
export function registrationErrorText(error: AppError): string {
  if (error.code === 'IDEMPOTENCY_KEY_REUSED') return 'Este registro se identificó igual que otro viaje distinto. Cierra el formulario y vuelve a intentarlo.';

  return error.message;
}

/** Mensaje de un error de anulación: el catálogo habla de «completar» en los códigos compartidos con la Etapa 1. */
export function voidErrorText(error: AppError): string {
  if (error.code === 'TRIP_HAS_CONFIRMED_MATCH') return 'Este viaje ya está confirmado como compartido con una empresa vinculada: no se puede anular sin alterar lo confirmado.';

  return error.message;
}

/** Lo que el servidor calculó, dicho en una línea: nunca un valor de la pantalla. */
export function resultHeadline(result: ManualResult): string {
  if (result.status === 'CALCULATED') return `Emisiones del viaje: ${kgText(result.kgCo2)} kg CO₂`;

  if (result.status === 'DUPLICATE') return 'Quedó como duplicado: no suma';

  return result.reasonLabel ? `Por completar: ${result.reasonLabel}` : 'Por completar';
}

/** El mensaje cortés anunciado al guardar. */
export function registrationAnnouncement(outcome: ManualTripOutcome): string {
  const head = outcome.created ? 'Viaje registrado.' : 'Este viaje ya estaba registrado.';

  return `${head} ${resultHeadline(outcome.result)}`;
}

/** «Usar último rendimiento (8,5 km/gal, 12/11)»: la sugerencia que el servidor dio para la placa, como texto del botón explícito. */
export const lastEfficiencyText = (vehicle: ManualVehicle, unitLabel: (unit: string) => string): string | null => {
  const last = vehicle.lastEfficiency;

  if (!last) return null;

  const value = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 }).format(Number(last.value));
  const day = last.tripDate ? `, ${dayText(last.tripDate).slice(0, 5)}` : '';

  return `Usar último rendimiento (${value} ${unitLabel(last.unit)}${day})`;
};

/** «Usar rendimiento del vehículo (6,9 km/gal · Declarado)»: la sugerencia del vehículo, siempre el PRIMER botón explícito. */
export const vehicleEfficiencyText = (vehicle: ManualVehicle, unitLabel: (unit: string) => string): string | null => {
  const record = vehicle.vehicleEfficiency;

  if (!record) return null;

  const value = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 }).format(Number(record.value));

  return `Usar rendimiento del vehículo (${value} ${unitLabel(record.unit)} · ${ORIGIN_LABELS[record.origin].text})`;
};

/** El valor de un decimal del servidor para escribirlo en un campo: sin ceros de más («8.5000» → «8.5»). */
export const decimalInput = (value: string): string => String(Number(value));

export const fuelOf = (options: ManualOptions | null, code: string | null): ManualFuel | null => (code ? (options?.fuels.find((fuel) => fuel.value === code) ?? null) : null);

/** «Distancia por ruta: 412,3 km». */
export const routeLine = (km: number): string => `Distancia por ruta: ${distanceText(km)} km`;
