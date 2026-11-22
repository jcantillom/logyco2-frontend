import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Params, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NotificationItem } from '../../domain/models/vehicles';
import { NotificationsFacade, internalLink } from '../../features/notifications/notifications.facade';
import { relativeTime } from '../../features/notifications/relative-time';

export interface BellAlert {
  readonly label: string;
  readonly hint: string;
  readonly count: number;
  readonly path: string;
  readonly query?: Params;
}

/**
 * Campana de la empresa: «Notificaciones» (si `notifications` está activo) y «Acciones pendientes». Solo lista lo que requiere atención y
 * lleva al lugar donde se resuelve. La consola de plataforma la usa sin notificaciones.
 */
@Component({
  selector: 'app-actions-bell',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { position: relative; display: inline-block; }
      .bell { position: relative; display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; color: var(--c-head); border: 0; background: none; padding: 0; cursor: pointer; font: inherit; transition: background 0.15s; }
      .bell:hover { background: rgb(81 83 74 / 7%); }
      .bell:focus-visible { outline: 3px solid var(--c-secondary-soft); }
      .bell svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .bell .count { position: absolute; top: 1px; right: 0; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: var(--c-danger); color: #fff; font-size: 0.68rem; font-weight: 800; display: grid; place-items: center; }
      .panel { position: absolute; top: calc(100% + 10px); right: 0; width: min(360px, 92vw); background: var(--c-sf); border: 1px solid var(--c-bd); border-radius: 14px; box-shadow: 0 18px 40px color-mix(in srgb, var(--c-gray) 14%, transparent); z-index: 70; overflow: hidden; }
      .panel header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--c-bd); font-size: 0.9rem; color: var(--c-head); }
      .panel .n { padding: 1px 8px; border-radius: 999px; background: var(--c-bad-soft); color: var(--c-danger); font-size: 0.72rem; font-weight: 800; }
      .panel ul { list-style: none; margin: 0; padding: 6px; }
      .panel li a { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 10px; text-decoration: none; color: inherit; }
      .panel li a:hover { background: var(--c-s2); }
      .panel .txt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .panel .txt strong { font-size: 0.84rem; color: var(--c-head); }
      .panel .txt span { font-size: 0.74rem; color: var(--c-mu); line-height: 1.35; }
      .panel .num { min-width: 28px; text-align: center; padding: 2px 8px; border-radius: 999px; background: var(--c-bad-soft); color: var(--c-danger); font-weight: 800; font-size: 0.8rem; }
      .panel section + section { border-top: 1px solid var(--c-bd); }
      .panel .sec-head { display: flex; align-items: center; gap: 8px; }
      .panel .sec-head .mark { margin-left: auto; border: 0; background: none; padding: 4px 6px; border-radius: 8px; font: inherit; font-size: 0.76rem; font-weight: 700; color: var(--c-accent); cursor: pointer; }
      .panel .sec-head .mark:hover:not(:disabled) { background: var(--c-ok-soft); }
      .panel .sec-head .mark:disabled { color: var(--c-mu); cursor: default; }
      .panel .sec-head .mark:focus-visible, .panel .notif:focus-visible, .panel .retry:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 1px; }
      .panel .scroll { max-height: min(320px, 46vh); overflow-y: auto; }
      .panel .notif { all: unset; box-sizing: border-box; display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 10px; border-radius: 10px; cursor: pointer; }
      .panel .notif:hover { background: var(--c-s2); }
      .panel .sev { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--c-info-bg); color: var(--c-info); }
      .panel .sev.WARNING { background: var(--c-warn-soft); color: var(--c-warning); }
      .panel .sev.SUCCESS { background: var(--c-success-bg); color: var(--c-success); }
      .panel .sev svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .panel .notif .txt strong { display: flex; align-items: center; gap: 6px; }
      .panel .notif .when { color: var(--c-mu); font-size: 0.7rem; }
      .panel .dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--c-primary); }
      .panel .notif.read strong { font-weight: 600; color: var(--c-text2); }
      .panel .state { display: flex; align-items: center; gap: 10px; margin: 0; padding: 14px 16px; font-size: 0.84rem; color: var(--c-mu); }
      .panel .state.err { color: var(--c-danger); }
      .panel .retry { border: 0; background: none; font: inherit; font-weight: 700; color: var(--c-accent); cursor: pointer; text-decoration: underline; padding: 0; }
      .panel .all-clear { display: flex; align-items: center; gap: 10px; margin: 0; padding: 18px 16px; font-size: 0.84rem; color: var(--c-mu); }
      .panel .all-clear svg { width: 22px; height: 22px; flex: none; fill: var(--c-ok-soft); stroke: var(--c-primary); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    `,
  ],
  template: `
    <button type="button" class="bell" aria-haspopup="true" [attr.aria-expanded]="open()" aria-controls="bell-panel" [attr.aria-label]="badge() ? label() + ': ' + badge() : 'Sin ' + label().toLowerCase()" data-testid="bell" (click)="toggle()">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" /></svg>
      @if (badge() > 0) { <span class="count" data-testid="bell-count">{{ badge() }}</span> }
    </button>
    @if (open()) {
      <div class="panel" id="bell-panel" role="region" [attr.aria-label]="label()" data-testid="bell-panel">
        @if (notifications()) {
          <section aria-labelledby="bell-notifs" data-testid="bell-notifications">
            <header class="sec-head">
              <strong id="bell-notifs">Notificaciones</strong>@if (facade.unreadCount() > 0) { <span class="n">{{ facade.unreadCount() }}</span> }
              <button type="button" class="mark" data-testid="mark-all" [disabled]="facade.unreadCount() === 0" (click)="markAll()">Marcar todas como leídas</button>
            </header>
            <div class="scroll" aria-live="polite">
              @if (facade.list.status() === 'error') {
                <p class="state err" role="alert" data-testid="notifs-error">{{ facade.list.error()?.message }} <button type="button" class="retry" (click)="facade.loadList()">Reintentar</button></p>
              } @else if (facade.list.data(); as page) {
                @if (page.items.length === 0) {
                  <p class="state" data-testid="notifs-empty">No tienes notificaciones</p>
                } @else {
                  <ul>
                    @for (item of page.items; track item.id) {
                      <li>
                        <button type="button" class="notif" [class.read]="item.read" data-testid="notification" (click)="openNotification(item)">
                          <span class="sev" [class]="item.severity" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icons[item.severity]" /></svg></span>
                          <span class="txt">
                            <strong>@if (!item.read) { <i class="dot" data-testid="unread-dot" aria-label="Sin leer"></i> }{{ item.title }}</strong>
                            <span>{{ item.description }}</span>
                            <span class="when">{{ time(item.createdAt) }}</span>
                          </span>
                        </button>
                      </li>
                    }
                  </ul>
                }
              } @else {
                <p class="state" role="status">Cargando…</p>
              }
            </div>
          </section>
        }
        <section aria-labelledby="bell-actions">
        <header><strong id="bell-actions">Acciones pendientes</strong>@if (pending() > 0) { <span class="n">{{ pending() }}</span> }</header>
        @if (alerts().length === 0) {
          <p class="all-clear" data-testid="bell-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6" /></svg>Todo al día. No hay acciones pendientes.</p>
        } @else {
          <ul>
            @for (item of alerts(); track item.label) {
              <li>
                <a [routerLink]="item.path" [queryParams]="item.query" (click)="open.set(false)">
                  <span class="txt"><strong>{{ item.label }}</strong><span>{{ item.hint }}</span></span>
                  <span class="num">{{ item.count }}</span>
                </a>
              </li>
            }
          </ul>
        }
        </section>
      </div>
    }
  `,
})
export class ActionsBellComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly alerts = input.required<readonly BellAlert[]>();
  readonly pending = input(0);
  /** Muestra las notificaciones de la empresa (espacio de empresa); la consola de plataforma no las tiene. */
  readonly notifications = input(false);
  protected readonly facade = inject(NotificationsFacade);
  private readonly router = inject(Router);
  protected readonly open = signal(false);
  protected readonly label = computed(() => (this.notifications() ? 'Notificaciones y acciones pendientes' : 'Acciones pendientes'));
  /** Lo que muestra la insignia: acciones pendientes más notificaciones sin leer. */
  protected readonly badge = computed(() => this.pending() + (this.notifications() ? this.facade.unreadCount() : 0));
  protected readonly icons = {
    INFO: 'M12 11v5M12 8v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    WARNING: 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
    SUCCESS: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM8 12.5l2.7 2.7L16 9.5',
  } as const;
  protected readonly time = relativeTime;

  constructor() {
    this.router.events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));
  }

  protected toggle(): void {
    this.open.set(!this.open());

    if (this.open() && this.notifications()) {
      this.facade.loadList();
      this.facade.loadUnread();
    }
  }

  protected markAll(): void {
    this.facade.markAllRead().subscribe({ error: () => this.facade.loadList() });
  }

  /** Marca como leída y navega al enlace (solo rutas internas); si marcarla falla igual se navega, la lectura se reintenta al reabrir. */
  protected openNotification(item: NotificationItem): void {
    const target = internalLink(item.deepLink);
    const go = (): void => {
      this.open.set(false);

      if (target) void this.router.navigate([target.path], { queryParams: target.query });
    };

    this.facade.markRead(item).subscribe({ next: go, error: go });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
