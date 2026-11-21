import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { Organization, OrganizationDeletionPlan } from '../../domain/models/organization';
import { ActivityItem as ActivityItemModel } from '../../domain/models/platform-admin';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { OrgLogoComponent } from '../../shared/ui/org-logo.component';
import { INVITATION_LABELS, MEMBERSHIP_LABELS, roleLabel } from '../../shared/ui/labels';
import { OnboardingStatus } from '../../domain/models/onboarding';
import { OnboardingFacade } from '../onboarding/onboarding.facade';
import { OnboardingStatusComponent } from '../onboarding/onboarding-status.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { OrgTypeChipComponent } from './org-type-chip.component';
import { ActivityIcon, activityLine, activityText, PERSON_STATUS_LABELS, relativeTime } from './platform-labels';
import { PlatformOrganizationsFacade, PlatformUsersFacade } from './platform.facades';

type Tab = 'summary' | 'members' | 'relations' | 'activity';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Información general' },
  { id: 'members', label: 'Administrador y equipo' },
  { id: 'relations', label: 'Relaciones comerciales' },
  { id: 'activity', label: 'Actividad' },
];

@Component({
  selector: 'app-platform-organization-detail',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, OrgLogoComponent, OrgTypeChipComponent, ResourceStateComponent, StatusBadgeComponent, OnboardingStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .type-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .admin-person { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 14px 16px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      .admin-person.pending { border-style: dashed; background: var(--c-s2); }
      .head-id { display: flex; align-items: center; gap: 14px; }
      .org-mark { display: grid; place-items: center; width: 52px; height: 52px; flex: none; border-radius: 14px; overflow: hidden; font-weight: 800; color: var(--c-accent); border: 1px solid var(--c-primary-200); background: var(--c-ok-soft); }
      .org-mark:has(img) { background: var(--c-sf); padding: 3px; }
      .avatar { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 12px; background: var(--c-ok-soft); border: 1px solid var(--c-primary-200); color: var(--c-accent); font-weight: 700; }
      .avatar.sm { width: 32px; height: 32px; border-radius: 10px; font-size: 0.72rem; }
      .table th.c, .table td.c { text-align: center; }
      .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .who a, .admin-info a { color: var(--c-head); font-weight: 700; text-decoration: none; }
      .who a:hover, .admin-info a:hover { color: var(--c-accent); text-decoration: underline; }
      .role-chip { display: inline-flex; padding: 2px 10px; border-radius: 999px; background: var(--c-s3); color: var(--c-head); font-size: 0.78rem; font-weight: 700; white-space: nowrap; }
      .timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
      .tl-item { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: start; gap: 12px; padding: 12px 0; }
      .tl-item + .tl-item { border-top: 1px solid var(--c-bd); }
      .tl-ico { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--c-s3); color: var(--c-mute2); }
      .tl-ico svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .tl-item[data-tone='success'] .tl-ico { background: var(--c-ok-soft); color: var(--c-accent); }
      .tl-item[data-tone='warning'] .tl-ico { background: var(--c-warning-bg); color: var(--c-warning); }
      .tl-item[data-tone='danger'] .tl-ico { background: var(--c-bad-soft); color: var(--c-bad); }
      .tl-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
      .tl-title { color: var(--c-head); font-size: 0.9rem; font-weight: 600; }
      .tl-detail { color: var(--c-mu); font-size: 0.8rem; }
      .tl-time { padding-top: 2px; color: var(--c-mu); font-size: 0.8rem; white-space: nowrap; }
      @media (max-width: 560px) { .tl-item { grid-template-columns: 36px minmax(0, 1fr); } .tl-time { grid-column: 2; } }
      .admin-info { display: flex; flex: 1 1 220px; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
      .admin-info a, .admin-info strong { font-weight: 650; }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="head-id">
          @if (facade.detail.data(); as head) {
            <span class="org-mark" [style.--h]="hueOf(head.name)" aria-hidden="true"><app-org-logo [id]="head.id" [version]="head.logoVersion">{{ initialsOf(head.name) }}</app-org-logo></span>
          }
          <div>
            <h1>{{ facade.detail.data()?.name ?? 'Empresa' }}</h1>
            <p><a routerLink="/plataforma/organizaciones">← Volver al listado</a></p>
          </div>
        </div>
        @if (facade.detail.data(); as org) {
          <span class="badge" [class.badge-success]="org.isActive" [class.badge-neutral]="!org.isActive">{{ org.isActive ? 'Activa' : 'Inactiva' }}</span>
        }
      </header>

      <div class="tabs" role="tablist" aria-label="Secciones de la empresa">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
        }
      </div>

      @switch (tab()) {
        @case ('summary') {
          <app-resource-state [status]="facade.detail.status()" [error]="facade.detail.error()" (retry)="facade.loadDetail(id())">
            @if (facade.detail.data(); as org) {
              <section class="card" aria-labelledby="sum-title">
                <h2 id="sum-title">Datos de la empresa</h2>
                <dl class="facts" style="margin-top: 12px">
                  <dt>Nombre</dt><dd>{{ org.name }}</dd>
                  <dt>Razón social</dt><dd>{{ org.legalName ?? '—' }}</dd>
                  <dt>NIT</dt><dd class="num">{{ org.taxId ?? '—' }}</dd>
                  <dt>Estado</dt><dd><span class="badge" [class.badge-success]="org.isActive" [class.badge-warning]="!org.isActive">{{ org.isActive ? 'Activa' : 'Inactiva' }}</span></dd>
                  <dt>Tipos</dt><dd><span class="type-chips">@for (t of org.types; track t.code) { <app-org-type-chip [type]="t" /> } @empty { <span class="muted">Sin tipo asignado</span> }</span></dd>
                  <dt>Administrador</dt>
                  <dd>
                    @if (org.activeAdmins === 0 && org.isActive) { <span class="badge badge-warning">Sin administrador activo</span> }
                    @else if (org.activeAdmins !== null) { {{ org.activeAdmins > 0 ? 'Activo' : 'Pendiente de activar' }} }
                    @else { — }
                    @if (org.pendingInvitations) { <span class="muted small"> · {{ org.pendingInvitations }} invitación(es) pendiente(s)</span> }
                  </dd>
                  <dt>Creada</dt><dd>{{ org.createdAt | date: 'medium' }}</dd>
                  <dt>Actualizada</dt><dd>{{ org.updatedAt | date: 'medium' }}</dd>
                </dl>
                @if (org.deletedAt) {
                  <div class="alert alert-danger" role="status" data-testid="deleted-banner" style="margin-top: 16px">
                    <div><strong>Esta empresa está eliminada</strong> desde el {{ org.deletedAt | date: 'medium' }}. Sus usuarios exclusivos están desactivados. Puedes restaurarla (vuelve <em>inactiva</em> y se reactivan esos usuarios) o eliminarla definitivamente.</div>
                  </div>
                  <div class="row" style="margin-top: 12px">
                    <button type="button" class="btn btn-primary" data-testid="restore-org" [disabled]="busy()" (click)="restore(org)">Restaurar empresa</button>
                    <button type="button" class="btn btn-danger" data-testid="purge-org" [disabled]="busy()" (click)="openDelete(org, 'purge')">Eliminar definitivamente</button>
                  </div>
                } @else {
                <div class="row" style="margin-top: 16px">
                  <button type="button" class="btn btn-primary" data-testid="edit-org" (click)="openEdit(org)">Editar datos</button>
                  <button type="button" class="btn" data-testid="toggle-org" [class.btn-danger]="org.isActive" [class.btn-primary]="!org.isActive" [disabled]="busy()" (click)="toggleActive(org)">
                    {{ org.isActive ? 'Desactivar empresa' : 'Activar empresa' }}
                  </button>
                  @if (!org.isActive) {
                    <button type="button" class="btn btn-danger" data-testid="delete-org" [disabled]="busy()" (click)="openDelete(org, 'soft')">Eliminar empresa</button>
                  }
                </div>
                }
              </section>
            }
          </app-resource-state>
        }

        @case ('members') {
          <section class="card stack admin-card" aria-labelledby="admin-title" data-testid="admin-section">
            <h2 id="admin-title">Administrador de la empresa</h2>
            <p class="muted small">Cada empresa tiene un único administrador: gestiona a su equipo y sus accesos.</p>
            <app-resource-state [status]="users.orgPeople.status()" [error]="users.orgPeople.error()" (retry)="users.loadOrganization(id())">
              @if (admin(); as a) {
                <div class="admin-person" data-testid="admin-person">
                  <span class="avatar" [style.--h]="hueOf(a.name)" aria-hidden="true">{{ initialsOf(a.name) }}</span>
                  <div class="admin-info">
                    <a [routerLink]="['/plataforma/usuarios', a.userId]">{{ a.name }}</a>
                    <span class="muted small">{{ a.email }}</span>
                  </div>
                  <app-status-badge [label]="personStatus[a.status]" />
                  <a class="btn btn-secondary btn-sm" [routerLink]="['/plataforma/usuarios', a.userId]">Administrar acceso</a>
                </div>
                <p class="hint" data-testid="admin-change-hint">Para cambiar de administrador, primero revoca el acceso del actual desde su ficha y después asigna a la nueva persona.</p>
              } @else if (pendingAdmin(); as inv) {
                <div class="admin-person pending" data-testid="admin-pending">
                  <span class="avatar" aria-hidden="true">?</span>
                  <div class="admin-info"><strong>{{ inv.inviteeName ?? inv.email }}</strong><span class="muted small">{{ inv.email }} · invitación vigente hasta el {{ inv.expiresAt | date: 'mediumDate' }}</span></div>
                  <span class="badge badge-warning">Invitación pendiente</span>
                  <a class="btn btn-secondary btn-sm" routerLink="/plataforma/usuarios" [queryParams]="{ tab: 'invitaciones' }">Ver invitaciones</a>
                </div>
                <p class="hint">Mientras la invitación esté vigente no se puede asignar a otra persona. Si fue un error, revócala en Usuarios → Invitaciones.</p>
              } @else {
                @if (facade.detail.data(); as org) {
                  <div class="alert alert-warning" role="status" data-testid="no-admin">Esta empresa aún no tiene administrador: nadie puede incorporar a su equipo ni gestionar sus accesos.</div>
                  @if (!org.isActive) { <div class="alert alert-warning" role="status">La empresa está inactiva: actívala antes de asignar al administrador.</div> }
                  <form class="stack" [formGroup]="inviteForm" (ngSubmit)="invite(org.id)" novalidate>
                    <p class="muted small">La persona recibe un correo con un enlace de un solo uso para activar su cuenta (o aceptar con la suya si ya tiene una). Al aceptar queda habilitada como administradora.</p>
                    <div class="grid grid-2">
                      <div class="field">
                        <label for="adm-email">Correo del administrador</label>
                        <input id="adm-email" class="input" type="email" formControlName="email" maxlength="320" />
                        @if (inviteForm.controls.email.touched && inviteForm.controls.email.invalid) { <span class="field-error">Ingresa un correo válido.</span> }
                      </div>
                      <div class="field"><label for="adm-name">Nombre completo</label><input id="adm-name" class="input" type="text" formControlName="inviteeName" maxlength="255" /></div>
                    </div>
                    <div class="row"><button type="submit" class="btn btn-primary" data-testid="invite-admin" [disabled]="busy() || !org.isActive">Asignar administrador</button></div>
                  </form>
                }
              }
            </app-resource-state>
          </section>

          <section class="stack" aria-labelledby="team-title" data-testid="team-section">
            <h2 id="team-title">Equipo</h2>
            <p class="muted small">Las demás personas de la empresa y su rol. El administrador invita a su equipo desde su propia cuenta.</p>
            <app-resource-state [status]="users.orgPeople.status()" [error]="users.orgPeople.error()" [empty]="team().length === 0" [emptyIcon]="icons.users" emptyTitle="Sin equipo" emptyMessage="Aún no hay más personas en esta empresa." (retry)="users.loadOrganization(id())">
              <div class="table-wrap">
                <table class="table">
                  <caption class="sr-only">Equipo de la empresa</caption>
                  <thead><tr><th scope="col">Persona</th><th scope="col">Correo</th><th scope="col" class="c">Rol</th><th scope="col" class="c">Estado</th></tr></thead>
                  <tbody>
                    @for (row of team(); track row.membershipId) {
                      <tr>
                        <td><div class="who"><span class="avatar sm" aria-hidden="true">{{ initialsOf(row.name) }}</span><a [routerLink]="['/plataforma/usuarios', row.userId]">{{ row.name }}</a></div></td>
                        <td class="muted">{{ row.email }}</td>
                        <td class="c"><span class="role-chip">{{ row.roles }}</span></td>
                        <td class="c"><app-status-badge [label]="personStatus[row.status]" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </app-resource-state>
          </section>

          @if (visibleInvitations().length > 0) {
            <section class="stack" aria-labelledby="inv-org-title" data-testid="org-invitations">
              <h2 id="inv-org-title">Invitaciones</h2>
              <div class="table-wrap">
                <table class="table">
                  <caption class="sr-only">Invitaciones de la empresa</caption>
                  <thead><tr><th scope="col">Correo</th><th scope="col" class="c">Rol</th><th scope="col" class="c">Estado</th><th scope="col" class="c">Vence</th></tr></thead>
                  <tbody>@for (i of visibleInvitations(); track i.id) { <tr><td>{{ i.email }}</td><td class="c"><span class="role-chip">{{ roleName(i.roleCode) }}</span></td><td class="c"><app-status-badge [label]="invitationLabels[i.status]" /></td><td class="c">{{ i.status === 'PENDING' ? (i.expiresAt | date: 'mediumDate') : '—' }}</td></tr> }</tbody>
                </table>
              </div>
            </section>
          }
        }

        @case ('relations') {
          <section class="card stack" aria-labelledby="rel-title">
            <h2 id="rel-title">Relaciones comerciales</h2>
            <p class="muted small">Vínculos entre empresas (proveedor/cliente). Son independientes de las membresías de usuarios.</p>
            <app-resource-state [status]="facade.relationships.status()" [error]="facade.relationships.error()" [empty]="facade.relationships.data()?.length === 0" [emptyIcon]="icons.link" emptyTitle="Sin relaciones" emptyMessage="Esta empresa no tiene relaciones comerciales registradas." (retry)="facade.loadRelationships(id())">
              <div class="table-wrap">
                <table class="table">
                  <caption class="sr-only">Relaciones comerciales</caption>
                  <thead><tr><th scope="col">Contraparte</th><th scope="col" class="c">Rol de esta empresa</th><th scope="col" class="c">Tipo</th><th scope="col" class="c">Vigencia</th><th scope="col" class="c">Estado</th></tr></thead>
                  <tbody>
                    @for (r of facade.relationships.data(); track r.id) {
                      <tr>
                        <td><div class="who"><span class="avatar sm" aria-hidden="true">{{ initialsOf(r.counterpart.name) }}</span><a [routerLink]="['/plataforma/organizaciones', r.counterpart.id]">{{ r.counterpart.name }}</a></div></td><td class="c"><span class="role-chip">{{ r.role === 'PROVIDER' ? 'Proveedor' : 'Cliente' }}</span></td><td class="c">{{ r.relationshipType }}</td>
                        <td class="c">{{ r.startDate ? (r.startDate | date: 'mediumDate') : '—' }} → {{ r.endDate ? (r.endDate | date: 'mediumDate') : 'vigente' }}</td>
                        <td class="c"><span class="badge" [class.badge-success]="r.isActive" [class.badge-neutral]="!r.isActive">{{ r.isActive ? 'Activa' : 'Terminada' }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </app-resource-state>
          </section>
        }

        @case ('activity') {
          <section class="card stack" aria-labelledby="act-title" data-testid="org-activity">
            <h2 id="act-title">Actividad</h2>
            <app-resource-state [status]="facade.activity.status()" [error]="facade.activity.error()" [empty]="facade.activity.data()?.length === 0" [emptyIcon]="icons.clock" emptyTitle="Sin actividad registrada" emptyMessage="Los cambios de esta empresa aparecerán aquí a medida que ocurran." (retry)="facade.loadActivity(id())">
              <ol class="timeline">
                @for (item of facade.activity.data(); track item.id) {
                  @let line = text(item);
                  <li class="tl-item" [attr.data-tone]="line.tone">
                    <span class="tl-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="activityIcon(item)" /></svg></span>
                    <div class="tl-body"><span class="tl-title">{{ line.title }}</span>@if (line.detail; as d) { <span class="tl-detail">{{ d }}</span> }</div>
                    <time class="tl-time" [attr.datetime]="item.occurredAt.toISOString()" [title]="item.occurredAt | date: 'medium'">{{ ago(item.occurredAt) }}</time>
                  </li>
                }
              </ol>
            </app-resource-state>
          </section>
        }
      }
    </div>

    <dialog #editDialog class="dialog dialog-pro" aria-labelledby="edit-title">
      <form [formGroup]="editForm" (ngSubmit)="saveEdit()" novalidate>
        <header class="dp-head">
          <span class="dp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M4 21h16" /></svg></span>
          <div><h2 id="edit-title">Editar empresa</h2><p>{{ facade.detail.data()?.name }}</p></div>
        </header>
        <div class="dialog-body">
          <fieldset class="dp-group">
            <legend>Identificación</legend>
            <div class="field">
              <label for="edit-name">Nombre</label>
              <input id="edit-name" class="input" type="text" formControlName="name" maxlength="255" placeholder="Nombre comercial" [attr.aria-invalid]="editForm.controls.name.touched && editForm.controls.name.invalid" />
              <span class="dp-meta">
                @if (editForm.controls.name.touched && editForm.controls.name.invalid) { <span class="field-error">El nombre es obligatorio.</span> } @else { <span></span> }
                <span class="hint">{{ editForm.controls.name.value.length }}/255</span>
              </span>
            </div>
          </fieldset>
          <fieldset class="dp-group">
            <legend>Información legal</legend>
            <div class="dp-grid">
              <div class="field"><label for="edit-legal">Razón social</label><input id="edit-legal" class="input" type="text" formControlName="legalName" maxlength="255" /></div>
              <div class="field"><label for="edit-tax">NIT</label><input id="edit-tax" class="input" type="text" formControlName="taxId" maxlength="50" /><span class="hint">Déjalo vacío para quitarlo.</span></div>
            </div>
          </fieldset>
          <fieldset class="dp-group">
            <legend>Tipo de empresa (obligatorio)</legend>
            <app-resource-state [status]="facade.types.status()" [error]="facade.types.error()" (retry)="facade.loadTypes()">
              <div class="dp-types" role="group" aria-label="Tipos de empresa" data-testid="edit-types">
                @for (t of facade.types.data() ?? []; track t.code) {
                  <label class="dp-type" [class.on]="draftTypes().includes(t.code)"><input type="checkbox" [checked]="draftTypes().includes(t.code)" (change)="toggleType(t.code)" />{{ t.name }}</label>
                }
              </div>
            </app-resource-state>
            @if (typesTouched() && draftTypes().length === 0) { <span class="field-error" data-testid="types-error" role="alert">Selecciona al menos un tipo de empresa.</span> } @else { <span class="hint">Una empresa puede ser a la vez generadora de carga y transportadora. Los tipos alimentan las métricas del Resumen.</span> }
          </fieldset>
        </div>
        <div class="dialog-actions">
          @if (editForm.dirty || typesChanged()) { <span class="dp-dirty" data-testid="edit-dirty"><i></i>Cambios sin guardar</span> }
          <button type="button" class="btn btn-secondary" (click)="closeEdit()">Cancelar</button>
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar cambios' }}</button>
        </div>
      </form>
    </dialog>

    <dialog #deleteDialog class="dialog" aria-labelledby="del-title">
      <div class="dialog-body">
        <h2 id="del-title">{{ deleteMode() === 'purge' ? 'Eliminar definitivamente' : 'Eliminar empresa' }}</h2>
        @if (deleteMode() === 'purge') {
          <div class="alert alert-danger" role="alert"><div><strong>Esta acción es irreversible.</strong> La empresa y sus usuarios exclusivos se borran de LoGyCO₂ y ya no se podrán restaurar.</div></div>
        } @else {
          <div class="alert alert-warning" role="note"><div><strong>La empresa quedará oculta, no borrada.</strong> Podrás restaurarla desde «Eliminadas» y se reactivarán sus usuarios.</div></div>
        }
        @if (deletePlan(); as plan) {
          <div data-testid="delete-plan" class="stack" style="gap: 8px">
            <p style="margin: 0"><strong>{{ deleteMode() === 'purge' ? 'Se eliminarán' : 'Se desactivarán' }}</strong></p>
            <ul style="margin: 0; padding-left: 20px">
              <li><strong>{{ plan.usersToDelete }}</strong> usuario(s) que pertenecen solo a esta empresa{{ deleteMode() === 'purge' ? '' : ' (no podrán iniciar sesión)' }}</li>
              @if (deleteMode() === 'purge') { <li>{{ plan.memberships }} membresía(s), {{ plan.invitations }} invitación(es) y {{ plan.relationships }} relación(es) comercial(es)</li> }
              @else { <li>Las {{ plan.memberships }} membresía(s) y {{ plan.invitations }} invitación(es) se conservan intactas</li> }
            </ul>
            <p style="margin: 6px 0 0"><strong>Se conservan</strong></p>
            <ul style="margin: 0; padding-left: 20px">
              <li><strong>{{ plan.usersKept }}</strong> usuario(s) con otras empresas o rol global: no se tocan{{ deleteMode() === 'purge' ? ' (solo pierden esta membresía)' : '' }}</li>
              <li>Las cuentas corporativas de LOGYCA y el historial de auditoría</li>
            </ul>
            <div class="field" style="margin-top: 10px">
              <label for="del-name">Escribe el nombre exacto de la empresa para confirmar: <strong>{{ plan.organizationName }}</strong></label>
              <input id="del-name" class="input" type="text" autocomplete="off" [value]="deleteConfirm()" (input)="deleteConfirm.set($any($event.target).value)" />
            </div>
          </div>
        } @else if (deleteError()) {
          <div class="alert alert-danger" role="alert" data-testid="delete-error"><div>{{ deleteError() }}</div></div>
        } @else {
          <p class="muted" role="status">Calculando el alcance…</p>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" (click)="closeDelete()">Cancelar</button>
        <button type="button" class="btn btn-danger" data-testid="delete-confirm" [disabled]="!canDelete() || deleting()" (click)="confirmDelete()">
          {{ deleting() ? 'Procesando…' : deleteMode() === 'purge' ? 'Eliminar definitivamente' : 'Eliminar empresa' }}
        </button>
      </div>
    </dialog>

    <dialog #codeDialog class="dialog" aria-labelledby="code-title" (close)="onboarded.set(null)">
      <div class="dialog-body">
        <h2 id="code-title">Estado de la incorporación</h2>
        @if (onboarded(); as status) { <app-onboarding-status [status]="status" [busy]="resending()" (resend)="resend($event)" /> }
      </div>
      <div class="dialog-actions"><button type="button" class="btn btn-primary" (click)="closeCode()">Cerrar</button></div>
    </dialog>
  `,
})
export class PlatformOrganizationDetailComponent {
  readonly id = input.required<string>();

  protected readonly facade = inject(PlatformOrganizationsFacade);
  protected readonly users = inject(PlatformUsersFacade);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editDialog = viewChild.required<ElementRef<HTMLDialogElement>>('editDialog');
  private readonly codeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('codeDialog');
  private readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');
  private readonly router = inject(Router);
  protected readonly deletePlan = signal<OrganizationDeletionPlan | null>(null);
  protected readonly deleteConfirm = signal('');
  protected readonly deleteError = signal('');
  protected readonly deleting = signal(false);
  protected readonly deleteMode = signal<'soft' | 'purge'>('soft');
  protected readonly canDelete = computed(() => !!this.deletePlan() && this.deleteConfirm().trim() === this.deletePlan()!.organizationName);

  protected readonly tabs = TABS;
  protected readonly tab = signal<Tab>('summary');
  protected readonly membershipLabels = MEMBERSHIP_LABELS;
  protected readonly personStatus = PERSON_STATUS_LABELS;
  protected readonly invitationLabels = INVITATION_LABELS;
  protected readonly hueOf = hueOf;
  protected readonly initialsOf = initialsOf;
  protected readonly busy = signal(false);
  protected readonly onboarded = signal<OnboardingStatus | null>(null);
  protected readonly resending = signal(false);
  private readonly onboarding = inject(OnboardingFacade);
  protected readonly draftTypes = signal<readonly string[]>([]);
  protected readonly typesTouched = signal(false);
  protected readonly editForm = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    legalName: [''],
    taxId: [''],
  });
  protected readonly inviteForm = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
    inviteeName: ['', [Validators.required, Validators.maxLength(255)]],
  });

  protected readonly orgInvitations = computed(() => (this.users.invitations.data()?.items ?? []).filter((i) => i.organization.id === this.id()));
  protected readonly typesChanged = computed(() => {
    const current = (this.facade.detail.data()?.types ?? []).map((t) => t.code).sort().join(',');

    return current !== [...this.draftTypes()].sort().join(',');
  });
  protected readonly linked = computed(() => {
    const orgId = this.id();

    return (this.users.orgPeople.data()?.items ?? []).flatMap((user) =>
      user.memberships
        .filter((m) => m.organization.id === orgId)
        .map((m) => ({
          userId: user.id, name: user.fullName, email: user.email, membershipId: m.membershipId, status: m.status,
          isAdmin: m.roles.includes('ORG_ADMIN'),
          roles: m.roles.map(roleLabel).join(', ') || 'Sin roles',
        })),
    )
      // Una membresía revocada es historia: no es administrador ni equipo actual.
      .filter((row) => row.status !== 'REVOKED');
  });
  /** El único administrador: su membresía no revocada con rol de administrador (activa, pendiente de aprobación o suspendida). */
  protected readonly admin = computed(() => this.linked().find((row) => row.isAdmin) ?? null);
  protected readonly team = computed(() => this.linked().filter((row) => !row.isAdmin));
  /** Invitación de administrador vigente: ocupa el cupo igual que un administrador. */
  protected readonly pendingAdmin = computed(() => this.orgInvitations().find((i) => i.roleCode === 'ORG_ADMIN' && i.status === 'PENDING' && i.expiresAt.getTime() > Date.now()) ?? null);
  /** Las invitaciones revocadas dejan de mostrarse. */
  protected readonly visibleInvitations = computed(() => this.orgInvitations().filter((i) => i.status !== 'REVOKED'));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.facade.loadDetail(id);
        this.facade.loadRelationships(id);
        this.facade.loadActivity(id);
        this.facade.loadTypes();
      });
    });
    // El borrador de tipos parte de los tipos reales de la empresa y se resincroniza al recargarla.
    effect(() => {
      const org = this.facade.detail.data();
      untracked(() => this.draftTypes.set((org?.types ?? []).map((t) => t.code)));
    });
    // El equipo se pide al servidor para ESTA empresa: se vuelve a pedir al cambiar de empresa.
    effect(() => {
      const id = this.id();
      untracked(() => this.users.loadOrganization(id));
    });
    this.users.loadInvitations();
  }

  protected text = activityText;
  protected readonly icons = {
    users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.7',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  } as const;
  private readonly activityIcons: Readonly<Record<ActivityIcon, string>> = {
    organization: 'M3 21h18M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M9 8h2M9 12h2M9 16h2',
    person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    invitation: 'M3 6h18v12H3zM3 7l9 6 9-6',
    role: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    membership: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.7',
  };
  protected activityIcon(item: ActivityItemModel): string {
    return this.activityIcons[activityLine(item).icon];
  }
  protected ago(moment: Date): string {
    return relativeTime(moment);
  }
  protected roleName(code: string): string {
    return roleLabel(code);
  }
  protected toggleType(code: string): void {
    this.draftTypes.update((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));
    this.typesTouched.set(true);
  }

  protected openEdit(org: Organization): void {
    this.editForm.reset({ name: org.name, legalName: org.legalName ?? '', taxId: org.taxId ?? '' });
    this.draftTypes.set(org.types.map((t) => t.code));
    this.typesTouched.set(false);
    this.editDialog().nativeElement.showModal();
  }
  protected closeEdit(): void {
    this.editDialog().nativeElement.close();
  }
  protected closeCode(): void {
    this.codeDialog().nativeElement.close();
  }

  /** Ejecuta una mutación con un único indicador de ocupado y avisos de éxito o error uniformes. */
  private run<T>(action: Observable<T>, success: string, done?: (value: T) => void, working = 'Procesando…'): void {
    if (this.busy()) return;

    this.busy.set(true);
    this.feedback.start(working);
    action.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.busy.set(false);
        this.feedback.finish(success);
        done?.(value);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.feedback.close();
        this.toast.error(toAppError(error));
      },
    });
  }

  protected saveEdit(): void {
    this.editForm.markAllAsTouched();
    this.typesTouched.set(true);

    const org = this.facade.detail.data();

    // Una empresa nunca se queda sin tipo (el backend también lo exige).
    if (this.editForm.invalid || !org || this.draftTypes().length === 0) return;

    const value = this.editForm.getRawValue();
    const changes = { name: value.name.trim(), legalName: value.legalName.trim() || null, taxId: value.taxId.trim() || null };
    const dataChanged = changes.name !== org.name || changes.legalName !== org.legalName || changes.taxId !== org.taxId;

    if (!dataChanged && !this.typesChanged()) {
      this.closeEdit();

      return;
    }

    // Los datos y los tipos son dos operaciones del backend: se envían solo las que cambiaron, en orden, bajo un único indicador.
    const update$ = dataChanged ? this.facade.update(org.id, changes) : of(org);
    const save$ = update$.pipe(switchMap((updated) => (this.typesChanged() ? this.facade.setTypes(updated.id, this.draftTypes()) : of(updated))));

    this.run(save$, 'Empresa actualizada.', () => this.closeEdit(), 'Guardando cambios…');
  }

  protected async toggleActive(org: Organization): Promise<void> {
    const next = !org.isActive;
    const accepted = await this.confirm.confirm({
      title: next ? 'Activar empresa' : 'Desactivar empresa',
      message: next
        ? `¿Activar «${org.name}»? Sus usuarios podrán volver a operar.`
        : `¿Desactivar «${org.name}»? Sus usuarios perderán el acceso mientras esté inactiva.`,
      confirmLabel: next ? 'Activar' : 'Desactivar',
      danger: !next,
    });

    if (!accepted) return;

    this.run(this.facade.setActive(org.id, next), next ? 'Empresa activada.' : 'Empresa desactivada.', undefined, next ? 'Activando empresa…' : 'Desactivando empresa…');
  }

  protected openDelete(org: Organization, mode: 'soft' | 'purge'): void {
    this.deleteMode.set(mode);
    this.deletePlan.set(null);
    this.deleteConfirm.set('');
    this.deleteError.set('');
    this.deleteDialog().nativeElement.showModal();
    this.facade.deletionPreview(org.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (plan) => this.deletePlan.set(plan),
      error: (error: unknown) => this.deleteError.set(toAppError(error).message),
    });
  }

  protected async restore(org: Organization): Promise<void> {
    const accepted = await this.confirm.confirm({
      title: 'Restaurar empresa',
      message: `¿Restaurar «${org.name}»? Volverá como empresa inactiva y se reactivarán los usuarios que la eliminación desactivó. Activarla es un paso aparte.`,
      confirmLabel: 'Restaurar',
    });

    if (!accepted) return;

    this.run(this.facade.restore(org.id), 'Empresa restaurada (inactiva).', undefined, 'Restaurando empresa…');
  }

  protected closeDelete(): void {
    this.deleteDialog().nativeElement.close();
  }

  protected confirmDelete(): void {
    const plan = this.deletePlan();

    if (!plan || !this.canDelete() || this.deleting()) return;

    this.deleting.set(true);
    this.feedback.start(this.deleteMode() === 'purge' ? 'Eliminando definitivamente…' : 'Eliminando empresa…');
    const request = this.deleteMode() === 'purge' ? this.facade.purge(plan.organizationId, this.deleteConfirm().trim()) : this.facade.delete(plan.organizationId, this.deleteConfirm().trim());
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (done) => {
        this.deleting.set(false);
        this.closeDelete();
        this.feedback.finish(done.permanent ? 'Empresa eliminada definitivamente' : 'Empresa eliminada. Puedes restaurarla desde «Eliminadas»');
        void this.router.navigate(['/plataforma/organizaciones']);
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.feedback.close();
        this.toast.error(toAppError(error));
      },
    });
  }

  protected invite(organizationId: string): void {
    this.inviteForm.markAllAsTouched();

    if (this.inviteForm.invalid) return;

    const value = this.inviteForm.getRawValue();
    this.busy.set(true);
    this.feedback.start('Creando administrador…');
    this.onboarding
      .onboardMember({ organizationId, email: value.email.trim().toLowerCase(), fullName: value.inviteeName.trim(), roleCode: 'ORG_ADMIN' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.busy.set(false);
          this.feedback.finish('Administrador incorporado');
          this.inviteForm.reset({ email: '', inviteeName: '' });
          this.users.loadInvitations();
          this.facade.loadActivity(organizationId);
          this.onboarded.set(status);
          this.codeDialog().nativeElement.showModal();
        },
        error: (error: unknown) => {
          this.busy.set(false);
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
          this.users.loadInvitations();
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
