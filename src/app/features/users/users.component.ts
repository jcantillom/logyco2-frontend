import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AccessPolicy } from '../../core/auth/access-policy';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext, reloadOnContextChange } from '../../core/org/organization-context';
import { DEFAULT_TEAM_ROLE, ManagedMembership, ManagedUser, MembershipStatus, MembershipTargetStatus, TEAM_ROLES } from '../../domain/models/users';
import { INVITATION_LABELS, MEMBERSHIP_LABELS, roleLabel } from '../../shared/ui/labels';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { OnboardingStatus } from '../../domain/models/onboarding';
import { OnboardingFacade } from '../onboarding/onboarding.facade';
import { OnboardingStatusComponent } from '../onboarding/onboarding-status.component';
import { UsersFacade } from './users.facade';

type Tab = 'users' | 'roles' | 'invitations';

/** Trazos de los íconos (viewBox 24, sin relleno). */
const ICONS = {
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6',
  check: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM8 12.5l2.7 2.7L16 9.5',
  tick: 'M5 12.5l4.5 4.5L19 7',
  pending: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  userx: 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21a7 7 0 0 1 12-4.9M17 9l5 5M22 9l-5 5',
  info: 'M12 11v5M12 8v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  plus: 'M12 5v14M5 12h14',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  bars: 'M4 20v-8h4v8M10 20V5h4v15M16 20V9h4v11',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  dots: 'M12 5.5v.01M12 12v.01M12 18.5v.01',
} as const;

interface StatusView {
  readonly text: string;
  readonly tone: 'ok' | 'warn' | 'off' | 'bad';
  readonly icon: keyof typeof ICONS;
}

interface MembershipAction {
  readonly status: MembershipTargetStatus;
  readonly label: string;
  readonly danger: boolean;
}

/** Transiciones válidas del backend (`_TRANSITIONS`); el servidor las vuelve a validar. */
const ACTIONS: Readonly<Record<string, readonly MembershipAction[]>> = {
  PENDING: [
    { status: 'ACTIVE', label: 'Aprobar', danger: false },
    { status: 'REVOKED', label: 'Rechazar', danger: true },
  ],
  ACTIVE: [
    { status: 'SUSPENDED', label: 'Suspender', danger: true },
    { status: 'REVOKED', label: 'Revocar', danger: true },
  ],
  SUSPENDED: [
    { status: 'ACTIVE', label: 'Reactivar', danger: false },
    { status: 'REVOKED', label: 'Revocar', danger: true },
  ],
  REVOKED: [],
};

