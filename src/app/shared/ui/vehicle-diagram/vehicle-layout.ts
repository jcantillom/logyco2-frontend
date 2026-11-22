import { FreightVehicle } from '../../../domain/models/emissions';

/** Geometría del diagrama lateral (coordenadas SVG). La unidad es el píxel del `viewBox`; no representa medidas reales. */
export const GROUND_Y = 78;
export const WHEEL_R = 10;
/** Separación entre ejes de un mismo grupo (tándem, trídem): ruedas casi juntas. */
const GROUP_STEP = 22;
/** Separación entre el último eje de un grupo y el primero del siguiente. */
const RIGID_GAP = 62;
const CHASSIS_GAP = 40;
const TRAILER_GAP = 44;
const MARGIN = 6;
const CAB_W = 40;

export interface Box { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
/** Un eje dibujado: su posición y el grupo (0 = el más delantero) al que pertenece. */
export interface DrawnAxle { readonly x: number; readonly group: number }

export interface VehicleLayout {
  readonly width: number;
  readonly truckAxles: readonly DrawnAxle[];
  readonly trailerAxles: readonly DrawnAxle[];
  readonly cab: Box | null;
  readonly truckBody: Box | null;
  readonly trailerBody: Box | null;
  /** Línea del bastidor (chasis) de cada parte, de x1 a x2. */
  readonly frames: readonly { readonly x1: number; readonly x2: number }[];
  readonly drawbar: { readonly x1: number; readonly x2: number } | null;
  readonly fifthWheel: number | null;
  readonly landingGear: number | null;
}

export type LayoutInput = Pick<FreightVehicle, 'trailerKind' | 'truckAxleGroups' | 'trailerAxleGroups'>;

const extent = (groups: readonly number[]): number => groups.reduce((sum, n) => sum + (n - 1) * GROUP_STEP, 0);

/** Ejes de cada grupo (los del grupo juntos) desde `start`, con `gap` entre grupos. */
function place(groups: readonly number[], start: number, gap: number): DrawnAxle[] {
  const axles: DrawnAxle[] = [];
  let x = start;
  groups.forEach((size, group) => {
    for (let i = 0; i < size; i++) {
      axles.push({ x, group });
      if (i < size - 1) x += GROUP_STEP;
    }
    x += gap;
  });

  return axles;
}

const last = (axles: readonly DrawnAxle[]): number => axles[axles.length - 1].x;

/** Camión (cabina con capó y ventana, caja): el primer grupo bajo la cabina y los demás atrás, cada grupo con sus ejes juntos. */
function truck(origin: number, groups: readonly number[]) {
  const cab: Box = { x: origin, y: 38, w: CAB_W, h: 32 };
  const axles = place(groups, origin + 11, RIGID_GAP);
  const end = last(axles) + 30;
  const bodyX = origin + CAB_W + 3;
  const body: Box = { x: bodyX, y: 20, w: Math.max(end - bodyX, 40), h: 50 };

  return { cab, body, axles, end: bodyX + body.w };
}

/** Disposición del diagrama de un vehículo según sus grupos de ejes y el tipo de remolque. */
export function layoutVehicle(vehicle: LayoutInput, truckGroups: readonly number[] = vehicle.truckAxleGroups): VehicleLayout {
  const { trailerAxleGroups: tg, trailerKind: kind } = vehicle;
  const hasTruck = truckGroups.length > 0;
  const hasTrailer = tg.length > 0;

  if (hasTruck && !hasTrailer) {
    const rigid = truck(MARGIN, truckGroups);

    return { width: rigid.end + MARGIN, truckAxles: rigid.axles, trailerAxles: [], cab: rigid.cab, truckBody: rigid.body, trailerBody: null, frames: [{ x1: MARGIN, x2: rigid.end }], drawbar: null, fifthWheel: null, landingGear: null };
  }

  if (hasTruck && kind === 'S') {
    // Tractocamión: cabina y chasis corto; el semirremolque (caja larga) se apoya en la quinta rueda y su grupo de ejes va atrás.
    const cab: Box = { x: MARGIN, y: 38, w: CAB_W, h: 32 };
    const axles = place(truckGroups, MARGIN + 11, CHASSIS_GAP);
    const chassisEnd = last(axles) + 14;
    const fifth = last(axles) - 4;
    const length = 112 + extent(tg);
    const trailer: Box = { x: fifth - 8, y: 24, w: length, h: 42 };
    const trailerEnd = trailer.x + length;
    const trailerAxles = place(tg, trailerEnd - 14 - extent(tg), CHASSIS_GAP);

    return { width: trailerEnd + MARGIN, truckAxles: axles, trailerAxles, cab, truckBody: null, trailerBody: trailer, frames: [{ x1: MARGIN, x2: chassisEnd }], drawbar: null, fifthWheel: fifth, landingGear: trailerAxles[0].x - 30 };
  }

  if (hasTruck && kind === 'B') {
    // Camión con remolque balanceado: acople corto sin barra de tiro y ejes del remolque centrados bajo su caja.
    const rigid = truck(MARGIN, truckGroups);
    const length = 44 + extent(tg) + 26;
    const trailer: Box = { x: rigid.end + 8, y: 26, w: length, h: 44 };
    const trailerAxles = place(tg, trailer.x + length / 2 - extent(tg) / 2, TRAILER_GAP);

    return { width: trailer.x + trailer.w + MARGIN, truckAxles: rigid.axles, trailerAxles, cab: rigid.cab, truckBody: rigid.body, trailerBody: trailer, frames: [{ x1: MARGIN, x2: rigid.end }, { x1: rigid.end, x2: trailer.x + trailer.w }], drawbar: null, fifthWheel: null, landingGear: null };
  }

  if (hasTruck) {
    // Camión con remolque de barra de tiro: dos unidades separadas unidas por la barra; el remolque con su eje delantero y los traseros.
    const rigid = truck(MARGIN, truckGroups);
    const x = rigid.end + 26;
    const trailerAxles = place(tg, x + 14, TRAILER_GAP);
    const trailer: Box = { x, y: 24, w: last(trailerAxles) + 30 - x, h: 46 };

    return { width: trailer.x + trailer.w + MARGIN, truckAxles: rigid.axles, trailerAxles, cab: rigid.cab, truckBody: rigid.body, trailerBody: trailer, frames: [{ x1: MARGIN, x2: rigid.end }, { x1: trailer.x, x2: trailer.x + trailer.w }], drawbar: { x1: rigid.end - 6, x2: trailer.x }, fifthWheel: null, landingGear: null };
  }

  // Remolque solo.
  const balanced = kind === 'B';
  const lead = balanced ? 12 : 30;
  const x = MARGIN + lead;
  if (balanced) {
    const length = 44 + extent(tg) + 26;
    const trailerAxles = place(tg, x + length / 2 - extent(tg) / 2, TRAILER_GAP);

    return { width: x + length + MARGIN, truckAxles: [], trailerAxles, cab: null, truckBody: null, trailerBody: { x, y: 24, w: length, h: 46 }, frames: [{ x1: x - 8, x2: x + length }], drawbar: null, fifthWheel: null, landingGear: null };
  }
  const trailerAxles = place(tg, x + 14, TRAILER_GAP);
  const trailer: Box = { x, y: 24, w: last(trailerAxles) + 30 - x, h: 46 };

  return { width: trailer.x + trailer.w + MARGIN, truckAxles: [], trailerAxles, cab: null, truckBody: null, trailerBody: trailer, frames: [{ x1: MARGIN, x2: trailer.x + trailer.w }], drawbar: { x1: MARGIN, x2: trailer.x }, fifthWheel: null, landingGear: null };
}
