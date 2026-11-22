export type NotificationKind = 'VEHICLES_NEW' | 'VEHICLES_CHANGED';

/** A qué carga apuntan los avisos de vehículos y las cifras que traen. */
export interface NotificationPayload {
  readonly importId: string;
  readonly new: number;
  readonly changed: number;
}

/** Aviso de la campana: el título y el texto vienen del servidor, ya en español. */
export interface NotificationItem {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly payload: NotificationPayload;
  readonly createdAt: string;
  /** `null` mientras no se ha leído. */
  readonly readAt: string | null;
}
