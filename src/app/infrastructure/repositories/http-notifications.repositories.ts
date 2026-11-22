import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { NotificationItem } from '../../domain/models/notifications';
import { Page, PageRequest } from '../../domain/models/pagination';
import { NotificationsRepository } from '../../domain/repositories/notifications.repositories';
import { NotificationDto, UnreadCountDto } from '../dto/notifications.dto';
import { ApiClient } from '../http/api-client';
import { toPage } from '../mappers/identity.mappers';
import { toNotification, toUnreadCount } from '../mappers/notifications.mappers';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/notifications`;

@Injectable()
export class HttpNotificationsRepository extends NotificationsRepository {
  private readonly api = inject(ApiClient);

  list(organizationId: string, request: PageRequest): Observable<Page<NotificationItem>> {
    return this.api
      .getPage<NotificationDto>(base(organizationId), { page: request.page, page_size: request.pageSize })
      .pipe(map((response) => toPage(response, toNotification)));
  }

  unreadCount(organizationId: string): Observable<number> {
    return this.api.get<UnreadCountDto | number>(`${base(organizationId)}/unread-count`).pipe(map(toUnreadCount));
  }

  markRead(organizationId: string, notificationId: string): Observable<void> {
    return this.api.post<unknown>(`${base(organizationId)}/${encodeURIComponent(notificationId)}/read`, {}).pipe(map(() => undefined));
  }

  markAllRead(organizationId: string): Observable<void> {
    return this.api.post<unknown>(`${base(organizationId)}/read-all`, {}).pipe(map(() => undefined));
  }
}
