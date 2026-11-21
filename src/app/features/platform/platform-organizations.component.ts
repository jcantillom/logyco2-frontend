import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { OrganizationFocus, OrganizationListFilter, OrganizationSort, SortOrder } from '../../domain/models/organization';
import { OnboardingStatus, OrganizationOnboarded } from '../../domain/models/onboarding';
import { OnboardingFacade } from '../onboarding/onboarding.facade';
import { OnboardingStatusComponent } from '../onboarding/onboarding-status.component';
import { onboardingError } from '../onboarding/onboarding.labels';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { roleLabel } from '../../shared/ui/labels';
import { OrgLogoComponent } from '../../shared/ui/org-logo.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { DIRECTORY_STYLES } from '../../shared/ui/directory.styles';
import { PAGE_SIZES, PagerComponent } from '../../shared/ui/pager.component';
import { OrgTypeChipComponent } from './org-type-chip.component';
import { PERSON_STATUS_LABELS } from './platform-labels';
import { PlatformDashboardFacade, PlatformOrganizationsFacade, PlatformUsersFacade } from './platform.facades';

export { hueOf, initialsOf };

const SIZE_KEY = 'logyco2.platform.organizations.pageSize';
const SEARCH_DEBOUNCE_MS = 300;
const SORTS: readonly OrganizationSort[] = ['name', 'created_at', 'status'];

/** Atajos de gestión (los indicadores): cada uno es un único criterio que el servidor resuelve. */
export type QuickFilter = 'todas' | 'activas' | 'inactivas' | 'sin-admin' | 'con-invitaciones' | 'sin-tipo' | 'eliminadas';
const QUICK: readonly QuickFilter[] = ['todas', 'activas', 'inactivas', 'sin-admin', 'con-invitaciones', 'sin-tipo', 'eliminadas'];
const FOCUS: Partial<Record<QuickFilter, OrganizationFocus>> = { 'sin-admin': 'without_admin', 'con-invitaciones': 'with_invitations', 'sin-tipo': 'without_type' };

/** Las fechas se leen de la más reciente a la más antigua; el resto, de la A a la Z. */
function defaultOrder(sort: OrganizationSort): SortOrder {
  return sort === 'created_at' ? 'desc' : 'asc';
}

function storedSize(): number {
  try {
    const size = Number(localStorage.getItem(SIZE_KEY));
    return PAGE_SIZES.includes(size) ? size : 25;
  } catch {
    return 25;
  }
}

