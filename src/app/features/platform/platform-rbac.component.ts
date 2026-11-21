import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccessPolicy } from '../../core/auth/access-policy';
import { PermissionImplementation, RbacRole, RoleAssignment } from '../../domain/models/platform-admin';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { MEMBERSHIP_LABELS } from '../../shared/ui/labels';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { PlatformRbacTabsComponent } from './platform-rbac-tabs.component';
import { PlatformRbacFacade } from './platform.facades';

/** Los cuatro perfiles funcionales, en lenguaje de negocio. El detalle de cada capacidad sale del catálogo real del backend. */
interface Profile {
  readonly title: string;
  readonly short: string;
  readonly goal: string;
  readonly icon: string;
  readonly restrictions: readonly string[];
  /** Dónde se consultan y administran las personas de este perfil: los módulos existentes, sin duplicarlos aquí. */
  readonly people: { readonly label: string; readonly path: string; readonly query?: Record<string, string> };
}

const PROFILES: Readonly<Record<string, Profile>> = {
  SUPER_ADMIN: {
    title: 'Superadministrador',
    short: 'Administra empresas, usuarios y accesos de toda la plataforma.',
    goal: 'Administra empresas, usuarios y accesos globales, y supervisa la plataforma LoGyCO₂.',
    icon: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 21h14',
    restrictions: ['No accede a los datos privados de las empresas: cargas, indicadores ni reportes.', 'Hay un máximo de superadministradores activos.'],
    people: { label: 'Ver superadministradores', path: '/plataforma/superadministradores' },
  },
  ORG_ADMIN: {
    title: 'Administrador de empresa',
    short: 'Administra los usuarios y accesos de su empresa.',
    goal: 'Administra a las personas de su empresa y supervisa su información de huella de carbono.',
    icon: 'M3 21h18M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M9 8h2M9 12h2M9 16h2',
    restrictions: ['Solo administra su propia empresa.', 'Solo puede conceder accesos con permisos que ya tiene.'],
    people: { label: 'Ver personas', path: '/plataforma/usuarios', query: { rol: 'ORG_ADMIN' } },
  },
  ORG_ANALYST: {
    title: 'Analista de huella de carbono',
    short: 'Trabaja con la información de emisiones de su empresa.',
    goal: 'Prepara y analiza la información de huella de carbono de su empresa.',
    icon: 'M4 20h16M7 20v-7M12 20V5M17 20v-10',
    restrictions: ['No administra usuarios ni accesos.', 'Solo ve la información de su empresa.'],
    people: { label: 'Ver personas', path: '/plataforma/usuarios', query: { rol: 'ORG_ANALYST' } },
  },
  ORG_VIEWER: {
    title: 'Usuario de consulta',
    short: 'Consulta indicadores y reportes de su empresa.',
    goal: 'Consulta los indicadores y reportes autorizados de su empresa.',
    icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    restrictions: ['No modifica información.', 'Solo ve la información de su empresa.'],
    people: { label: 'Ver personas', path: '/plataforma/usuarios', query: { rol: 'ORG_VIEWER' } },
  },
};
const PLATFORM_CODES = ['SUPER_ADMIN'] as const;
const COMPANY_CODES = ['ORG_ADMIN', 'ORG_ANALYST', 'ORG_VIEWER'] as const;

/** Capacidades por función. Cada una existe si el rol tiene el permiso; su estado sale de `implementation` del backend. */
interface Capability { readonly permission: string; readonly company: string; readonly platform: string }
interface Group { readonly title: string; readonly capabilities: readonly Capability[] }

