/** Contratos JSON de `/organizations/{id}/notifications…`. */
export interface NotificationDto {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly payload: { readonly import_id: string; readonly new: number; readonly changed: number };
  readonly created_at: string;
  readonly read_at: string | null;
}

export interface UnreadCountDto {
  readonly count: number;
}
