import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Límites del backend (`POST /vehicles` y `PATCH /vehicles/{id}`), copiados aquí para avisar antes de enviar. Si el servidor los cambia,
 * hay que cambiarlos aquí también; el servidor sigue siendo quien valida.
 */
export const VEHICLE_LIMITS = {
  /** `configuration_code` */
  configurationMax: 20,
  /** `vehicle_type`, `technology` y `fuel_type` */
  textMax: 80,
  /** `model_year` */
  yearMin: 1900,
  yearMax: 9999,
  /** `capacity_tons`: mayor que 0, hasta 10 dígitos en total y 3 decimales. */
  capacityDigits: 10,
  capacityDecimals: 3,
  /** `note` de la declaración de rendimiento (la ficha usa el mismo tope). */
  efficiencyNoteMax: 200,
} as const;

const CAPACITY = /^(\d+)(?:\.(\d+))?$/;

/** Capacidad con punto decimal, mayor que 0, hasta 10 dígitos y 3 decimales; vacío es válido (el dato es opcional). */
export function capacityValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();

  if (!value) return null;

  const match = CAPACITY.exec(value);

  if (!match) return { capacityFormat: true };

  const [, integer, decimals = ''] = match;

  if (Number(value) <= 0) return { capacityPositive: true };
  if (decimals.length > VEHICLE_LIMITS.capacityDecimals) return { capacityDecimals: true };
  if ((integer + decimals).length > VEHICLE_LIMITS.capacityDigits) return { capacityDigits: true };

  return null;
}
