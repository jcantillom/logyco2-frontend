import { NotificationItem, NotificationKind } from '../../domain/models/notifications';
import { NotificationDto, UnreadCountDto } from '../dto/notifications.dto';

const KINDS: readonly NotificationKind[] = ['VEHICLES_NEW', 'VEHICLES_CHANGED'];

/** Un tipo que el cliente no conoce se trata como aviso de cambios: lleva a la misma revisión, sin inventar otra. */
const kind = (value: string): NotificationKind => KINDS.find((option) => option === value) ?? 'VEHICLES_CHANGED';

export const toNotification = (dto: NotificationDto): NotificationItem => ({
  id: dto.id,
  kind: kind(dto.kind),
  title: dto.title,
  body: dto.body,
  payload: { importId: dto.payload.import_id, new: dto.payload.new, changed: dto.payload.changed },
  createdAt: dto.created_at,
  readAt: dto.read_at,
});

/** El conteo llega como `{count}`; si el servidor lo entrega como número suelto también se acepta. */
export const toUnreadCount = (dto: UnreadCountDto | number): number => (typeof dto === 'number' ? dto : dto.count);
