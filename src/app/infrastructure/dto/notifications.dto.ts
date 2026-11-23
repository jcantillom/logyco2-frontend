/** Contratos JSON de `/organizations/{id}/notifications…`. */
export interface NotificationDto {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  /** Los avisos de posibles duplicados añaden `possible_duplicates` (cuántas operaciones); el texto del servidor ya lo dice. */
  readonly payload: {
    readonly import_id: string;
    readonly new?: number;
    readonly changed?: number;
    readonly possible_duplicates?: number;
    /** Solo en los avisos `SHARED_OPERATIONS`: cuántos posibles viajes compartidos esperan revisión. */
    readonly possible_shared?: number;
  };
  readonly created_at: string;
  readonly read_at: string | null;
}

export interface UnreadCountDto {
  readonly count: number;
}
