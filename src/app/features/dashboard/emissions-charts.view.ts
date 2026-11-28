import { FootprintByFuel } from '../../domain/models/footprint';
import { ShareSlice, shareSlices } from '../../shared/ui/charts/share-chart';

/** Texto del estado vacío cuando el cálculo de CO₂ todavía no existe. */
export const NO_CALCULATION = 'Se activa cuando calcules tu huella de CO₂';
/** Texto del estado vacío cuando hay cálculo, pero no para el periodo elegido. */
export const NO_PERIOD_DATA = 'No hay cálculo para este periodo';

/** Porciones de la dona por combustible del periodo elegido (mayor resto, «Otros» si hay más de 4, ceros omitidos). */
export function fuelSlices(byFuel: FootprintByFuel | null): ShareSlice[] {
  return shareSlices((byFuel ?? []).map((f) => ({ key: f.fuelCode, label: f.name, value: f.kgCo2 })));
}
