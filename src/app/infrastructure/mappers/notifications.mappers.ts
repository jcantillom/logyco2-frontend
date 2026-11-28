import { NotificationItem, NotificationKind } from '../../domain/models/notifications';
import { NotificationDto, UnreadCountDto } from '../dto/notifications.dto';

const KINDS: readonly NotificationKind[] = ['VEHICLES_NEW', 'VEHICLES_CHANGED', 'POSSIBLE_DUPLICATES', 'SHARED_OPERATIONS', 'EFFICIENCY_ESTIMATED'];

/** Un tipo que el cliente no conoce se trata como aviso de cambios: lleva a la misma revisión, sin inventar otra. */
const kind = (value: string): NotificationKind => KINDS.find((option) => option === value) ?? 'VEHICLES_CHANGED';

export const toNotification = (dto: NotificationDto): NotificationItem => {
  const base = { id: dto.id, title: dto.title, body: dto.body, createdAt: dto.created_at, readAt: dto.read_at };
  const type = kind(dto.kind);
  const importKind = dto.payload.import_kind === 'MANUAL' ? 'MANUAL' : null;

  if (type === 'SHARED_OPERATIONS') return { ...base, kind: type, payload: { importId: dto.payload.import_id, importKind, possibleShared: dto.payload.possible_shared ?? 0 } };

  if (type === 'EFFICIENCY_ESTIMATED') return { ...base, kind: type, payload: { importId: dto.payload.import_id, importKind, estimatedTrips: dto.payload.estimated_trips ?? 0, pendingTrips: dto.payload.pending_trips ?? 0 } };

  return { ...base, kind: type, payload: { importId: dto.payload.import_id, importKind, new: dto.payload.new ?? 0, changed: dto.payload.changed ?? 0 } };
};

/** El conteo llega como `{count}`; si el servidor lo entrega como número suelto también se acepta. */
export const toUnreadCount = (dto: UnreadCountDto | number): number => (typeof dto === 'number' ? dto : dto.count);