const GROUPS: readonly Group[] = [
  { title: 'Empresas y accesos', capabilities: [
    { permission: 'organizations:read', company: 'Consultar los datos de su empresa', platform: 'Consultar los datos de todas las empresas' },
    { permission: 'organizations:manage', company: 'Editar los datos de su empresa', platform: 'Crear, editar, activar y eliminar empresas' },
    { permission: 'memberships:read', company: 'Ver quién tiene acceso a su empresa', platform: 'Ver los accesos de todas las empresas' },
    { permission: 'memberships:manage', company: 'Invitar y administrar a los usuarios de su empresa', platform: 'Invitar y administrar usuarios de cualquier empresa' },
    { permission: 'users:read', company: 'Consultar a las personas de la plataforma', platform: 'Consultar a todas las personas de la plataforma' },
  ] },
  { title: 'Catálogos de plataforma', capabilities: [
    { permission: 'catalogs:manage', company: 'Administrar los catálogos de la plataforma', platform: 'Administrar los catálogos de la plataforma' },
  ] },
  { title: 'Cargas operativas', capabilities: [
    { permission: 'imports:create', company: 'Cargar la información de las operaciones de transporte', platform: 'Cargar la información de las operaciones de transporte' },
  ] },
  { title: 'Huella de carbono', capabilities: [
    { permission: 'indicators:read', company: 'Consultar los indicadores de emisiones', platform: 'Consultar los indicadores de emisiones' },
  ] },
  { title: 'Reportes', capabilities: [
    { permission: 'reports:read', company: 'Consultar los reportes', platform: 'Consultar los reportes' },
    { permission: 'reports:download', company: 'Descargar los reportes', platform: 'Descargar los reportes' },
  ] },
  { title: 'Información sectorial', capabilities: [
    { permission: 'sector_reports:read', company: 'Consultar estadísticas sectoriales anonimizadas', platform: 'Consultar estadísticas sectoriales anonimizadas' },
  ] },
];

const AVAILABILITY: Readonly<Record<PermissionImplementation, { text: string; badge: string }>> = {
  active: { text: 'Disponible', badge: 'badge-success' },
  planned: { text: 'Aún no disponible', badge: 'badge-neutral' },
  complementary: { text: 'Complementaria', badge: 'badge-warning' },
};

interface ShownCapability { readonly text: string; readonly state: PermissionImplementation }
interface ShownGroup { readonly title: string; readonly state: PermissionImplementation; readonly items: readonly ShownCapability[] }