@Component({
  selector: 'app-users',
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, PageHeroComponent, PaginationComponent, ResourceStateComponent, StatusBadgeComponent, OnboardingStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      svg.i { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
      .tile { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 14px; padding: 16px 18px; min-height: 92px; border: 1px solid var(--c-bd); border-radius: 16px; background: var(--c-sf); box-shadow: 0 2px 10px rgb(81 83 74 / 6%); transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s; }
      .tile:hover { border-color: var(--c-primary); box-shadow: 0 10px 26px rgb(81 83 74 / 12%); transform: translateY(-2px); } .tile:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .ico { flex: none; display: grid; place-items: center; width: 50px; height: 50px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-primary); font-size: 24px; }
      .tile.warn .ico { background: var(--c-warn-soft); color: var(--c-warning); } .tile.bad .ico { background: var(--c-bad-soft); color: var(--c-danger); }
      .tile b { display: block; font-size: 1.65rem; font-weight: 800; line-height: 1.05; color: var(--c-head); }
      .tile strong { display: block; margin-top: 1px; font-size: 0.93rem; color: var(--c-head); } .tile small { display: block; margin-top: 2px; color: var(--c-mu); font-size: 0.76rem; }
      .tabs { margin-top: 4px; gap: 6px; } .tabs button { display: inline-flex; align-items: center; gap: 8px; padding: 11px 16px; font-size: 0.93rem; } .tabs button svg { font-size: 18px; }
      .tabs i { font-style: normal; background: var(--c-warn-soft); color: var(--c-warning); border-radius: 999px; padding: 0 7px; font-size: 0.74rem; font-weight: 800; }
      .panel { border: 1px solid var(--c-bd); border-radius: 16px; background: var(--c-sf); padding: 18px 22px 16px; box-shadow: 0 2px 10px rgb(81 83 74 / 5%); }
      .ph { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
      .ph .ico { width: 42px; height: 42px; font-size: 21px; } .ph h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.02em; color: var(--c-head); } .ph p { margin: 2px 0 0; color: var(--c-mu); font-size: 0.82rem; }
      .ph .grow { flex: 1 1 200px; min-width: 0; } .ph .tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-left: auto; }
      .search { position: relative; } .search svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 18px; color: var(--c-mu); pointer-events: none; }
      .search .input { padding-left: 40px; min-height: 38px; width: 270px; max-width: 100%; border-radius: 12px; }
      .btn-f { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--c-bd); background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
      .btn-f:hover, .btn-f[aria-expanded='true'] { border-color: var(--c-primary); background: var(--c-ok-soft); } .btn-f:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .invite { min-height: 38px; border-radius: 10px; padding: 0 16px; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 8px; }
      .filters { display: flex; gap: 12px; flex-wrap: wrap; margin: -4px 0 16px; } .filters select.input { min-height: 42px; width: auto; border-radius: 10px; }
      .tw { border: 1px solid var(--c-bd); border-radius: 14px; }
      .tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.87rem; }
      .tbl th { text-align: left; padding: 11px 16px; font-weight: 600; font-size: 0.82rem; color: var(--c-text2); background: var(--c-s2); white-space: nowrap; border-bottom: 1px solid var(--c-bd); }
      .tbl th:first-child { border-top-left-radius: 13px; } .tbl th:last-child { border-top-right-radius: 13px; }
      .tbl td { padding: 10px 16px; border-bottom: 1px solid var(--c-bd); vertical-align: middle; } .tbl tbody tr:last-child td { border-bottom: 0; } .tbl tbody tr:hover td { background: color-mix(in srgb, var(--c-s2) 60%, transparent); }
      .tbl .c { text-align: center; } .tbl .nw { white-space: nowrap; } .tbl td.r { position: relative; }
      .who { display: flex; align-items: center; gap: 14px; min-width: 0; } .who strong { display: block; color: var(--c-head); font-weight: 600; } .who small { color: var(--c-mu); font-size: 0.8rem; }
      .av { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-accent); font-weight: 700; font-size: 0.76rem; } .av.me { background: var(--c-primary); color: #fff; }
      .role, .st { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-weight: 600; font-size: 0.78rem; }
      .role.ORG_ADMIN { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: color-mix(in srgb, var(--c-primary-700) 75%, var(--c-head)); }
      .role.ORG_ANALYST { background: color-mix(in srgb, var(--c-secondary) 13%, var(--c-sf)); color: color-mix(in srgb, var(--c-secondary) 75%, var(--c-head)); }
      .role.ORG_VIEWER, .role.none { background: var(--c-s3); color: var(--c-text2); }
      .st { padding-inline: 8px; font-size: 0.84rem; } .st.ok { color: var(--c-success); } .st.warn { color: var(--c-warning); } .st.off { color: var(--c-mu); } .st.bad { color: var(--c-danger); } .st svg { font-size: 18px; }
      .kebab { all: unset; cursor: pointer; display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: var(--c-text2); font-size: 18px; } .kebab svg { stroke-width: 3; }
      .kebab:hover, .kebab[aria-expanded='true'] { background: var(--c-s3); } .kebab:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .menu { position: absolute; right: 50%; transform: translateX(50%); top: calc(100% - 10px); z-index: 20; min-width: 190px; padding: 6px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); box-shadow: 0 14px 34px rgb(81 83 74 / 18%); text-align: left; }
      .menu button { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 9px 12px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; color: var(--c-text); } .menu button:hover, .menu button:focus-visible { background: var(--c-s3); outline: none; } .menu button.danger { color: var(--c-danger); }
      .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--c-bd); color: var(--c-text2); font-size: 0.84rem; } .foot .pg { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .pn { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 34px; height: 34px; padding: 0 10px; border-radius: 10px; border: 1px solid transparent; font-size: 0.86rem; font-weight: 600; color: var(--c-text2); transition: background 0.12s, border-color 0.12s; }
      .pn:hover:not(:disabled):not([aria-current='page']) { background: var(--c-ok-soft); border-color: color-mix(in srgb, var(--c-primary) 30%, transparent); color: var(--c-accent); }
      .pn.wide { border-color: var(--c-bd); background: var(--c-sf); padding: 0 12px 0 10px; } .pn.wide:last-child { padding: 0 10px 0 12px; } .pn.wide svg { font-size: 16px; }
      .pn[aria-current='page'] { background: var(--c-primary); border-color: var(--c-primary); color: #fff; box-shadow: 0 4px 10px color-mix(in srgb, var(--c-primary) 35%, transparent); } .pn:disabled { opacity: 0.4; cursor: not-allowed; } .pn:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .gap { min-width: 22px; text-align: center; color: var(--c-mu); }
      /* Pantalla vertical o estrecha: cada fila de la tabla pasa a una tarjeta (sin scroll horizontal). */
      @media (max-width: 1250px) {
        .tw { border: 0; border-radius: 0; }
        .tbl thead { display: none; } .tbl, .tbl tbody { display: block; }
        .tbl tr { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; grid-template-areas: 'who who who act' 'mail mail mail act' 'role state seen seen'; gap: 4px 12px; align-items: center; padding: 12px 14px; margin-bottom: 10px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); }
        .tbl td, .tbl td.c, .tbl td.r { display: block; padding: 0; border: 0; text-align: left; background: none !important; }
        .tbl .k-who { grid-area: who; } .tbl .k-mail { grid-area: mail; color: var(--c-mu); font-size: 0.84rem; overflow-wrap: anywhere; } .tbl .k-role { grid-area: role; } .tbl .k-state { grid-area: state; } .tbl .k-seen { grid-area: seen; justify-self: end; color: var(--c-mu); font-size: 0.82rem; } .tbl .k-act { grid-area: act; align-self: start; text-align: right; }
        .tbl td[data-l]::before { content: attr(data-l) ': '; }
        .menu { right: 0; transform: none; top: 36px; }
        .tbl tbody tr:hover td { background: none; }
      }
      .roles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
      .rc { display: flex; align-items: center; gap: 14px; padding: 16px 20px; border: 1px solid var(--c-bd); border-radius: 16px; background: var(--c-sf); box-shadow: 0 2px 10px rgb(81 83 74 / 5%); }
      .rc .ico { width: 44px; height: 44px; font-size: 22px; background: color-mix(in srgb, var(--c-primary) 13%, var(--c-sf)); color: var(--c-primary); } .rc.blue .ico { background: color-mix(in srgb, var(--c-secondary) 13%, var(--c-sf)); color: var(--c-secondary); }
      .rc strong { display: block; font-size: 0.98rem; color: var(--c-head); } .rc small { display: block; margin-top: 3px; color: var(--c-text2); font-size: 0.8rem; line-height: 1.4; }
      @media (max-width: 1100px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .roles { grid-template-columns: 1fr; } }
      @media (max-width: 760px) { .tiles { grid-template-columns: 1fr; } .tw { overflow-x: auto; } }
    `,
  ],
  template: `
    <div class="page">
      <app-page-hero title="Usuarios y accesos" subtitle="Gestiona las personas de tu organización, sus roles y permisos en LoGyCO₂." />

      <div class="tiles">
        <button type="button" class="tile" data-testid="tile-total" (click)="clearFilters()">
          <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.users" /></svg></span>
          <div><b>{{ total() }}</b><strong>Usuarios totales</strong><small>Personas con acceso a la empresa</small></div>
        </button>
        <button type="button" class="tile" data-testid="tile-active" (click)="showStatus('ACTIVE')">
          <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.check" /></svg></span>
          <div><b>{{ facade.counts.data()?.active ?? '—' }}</b><strong>{{ facade.counts.data()?.active === 1 ? 'Usuario activo' : 'Usuarios activos' }}</strong><small>Pueden ingresar a la plataforma</small></div>
        </button>
        <button type="button" class="tile warn" data-testid="tile-invitations" (click)="tab.set('invitations')">
          <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.pending" /></svg></span>
          <div><b>{{ facade.counts.data()?.pendingInvitations ?? '—' }}</b><strong>{{ facade.counts.data()?.pendingInvitations === 1 ? 'Invitación pendiente' : 'Invitaciones pendientes' }}</strong><small>Por completar registro</small></div>
        </button>
        <button type="button" class="tile bad" data-testid="tile-inactive" (click)="showStatus('SUSPENDED')">
          <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.userx" /></svg></span>
          <div><b>{{ facade.counts.data()?.suspended ?? '—' }}</b><strong>{{ facade.counts.data()?.suspended === 1 ? 'Usuario inactivo' : 'Usuarios inactivos' }}</strong><small>Sin acceso actualmente</small></div>
        </button>
      </div>

      <div class="tabs" role="tablist" aria-label="Usuarios, roles e invitaciones">
        <button type="button" role="tab" id="tab-users" [attr.aria-selected]="tab() === 'users'" aria-controls="panel-users" (click)="tab.set('users')"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.users" /></svg>Usuarios</button>
        <button type="button" role="tab" id="tab-roles" [attr.aria-selected]="tab() === 'roles'" aria-controls="panel-roles" (click)="tab.set('roles')"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.shield" /></svg>Roles y permisos</button>
        <button type="button" role="tab" id="tab-inv" [attr.aria-selected]="tab() === 'invitations'" aria-controls="panel-inv" (click)="tab.set('invitations')"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.mail" /></svg>Invitaciones@if (facade.counts.data()?.pendingInvitations) { <i>{{ facade.counts.data()?.pendingInvitations }}</i> }</button>
      </div>

      @if (tab() === 'users') {
        <section id="panel-users" role="tabpanel" aria-labelledby="tab-users" class="panel">
          <div class="ph">
            <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.users" /></svg></span>
            <div class="grow"><h2>Usuarios de la empresa</h2><p>Personas que tienen acceso a LoGyCO₂ en esta organización.</p></div>
            <div class="tools">
              <label class="search"><span class="sr-only">Buscar por nombre o correo</span><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.search" /></svg><input class="input" type="search" placeholder="Buscar por nombre o correo" [formControl]="search" /></label>
              <button type="button" class="btn-f" [attr.aria-expanded]="filtersOpen()" (click)="filtersOpen.set(!filtersOpen())"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.filter" /></svg>Filtros</button>
              @if (canManage()) { <button type="button" class="btn btn-primary invite" data-testid="new-invitation" (click)="openCreate()"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.plus" /></svg>Invitar usuario</button> }
            </div>
          </div>
          @if (filtersOpen()) {
            <div class="filters">
              <select class="input" aria-label="Filtrar por rol" [value]="facade.filter().role ?? ''" (change)="setFilter({ role: $any($event.target).value || undefined })">
                <option value="">Todos los roles</option>
                @for (r of roleOptions; track r.code) { <option [value]="r.code">{{ r.label }}</option> }
              </select>
              <select class="input" aria-label="Filtrar por estado" [value]="facade.filter().membershipStatus ?? ''" (change)="setFilter({ membershipStatus: $any($event.target).value || undefined })">
                <option value="">Todos los estados</option>
                <option value="ACTIVE">Activo</option><option value="PENDING">Pendiente de aprobación</option><option value="SUSPENDED">Inactivo</option>
              </select>
            </div>
          }
          <app-resource-state
            [status]="facade.userList.status()" [error]="facade.userList.error()" [empty]="facade.userList.data()?.total === 0"
            emptyTitle="Sin usuarios" [emptyMessage]="hasFilter() ? 'Ningún usuario coincide con la búsqueda.' : 'No hay usuarios que puedas administrar.'" (retry)="facade.loadUsers()"
          >
            @if (facade.userList.data(); as page) {
              <div class="tw">
                <table class="tbl">
                  <caption class="sr-only">Usuarios de la empresa</caption>
                  <thead><tr><th scope="col">Usuario</th><th scope="col">Correo electrónico</th><th scope="col" class="c">Rol</th><th scope="col" class="c">Estado</th><th scope="col">Último acceso</th><th scope="col" class="c">Acciones</th></tr></thead>
                  <tbody>
                    @for (user of page.items; track user.id) {
                      @let m = primary(user);
                      @let st = statusOf(user, m);
                      <tr>
                        <td class="k-who"><div class="who"><span class="av" [class.me]="isSelf(user)" aria-hidden="true">{{ initials(user.fullName) }}</span><div><strong>{{ user.fullName }}</strong>@if (isSelf(user)) { <small>Tú</small> }</div></div></td>
                        <td class="k-mail">{{ user.email }}</td>
                        <td class="c k-role">@if (m && m.roles.length) { <span class="role" [class]="'role ' + m.roles[0]">{{ shortRoles(m.roles) }}</span> } @else { <span class="role none">Sin rol</span> }</td>
                        <td class="c k-state"><span class="st" [class]="'st ' + st.tone"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons[st.icon]" /></svg>{{ st.text }}</span></td>
                        <td class="nw k-seen" data-l="Último acceso">{{ user.lastLoginAt ? lastAccess(user.lastLoginAt) : 'Sin accesos registrados' }}</td>
                        <td class="r c k-act">
                          @if (canManage()) {
                            <button type="button" class="kebab" [attr.data-testid]="'menu-' + user.id" aria-haspopup="menu" [attr.aria-expanded]="menuFor() === user.id" [attr.aria-label]="'Acciones de ' + user.fullName" (click)="toggleMenu(user.id, $event)"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.dots" /></svg></button>
                            @if (menuFor() === user.id) {
                              <div class="menu" role="menu">
                                <button type="button" role="menuitem" [attr.data-testid]="'edit-' + user.id" (click)="openEdit(user)">Editar</button>
                                @if (m && !isSelf(user)) {
                                  @for (action of actionsFor(m); track action.status) {
                                    <button type="button" role="menuitem" [class.danger]="action.danger" (click)="changeStatus(user.fullName, m, action)">{{ action.label }}</button>
                                  }
                                  @if (m.status === 'REVOKED') { <button type="button" role="menuitem" class="danger" [attr.data-testid]="'remove-' + user.id" (click)="remove(user.fullName, m)">Eliminar</button> }
                                }
                              </div>
                            }
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <nav class="foot" aria-label="Paginación de usuarios">
                <span aria-live="polite">Mostrando {{ (page.page - 1) * page.pageSize + 1 }} – {{ (page.page - 1) * page.pageSize + page.items.length }} de {{ page.total }} {{ page.total === 1 ? 'usuario' : 'usuarios' }}</span>
                <span class="pg">
                  <button type="button" class="pn wide" [disabled]="!page.hasPrevious" (click)="facade.loadUsers(page.page - 1)"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Anterior</button>
                  @for (n of pageNumbers(page.page, page.totalPages); track $index) {
                    @if (n === null) { <span class="gap" aria-hidden="true">…</span> }
                    @else { <button type="button" class="pn" [attr.aria-current]="n === page.page ? 'page' : null" [attr.aria-label]="'Página ' + n" (click)="facade.loadUsers(n)">{{ n }}</button> }
                  }
                  <button type="button" class="pn wide" [disabled]="!page.hasNext" (click)="facade.loadUsers(page.page + 1)">Siguiente<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
                </span>
              </nav>
            }
          </app-resource-state>
        </section>
        <ng-container *ngTemplateOutlet="roleCards" />
      } @else if (tab() === 'roles') {
        <section id="panel-roles" role="tabpanel" aria-labelledby="tab-roles" class="panel">
          <div class="ph">
            <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.shield" /></svg></span>
            <div class="grow"><h2>Roles de la empresa</h2><p>Qué puede hacer cada persona según el rol que tiene asignado. Una empresa tiene un solo administrador.</p></div>
          </div>
          <ng-container *ngTemplateOutlet="roleCards" />
        </section>
      } @else {
        <section id="panel-inv" role="tabpanel" aria-labelledby="tab-inv" class="panel">
          <div class="ph">
            <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.mail" /></svg></span>
            <div class="grow"><h2>Invitaciones</h2><p>Personas que aún no completan su registro en LoGyCO₂.</p></div>
            <div class="tools">@if (canManage()) { <button type="button" class="btn btn-primary invite" (click)="openCreate()"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.plus" /></svg>Invitar usuario</button> }</div>
          </div>
          <app-resource-state
            [status]="facade.invitationList.status()" [error]="facade.invitationList.error()" [empty]="facade.invitationList.data()?.total === 0"
            emptyTitle="Sin invitaciones" emptyMessage="Aún no hay invitaciones registradas." (retry)="facade.loadInvitations()"
          >
            @if (facade.invitationList.data(); as page) {
              <div class="tw">
                <table class="tbl">
                  <caption class="sr-only">Invitaciones</caption>
                  <thead><tr><th scope="col">Invitado</th><th scope="col" class="c">Rol</th><th scope="col" class="c">Estado</th><th scope="col">Expira</th><th scope="col" class="c">Acciones</th></tr></thead>
                  <tbody>
                    @for (inv of page.items; track inv.id) {
                      <tr>
                        <td class="k-who"><div class="who"><span class="av" aria-hidden="true">{{ initials(inv.inviteeName ?? inv.email) }}</span><div><strong>{{ inv.inviteeName ?? '—' }}</strong><small>{{ inv.email }}</small></div></div></td>
                        <td class="c k-role"><span class="role" [class]="'role ' + inv.roleCode">{{ shortRoles([inv.roleCode]) }}</span></td>
                        <td class="c k-state"><app-status-badge [label]="invitationLabels[inv.status]" /></td>
                        <td class="nw k-seen" data-l="Expira">{{ inv.expiresAt | date: 'd MMM y' }}</td>
                        <td class="r c k-act">@if (canManage() && inv.status === 'PENDING') { <button type="button" class="btn btn-danger-soft btn-sm" (click)="revoke(inv.id, inv.email)">Revocar</button> }</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <app-pagination [page]="page" (pageChange)="facade.loadInvitations($event)" />
            }
          </app-resource-state>
        </section>
      }
    </div>

    <ng-template #roleCards>
      <div class="roles">
        <div class="rc"><span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.crown" /></svg></span><div><strong>Administrador</strong><small>Gestiona usuarios, datos de la empresa y configuración de la organización.</small></div></div>
        <div class="rc blue"><span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.bars" /></svg></span><div><strong>Analista</strong><small>Carga y valida información, consulta operaciones y analiza emisiones.</small></div></div>
        <div class="rc"><span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.eye" /></svg></span><div><strong>Consulta</strong><small>Acceso de solo lectura a la información y resultados de la empresa.</small></div></div>
      </div>
    </ng-template>

    <dialog #createDialog class="dialog" aria-labelledby="create-title">
      <form [formGroup]="form" (ngSubmit)="create()" novalidate>
        <div class="dialog-body">
          <h2 id="create-title">Incorporar usuario</h2>
          <p class="muted small">Se registra su acceso a la empresa y recibe un correo con un enlace de un solo uso. Si es nuevo, activa su cuenta y elige su contraseña; si ya tiene cuenta, usa la suya. Un administrador debe aprobar su membresía.</p>
          <p class="muted small" data-testid="invite-company">Se agregará a <strong>{{ context.activeMembership()?.organization?.name }}</strong>, la empresa que administras.</p>
          <div class="field">
            <label for="inv-email">Correo</label>
            <input id="inv-email" class="input" type="email" formControlName="email" />
            @if (form.controls.email.touched && form.controls.email.invalid) { <span class="field-error">Ingresa un correo válido.</span> }
          </div>
          <div class="field">
            <label for="inv-name">Nombre completo</label>
            <input id="inv-name" class="input" type="text" formControlName="inviteeName" maxlength="255" />
            @if (form.controls.inviteeName.touched && form.controls.inviteeName.invalid) { <span class="field-error">Ingresa el nombre de la persona.</span> }
          </div>
          <div class="field">
            <label for="inv-role">Rol</label>
            <select id="inv-role" class="input" formControlName="roleCode">
              @for (r of invitableRoles; track r.code) { <option [value]="r.code">{{ roleName(r.code) }}</option> }
            </select>
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" (click)="closeCreate()">Cancelar</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Enviando…' : 'Incorporar y enviar correo' }}</button>
        </div>
      </form>
    </dialog>

    <dialog #codeDialog class="dialog" aria-labelledby="code-title" (close)="onboarded.set(null)">
      <div class="dialog-body">
        <h2 id="code-title">Estado de la incorporación</h2>
        @if (onboarded(); as status) { <app-onboarding-status [status]="status" [busy]="resending()" (resend)="resend($event)" /> }
      </div>
      <div class="dialog-actions"><button type="button" class="btn btn-primary" (click)="closeCode()">Cerrar</button></div>
    </dialog>

    <dialog #editDialog class="dialog dialog-pro" aria-labelledby="edit-user-title">
      <form [formGroup]="editForm" (ngSubmit)="saveEdit()" novalidate>
        <header class="dp-head">
          <span class="dp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0" /></svg></span>
          <div><h2 id="edit-user-title">Editar usuario</h2><p>{{ editingSelf() ? 'Tu cuenta: puedes cambiar tu nombre; el correo no.' : 'Actualiza el nombre y el correo de contacto.' }}</p></div>
        </header>
        <div class="dialog-body">
          <div class="field">
            <label for="usr-name">Nombre completo</label>
            <input id="usr-name" class="input" type="text" formControlName="fullName" maxlength="255" />
            @if (editForm.controls.fullName.touched && editForm.controls.fullName.invalid) { <span class="field-error">Ingresa el nombre de la persona.</span> }
          </div>
          <div class="field">
            <label for="usr-email">Correo electrónico</label>
            <input id="usr-email" class="input" type="email" formControlName="email" />
            @if (editingSelf()) { <span class="muted small">Tu correo no se puede cambiar.</span> }
            @else if (editForm.controls.email.touched && editForm.controls.email.invalid) { <span class="field-error">Ingresa un correo válido.</span> }
            @else { <span class="muted small">Es el correo de contacto de la persona; no cambia con qué cuenta inicia sesión.</span> }
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" (click)="closeEdit()">Cancelar</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button>
        </div>
      </form>
    </dialog>
  `,
})
export class UsersComponent {
  protected readonly facade = inject(UsersFacade);
  private readonly access = inject(AccessPolicy);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionStore);
  protected readonly context = inject(OrganizationContext);

  private readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  private readonly editDialog = viewChild.required<ElementRef<HTMLDialogElement>>('editDialog');
  private readonly codeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('codeDialog');

  protected readonly tab = signal<Tab>('users');
  protected readonly saving = signal(false);
  protected readonly onboarded = signal<OnboardingStatus | null>(null);
  protected readonly resending = signal(false);
  private readonly onboarding = inject(OnboardingFacade);
  protected readonly membershipLabels = MEMBERSHIP_LABELS;
  protected readonly invitationLabels = INVITATION_LABELS;
  protected readonly invitableRoles = TEAM_ROLES;
  protected readonly icons = ICONS;
  protected readonly roleOptions = [{ code: 'ORG_ADMIN', label: roleLabel('ORG_ADMIN') }, ...TEAM_ROLES];
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly filtersOpen = signal(false);
  protected readonly menuFor = signal<string | null>(null);
  private editing: ManagedUser | null = null;
  protected readonly editingSelf = signal(false);
  protected readonly editForm = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
  });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
    inviteeName: ['', [Validators.required, Validators.maxLength(255)]],
    roleCode: [DEFAULT_TEAM_ROLE, Validators.required],
  });

  constructor() {
    reloadOnContextChange(() => {
      this.facade.loadUsers(1);
      this.facade.loadInvitations(1);
      this.facade.loadCounts();
    });
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.setFilter({ search: value.trim() || undefined }));
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  protected closeMenu(): void {
    this.menuFor.set(null);
  }

  protected toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.menuFor.set(this.menuFor() === id ? null : id);
  }

  /** Personas con acceso a la empresa: membresías activas, pendientes de aprobación o suspendidas. */
  protected total(): number | string {
    const c = this.facade.counts.data();

    return c ? c.active + c.pending + c.suspended : '—';
  }

  protected clearFilters(): void {
    this.tab.set('users');
    this.search.setValue('', { emitEvent: false });
    this.facade.setFilter({});
  }

  protected statusOf(user: ManagedUser, membership: ManagedMembership | null): StatusView {
    if (!membership || membership.status === 'REVOKED') return { text: 'Revocado', tone: 'bad', icon: 'info' };
    if (!user.isActive || membership.status === 'SUSPENDED') return { text: 'Inactivo', tone: 'off', icon: 'info' };
    if (membership.status === 'PENDING') return { text: 'Pendiente', tone: 'warn', icon: 'pending' };

    return { text: 'Activo', tone: 'ok', icon: 'tick' };
  }

  /** «Hoy, 10:24» · «Ayer, 16:40» · «15 ene 2026, 09:12». */
  protected lastAccess(iso: string): string {
    const date = new Date(iso);
    const hour = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    const day = (d: Date): string => d.toDateString();
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (day(date) === day(now)) return `Hoy, ${hour}`;
    if (day(date) === day(yesterday)) return `Ayer, ${hour}`;

    return `${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(date).replace(/\./g, '')}, ${hour}`;
  }

  /** Números de página con puntos suspensivos: 1 … 4 5 6 … 12. */
  protected pageNumbers(current: number, total: number): (number | null)[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const around = [current - 1, current, current + 1].filter((n) => n > 1 && n < total);
    const result: (number | null)[] = [1];

    if (around[0] > 2) result.push(null);
    result.push(...around);
    if (around[around.length - 1] < total - 1) result.push(null);

    return [...result, total];
  }

  protected hasFilter(): boolean {
    const f = this.facade.filter();

    return !!(f.search || f.role || f.membershipStatus);
  }

  protected setFilter(change: { search?: string; role?: string; membershipStatus?: MembershipStatus }): void {
    this.facade.setFilter({ ...this.facade.filter(), ...change });
  }

  protected showStatus(status: MembershipStatus): void {
    this.tab.set('users');
    this.setFilter({ membershipStatus: status });
  }

  /** Membresía que se muestra en la fila: la de la empresa activa, o la primera vigente. */
  protected primary(user: ManagedUser): ManagedMembership | null {
    const active = this.context.activeOrganizationId();

    return user.memberships.find((m) => m.organization.id === active) ?? user.memberships.find((m) => m.status !== 'REVOKED') ?? user.memberships[0] ?? null;
  }

  protected isSelf(user: ManagedUser): boolean {
    return user.id === this.session.user()?.id;
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  protected canManage(): boolean {
    return this.access.can('memberships:manage');
  }

  protected roles(codes: readonly string[]): string {
    return codes.map(roleLabel).join(', ') || 'Sin roles';
  }

  /** Etiqueta corta de las etiquetas de la tabla: «Administrador», «Analista», «Consulta». */
  protected shortRoles(codes: readonly string[]): string {
    const short: Record<string, string> = { ORG_ADMIN: 'Administrador', ORG_ANALYST: 'Analista', ORG_VIEWER: 'Consulta' };

    return codes.map((c) => short[c] ?? roleLabel(c)).join(', ') || 'Sin rol';
  }

  protected roleName(code: string): string {
    return roleLabel(code);
  }

  protected actionsFor(membership: ManagedMembership): readonly MembershipAction[] {
    return ACTIONS[membership.status] ?? [];
  }

  protected async changeStatus(userName: string, membership: ManagedMembership, action: MembershipAction): Promise<void> {
    this.menuFor.set(null);
    const accepted = await this.confirm.confirm({
      title: `${action.label} membresía`,
      message: `¿${action.label} la membresía de ${userName} en ${membership.organization.name}?`,
      confirmLabel: action.label,
      danger: action.danger,
    });
    if (!accepted) return;

    this.feedback.start('Actualizando membresía…');
    this.facade
      .changeMembershipStatus(membership.organization.id, membership.membershipId, action.status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.feedback.finish('Membresía actualizada'),
        error: (error: unknown) => { this.feedback.close(); this.toast.error(toAppError(error)); },
      });
  }

  protected async remove(userName: string, membership: ManagedMembership): Promise<void> {
    this.menuFor.set(null);
    const accepted = await this.confirm.confirm({
      title: 'Eliminar usuario',
      message: `¿Eliminar a ${userName} de ${membership.organization.name}? Dejará de aparecer en la lista; su cuenta se conserva y se le puede invitar de nuevo.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!accepted) return;

    this.feedback.start('Eliminando usuario…');
    this.facade
      .removeMembership(membership.organization.id, membership.membershipId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.feedback.finish('Usuario eliminado'),
        error: (error: unknown) => { this.feedback.close(); this.toast.error(toAppError(error)); },
      });
  }

  protected async revoke(invitationId: string, email: string): Promise<void> {
    const accepted = await this.confirm.confirm({
      title: 'Revocar invitación',
      message: `¿Revocar la invitación pendiente de ${email}? El código dejará de funcionar.`,
      confirmLabel: 'Revocar',
      danger: true,
    });
    if (!accepted) return;

    this.feedback.start('Revocando invitación…');
    this.facade
      .revokeInvitation(invitationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.feedback.finish('Invitación revocada'),
        error: (error: unknown) => { this.feedback.close(); this.toast.error(toAppError(error)); },
      });
  }

  protected openEdit(user: ManagedUser): void {
    this.menuFor.set(null);
    this.editing = user;
    this.editingSelf.set(this.isSelf(user));
    this.editForm.reset({ fullName: user.fullName, email: user.email });
    // El correo propio no se edita: el campo se muestra, pero bloqueado.
    if (this.isSelf(user)) this.editForm.controls.email.disable(); else this.editForm.controls.email.enable();
    this.editDialog().nativeElement.showModal();
  }

  protected closeEdit(): void {
    this.editDialog().nativeElement.close();
  }

  protected saveEdit(): void {
    this.editForm.markAllAsTouched();
    const user = this.editing;
    if (!user || this.editForm.invalid || this.saving()) return;

    const value = this.editForm.getRawValue();
    const changes = {
      ...(value.fullName.trim() !== user.fullName ? { fullName: value.fullName.trim() } : {}),
      ...(!this.isSelf(user) && value.email.trim().toLowerCase() !== user.email.toLowerCase() ? { email: value.email.trim().toLowerCase() } : {}),
    };
    if (Object.keys(changes).length === 0) { this.closeEdit(); return; }

    this.saving.set(true);
    this.feedback.start('Guardando cambios…');
    this.facade
      .updateUser(user.id, changes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.saving.set(false); this.feedback.finish('Usuario actualizado'); this.closeEdit(); },
        error: (error: unknown) => { this.saving.set(false); this.feedback.close(); this.toast.error(toAppError(error)); },
      });
  }

  protected openCreate(): void {
    this.form.reset({ email: '', inviteeName: '', roleCode: DEFAULT_TEAM_ROLE });
    this.createDialog().nativeElement.showModal();
  }

  protected closeCode(): void {
    this.codeDialog().nativeElement.close();
  }

  protected closeCreate(): void {
    this.createDialog().nativeElement.close();
  }

  protected create(): void {
    this.form.markAllAsTouched();
    const organizationId = this.context.activeOrganizationId();
    if (this.form.invalid || this.saving() || !organizationId) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.feedback.start('Incorporando usuario…');
    this.onboarding
      .onboardMember({ organizationId, email: value.email.trim().toLowerCase(), fullName: value.inviteeName.trim(), roleCode: value.roleCode })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.saving.set(false);
          this.feedback.finish('Usuario incorporado');
          this.closeCreate();
          this.facade.loadInvitations();
          this.onboarded.set(status); // estado REAL de cada paso; el correo solo figura «Enviado» si el backend lo confirmó
          this.codeDialog().nativeElement.showModal();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.feedback.close();
          this.toast.error(toAppError(error));
        },
      });
  }

  protected resend(invitationId: string): void {
    this.resending.set(true);
    this.feedback.start('Reenviando correo…');
    this.onboarding
      .resend(invitationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.resending.set(false);
          this.notifyResend(status);
          this.onboarded.set(status);
          this.facade.loadInvitations();
        },
        error: (error: unknown) => {
          this.resending.set(false);
          this.feedback.close();
          this.toast.error(toAppError(error));
        },
      });
  }

  /** El check solo aparece si el correo salió de verdad; un fallo de envío se avisa, no se disfraza de éxito. */
  private notifyResend(status: OnboardingStatus): void {
    if (status.deliveryStatus === 'SENT') {
      this.feedback.finish('Correo reenviado');
    } else {
      this.feedback.close();
      this.toast.warning('No se pudo enviar el correo. Puedes intentarlo de nuevo.');
    }
  }
}
