import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, computed, inject } from '@angular/core';
import { Params } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { Page } from '../../domain/models/pagination';
import { NotificationItem, NotificationLink } from '../../domain/models/vehicles';
import { NotificationsRepository } from '../../domain/repositories/vehicles.repositories';

/** Cada cuánto se renueva el conteo de no leídas mientras la pestaña está visible. */
export const UNREAD_REFRESH_MS = 60_000;
const PAGE_SIZE = 10;

/**
 * Solo se navega a rutas internas: empieza por una sola `/`, sin `\`, sin esquema ni caracteres de control. Cualquier otra cosa
 * (`https://…`, `//host`, `javascript:`) se descarta y la notificación solo se marca como leída.
 */
export function internalLink(link: NotificationLink): { readonly path: string; readonly query: Params } | null {
  const { path } = link;

  // eslint-disable-next-line no-control-regex
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) return null;

  return { path, query: link.query };
}

/**
 * Notificaciones de la campana para la empresa activa: conteo de no leídas (se renueva cada 60 s con la pestaña visible y se pausa
 * al ocultarla) y lista que se carga al abrir el panel. Todo es de la empresa activa y se descarta al cambiar de empresa.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsFacade implements OnDestroy {
  private readonly repository = inject(NotificationsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);
  private readonly document = inject(DOCUMENT);

  readonly unread = this.registry.track(new ScopedResource<number>());
  readonly list = this.registry.track(new ScopedResource<Page<NotificationItem>>());
  readonly unreadCount = computed(() => this.unread.data() ?? 0);

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly onVisibility = (): void => {
    if (!this.running) return;

    if (this.document.hidden) this.clearTimer();
    else {
      this.loadUnread();
      this.schedule();
    }
  };

  /** Empieza (o reinicia) la renovación periódica y pide el conteo ahora. Es seguro llamarla en cada cambio de empresa. */
  start(): void {
    if (!this.running) this.document.addEventListener('visibilitychange', this.onVisibility);

    this.running = true;
    this.loadUnread();
    this.clearTimer();

    if (!this.document.hidden) this.schedule();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    this.document.removeEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    this.stop();
  }

  loadUnread(): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.unread.reset();

    this.unread.load(this.repository.unreadCount(id), { keepData: true });
  }

  loadList(): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.list.reset();

    this.list.load(this.repository.list(id, { page: 1, pageSize: PAGE_SIZE }, false), { keepData: true });
  }

  /** Marca una como leída (idempotente) y actualiza lista y conteo sin esperar otra consulta. */
  markRead(item: NotificationItem): Observable<NotificationItem> {
    return this.repository.markRead(this.organizationId(), item.id).pipe(
      tap((updated) => {
        this.patchList((n) => (n.id === updated.id ? updated : n));
        if (!item.read) this.unread.data.update((count) => Math.max(0, (count ?? 1) - 1));
      }),
    );
  }

  markAllRead(): Observable<number> {
    return this.repository.markAllRead(this.organizationId()).pipe(
      tap(() => {
        this.patchList((n) => ({ ...n, read: true }));
        this.unread.data.set(0);
      }),
    );
  }

  private patchList(change: (item: NotificationItem) => NotificationItem): void {
    this.list.data.update((page) => (page ? { ...page, items: page.items.map(change) } : page));
  }

  private schedule(): void {
    this.timer = setInterval(() => this.loadUnread(), UNREAD_REFRESH_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);

    this.timer = null;
  }

  private organizationId(): string {
    const id = this.context.activeOrganizationId();

    if (!id) throw new Error('No hay una empresa activa.');

    return id;
  }
}
