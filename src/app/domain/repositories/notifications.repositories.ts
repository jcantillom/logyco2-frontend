import { Observable } from 'rxjs';
import { NotificationItem } from '../models/notifications';
import { Page, PageRequest } from '../models/pagination';

/** Puerto de los avisos del usuario en la empresa activa (`/organizations/{id}/notifications…`). */
export abstract class NotificationsRepository {
  /** Del más reciente al más antiguo. */
  abstract list(organizationId: string, request: PageRequest): Observable<Page<NotificationItem>>;
  abstract unreadCount(organizationId: string): Observable<number>;
  /** Idempotente: marcar un aviso ya leído no falla. */
  abstract markRead(organizationId: string, notificationId: string): Observable<void>;
  abstract markAllRead(organizationId: string): Observable<void>;
}
