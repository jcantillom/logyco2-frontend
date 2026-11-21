import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AccessPolicy } from '../../core/auth/access-policy';
import { OrganizationContext, reloadOnContextChange } from '../../core/org/organization-context';
import { HomeFacade } from '../../features/dashboard/home.facade';
import { OrganizationLogoStore } from '../../features/organizations/logo.store';
import { ActionsBellComponent } from './actions-bell.component';
import { ToastService } from '../../core/notifications/toast.service';
import { roleLabel } from '../ui/labels';
import { SIDEBAR_STYLES } from './sidebar.styles';
import { LogoComponent } from '../ui/logo.component';
import { BreadcrumbsComponent } from './breadcrumbs.component';
import { ContextSwitchComponent } from './context-switch.component';
import { HELP_ITEM, NAV_GROUPS, NAV_ITEMS } from './nav-items';
import { UserMenuComponent } from './user-menu.component';

@Component({
  selector: 'app-shell',
  host: { '(document:keydown.escape)': 'companyOpen.set(false)', '(document:click)': 'closeCompanyOutside($event)' },
  imports: [ActionsBellComponent, RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, BreadcrumbsComponent, ContextSwitchComponent, UserMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    SIDEBAR_STYLES,
    `
      .company { position: relative; border: 1px solid var(--sb-line); border-radius: var(--radius-sm); padding: 8px; }
      .company-btn { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 12px; width: 100%; padding: 4px; border-radius: var(--radius-sm); cursor: default; }
      .company-btn.multi { cursor: pointer; }
      .company-btn.multi:hover { background: var(--sb-hover); }
      .company-ico { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: var(--radius-sm); background: var(--sb-hover); color: var(--sb-accent); }
      .company-ico.has-logo { background: var(--c-sf); padding: 4px; }
      .company-ico img { width: 100%; height: 100%; object-fit: contain; border-radius: 4px; }
      .company-ico svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .company .txt { min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
      .company .txt strong { color: var(--sb-active-fg); font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .company .txt span { color: var(--sb-fg-muted); font-size: 0.78rem; }
      .company .chev { margin-left: auto; width: 16px; height: 16px; flex: none; fill: none; stroke: var(--sb-fg-muted); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
      .company-btn[aria-expanded='true'] .chev { transform: rotate(180deg); }
      .company-list { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 60; margin: 0; padding: 8px; list-style: none; background: var(--sb-bg); border: 1px solid var(--sb-line); border-radius: var(--radius-sm); box-shadow: var(--shadow); }
      .company-list button { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 12px; border-radius: var(--radius-sm); color: var(--sb-fg); font-size: 0.85rem; cursor: pointer; }
      .company-list button:hover, .company-list button:focus-visible { background: var(--sb-hover); }
      .company-list button[aria-current='true'] { color: var(--sb-accent); font-weight: 700; }
      .main-col { min-width: 0; display: flex; flex-direction: column; background: linear-gradient(180deg, var(--c-m1), var(--c-m2)); }
      .topbar { position: sticky; top: 0; z-index: 40; min-height: var(--header-h); display: flex; align-items: center; gap: 12px; padding: 0 24px; background: var(--c-top); backdrop-filter: saturate(160%) blur(10px); border-bottom: 1px solid var(--c-bd); box-shadow: 0 6px 20px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .topbar .spacer { flex: 1; }
      .burger, .header-logo { display: none; }
      main { padding: 22px 28px 22px; display: flex; flex-direction: column; gap: 16px; max-width: 1280px; width: 100%; margin: 0 auto; outline: none; }
      main.wide { max-width: 1680px; }
      @media (max-width: 900px) {
        .burger { display: inline-flex; }
        .header-logo { display: inline-flex; margin-right: auto; }
        .topbar { padding: 0 14px; gap: 8px; flex-wrap: wrap; }
        main { padding: 16px 14px; }
        .crumbs { display: none; }
      }
    `,
  ],
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido principal</a>
    <div class="shell" [class.collapsed]="collapsed()" [class.mobile-open]="mobileOpen()">
      <aside class="sidebar" aria-label="Barra lateral">
        <a class="brand" routerLink="/resumen" aria-label="LoGyCO₂, ir al inicio">
          @if (collapsed()) {
            <app-logo variant="mark" theme="dark" [size]="40" motion="hover" />
          } @else {
            <app-logo variant="compact" theme="dark" [size]="40" motion="hover" />
          }
        </a>
        <div class="company">
          @let active = context.activeMembership();
          <button type="button" class="company-btn" [class.multi]="multiple()" [attr.aria-haspopup]="multiple() ? 'listbox' : null" [attr.aria-expanded]="multiple() ? companyOpen() : null" [attr.title]="collapsed() ? (active?.organization?.name ?? 'Sin empresa') : null" (click)="multiple() && companyOpen.set(!companyOpen())">
            <span class="company-ico" [class.has-logo]="logo.url()" aria-hidden="true">@if (logo.url(); as src) { <img [src]="src" alt="" /> } @else { <svg viewBox="0 0 24 24"><path d="M3 21h18M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M9 8h2M9 12h2M9 16h2" /></svg> }</span>
            <span class="txt"><strong>{{ active?.organization?.name ?? 'Sin empresa' }}</strong><span>{{ roleText() }}</span></span>
            @if (multiple()) { <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg> }
          </button>
          @if (companyOpen()) {
            <ul class="company-list" role="listbox" aria-label="Empresa activa">
              @for (m of context.memberships(); track m.membershipId) {
                <li><button type="button" role="option" [attr.aria-selected]="m.organization.id === context.activeOrganizationId()" [attr.aria-current]="m.organization.id === context.activeOrganizationId()" (click)="selectCompany(m.organization.id)">{{ m.organization.name }}</button></li>
              }
            </ul>
          }
        </div>
        <nav aria-label="Navegación principal">
          @for (group of groups(); track group.id) {
            <div class="group">
              <h2>{{ group.title }}</h2>
              <ul>
                @for (item of group.items; track item.path) {
                  <li>
                    <a class="nav-link" [class.soon-item]="item.soon" [routerLink]="item.path" routerLinkActive="active" ariaCurrentWhenActive="page" [attr.aria-label]="item.soon ? item.label + ' · Próximamente' : null" [attr.title]="collapsed() ? item.label : (item.soon ? 'Próximamente' : null)">
                      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="item.icon" /></svg>
                      <span class="label">{{ item.label }}</span>
                      @if (item.soon) { <span class="pill">Próximamente</span> }
                    </a>
                  </li>
                }
              </ul>
            </div>
          }
        </nav>
        <div class="side-foot">
          <a class="nav-link help" [routerLink]="help.path" routerLinkActive="active" ariaCurrentWhenActive="page" [attr.title]="collapsed() ? help.label : null">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="help.icon" /></svg>
            <span class="label">{{ help.label }}</span>
          </a>
          <button type="button" class="collapse-btn" [attr.aria-label]="collapsed() ? 'Expandir barra lateral' : 'Contraer barra lateral'" [attr.aria-expanded]="!collapsed()" (click)="collapsed.set(!collapsed())">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6M20 4v16" /></svg><span class="label">Contraer menú</span>
          </button>
          <span class="txt">Una plataforma de LOGYCA</span>
        </div>
      </aside>
      <div class="backdrop" (click)="mobileOpen.set(false)" aria-hidden="true"></div>

      <div class="main-col">
        <header class="topbar">
          <button type="button" class="btn btn-ghost btn-icon burger" aria-label="Abrir menú de navegación" [attr.aria-expanded]="mobileOpen()" (click)="mobileOpen.set(!mobileOpen())">☰</button>
          <a class="header-logo" routerLink="/resumen" aria-label="LoGyCO₂, ir al inicio"><app-logo variant="mark" theme="light" [size]="34" /></a>
          <div class="crumbs"><app-breadcrumbs rootLabel="Mi empresa" rootLink="/resumen" /></div>
          <span class="spacer"></span>
          <app-context-switch />
          <app-actions-bell [alerts]="home.actions()" [pending]="home.pending()" />
          <app-user-menu [identity]="true" />
        </header>
        <main id="main-content" tabindex="-1" [class.wide]="wide()">
          @if (context.activeAccessLost()) {
            <div class="alert alert-danger" role="alert" data-testid="access-lost">
              <span><strong>Acceso a la empresa activa no disponible.</strong> Fue revocada, suspendida o está inactiva. Selecciona otra empresa o contacta al administrador.</span>
            </div>
          }
          @if (!context.hasOrganizations()) {
            <div class="alert alert-warning" role="status" data-testid="no-orgs">
              <span><strong>No perteneces a ninguna empresa.</strong> Solicita una invitación para operar con datos de una empresa.</span>
            </div>
          }
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  private readonly access = inject(AccessPolicy);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly context = inject(OrganizationContext);
  protected readonly home = inject(HomeFacade);
  protected readonly logo = inject(OrganizationLogoStore);
  protected readonly help = HELP_ITEM;

  protected readonly collapsed = signal(false);
  private readonly root = inject(DOCUMENT).documentElement;
  protected readonly mobileOpen = signal(false);
  /** Vistas con tablas y tarjetas (`data: { wide: true }` en la ruta) usan más ancho del área de contenido. */
  protected readonly wide = signal(false);
  protected readonly companyOpen = signal(false);
  protected readonly multiple = computed(() => this.context.memberships().length > 1);
  protected readonly roleText = computed(() => {
    const roles = this.context.activeMembership()?.roles ?? [];

    return roles.map((role) => roleLabel(role.code)).join(' · ') || 'Sin rol';
  });

  private readonly visible = computed(() => NAV_ITEMS.filter((item) => this.access.canAny(item.requires)));
  /** Solo los grupos con alguna opción visible para la persona (permisos). */
  protected readonly groups = computed(() =>
    NAV_GROUPS.map((group) => ({ ...group, items: this.visible().filter((item) => item.group === group.id) })).filter((group) => group.items.length > 0),
  );

  constructor() {
    // Los diálogos se centran en el área de contenido: se les descuenta el ancho de la barra lateral (ver `--dlg-left` en styles.scss).
    effect(() => this.root.style.setProperty('--dlg-left', this.collapsed() ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)'));
    inject(DestroyRef).onDestroy(() => this.root.style.removeProperty('--dlg-left'));
    this.wide.set(this.deepestData('wide') === true);
    reloadOnContextChange(() => {
      this.home.load();
      this.logo.load();
    });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.mobileOpen.set(false);
        this.companyOpen.set(false);
        this.wide.set(this.deepestData('wide') === true);
      });
  }

  private deepestData(key: string): unknown {
    let route = this.router.routerState.snapshot.root;
    let value: unknown;
    while (route) {
      if (key in route.data) value = route.data[key];
      route = route.firstChild as typeof route;
    }

    return value;
  }

  protected closeCompanyOutside(event: Event): void {
    if (this.companyOpen() && !(event.target as Element | null)?.closest('.company')) this.companyOpen.set(false);
  }

  protected selectCompany(id: string): void {
    this.companyOpen.set(false);

    if (this.context.select(id)) this.toast.info(`Empresa activa: ${this.context.activeMembership()?.organization.name}`);
  }
}
