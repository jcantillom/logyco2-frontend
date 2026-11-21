import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { BreadcrumbsComponent } from '../../shared/layouts/breadcrumbs.component';
import { ActionsBellComponent } from '../../shared/layouts/actions-bell.component';
import { UserMenuComponent } from '../../shared/layouts/user-menu.component';
import { SIDEBAR_STYLES } from '../../shared/layouts/sidebar.styles';
import { LogoComponent } from '../../shared/ui/logo.component';
import { PLATFORM_NAV, PlatformNavGroup } from './platform-nav';
import { PlatformDashboardFacade, PlatformOrganizationsFacade, PlatformUsersFacade } from './platform.facades';

/**
 * Shell de la consola global. Indica de forma permanente que se trabaja en el
 * contexto de PLATAFORMA (no en una empresa) y rotula cada sección según
 * si usa API real, API parcial o aún no existe en el backend.
 */
@Component({
  selector: 'app-platform-shell',
  imports: [ActionsBellComponent, RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, BreadcrumbsComponent, UserMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    SIDEBAR_STYLES,
    `
      .main-col { min-width: 0; display: flex; flex-direction: column; background: linear-gradient(180deg, var(--c-m1), var(--c-m2)); }
      .topbar { position: sticky; top: 0; z-index: 40; min-height: var(--header-h); display: flex; align-items: center; gap: 12px; padding: 0 24px; background: var(--c-top); backdrop-filter: saturate(160%) blur(10px); border-bottom: 1px solid var(--c-bd); box-shadow: 0 6px 20px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .spacer { flex: 1; }
      .role-tag { align-self: flex-end; display: inline-flex; align-items: center; gap: 4px; margin: -4px 8px 12px 0; padding: 2px 8px; border: 1px solid var(--sb-line); border-radius: 999px; color: var(--sb-accent); font-size: 0.72rem; font-weight: 700; }
      .role-tag svg { width: 12px; height: 12px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .collapsed .role-tag { align-self: center; margin-right: 0; padding: 4px; }
      .burger, .header-logo { display: none; }
      main { padding: 22px 28px 32px; display: flex; flex-direction: column; gap: 0; max-width: 1600px; width: 100%; margin: 0 auto; outline: none; }
      @media (max-width: 900px) {
        .burger, .header-logo { display: inline-flex; }
        .topbar { padding: 0 14px; gap: 8px; flex-wrap: wrap; }
        .crumbs { display: none; }
        main { padding: 16px 14px; }
      }
    `,
  ],
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido principal</a>
    <div class="shell platform-console" [class.collapsed]="collapsed()" [class.mobile-open]="mobileOpen()">
      <aside class="sidebar" aria-label="Barra lateral de la consola de plataforma">
        <a class="brand" routerLink="/plataforma" aria-label="LoGyCO₂, consola de plataforma">
          @if (collapsed()) { <app-logo variant="mark" theme="dark" [size]="40" motion="hover" /> }
          @else { <app-logo variant="compact" theme="dark" [size]="40" motion="hover" /> }
        </a>
        <div class="role-tag" data-testid="role-tag" [attr.title]="collapsed() ? 'Superadmin' : null"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 21h14" /></svg><span class="label">Superadmin</span></div>
        <nav aria-label="Navegación de la consola">
          @for (group of groups; track group.title; let groupIndex = $index) {
            <div class="group" [class.leafy]="group.icon && !group.parent" [class.parent]="group.parent" [class.pinned]="group.pinned" [class.has-active]="group.parent && containsRoute(group)">
              @if (group.parent) {
                <button type="button" class="parent-toggle" [attr.aria-expanded]="isOpen(group)" [attr.aria-controls]="'platform-group-' + groupIndex" [attr.title]="collapsed() ? group.title : null" (click)="toggle(group.title)">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="group.icon" /></svg>
                  <span class="label">{{ group.title }}</span>
                  <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
                </button>
              } @else if (group.collapsible) {
                <button type="button" class="group-toggle" [attr.aria-expanded]="isOpen(group)" [attr.aria-controls]="'platform-group-' + groupIndex" (click)="toggle(group.title)">
                  @if (group.icon) { <svg class="leaf" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="group.icon" /></svg> }
                  {{ group.title }}
                  <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
                </button>
              } @else {
                <h2>{{ group.title }}</h2>
              }
              @if (isOpen(group)) {
                <ul [id]="'platform-group-' + groupIndex" [class.sub]="group.parent">
                  @for (item of group.items; track item.path) {
                    <li>
                      <a class="nav-link" [class.soon-item]="item.soon" [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!item.exact }" ariaCurrentWhenActive="page" [attr.aria-label]="item.label + (item.soon ? ' · Próximamente' : '')" [attr.title]="collapsed() ? item.label : null">
                        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="item.icon" /></svg>
                        <span class="label">{{ item.label }}</span>
                        @if (item.soon) { <span class="pill">Próximamente</span> }
                      </a>
                    </li>
                  }
                </ul>
              }
            </div>
          }
        </nav>
        <div class="side-foot">
          <button type="button" class="collapse-btn" [attr.aria-label]="collapsed() ? 'Expandir barra lateral' : 'Contraer barra lateral'" [attr.aria-expanded]="!collapsed()" (click)="collapsed.set(!collapsed())"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6M20 4v16" /></svg><span class="label">Contraer menú</span></button>
          <span class="txt side-version">v1.0.0 (DEV)</span>
        </div>
      </aside>
      <div class="backdrop" (click)="mobileOpen.set(false)" aria-hidden="true"></div>

      <div class="main-col">
        <header class="topbar">
          <button type="button" class="btn btn-ghost btn-icon burger" aria-label="Abrir menú de navegación" [attr.aria-expanded]="mobileOpen()" (click)="mobileOpen.set(!mobileOpen())">☰</button>
          <a class="header-logo" routerLink="/plataforma" aria-label="LoGyCO₂, consola de plataforma"><app-logo variant="mark" theme="light" [size]="34" /></a>
          <span class="sr-only" data-testid="platform-context">Contexto global · Plataforma</span>
          @if (!isHome()) { <div class="crumbs"><app-breadcrumbs rootLabel="Plataforma" rootLink="/plataforma" /></div> }
          <span class="spacer"></span>
          @if (hasOrganizations()) { <a class="btn btn-secondary btn-sm" routerLink="/resumen" data-testid="to-organization">Ir al espacio de empresa</a> }
          <app-actions-bell [alerts]="alerts()" [pending]="pending()" />
          <app-user-menu [identity]="true" settingsLink="/plataforma/configuracion" />
        </header>
        <main id="main-content" tabindex="-1"><router-outlet /></main>
      </div>
    </div>
  `,
})
export class PlatformShellComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  protected readonly groups = PLATFORM_NAV;
  protected readonly collapsed = signal(false);
  private readonly root = inject(DOCUMENT).documentElement;
  protected readonly mobileOpen = signal(false);
  /** Grupos plegados con su chevron. Por defecto TODOS parten desplegados; la persona puede plegar cada uno cuando quiera. */
  private readonly folded = signal<ReadonlySet<string>>(new Set());
  private readonly url = signal(this.router.url);
  /** Grupo de la ruta anterior: el grupo solo se despliega solo al ENTRAR en él, así el usuario puede contraerlo estando dentro. */
  private lastGroup: string | null = null;
  protected readonly hasOrganizations = computed(() => (this.session.user()?.memberships.length ?? 0) > 0);
  private readonly dash = inject(PlatformDashboardFacade);
  /** Acciones que requieren al administrador (empresas sin administrador + membresías e invitaciones pendientes). */
  protected readonly pending = this.dash.pendingActions;
  /** La campana lista solo lo que requiere acción, desde la misma fuente que la tarjeta del Resumen. */
  protected readonly alerts = this.dash.actionsRequired;
  protected readonly isHome = computed(() => this.url() === '/plataforma' || this.url().startsWith('/plataforma/resumen'));

  constructor() {
    // Los diálogos se centran en el área de contenido (entre el borde del menú y el de la página); igual que en el shell de empresa.
    effect(() => this.root.style.setProperty('--dlg-left', this.collapsed() ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)'));
    inject(DestroyRef).onDestroy(() => this.root.style.removeProperty('--dlg-left'));
    if (this.dash.admin.status() === 'idle') this.dash.loadMetrics();
    // La campana y la tarjeta del Resumen cuentan lo mismo: la atención (invitaciones por vencer, empresas en espera…) se carga aquí.
    if (this.dash.attention.status() === 'idle') this.dash.loadAttention();
    // Las listas más visitadas se piden al entrar a la consola: el primer clic en Empresas o Usuarios ya las encuentra cargadas.
    inject(PlatformOrganizationsFacade).prefetch();
    inject(PlatformUsersFacade).prefetch();

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      this.mobileOpen.set(false);
      this.url.set(this.router.url);
      this.syncFolding();
    });
    this.syncFolding();
  }

  protected isOpen(group: PlatformNavGroup): boolean {
    if (this.collapsed() || !group.collapsible) return true;

    return !this.folded().has(group.title);
  }

  protected containsRoute(group: PlatformNavGroup): boolean {
    const url = this.url().split(/[?#]/)[0];

    return group.items.some((item) => (item.exact ? url === item.path : url === item.path || url.startsWith(`${item.path}/`)));
  }

  /** Al entrar en un grupo plegado lo despliega; si el usuario lo contrae estando dentro, se respeta hasta que salga y vuelva a entrar. */
  private syncFolding(): void {
    const current = this.groups.find((group) => group.collapsible && this.containsRoute(group))?.title ?? null;

    if (current !== null && current !== this.lastGroup) this.folded.update((set) => new Set([...set].filter((title) => title !== current)));

    this.lastGroup = current;
  }

  protected toggle(title: string): void {
    const wasCollapsed = this.collapsed();
    this.collapsed.set(false);
    this.folded.update((current) => {
      const next = new Set(current);

      if (!wasCollapsed && next.has(title)) next.delete(title);
      else next.add(title);

      return next;
    });
  }
}
