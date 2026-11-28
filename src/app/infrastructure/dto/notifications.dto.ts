/** Contratos JSON de `/organizations/{id}/notifications…`. */
export interface NotificationDto {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  /** Los avisos de posibles duplicados añaden `possible_duplicates` (cuántas operaciones); el texto del servidor ya lo dice. */
  readonly payload: {
    readonly import_id: string;
    /** Solo viaja si es `MANUAL` (viaje retenido registrado a mano). */
    readonly import_kind?: 'MANUAL' | null;
    readonly new?: number;
    readonly changed?: number;
    readonly possible_duplicates?: number;
    /** Solo en los avisos `SHARED_OPERATIONS`: cuántos posibles viajes compartidos esperan revisión. */
    readonly possible_shared?: number;
    /** Solo en los avisos `EFFICIENCY_ESTIMATED`: viajes calculados con rendimiento estimado y viajes que siguen pendientes. */
    readonly estimated_trips?: number;
    readonly pending_trips?: number;
  };
  readonly created_at: string;
  readonly read_at: string | null;
}

export interface UnreadCountDto {
  readonly count: number;
}
