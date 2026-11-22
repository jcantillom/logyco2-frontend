import { FreightVehicle, VehicleFamily } from '../../../domain/models/emissions';

/** Tipo de vehículo en lenguaje común, deducido de la familia y de si el catálogo trae camión (o es un remolque solo). */
export function vehicleKind(vehicle: Pick<FreightVehicle, 'family' | 'truckAxles'>): string {
  const alone = vehicle.truckAxles === 0;
  const kinds: Readonly<Record<VehicleFamily, string>> = {
    RIGID: 'Camión rígido',
    TRACTOR: 'Tractocamión',
    TRAILER: alone ? 'Remolque' : 'Camión con remolque',
    BALANCED_TRAILER: alone ? 'Remolque balanceado' : 'Camión con remolque balanceado',
  };

  return kinds[vehicle.family];
}

export const axlesWord = (n: number): string => `${n} ${n === 1 ? 'eje' : 'ejes'}`;

/** Nombre accesible del diagrama: «Camión rígido de 2 ejes», «Tractocamión de 3 ejes con 2 ejes de semirremolque». */
export function diagramLabel(vehicle: FreightVehicle): string {
  const kind = vehicleKind(vehicle);
  if (vehicle.truckAxles > 0 && vehicle.trailerAxles > 0) return `${kind} de ${axlesWord(vehicle.truckAxles)} con ${axlesWord(vehicle.trailerAxles)} de remolque`;

  return `${kind} de ${axlesWord(vehicle.totalAxles)}`;
}
