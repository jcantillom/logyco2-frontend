import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { NavigationEnd, Params, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { OrganizationContext } from '../../core/org/organization-context';
import { NotificationItem, NotificationKind } from '../../domain/models/notifications';
import { NotificationsFacade } from '../../features/notifications/notifications.facade';
import { relativeTime } from '../../features/notifications/relative-time';

export interface BellAlert {
  readonly label: string;
  readonly hint: string;
  readonly count: number;
  readonly path: string;
  readonly query?: Params;
}

/** Trazo del ícono de vehículo de un aviso (viewBox 24, sin relleno). */
const VEHICLE_ICON = 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7.5 18.5a1 1 0 1 0 0 .01M17.5 18.5a1 1 0 1 0 0 .01';

/** Trazo del ícono de un aviso de posibles duplicados: dos viajes superpuestos (viewBox 24, sin relleno). */
const DUPLICATES_ICON = 'M8 8h11v11H8zM5 16V5h11';

/** Trazo del ícono de un aviso de viajes compartidos: dos flechas en sentidos opuestos (viewBox 24, sin relleno). */
const SHARED_ICON = 'M4 8h14l-3-3M20 16H6l3 3';

/** Ruta de la bandeja de Calidad de datos, adonde lleva un aviso de posibles duplicados. */
export const QUALITY_PATH = '/calidad';

/** Parámetro y valor con los que un aviso de viajes compartidos abre la pestaña «Operaciones compartidas» de Calidad de datos. */
export const QUALITY_TAB_PARAM = 'tab';
export const SHARED_OPERATIONS_TAB = 'compartidas';

/** Ruta y parámetro con los que un aviso de vehículos abre la revisión de su carga. */
export const IMPORT_REVIEW_PATH = '/cargas';
export const IMPORT_QUERY_PARAM = 'import';

/** Avisos visibles a la vez: el panel no tiene scroll interno, el resto se resume en una línea. */
export const MAX_VISIBLE_NOTICES = 5;

type BellTab = 'notices' | 'pending';

/**
 * Campana de la barra superior. Por defecto es la de «Acciones pendientes»: solo lista lo que requiere atención y lleva al lugar
 * donde se resuelve. Con `withNotifications` también reúne los avisos de vehículos de la empresa en un panel de dos pestañas.
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
      .panel .all-clear { display: flex; align-items: center; gap: 10px; margin: 0; padding: 18px 16px; font-size: 0.84rem; color: var(--c-mu); }
      .bell .count.acc { background: var(--c-accent); color: var(--c-sf); }
      .tab:focus-visible, .mark:focus-visible, .retry:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 1px; }
      .panel.wide { width: min(380px, 92vw); }
      .tabs { display: flex; gap: 4px; padding: 6px 8px 0; border-bottom: 1px solid var(--c-bd); }
      .tab { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border: 0; border-bottom: 3px solid transparent; background: none; font: inherit; font-size: 0.84rem; font-weight: 700; color: var(--c-mu); cursor: pointer; border-radius: 8px 8px 0 0; }
      .tab:hover { background: var(--c-s2); }
      .tab[aria-selected='true'] { color: var(--c-accent); border-bottom-color: var(--c-accent); }
      .tab .n { background: var(--c-primary-100); color: var(--c-accent); }
      .tools { display: flex; justify-content: flex-end; padding: 6px 8px 0; }
      .mark { border: 0; background: none; font: inherit; font-size: 0.8rem; font-weight: 700; color: var(--c-accent); cursor: pointer; min-height: 32px; padding: 4px 8px; border-radius: 8px; }
      .mark:hover:not(:disabled) { background: var(--c-ok-soft); }
      .mark:disabled { color: var(--c-mu); cursor: default; }
      .notif { all: unset; box-sizing: border-box; display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 10px; border-radius: 10px; cursor: pointer; }
      .notif:hover { background: var(--c-s2); }
      .notif:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 1px; }
      .ico { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-accent); }
      .ico svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .notif .txt strong { display: flex; align-items: center; gap: 6px; }
      .notif .txt span { font-size: 0.78rem; color: var(--c-text2); line-height: 1.35; }
      .notif .txt .when { color: var(--c-mu); font-size: 0.7rem; }
      .dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--c-primary); }
      .notif.read strong { font-weight: 600; color: var(--c-text2); }
      .state { display: flex; align-items: center; gap: 10px; margin: 0; padding: 18px 16px; font-size: 0.84rem; color: var(--c-mu); }
      .state.err { color: var(--c-danger); }
      .state.older { padding: 4px 16px 12px; font-size: 0.74rem; }
      .retry { border: 0; background: none; font: inherit; font-weight: 700; color: var(--c-accent); cursor: pointer; text-decoration: underline; padding: 0; }
      @media (prefers-reduced-motion: reduce) { .bell { transition: none; } }
      .panel .all-clear svg { width: 22px; height: 22px; flex: none; fill: var(--c-ok-soft); stroke: var(--c-primary); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    `,
  ],
  template: `
    @if (withNotifications()) {
      <button #trigger type="button" class="bell" aria-haspopup="true" [attr.aria-expanded]="open()" aria-controls="bell-panel" [attr.aria-label]="label()" data-testid="bell" (click)="toggle()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" /></svg>
        @if (total() > 0) { <span class="count acc" data-testid="bell-count" aria-hidden="true">{{ total() > 99 ? '99+' : total() }}</span> }
      </button>
      @if (open()) {
        <div class="panel wide" id="bell-panel" role="region" aria-label="Notificaciones" data-testid="bell-panel">
          <div class="tabs" role="tablist" aria-label="Notificaciones">
            <button type="button" role="tab" class="tab" id="bell-tab-notices" aria-controls="bell-tabpanel" data-testid="tab-notices" [attr.aria-selected]="tab() === 'notices'" [attr.tabindex]="tab() === 'notices' ? 0 : -1" (click)="tab.set('notices')" (keydown)="onTabKey($event)">
              Avisos @if (facade.unreadCount() > 0) { <span class="n" data-testid="tab-notices-count">{{ facade.unreadCount() }}</span> }
            </button>
            <button type="button" role="tab" class="tab" id="bell-tab-pending" aria-controls="bell-tabpanel" data-testid="tab-pending" [attr.aria-selected]="tab() === 'pending'" [attr.tabindex]="tab() === 'pending' ? 0 : -1" (click)="tab.set('pending')" (keydown)="onTabKey($event)">
              Pendientes @if (pending() > 0) { <span class="n" data-testid="tab-pending-count">{{ pending() }}</span> }
            </button>
          </div>
          <div id="bell-tabpanel" role="tabpanel" [attr.aria-labelledby]="'bell-tab-' + tab()">
            @if (tab() === 'notices') {
              <div class="tools"><button type="button" class="mark" data-testid="mark-all" [disabled]="facade.unreadCount() === 0" (click)="markAll()">Marcar todas como leídas</button></div>
              <div aria-live="polite">
                @if (facade.list.status() === 'error') {
                  <p class="state err" role="alert" data-testid="notifications-error">{{ facade.list.error()?.message }} <button type="button" class="retry" (click)="facade.loadList()">Reintentar</button></p>
                } @else if (facade.list.data(); as page) {
                  @if (page.items.length === 0) {
                    <p class="state" data-testid="notifications-empty">No tienes avisos.</p>
                  } @else {
                    <ul>
                      @for (item of page.items.slice(0, maxVisible); track item.id) {
                        <li>
                          <button type="button" class="notif" [class.read]="item.readAt !== null" data-testid="notification" (click)="openNotification(item)">
                            <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="iconFor(item.kind)" /></svg></span>
                            <span class="txt">
                              <strong>@if (item.readAt === null) { <i class="dot" data-testid="unread-dot" role="img" aria-label="Sin leer"></i> }{{ item.title }}</strong>
                              <span>{{ item.body }}</span>
                              <span class="when">{{ time(item.createdAt) }}</span>
                            </span>
                          </button>
                        </li>
                      }
                    </ul>
                    @if (page.total > maxVisible) {
                      <p class="state older" data-testid="notifications-older">Hay {{ page.total - maxVisible }} {{ page.total - maxVisible === 1 ? 'aviso más antiguo' : 'avisos más antiguos' }}</p>
                    }
                  }
                } @else {
                  <p class="state" role="status" aria-busy="true" data-testid="notifications-loading">Cargando…</p>
                }
              </div>
            } @else {
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
            }
          </div>
        </div>
      }
    } @else {
      <button type="button" class="bell" aria-haspopup="true" [attr.aria-expanded]="open()" aria-controls="bell-panel" [attr.aria-label]="pending() ? 'Acciones pendientes: ' + pending() : 'Sin acciones pendientes'" data-testid="bell" (click)="open.set(!open())">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" /></svg>
        @if (pending() > 0) { <span class="count">{{ pending() }}</span> }
      </button>
      @if (open()) {
        <div class="panel" id="bell-panel" role="region" aria-label="Acciones pendientes" data-testid="bell-panel">
          <header><strong>Acciones pendientes</strong>@if (pending() > 0) { <span class="n">{{ pending() }}</span> }</header>
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
        </div>
      }
    }
  `,
})
export class ActionsBellComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly context = inject(OrganizationContext);
  /** Los avisos solo se consultan cuando `withNotifications` está activo; sin él esta campana no hace peticiones. */
  protected readonly facade = inject(NotificationsFacade);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  readonly alerts = input.required<readonly BellAlert[]>();
  readonly pending = input(0);
  readonly withNotifications = input(false);
  protected readonly open = signal(false);
  protected readonly tab = signal<BellTab>('notices');
  protected readonly iconFor = (kind: NotificationKind): string => (kind === 'POSSIBLE_DUPLICATES' ? DUPLICATES_ICON : kind === 'SHARED_OPERATIONS' ? SHARED_ICON : VEHICLE_ICON);
  protected readonly maxVisible = MAX_VISIBLE_NOTICES;
  protected readonly time = relativeTime;

  protected readonly total = computed(() => this.pending() + this.facade.unreadCount());
  protected readonly label = computed(() => {
    const unread = this.facade.unreadCount();
    const pending = this.pending();
    const parts = [unread > 0 ? `${unread} ${unread === 1 ? 'aviso sin leer' : 'avisos sin leer'}` : '', pending > 0 ? `${pending} ${pending === 1 ? 'acción pendiente' : 'acciones pendientes'}` : ''].filter(Boolean);

    return parts.length ? `Notificaciones: ${parts.join(', ')}` : 'Sin notificaciones';
  });

  constructor() {
    effect(() => {
      this.context.activeOrganizationId();

      if (this.withNotifications()) {
        untracked(() => {
          this.open.set(false);
          this.facade.start();
        });
      } else {
        untracked(() => this.facade.stop());
      }
    });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.open.set(false);

        if (this.withNotifications()) this.facade.refresh();
      });
    inject(DestroyRef).onDestroy(() => {
      if (this.withNotifications()) this.facade.stop();
    });
  }

  protected toggle(): void {
    this.open.set(!this.open());

    if (!this.open()) return;

    this.tab.set(this.facade.unreadCount() > 0 || this.pending() === 0 ? 'notices' : 'pending');
    this.facade.loadList();
    this.facade.loadUnread();
  }

  protected onTabKey(event: KeyboardEvent): void {
    const order: readonly BellTab[] = ['notices', 'pending'];
    const current = order.indexOf(this.tab());
    const next = { ArrowRight: (current + 1) % order.length, ArrowLeft: (current + order.length - 1) % order.length, Home: 0, End: order.length - 1 }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    this.tab.set(order[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#bell-tab-${order[next]}`)?.focus();
  }

  protected markAll(): void {
    this.facade.markAllRead().subscribe({ error: () => this.facade.loadList() });
  }

  /**
   * Marca como leído y abre el lugar del aviso: la revisión de su carga (vehículos), la bandeja de Calidad de datos (posibles duplicados) o su pestaña «Operaciones compartidas» (viajes compartidos).
   * Si marcarlo falla igual se navega, la lectura se reintenta al reabrir.
   */
  protected openNotification(item: NotificationItem): void {
    const go = (): void => {
      this.open.set(false);

      if (item.kind === 'POSSIBLE_DUPLICATES') void this.router.navigate([QUALITY_PATH]);
      else if (item.kind === 'SHARED_OPERATIONS') void this.router.navigate([QUALITY_PATH], { queryParams: { [QUALITY_TAB_PARAM]: SHARED_OPERATIONS_TAB } });
      else void this.router.navigate([IMPORT_REVIEW_PATH], { queryParams: { [IMPORT_QUERY_PARAM]: item.payload.importId } });
    };

    this.facade.markRead(item).subscribe({ next: go, error: go });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.open()) return;

    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