@Component({
  selector: 'app-platform-organizations',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, OnboardingStatusComponent, OrgLogoComponent, OrgTypeChipComponent, PagerComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    DIRECTORY_STYLES,
    `
      :host { display: block; min-width: 0; }
      .page { min-width: 0; }
      .page-header { align-items: center; gap: 24px; }
      .page-header h1 { letter-spacing: -0.035em; }
      .head-ico { width: 52px; height: 52px; border-radius: 16px; }
      .overview-heading { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
      .chip { flex-direction: row; align-items: center; gap: 8px; min-height: 40px; padding: 8px 14px; border-radius: 999px; background: var(--c-sf); }
      .chip::before { display: none; }
      .chip span { min-height: 0; font-size: 0.82rem; }
      .chip b { font-size: 0.95rem; letter-spacing: 0; }
      .chip:hover { transform: none; box-shadow: none; }
      .chip[aria-pressed='true'] { background: var(--c-ok-soft); box-shadow: none; }
      .directory { border-radius: 16px; box-shadow: var(--shadow); }
      .toolbar { gap: 10px; }
      .toolbar .search { flex-basis: 380px; }
      .toolbar .type-filter { flex-basis: 210px; }
      .dt { max-height: max(360px, calc(100dvh - 300px)); }
      .dt table { width: 100%; min-width: 1160px; table-layout: fixed; border-collapse: separate; border-spacing: 0; }
      .dt .c-name { width: 26%; } .dt .c-nit { width: 11%; } .dt .c-types { width: 19%; } .dt .c-access { width: 18%; } .dt .c-status { width: 11%; } .dt .c-created { width: 11%; } .dt .c-go { width: 4%; }
      .dt thead th > span, .dt thead th > button { height: 46px; }
      .dt tbody tr { height: 76px; }
      .twirl { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border: 0; border-radius: 8px; background: transparent; color: var(--c-mu); cursor: pointer; transition: background-color 0.15s, color 0.15s; }
      .twirl:hover { background: var(--c-s3); color: var(--c-accent); }
      .twirl:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 1px; }
      .twirl svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
      .twirl.open svg { transform: rotate(90deg); }
      .twirl.open { color: var(--c-accent); }
      .dt tbody tr.team-row, .dt tbody tr.team-row:hover { height: auto; cursor: default; background: var(--c-s2); }
      .team-row td { padding: 0; }
      .team-panel { padding: 8px 20px 16px 72px; text-align: left; }
      .team-head, .team-list li { display: grid; grid-template-columns: minmax(200px, 270px) minmax(0, 290px) 190px minmax(140px, 1fr); align-items: center; column-gap: 24px; }
      .team-head { padding: 4px 0 8px; border-bottom: 1px solid var(--c-bd); color: var(--c-mu); font-size: 0.78rem; font-weight: 700; }
      .team-head .c, .team-list .c { display: flex; justify-content: center; }
      .team-list { list-style: none; margin: 0; padding: 0; }
      .team-list li { padding: 9px 0; }
      .team-list li + li { border-top: 1px solid var(--c-bd); }
      .t-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .team-list .mini-avatar { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: 10px; background: var(--c-ok-soft); border: 1px solid var(--c-primary-200); color: var(--c-accent); font-size: 0.68rem; font-weight: 700; }
      .t-who a { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-head); font-size: 0.86rem; font-weight: 700; text-decoration: none; }
      .t-who a:hover { color: var(--c-accent); text-decoration: underline; }
      .t-mail { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-mu); font-size: 0.82rem; }
      .team-list .role-chip { padding: 3px 12px; border-radius: 999px; background: var(--c-sf); border: 1px solid var(--c-bd); color: var(--c-head); font-size: 0.76rem; font-weight: 700; white-space: nowrap; }
      .team-more { display: inline-block; margin-top: 8px; font-size: 0.84rem; font-weight: 700; }
      .team-empty { margin: 0; padding: 12px 0; color: var(--c-mu); font-size: 0.86rem; }
      .team-skel { display: grid; gap: 10px; padding: 8px 0; }
      .team-skel i { display: block; height: 32px; border-radius: 10px; background: var(--c-s3); }
      .dt td, .dt tbody th { padding: 8px 16px; }
      .dt td.c-nit, .dt td.c-created { color: var(--c-text2); font-size: 0.84rem; font-variant-numeric: tabular-nums; }
      .avatar { width: 44px; height: 44px; border-radius: 12px; background: var(--c-ok-soft); border-color: var(--c-primary-200); color: var(--c-accent); font-size: 0.8rem; }
      .avatar:has(img) { background: var(--c-sf); }
      .nm { gap: 2px; }
      .nm a { font-size: 0.95rem; font-weight: 700; }
      .types { display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .access { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 0.78rem; }
      .admins { color: var(--c-head); font-weight: 600; }
      .attention { display: inline-flex; align-items: center; gap: 6px; color: var(--c-warning); font-weight: 500; }
      .attention::before { content: ''; width: 5px; height: 5px; flex: none; border-radius: 50%; background: currentColor; }
      .invs { color: var(--c-gray-600); font-size: 0.72rem; }
      .invs.pending { color: var(--c-warning); }
      @media (prefers-reduced-motion: reduce) { .twirl, .twirl svg { transition: none; } }
      @media (max-width: 700px) {
        .page-header { align-items: flex-start; flex-wrap: wrap; }
        .btn-new { width: 100%; justify-content: center; }
        .toolbar .search, .toolbar .type-filter { flex: 1 1 100%; }
        .result { margin-left: 0; }
      }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="head"><span class="head-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icons.building" /></svg></span><div><h1>Empresas</h1><p>Empresas registradas en la plataforma, su clasificación y quién las administra.</p></div></div>
        <button type="button" class="btn btn-primary btn-new" data-testid="new-org" (click)="openCreate()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nueva empresa</button>
      </header>

      <div class="overview-heading"><h2>Panorama de empresas</h2><p>Selecciona un indicador para filtrar el listado</p></div>
      <div class="chips" role="group" aria-label="Indicadores de gestión" data-testid="org-chips">
        @for (chip of chips(); track chip.key) {
          <button type="button" class="chip" [class.warn]="chip.warn" [attr.aria-pressed]="quick() === chip.key" [attr.data-testid]="'chip-' + chip.key" (click)="setQuick(chip.key)">
            <span>{{ chip.label }}</span><b>{{ chip.count ?? '—' }}</b>
          </button>
        }
      </div>

      <div class="directory">
      <form class="toolbar" role="search" (submit)="$event.preventDefault()">
        <div class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
          <input id="org-q" class="input" type="search" aria-label="Buscar empresa" placeholder="Buscar por nombre, razón social o NIT" autocomplete="off" [value]="search()" (input)="onSearch($event)" />
          @if (search()) { <button type="button" class="x" aria-label="Borrar búsqueda" data-testid="clear-search" (click)="clearSearch()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button> }
        </div>
        <select class="input type-filter" aria-label="Filtrar por tipo de empresa" data-testid="type-filter" [value]="typeCode()" (change)="setType($event)">
          <option value="">Todos los tipos</option>
          @for (t of typeOptions(); track t.code) { <option [value]="t.code" [selected]="t.code === typeCode()">{{ t.name }} ({{ t.count }})</option> }
        </select>
        @if (hasFilters()) { <button type="button" class="btn btn-ghost btn-sm" data-testid="clear-filters" (click)="clearFilters()">Limpiar filtros</button> }
        @let countLabel = quick() === 'eliminadas' ? (total() === 1 ? 'empresa eliminada' : 'empresas eliminadas') : (total() === 1 ? 'empresa' : 'empresas');
        <span class="result" role="status" [attr.title]="total() + ' ' + countLabel"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.building" /></svg><b>{{ total() }}</b><span class="sr-only"> {{ countLabel }}</span></span>
      </form>

      @if (facade.list.status() === 'error' && !facade.list.data()) {
        <div class="alert alert-danger" role="alert"><div>{{ facade.list.error()?.message ?? 'No se pudo cargar el listado.' }}</div><button type="button" class="btn btn-secondary btn-sm" (click)="reload()">Reintentar</button></div>
      } @else {
        <section class="dt" tabindex="0" aria-label="Listado de empresas" [class.busy]="facade.list.status() === 'loading' && !!facade.list.data()" [attr.aria-busy]="facade.list.status() === 'loading'">
          <table>
            <caption class="sr-only">Empresas</caption>
            <colgroup><col class="c-name" /><col class="c-nit" /><col class="c-types" /><col class="c-access" /><col class="c-status" /><col class="c-created" /><col class="c-go" /></colgroup>
            <thead>
              <tr>
                <th scope="col" [attr.aria-sort]="ariaSort('name')"><button type="button" data-testid="sort-name" (click)="sortBy('name')">Empresa<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg></button></th>
                <th scope="col" class="c-nit"><span>NIT</span></th>
                <th scope="col" class="c-types"><span>Tipo de empresa</span></th>
                <th scope="col" class="c-access"><span>Administración</span></th>
                <th scope="col" class="c-status" [attr.aria-sort]="ariaSort('status')"><button type="button" data-testid="sort-status" (click)="sortBy('status')">Estado<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg></button></th>
                <th scope="col" class="c-created" [attr.aria-sort]="ariaSort('created_at')"><button type="button" data-testid="sort-created" (click)="sortBy('created_at')">Creada<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg></button></th>
                <th scope="col"><span class="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              @if (!facade.list.data()) {
                @for (n of skeletonRows; track n) { <tr class="skel" aria-hidden="true"><td><div class="who"><i class="sa"></i><i style="width: 60%"></i></div></td><td class="c-nit"><i style="width: 70%"></i></td><td class="c-types"><i style="width: 80%"></i></td><td class="c-access"><i style="width: 70%"></i></td><td><i style="width: 60%"></i></td><td class="c-created"><i style="width: 60%"></i></td><td></td></tr> }
              } @else {
                @for (org of items(); track org.id) {
                  <tr (click)="open(org.id, $event)">
                    <th scope="row">
                      <div class="who">
                        <button type="button" class="twirl" [class.open]="isOpen(org.id)" [attr.aria-expanded]="isOpen(org.id)" [attr.aria-controls]="'team-' + org.id" [attr.aria-label]="(isOpen(org.id) ? 'Ocultar' : 'Mostrar') + ' el equipo de ' + org.name" (click)="toggleTeam(org.id)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
                        <span class="avatar" [class.off]="!org.isActive" [class.warn]="org.isActive && org.activeAdmins === 0" [style.--h]="hueOf(org.name)" aria-hidden="true"><app-org-logo [id]="org.id" [version]="org.logoVersion">{{ initialsOf(org.name) }}</app-org-logo></span>
                        <div class="nm">
                          <a [routerLink]="['/plataforma/organizaciones', org.id]" [title]="org.name">{{ org.name }}</a>
                          @if (org.legalName) { <span class="muted small">{{ org.legalName }}</span> }
                        </div>
                      </div>
                    </th>
                    <td class="c-nit">{{ org.taxId ?? '—' }}</td>
                    <td class="c-types"><div class="types">@for (t of org.types; track t.code) { <app-org-type-chip [type]="t" /> } @empty { <span class="muted">Sin tipo</span> }</div></td>
                    <td class="c-access"><div class="access">
                      @if (org.activeAdmins === null) { <span class="muted">Administradores: —</span> }
                      @else if (org.activeAdmins === 0 && org.isActive) { <span class="attention">Sin administrador</span> }
                      @else { <span class="admins">{{ org.activeAdmins }} {{ org.activeAdmins === 1 ? 'administrador' : 'administradores' }}</span> }
                      <span class="invs" [class.pending]="!!org.pendingInvitations">@if (org.pendingInvitations === null) { Invitaciones: — } @else if (org.pendingInvitations) { {{ org.pendingInvitations }} {{ org.pendingInvitations === 1 ? 'invitación pendiente' : 'invitaciones pendientes' }} } @else { Sin invitaciones pendientes }</span>
                    </div>
                    </td>
                    <td>@if (org.deletedAt) { <span class="pill del" data-testid="pill-deleted">Eliminada</span> } @else { <span class="pill" [class.on]="org.isActive" [class.off]="!org.isActive">{{ org.isActive ? 'Activa' : 'Inactiva' }}</span> }</td>
                    <td class="c-created">{{ org.createdAt | date: 'mediumDate' }}</td>
                    <td><svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg></td>
                  </tr>
                  @if (isOpen(org.id)) {
                    <tr class="team-row" [id]="'team-' + org.id">
                      <td colspan="7">
                        @let team = people.team(org.id);
                        <div class="team-panel" role="region" [attr.aria-label]="'Equipo de ' + org.name" data-testid="team-panel">
                          @if (team.status() === 'error' && !team.data()) {
                            <div class="alert alert-danger" role="alert"><div>{{ team.error()?.message ?? 'No se pudo cargar el equipo.' }}</div><button type="button" class="btn btn-secondary btn-sm" (click)="people.loadTeam(org.id)">Reintentar</button></div>
                          } @else if (!team.data()) {
                            <div class="team-skel" role="status" aria-busy="true"><span class="sr-only">Cargando equipo…</span><i></i><i></i></div>
                          } @else if (teamRows(org.id).length === 0) {
                            <p class="team-empty">Esta empresa aún no tiene personas.</p>
                          } @else {
                            <div class="team-head" aria-hidden="true"><span>Persona</span><span>Correo</span><span class="c">Rol</span><span class="c">Estado</span></div>
                            <ul class="team-list">
                              @for (p of teamRows(org.id); track p.userId) {
                                <li>
                                  <div class="t-who"><span class="mini-avatar" aria-hidden="true">{{ initialsOf(p.name) }}</span><a [routerLink]="['/plataforma/usuarios', p.userId]" [title]="p.name">{{ p.name }}</a></div>
                                  <span class="t-mail" [title]="p.email">{{ p.email }}</span>
                                  <span class="c"><span class="role-chip">{{ p.role }}</span></span>
                                  <span class="c"><app-status-badge [label]="personStatus[p.status]" /></span>
                                </li>
                              }
                            </ul>
                            @if (team.data()!.total > team.data()!.items.length) {
                              <a class="team-more" [routerLink]="['/plataforma/usuarios']" [queryParams]="{ empresa: org.id }" data-testid="team-more">Ver todas las personas de {{ org.name }}</a>
                            }
                          }
                        </div>
                      </td>
                    </tr>
                  }
                }
              }
            </tbody>
          </table>
          @if (facade.list.data() && total() === 0) {
            <div class="empty-state" data-testid="empty-state">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="hasFilters() ? icons.search : icons.building" /></svg>
              @if (hasFilters()) {
                <h2>Sin resultados</h2><p class="muted">Ninguna empresa coincide con los criterios.</p>
                <button type="button" class="btn btn-secondary btn-sm" (click)="clearFilters()">Limpiar filtros</button>
              } @else {
                <h2>Aún no hay empresas</h2><p class="muted">Crea la primera para empezar a incorporar a sus equipos.</p>
                <button type="button" class="btn btn-primary btn-sm" (click)="openCreate()">Nueva empresa</button>
              }
            </div>
          }
        </section>
        <app-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" (pageChange)="goToPage($event)" (sizeChange)="setPageSize($event)" />
      }
      </div>
    </div>

    <dialog #createDialog class="dialog dialog-pro" aria-labelledby="neworg-title">
      @if (result(); as done) {
        <header class="dp-head">
          <span class="dp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icons.building" /></svg></span>
          <div><h2 id="neworg-title">Empresa creada</h2><p>{{ done.organization.name }}</p></div>
        </header>
        <div class="dialog-body" data-testid="onboarding-result">
          @if (done.onboarding; as status) {
            <app-onboarding-status [status]="status" [busy]="resending()" (resend)="resend($event)" />
          } @else {
            <div class="alert alert-warning" role="alert" data-testid="onboarding-failed">
              <div><strong>La empresa se creó, pero no se pudo incorporar a su administrador.</strong><br />{{ onboardingMessage(done) }} Abre la empresa para reintentar.</div>
            </div>
          }
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" (click)="closeCreate()">Cerrar</button>
          <button type="button" class="btn btn-primary" data-testid="onboarding-open" (click)="openCreated(done.organization.id)">Ver empresa</button>
        </div>
      } @else {
      <form [formGroup]="form" (ngSubmit)="create()" novalidate>
        <header class="dp-head">
          <span class="dp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M4 21h16" /></svg></span>
          <div><h2 id="neworg-title">Nueva empresa</h2><p>Registra la empresa y a su primer administrador: recibirá un correo para activar su cuenta.</p></div>
        </header>
        <div class="dialog-body">
          <fieldset class="dp-group">
            <legend>Identificación</legend>
            <div class="field">
              <label for="neworg-name">Nombre</label>
              <input id="neworg-name" class="input" type="text" formControlName="name" maxlength="255" placeholder="Nombre comercial" [attr.aria-invalid]="form.controls.name.touched && form.controls.name.invalid" />
              @if (form.controls.name.touched && form.controls.name.invalid) { <span class="field-error">El nombre es obligatorio.</span> }
            </div>
            <div class="dp-grid">
              <div class="field"><label for="neworg-legal">Razón social (opcional)</label><input id="neworg-legal" class="input" type="text" formControlName="legalName" maxlength="255" /></div>
              <div class="field"><label for="neworg-tax">NIT (opcional)</label><input id="neworg-tax" class="input" type="text" formControlName="taxId" maxlength="50" /></div>
            </div>
          </fieldset>
          <fieldset class="dp-group">
            <legend>Primer administrador de la empresa</legend>
            <div class="dp-grid">
              <div class="field">
                <label for="neworg-admin-name">Nombre completo</label>
                <input id="neworg-admin-name" class="input" type="text" formControlName="adminFullName" maxlength="255" autocomplete="off" [attr.aria-invalid]="form.controls.adminFullName.touched && form.controls.adminFullName.invalid" />
                @if (form.controls.adminFullName.touched && form.controls.adminFullName.invalid) { <span class="field-error">El nombre del administrador es obligatorio.</span> }
              </div>
              <div class="field">
                <label for="neworg-admin-email">Correo electrónico</label>
                <input id="neworg-admin-email" class="input" type="email" formControlName="adminEmail" maxlength="320" autocomplete="off" [attr.aria-invalid]="form.controls.adminEmail.touched && form.controls.adminEmail.invalid" />
                @if (form.controls.adminEmail.touched && form.controls.adminEmail.invalid) { <span class="field-error">Ingresa un correo válido.</span> }
              </div>
            </div>
            <p class="hint small">Rol: <strong>Administrador de la empresa (ORG_ADMIN)</strong>. Recibirá un enlace de un solo uso para activar su cuenta y elegir su contraseña.</p>
          </fieldset>
          <fieldset class="dp-group">
            <legend>Tipo de empresa (obligatorio)</legend>
            <div class="dp-types" role="group" aria-label="Tipos de empresa" [attr.aria-invalid]="typesTouched() && selectedTypes().length === 0">
              @for (t of facade.types.data() ?? []; track t.code) {
                <label class="dp-type" [class.on]="selectedTypes().includes(t.code)"><input type="checkbox" [checked]="selectedTypes().includes(t.code)" (change)="toggleType(t.code)" />{{ t.name }}</label>
              } @empty {
                <span class="hint">No hay tipos disponibles en el catálogo: no se puede crear la empresa hasta que existan.</span>
              }
            </div>
            @if (typesTouched() && selectedTypes().length === 0) { <span class="field-error" data-testid="types-error" role="alert">Selecciona al menos un tipo de empresa.</span> } @else { <span class="hint">Define si es generadora de carga, transportadora o ambas: clasifica su huella de carbono.</span> }
          </fieldset>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" (click)="closeCreate()">Cancelar</button>
          <button type="submit" class="btn btn-primary" data-testid="create-submit" [disabled]="saving()">{{ saving() ? 'Creando…' : 'Crear empresa e invitar' }}</button>
        </div>
      </form>
      }
    </dialog>
  `,
})
export class PlatformOrganizationsComponent {
  protected readonly facade = inject(PlatformOrganizationsFacade);
  protected readonly people = inject(PlatformUsersFacade);
  protected readonly personStatus = PERSON_STATUS_LABELS;
  /** Empresas con el equipo desplegado (se pide al desplegar, solo esa empresa). */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  private readonly dashboard = inject(PlatformDashboardFacade);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly onboarding = inject(OnboardingFacade);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  private readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  protected readonly hueOf = hueOf;
  protected readonly initialsOf = initialsOf;
  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly icons = {
    building: 'M3 21h18M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M9 8h2M9 12h2M9 16h2',
    check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12l2.5 2.5 4.5-5',
    pause: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 9v6M14 9v6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
    tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8.5 11h5',
  } as const;

