export type NotificationKind = 'VEHICLES_NEW' | 'VEHICLES_CHANGED' | 'POSSIBLE_DUPLICATES' | 'SHARED_OPERATIONS';

/** A qué carga apuntan todos los avisos. */
interface PayloadBase {
  readonly importId: string;
}

/** Avisos de vehículos y de posibles duplicados (el texto del servidor ya incluye la cantidad de duplicados). */
export interface VehiclesPayload extends PayloadBase {
  readonly new: number;
  readonly changed: number;
}

/** Aviso agrupado de posibles viajes compartidos con una empresa vinculada: solo la carga y cuántos esperan revisión; nada de la otra empresa. */
export interface SharedOperationsPayload extends PayloadBase {
  readonly possibleShared: number;
}

export type NotificationPayload = VehiclesPayload | SharedOperationsPayload;

interface NotificationBase {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  /** `null` mientras no se ha leído. */
  readonly readAt: string | null;
}

/** Aviso de la campana: el título y el texto vienen del servidor, ya en español. El tipo decide la forma de su `payload`. */
export type NotificationItem =
  | (NotificationBase & { readonly kind: 'VEHICLES_NEW' | 'VEHICLES_CHANGED' | 'POSSIBLE_DUPLICATES'; readonly payload: VehiclesPayload })
  | (NotificationBase & { readonly kind: 'SHARED_OPERATIONS'; readonly payload: SharedOperationsPayload });