@Component({
  selector: 'app-platform-rbac',
  imports: [RouterLink, ResourceStateComponent, PlatformRbacTabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .head { display: flex; align-items: center; gap: 14px; }
      .head-ico { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 13px; background: linear-gradient(145deg, var(--c-primary-600), var(--c-primary)); color: #fff; box-shadow: 0 6px 14px color-mix(in srgb, var(--c-primary) 25%, transparent); flex: none; }
      .ico { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .head-ico .ico { width: 26px; height: 26px; }
      .layout { display: grid; gap: 20px; align-items: start; grid-template-columns: minmax(0, 1fr); }
      .layout.with-panel { grid-template-columns: minmax(0, 1fr) minmax(330px, 400px); }
      .roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
      /* Con el panel abierto las tarjetas forman una cuadrícula 2×2; en pantallas estrechas se apilan. */
      .with-panel .roles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .role-card { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 18px; border: 1px solid var(--c-bd); border-radius: 14px; background: linear-gradient(180deg, var(--c-sf), var(--c-s2)); box-shadow: 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
      .role-card:hover { transform: translateY(-2px); border-color: var(--c-primary); box-shadow: 0 10px 24px color-mix(in srgb, var(--c-gray) 8%, transparent); }
      .role-card[data-selected='true'] { border-color: var(--c-primary); box-shadow: 0 0 0 2px var(--c-primary), 0 10px 24px color-mix(in srgb, var(--c-primary) 14%, transparent); }
      .role-top { display: flex; align-items: center; gap: 12px; }
      .role-ico { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--c-s3); border: 1px solid var(--c-bd); color: var(--c-accent); flex: none; }
      .role-ico .ico { width: 24px; height: 24px; }
      .role-card h3 { margin: 0 0 4px; font-size: 1rem; line-height: 1.25; }
      .role-card p { margin: 0; flex: 1; font-size: 0.86rem; line-height: 1.5; color: var(--c-text2); }
      .role-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid var(--c-bd); font-size: 0.82rem; color: var(--c-mute2); }
      .role-meta .count { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: var(--c-s2); }
      .role-meta .count svg { width: 16px; height: 16px; color: var(--c-primary); }
      .role-meta b { color: var(--c-head); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
      .count-pill { display: inline-flex; align-items: center; gap: 6px; margin-left: 6px; padding: 3px 10px; border-radius: 999px; background: var(--c-s2); color: var(--c-head); font-size: 0.85rem; font-weight: 700; vertical-align: middle; }
      .count-pill svg { width: 15px; height: 15px; fill: none; stroke: var(--c-primary); stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
      .role-meta .btn { white-space: nowrap; }
      /* Toda la tarjeta es clicable (el botón se extiende sobre ella) sin perder el control accesible por teclado. */
      .role-meta .btn::after { content: ''; position: absolute; inset: 0; border-radius: 14px; }
      .role-card:has(.btn:focus-visible) { outline: 3px solid var(--c-secondary-soft); outline-offset: 2px; }
      .role-card { cursor: pointer; }
      .more svg { width: 14px; height: 14px; margin-left: 4px; vertical-align: -2px; }
      .panel { position: sticky; top: 16px; display: flex; flex-direction: column; max-height: max(420px, calc(100dvh - 300px)); min-height: 0; overflow: hidden; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-gray) 5%, transparent), 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .panel-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: grid; gap: 18px; align-content: start; padding: 0 22px 18px; scrollbar-width: thin; }
      .panel-scroll:focus-visible { outline: 3px solid var(--c-primary); outline-offset: -3px; }
      .panel-head { display: flex; align-items: flex-start; gap: 14px; padding: 20px 22px 14px; }
      .panel-head h2 { margin: 0 0 4px; font-size: 1.2rem; }
      .panel-head p { margin: 8px 0 0; font-size: 0.86rem; color: var(--c-text2); line-height: 1.5; }
      .close { margin-left: auto; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 10px; background: transparent; cursor: pointer; color: var(--c-head); flex: none; }
      .close:hover { background: var(--c-s2); }
      .close:focus-visible { outline: 3px solid var(--c-secondary-soft); }
      .close svg { width: 20px; height: 20px; }
      .panel h3 { margin: 0 0 10px; font-size: 0.98rem; }
      .group { border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .group + .group { margin-top: 8px; }
      .group-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; cursor: pointer; list-style: none; font-weight: 650; font-size: 0.86rem; color: var(--c-text2); }
      .group-head::-webkit-details-marker { display: none; }
      .group-head:focus-visible { outline: 3px solid var(--c-secondary-soft); outline-offset: -3px; border-radius: 12px; }
      .group-head .chev { width: 14px; height: 14px; margin-right: 8px; flex: none; transition: transform 0.15s; }
      .group[open] .group-head .chev { transform: rotate(90deg); }
      .group-head .title { display: flex; align-items: center; flex: 1; }
      .group ul { padding: 0 12px 12px 34px; }
      .group ul, .limits { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; font-size: 0.86rem; color: var(--c-text2); }
      .group li { display: flex; gap: 8px; }
      .group li::before { content: '✓'; color: var(--c-accent); font-weight: 800; }
      .restrictions { padding: 12px 14px; border-radius: 12px; background: var(--c-s2); }
      .restrictions h3 { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .restrictions h3 svg { width: 16px; height: 16px; color: var(--c-accent); }
      .limits li { display: flex; gap: 8px; font-size: 0.82rem; }
      .limits li::before { content: '•'; color: var(--c-mute2); font-weight: 800; }
      .note { margin: 0; font-size: 0.8rem; color: var(--c-mu); }
      .people-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .people-table th { padding: 8px 12px; text-align: left; font-size: 0.78rem; font-weight: 700; letter-spacing: 0; text-transform: none; color: var(--c-mute2); background: var(--c-s2); }
      .people-table td { padding: 10px 12px; border-top: 1px solid var(--c-bd); vertical-align: middle; }
      .people-table th.c, .people-table td.c { text-align: center; }
      .who { display: flex; align-items: center; gap: 10px; }
      .who-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .who-text > a { color: var(--c-head); font-weight: 700; text-decoration: none; overflow-wrap: break-word; }
      .who-text > a:hover { color: var(--c-accent); text-decoration: underline; }
      .who-text .sub { color: var(--c-mu); font-size: 0.76rem; overflow-wrap: anywhere; }
      .mini-avatar { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--c-ok-soft); border: 1px solid var(--c-primary-200); color: var(--c-accent); font-size: 0.68rem; font-weight: 700; flex: none; }
      .people-box { border: 1px solid var(--c-bd); border-radius: 12px; overflow: hidden; }
      .all-link { display: inline-block; margin-top: 8px; font-size: 0.82rem; font-weight: 600; }
      .panel-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 22px; border-top: 1px solid var(--c-bd); background: var(--c-s2); }
      .where { display: flex; align-items: center; gap: 14px; padding: 16px 20px; border-radius: 14px; background: var(--c-s2); color: var(--c-text2); }
      .where svg { width: 26px; height: 26px; color: var(--c-accent); flex: none; }
      .where strong { display: block; margin-bottom: 2px; color: var(--c-head); }
      .where p { margin: 0; font-size: 0.86rem; }
      @media (max-width: 1100px) { .layout.with-panel { grid-template-columns: minmax(0, 1fr); } .panel { position: static; max-height: none; overflow: visible; } .panel-scroll { overflow: visible; } }
      @media (max-width: 560px) { .with-panel .roles { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: 640px) { .head-ico { display: none; } .panel-head { padding: 16px 16px 10px; } .panel-scroll { padding: 0 16px 16px; } .panel-actions { padding: 12px 16px; } }
      @media (prefers-reduced-motion: reduce) { .role-card, .group-head .chev { transition: none; } }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="head">
          <span class="head-ico" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24"><path [attr.d]="shield" /></svg></span>
          <div>
            <h1>Roles y accesos</h1>
            <p>Perfiles de la plataforma y permisos asociados. Gestiona quién puede hacer qué en LoGyCO₂.</p>
          </div>
        </div>
      </header>
      <app-rbac-tabs />

      <app-resource-state [status]="facade.catalog.status()" [error]="facade.catalog.error()" (retry)="facade.load()">
        @if (facade.catalog.data()) {
          <div class="layout" [class.with-panel]="!!selected()">
            <div class="stack">
              <div class="roles" data-testid="role-cards">
                @for (r of profiles(); track r.code) {
                  <article class="role-card" [attr.data-selected]="selectedCode() === r.code" [attr.data-testid]="'role-' + r.code">
                    <div class="role-top">
                      <span class="role-ico" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24"><path [attr.d]="r.profile.icon" /></svg></span>
                      <div>
                        <h3>{{ r.profile.title }}</h3>
                        <span class="badge" [class.badge-warning]="r.scope === 'GLOBAL'" [class.badge-info]="r.scope === 'ORGANIZATION'">{{ r.scope === 'GLOBAL' ? 'Global' : 'Empresa' }}</span>
                      </div>
                    </div>
                    <p>{{ r.profile.short }}</p>
                    <div class="role-meta">
                      <span class="count" [attr.title]="r.people + (r.people === 1 ? ' persona' : ' personas')"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg><b data-testid="people-count">{{ r.people }}</b><span class="sr-only"> {{ r.people === 1 ? 'persona' : 'personas' }}</span></span>
                      <button type="button" class="btn btn-sm" [class.btn-primary]="selectedCode() === r.code" [class.btn-secondary]="selectedCode() !== r.code" [attr.aria-pressed]="selectedCode() === r.code" [attr.aria-label]="'Ver detalle de ' + r.profile.title" (click)="open(r.code)">Ver detalle<svg class="ico more" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg></button>
                    </div>
                  </article>
                }
              </div>
              <div class="where" data-testid="where-assigned">
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01" /></svg>
                <div>
                  <strong>¿Dónde se asignan los roles?</strong>
                  <p>Los accesos de cada empresa se gestionan desde <a routerLink="/plataforma/organizaciones">Empresas</a> y <a routerLink="/plataforma/usuarios">Usuarios</a>; los de plataforma, desde <a routerLink="/plataforma/superadministradores">Superadministradores</a>.</p>
                </div>
              </div>
            </div>

            @if (selected(); as role) {
              <aside #panel class="panel" aria-labelledby="panel-title" data-testid="role-panel">
                <div class="panel-head">
                  <div>
                    <h2 id="panel-title">{{ profileOf(role).title }}</h2>
                    <span class="badge" [class.badge-warning]="role.scope === 'GLOBAL'" [class.badge-info]="role.scope === 'ORGANIZATION'">{{ role.scope === 'GLOBAL' ? 'Global' : 'Empresa' }}</span>
                    <p>{{ profileOf(role).goal }}</p>
                  </div>
                  <button type="button" class="close" aria-label="Cerrar detalle" data-testid="close-panel" (click)="close()"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                </div>

                <div class="panel-scroll" tabindex="0" role="region" aria-label="Detalle del perfil (desplazable)">
                <section aria-labelledby="cap-title">
                  <h3 id="cap-title">Capacidades principales</h3>
                  @for (g of capabilities(role); track g.title) {
                    <details class="group" data-testid="capability-group" [open]="$first">
                      <summary class="group-head"><span class="title"><svg class="ico chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>{{ g.title }}</span><span class="badge" [class]="'badge ' + availability(g.state).badge">{{ availability(g.state).text }}</span></summary>
                      <ul>@for (c of g.items; track c.text) { <li>{{ c.text }}</li> }</ul>
                    </details>
                  }
                  @if (hasPlanned(role)) { <p class="note" style="margin-top: 10px">Las funciones «Aún no disponible» ya están previstas para este perfil y se habilitarán cuando existan sus módulos.</p> }
                </section>

                <section class="restrictions" aria-labelledby="lim-title">
                  <h3 id="lim-title"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01" /></svg>Restricciones</h3>
                  <ul class="limits">@for (l of profileOf(role).restrictions; track l) { <li>{{ l }}</li> }</ul>
                </section>

                <section aria-labelledby="ppl-title" data-testid="people-summary">
                  <h3 id="ppl-title">Personas con este rol<span class="count-pill" [attr.title]="role.people + (role.people === 1 ? ' persona' : ' personas')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg><span data-testid="panel-people">{{ role.people }}</span></span></h3>
                  <app-resource-state [status]="facade.assignments.status()" [error]="facade.assignments.error()" [empty]="facade.assignments.data()?.items?.length === 0" emptyTitle="Sin personas" emptyMessage="Nadie tiene este perfil por ahora." (retry)="facade.loadAssignments(role.code)">
                    @if (facade.assignments.data(); as page) {
                      <div class="people-box">
                        <table class="people-table" data-testid="people-table">
                          <caption class="sr-only">Primeras personas con el perfil</caption>
                          <thead><tr><th scope="col">Persona</th><th scope="col" class="c">Estado</th></tr></thead>
                          <tbody>
                            @for (a of page.items; track a.userId + (a.organization?.id ?? '')) {
                              <tr>
                                <td><span class="who"><span class="mini-avatar" aria-hidden="true">{{ initialsOf(a.userName) }}</span><span class="who-text"><a [routerLink]="personLink(role, a)">{{ a.userName }}</a><span class="sub">@if (role.scope === 'GLOBAL') { {{ a.email }} } @else if (a.organization) { <a [routerLink]="['/plataforma/organizaciones', a.organization.id]">{{ a.organization.name }}</a> }</span></span></span></td>
                                <td class="c"><span class="badge" [class.badge-success]="a.isActive && (!a.membershipStatus || a.membershipStatus === 'ACTIVE')" [class.badge-warning]="!a.isActive || (a.membershipStatus && a.membershipStatus !== 'ACTIVE')">{{ stateText(a) }}</span></td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      @if (page.total > page.items.length) { <a class="all-link" [routerLink]="profileOf(role).people.path" [queryParams]="profileOf(role).people.query ?? null" data-testid="see-all">Ver las {{ page.total }} personas</a> }
                    }
                  </app-resource-state>
                </section>
                </div>

                @if (canManage()) {
                  <div class="panel-actions">
                    <a class="btn btn-primary" [routerLink]="profileOf(role).people.path" [queryParams]="profileOf(role).people.query ?? null" data-testid="people-link">{{ profileOf(role).people.label }}</a>
                  </div>
                }
              </aside>
            }
          </div>
        }
      </app-resource-state>
    </div>
  `,
})
export class PlatformRbacComponent {
  protected readonly facade = inject(PlatformRbacFacade);
  private readonly access_ = inject(AccessPolicy);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  protected readonly shield = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5';
  protected readonly hueOf = hueOf;
  protected readonly initialsOf = initialsOf;

  /** El primer perfil llega seleccionado: el panel acoplado nunca es una ventana modal ni tapa las tarjetas. */
  protected readonly selectedCode = signal<string | null>('SUPER_ADMIN');
  protected readonly selected = computed<RbacRole | null>(() => this.facade.catalog.data()?.roles.find((r) => r.code === this.selectedCode()) ?? null);
  /** Los cuatro perfiles funcionales en una sola cuadrícula; cualquier otro rol del catálogo solo aparece en la matriz técnica. */
  protected readonly profiles = computed(() => {
    const roles = this.facade.catalog.data()?.roles ?? [];

    return [...PLATFORM_CODES, ...COMPANY_CODES].flatMap((code) => {
      const role = roles.find((r) => r.code === code && r.isActive);

      return role ? [{ code, scope: role.scope, people: role.people, profile: PROFILES[code] }] : [];
    });
  });
  /** Solo se ofrece administrar accesos a quien puede hacerlo; la autorización real la aplica FastAPI. */
  protected readonly canManage = computed(() => this.access_.canAny(['memberships:manage']));

  constructor() {
    this.facade.load();
    // Con un perfil elegido se piden SOLO sus primeras personas al servidor; el resto está en Usuarios (con búsqueda y paginación).
    effect(() => {
      const role = this.selected();

      untracked(() => this.facade.loadAssignments(role ? role.code : null));
    });
  }

  protected open(code: string): void {
    this.selectedCode.set(code);
    this.revealPanelIfStacked();
  }
  /** En pantallas estrechas el panel queda debajo de las tarjetas: se lleva a la vista para que elegir un perfil tenga efecto visible. */
  private revealPanelIfStacked(): void {
    if (typeof matchMedia !== 'function' || !matchMedia('(max-width: 1100px)').matches) return;

    setTimeout(() => this.panel()?.nativeElement.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  }
  protected close(): void {
    this.selectedCode.set(null);
  }
  protected profileOf(role: RbacRole): Profile {
    return PROFILES[role.code];
  }
  protected availability(state: PermissionImplementation): { text: string; badge: string } {
    return AVAILABILITY[state];
  }
  /** Capacidades del rol agrupadas por función; el estado de cada grupo sale del catálogo real, nunca de un texto fijo. */
  protected capabilities(role: RbacRole): readonly ShownGroup[] {
    const states = new Map((this.facade.catalog.data()?.permissions ?? []).map((p) => [p.code, p.implementation]));
    const held = new Set(role.permissions);
    const wording = role.scope === 'GLOBAL' ? 'platform' : 'company';
    const rank: PermissionImplementation[] = ['active', 'complementary', 'planned'];

    return GROUPS.flatMap((group) => {
      const items = group.capabilities.filter((c) => held.has(c.permission)).map((c) => ({ text: c[wording], state: states.get(c.permission) ?? 'planned' }));
      const state = rank.find((candidate) => items.some((i) => i.state === candidate));

      return state ? [{ title: group.title, state, items }] : [];
    });
  }
  protected hasPlanned(role: RbacRole): boolean {
    return this.capabilities(role).some((g) => g.state === 'planned');
  }
  /** Superadministradores se gestionan en su sección; las personas de empresa, en su detalle de usuario. */
  protected personLink(role: RbacRole, a: RoleAssignment): string[] {
    return [role.scope === 'GLOBAL' ? '/plataforma/superadministradores' : '/plataforma/usuarios', a.userId];
  }
  protected stateText(a: RoleAssignment): string {
    if (!a.isActive) return 'Cuenta suspendida';

    return a.membershipStatus ? ((MEMBERSHIP_LABELS as Record<string, { text: string }>)[a.membershipStatus]?.text ?? a.membershipStatus) : 'Activo';
  }
}
