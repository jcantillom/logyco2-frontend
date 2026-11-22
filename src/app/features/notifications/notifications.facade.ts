import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, computed, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { NotificationItem } from '../../domain/models/notifications';
import { Page } from '../../domain/models/pagination';
import { NotificationsRepository } from '../../domain/repositories/notifications.repositories';

/** Cada cuánto se renueva el conteo de no leídos mientras la pestaña está visible. */
export const UNREAD_REFRESH_MS = 60_000;
/** Dos renovaciones por cambio de ruta no se piden con menos de esto entre sí. */
export const UNREAD_MIN_GAP_MS = 10_000;
const PAGE_SIZE = 20;

/**
 * Avisos de la campana para la empresa activa: conteo de no leídos (se renueva cada 60 s con la pestaña visible, se pausa al
 * ocultarla y se pide al cambiar de ruta) y lista que se carga al abrir el panel. Todo es de la empresa activa y se descarta
 * al cambiar de empresa.
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
  private lastUnreadAt = 0;
  private readonly onVisibility = (): void => {
    if (!this.running) return;

    this.clearTimer();

    if (!this.document.hidden) {
      this.loadUnread();
      this.schedule();
    }
  };

  /** Empieza (o reinicia) la renovación periódica y pide el conteo ahora. Es seguro llamarla en cada cambio de empresa. */
  start(): void {
    if (!this.running) this.document.addEventListener('visibilitychange', this.onVisibility);

    this.running = true;
    this.clearTimer();
    this.loadUnread();

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

  /** Renovación por cambio de ruta: no repite la consulta si se acaba de hacer. */
  refresh(): void {
    if (this.running && Date.now() - this.lastUnreadAt >= UNREAD_MIN_GAP_MS) this.loadUnread();
  }

  loadUnread(): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.unread.reset();

    this.lastUnreadAt = Date.now();
    this.unread.load(this.repository.unreadCount(id), { keepData: true });
  }

  loadList(): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.list.reset();

    this.list.load(this.repository.list(id, { page: 1, pageSize: PAGE_SIZE }), { keepData: true });
  }

  /** Marca uno como leído (idempotente) y actualiza lista y conteo sin esperar otra consulta. */
  markRead(item: NotificationItem): Observable<void> {
    return this.repository.markRead(this.organizationId(), item.id).pipe(
      tap(() => {
        if (item.readAt !== null) return;

        this.patchList((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n));
        this.unread.data.update((count) => Math.max(0, (count ?? 1) - 1));
      }),
    );
  }

  markAllRead(): Observable<void> {
    return this.repository.markAllRead(this.organizationId()).pipe(
      tap(() => {
        const now = new Date().toISOString();

        this.patchList((n) => (n.readAt === null ? { ...n, readAt: now } : n));
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
