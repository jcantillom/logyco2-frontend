import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Límites de entrada de la simulación: se replican solo para validar el formulario; el servidor es la referencia (422 si se superan). */
export const MAX_DISTANCE_KM = 100_000;
export const MAX_EFFICIENCY = 100;

/** Número decimal positivo escrito con punto o coma («12,5»); cualquier otra cosa (letras, signos, notación científica) es `null`. */
export function parseDecimal(text: string): number | null {
  const value = text.trim().replace(',', '.');

  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

/** Valida un número requerido, mayor que cero y no superior a `max`. Los errores: `required`, `number`, `positive`, `max`. */
export function positiveDecimal(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const text = String(control.value ?? '').trim();
    if (text === '') return { required: true };

    const value = parseDecimal(text);
    if (value === null) return { number: true };
    if (value <= 0) return { positive: true };

    return value > max ? { max: true } : null;
  };
}