  // ── Alta de empresa ──
  protected readonly saving = signal(false);
  protected readonly selectedTypes = signal<readonly string[]>([]);
  protected readonly typesTouched = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    legalName: [''],
    taxId: [''],
    adminFullName: ['', [Validators.required, Validators.maxLength(255)]],
    adminEmail: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
  });
  protected readonly result = signal<OrganizationOnboarded | null>(null);
  protected readonly resending = signal(false);

  // ── Criterios de la lista (se reflejan en la URL: se puede compartir y «Atrás» los conserva) ──
  protected readonly search = signal('');
  private readonly appliedSearch = signal('');
  protected readonly quick = signal<QuickFilter>('todas');
  protected readonly typeCode = signal('');
  protected readonly sort = signal<OrganizationSort>('name');
  protected readonly order = signal<SortOrder>('asc');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(storedSize());
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly filter = computed<OrganizationListFilter>(() => {
    const quick = this.quick();

    return {
      deleted: quick === 'eliminadas',
      search: this.appliedSearch(),
      isActive: quick === 'activas' ? true : quick === 'inactivas' ? false : undefined,
      typeCode: this.typeCode(),
      focus: FOCUS[quick],
      sort: this.sort(),
      order: this.order(),
    };
  });
  protected readonly items = computed(() => this.facade.list.data()?.items ?? []);
  protected readonly total = computed(() => this.facade.list.data()?.total ?? 0);
  protected readonly hasFilters = computed(() => this.quick() !== 'todas' || !!this.appliedSearch() || !!this.typeCode());
  protected readonly typeOptions = computed(() => this.dashboard.admin.data()?.organizations.byType ?? []);
  protected readonly chips = computed(() => {
    const m = this.dashboard.admin.data()?.organizations;

    return [
      { key: 'todas' as const, label: 'Todas', icon: this.icons.building, count: m?.total, warn: false },
      { key: 'activas' as const, label: 'Activas', icon: this.icons.check, count: m?.active, warn: false },
      { key: 'inactivas' as const, label: 'Inactivas', icon: this.icons.pause, count: m?.inactive, warn: false },
      { key: 'sin-admin' as const, label: 'Sin administrador activo', icon: this.icons.user, count: m?.withoutActiveAdmin, warn: (m?.withoutActiveAdmin ?? 0) > 0 },
      { key: 'con-invitaciones' as const, label: 'Con invitaciones pendientes', icon: this.icons.mail, count: m?.withPendingInvitations, warn: false },
      { key: 'sin-tipo' as const, label: 'Sin tipo', icon: this.icons.tag, count: m?.withoutType, warn: false },
      { key: 'eliminadas' as const, label: 'Eliminadas', icon: this.icons.trash, count: m?.deleted, warn: false },
    ];
  });

  constructor() {
    this.restore(this.route.snapshot.queryParamMap);

    // Una sola fuente de verdad: cualquier cambio de criterio, página o tamaño pide UNA página al servidor.
    effect(() => {
      const filter = this.filter();
      const request = { page: this.page(), pageSize: this.pageSize() };

      untracked(() => {
        this.facade.loadPage(request, filter);
        this.syncUrl();
      });
    });
    this.dashboard.loadMetrics();
    this.destroyRef.onDestroy(() => this.searchTimer !== null && clearTimeout(this.searchTimer));
  }

  /** Vuelve a pedir la página actual (y los indicadores) tras un cambio de datos. */
  protected reload(): void {
    this.facade.loadPage({ page: this.page(), pageSize: this.pageSize() }, this.filter());
    this.dashboard.loadMetrics();
  }

  protected setQuick(key: QuickFilter): void {
    this.quick.set(key);
    this.typeCode.set('');
    this.page.set(1);
  }
  protected setType(event: Event): void {
    this.typeCode.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }
  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.search.set(value);

    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applySearch(value), SEARCH_DEBOUNCE_MS);
  }
  protected clearSearch(): void {
    this.search.set('');
    this.applySearch('');
  }
  protected clearFilters(): void {
    this.search.set('');
    this.appliedSearch.set('');
    this.quick.set('todas');
    this.typeCode.set('');
    this.page.set(1);
  }
  private applySearch(value: string): void {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;

    if (value.trim() === this.appliedSearch()) return;

    this.appliedSearch.set(value.trim());
    this.page.set(1);
  }

  protected sortBy(column: OrganizationSort): void {
    if (this.sort() === column) this.order.update((order) => (order === 'asc' ? 'desc' : 'asc'));
    else { this.sort.set(column); this.order.set(defaultOrder(column)); }

    this.page.set(1);
  }
  protected ariaSort(column: OrganizationSort): 'ascending' | 'descending' | 'none' {
    return this.sort() !== column ? 'none' : this.order() === 'asc' ? 'ascending' : 'descending';
  }
  protected goToPage(page: number): void {
    this.page.set(page);
  }
  protected setPageSize(size: number): void {
    try { localStorage.setItem(SIZE_KEY, String(size)); } catch { /* la preferencia es opcional */ }

    this.pageSize.set(size);
    this.page.set(1);
  }

  /** Lee los criterios de la URL (incluido el enlace antiguo `?filtro=` del resumen). */
  private restore(params: ParamMap): void {
    const quick = params.get('vista') ?? params.get('filtro');
    const sort = params.get('orden');
    const page = Number(params.get('pagina'));
    const size = Number(params.get('tam'));
    const search = params.get('q') ?? '';

    if (QUICK.includes(quick as QuickFilter)) this.quick.set(quick as QuickFilter);
    if (SORTS.includes(sort as OrganizationSort)) this.sort.set(sort as OrganizationSort);
    this.order.set(params.get('dir') === 'desc' || params.get('dir') === 'asc' ? (params.get('dir') as SortOrder) : defaultOrder(this.sort()));
    if (Number.isInteger(page) && page > 1) this.page.set(page);
    if (PAGE_SIZES.includes(size)) this.pageSize.set(size);

    this.typeCode.set(params.get('tipo') ?? '');
    this.search.set(search);
    this.appliedSearch.set(search.trim());
  }

  /** Refleja los criterios en la URL sin crear una entrada de historial por cada cambio. */
  private syncUrl(): void {
    const entries: [string, string][] = [
      ['vista', this.quick() === 'todas' ? '' : this.quick()],
      ['q', this.appliedSearch()],
      ['tipo', this.typeCode()],
      ['orden', this.sort() === 'name' ? '' : this.sort()],
      ['dir', this.order() === defaultOrder(this.sort()) ? '' : this.order()],
      ['pagina', this.page() > 1 ? String(this.page()) : ''],
      ['tam', this.pageSize() === 25 ? '' : String(this.pageSize())],
    ];
    const query = entries.filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

    this.location.replaceState(this.location.path().split('?')[0], query);
  }

  protected openCreate(): void {
    if (!this.facade.types.data()) this.facade.loadTypes();

    this.result.set(null);
    this.form.reset({ name: '', legalName: '', taxId: '', adminFullName: '', adminEmail: '' });
    this.selectedTypes.set([]);
    this.typesTouched.set(false);
    this.createDialog().nativeElement.showModal();
  }
  protected closeCreate(): void {
    this.createDialog().nativeElement.close();
  }
  protected toggleType(code: string): void {
    this.selectedTypes.update((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));
    this.typesTouched.set(true);
  }
  protected create(): void {
    this.form.markAllAsTouched();
    this.typesTouched.set(true);

    // El tipo es obligatorio: sin él no se puede clasificar la huella de la empresa (el backend también lo exige).
    if (this.form.invalid || this.selectedTypes().length === 0 || this.saving()) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.feedback.start('Creando empresa…');
    this.onboarding
      .onboardOrganization({
        name: value.name.trim(), legalName: value.legalName.trim() || undefined, taxId: value.taxId.trim() || undefined, typeCodes: this.selectedTypes(),
        adminEmail: value.adminEmail.trim().toLowerCase(), adminFullName: value.adminFullName.trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outcome) => {
          this.saving.set(false);
          this.feedback.finish('Empresa creada');
          this.reload();
          this.result.set(outcome); // muestra el estado REAL de cada paso; no se afirma «correo enviado» sin confirmarlo
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
        next: (status: OnboardingStatus) => {
          this.resending.set(false);
          this.notifyResend(status);
          this.result.update((current) => (current ? { ...current, onboarding: status } : current));
        },
        error: (error: unknown) => {
          this.resending.set(false);
          this.feedback.close();
          this.toast.error(toAppError(error));
        },
      });
  }

  /** La fila completa abre el detalle (el enlace del nombre sigue siendo el control accesible). */
  protected isOpen(organizationId: string): boolean {
    return this.expanded().has(organizationId);
  }
  protected toggleTeam(organizationId: string): void {
    const opening = !this.isOpen(organizationId);

    this.expanded.update((current) => {
      const next = new Set(current);

      if (opening) next.add(organizationId);
      else next.delete(organizationId);

      return next;
    });

    if (opening) this.people.loadTeam(organizationId);
  }
  /** Personas de la empresa con su membresía vigente (una revocada es historia), en el orden que entrega el servidor. */
  protected teamRows(organizationId: string): { userId: string; name: string; email: string; status: string; role: string }[] {
    return (this.people.team(organizationId).data()?.items ?? []).flatMap((user) =>
      user.memberships
        .filter((m) => m.organization.id === organizationId && m.status !== 'REVOKED')
        .map((m) => ({ userId: user.id, name: user.fullName, email: user.email, status: m.status, role: m.roles.map(roleLabel).join(', ') || 'Sin rol' })),
    );
  }

  protected open(id: string, event: Event): void {
    if ((event.target as Element).closest('a, button')) return;

    void this.router.navigate(['/plataforma/organizaciones', id]);
  }
  protected openCreated(id: string): void {
    this.closeCreate();
    void this.router.navigate(['/plataforma/organizaciones', id]);
  }
  protected onboardingMessage(done: OrganizationOnboarded): string {
    return onboardingError(done.onboardingErrorCode);
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
