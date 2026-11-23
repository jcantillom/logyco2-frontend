import { NotificationItem, NotificationKind } from '../../domain/models/notifications';
import { NotificationDto, UnreadCountDto } from '../dto/notifications.dto';

const KINDS: readonly NotificationKind[] = ['VEHICLES_NEW', 'VEHICLES_CHANGED', 'POSSIBLE_DUPLICATES', 'SHARED_OPERATIONS'];

/** Un tipo que el cliente no conoce se trata como aviso de cambios: lleva a la misma revisión, sin inventar otra. */
const kind = (value: string): NotificationKind => KINDS.find((option) => option === value) ?? 'VEHICLES_CHANGED';

export const toNotification = (dto: NotificationDto): NotificationItem => {
  const base = { id: dto.id, title: dto.title, body: dto.body, createdAt: dto.created_at, readAt: dto.read_at };
  const type = kind(dto.kind);

  if (type === 'SHARED_OPERATIONS') return { ...base, kind: type, payload: { importId: dto.payload.import_id, possibleShared: dto.payload.possible_shared ?? 0 } };

  return { ...base, kind: type, payload: { importId: dto.payload.import_id, new: dto.payload.new ?? 0, changed: dto.payload.changed ?? 0 } };
};

/** El conteo llega como `{count}`; si el servidor lo entrega como número suelto también se acepta. */
export const toUnreadCount = (dto: UnreadCountDto | number): number => (typeof dto === 'number' ? dto : dto.count);
