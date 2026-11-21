import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, concat, last, of } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccessPolicy } from '../../core/auth/access-policy';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { OrganizationContext, reloadOnContextChange } from '../../core/org/organization-context';
import { CommercialRelationship, Organization, OrganizationProfileChanges } from '../../domain/models/organization';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { roleLabel } from '../../shared/ui/labels';
import { OrgRequiredComponent } from '../../shared/ui/org-required.component';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { HomeFacade } from '../dashboard/home.facade';
import { OrganizationLogoStore } from './logo.store';
import { CompanyLinksComponent } from './company-links.component';
import { CompanyProfileFacade } from './company-profile.facade';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 512 * 1024;

type TabId = 'general' | 'links' | 'config';
type EditFocus = 'name' | 'contact';

const TABS: readonly { id: TabId; label: string; icon: string }[] = [
  { id: 'general', label: 'Información general', icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4' },
  { id: 'links', label: 'Empresas vinculadas', icon: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' },
  { id: 'config', label: 'Configuración', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7' },
];

/** «Datos de mi empresa»: información general y de contacto (editable lo no sensible), actividad, empresas vinculadas y configuración. */
@Component({
  selector: 'app-company-profile',
  imports: [DatePipe, RouterLink, ReactiveFormsModule, CompanyLinksComponent, OrgRequiredComponent, PageHeroComponent, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .tabs { display: flex; flex-wrap: wrap; gap: 4px 44px; margin-top: 6px; padding: 0 4px; border-bottom: 1px solid var(--c-bd); overflow: visible; }
      .tab { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 10px; padding: 12px 2px 11px; cursor: pointer; color: var(--c-text2); font-weight: 600; font-size: 0.98rem; border-bottom: 3px solid transparent; margin-bottom: -1px; transition: color 0.15s, border-color 0.15s; }
      .tab:hover { color: var(--c-head); border-bottom-color: var(--c-bd); }
      .tab:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 6px; }
      .tab[aria-selected='true'] { color: var(--c-accent); border-bottom-color: var(--c-primary); }
      .tab svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .cols { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }
      .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
      .card { border-radius: 16px; padding: 18px 20px; }
      .head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
      .head .txt { flex: 1; min-width: 0; }
      .head h2 { margin: 0; font-size: 1.15rem; color: var(--c-head); }
      .head p { margin: 2px 0 0; color: var(--c-mu); font-size: 0.82rem; }
      .ico { display: grid; place-items: center; width: 42px; height: 42px; flex: none; border-radius: 12px; background: var(--c-ok-soft); color: var(--c-accent); }
      .ico svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .edit { display: inline-flex; align-items: center; gap: 6px; }
      .edit svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .rows { margin: 0; }
      .rows > div { display: grid; grid-template-columns: minmax(120px, 0.7fr) 1.3fr; gap: 12px; align-items: center; padding: 12px 4px; border-top: 1px solid var(--c-bd); }
      .rows dt { color: var(--c-head); font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 6px; }
      .rows dt svg { width: 13px; height: 13px; fill: none; stroke: var(--c-mute2); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .rows dd { margin: 0; color: var(--c-head); overflow-wrap: anywhere; }
      .rows dd.none { color: var(--c-mute2); }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .contact { list-style: none; margin: 0; padding: 0; }
      .contact li { display: flex; align-items: center; gap: 14px; padding: 12px 4px; border-top: 1px solid var(--c-bd); overflow-wrap: anywhere; }
      .contact li svg { width: 20px; height: 20px; flex: none; fill: none; stroke: var(--c-mu); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .contact li.none { color: var(--c-mute2); }
      .contact a { color: var(--c-head); text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
      .contact a:hover { color: var(--c-accent); }
      .lock { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--c-s2); color: var(--c-mu); font-size: 0.82rem; }
      .lock svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .type { padding: 12px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .type strong { color: var(--c-head); } .type small { color: var(--c-mu); margin-left: 6px; }
      .type p { margin: 4px 0 0; color: var(--c-mu); font-size: 0.84rem; }
      .types { display: flex; flex-direction: column; gap: 10px; }
      .link { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-top: 1px solid var(--c-bd); }
      .link:first-child { border-top: 0; }
      .link .nm { flex: 1; min-width: 0; } .link .nm strong { display: block; color: var(--c-head); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .link .nm span { color: var(--c-mu); font-size: 0.8rem; }
      .linkbox { border: 1px solid var(--c-bd); border-radius: 12px; overflow: hidden; }
      .more { all: unset; cursor: pointer; display: inline-block; margin-top: 12px; font-size: 0.9rem; font-weight: 600; color: var(--c-accent); }
      .more:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      .profile { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--c-bd); }
      .pline { display: flex; justify-content: space-between; gap: 8px; font-size: 0.88rem; } .pline strong { color: var(--c-head); } .pline span { color: var(--c-mu); }
      .pend { margin: 0 0 8px; color: var(--c-mu); font-size: 0.84rem; } .pend b { color: var(--c-head); font-weight: 600; }
      .bar { height: 10px; border-radius: 999px; background: var(--c-s3); overflow: hidden; margin: 6px 0 14px; }
      .bar i { display: block; height: 100%; background: var(--c-primary); border-radius: 999px; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .tbl th { text-align: left; padding: 10px 12px; background: var(--c-s2); color: var(--c-head); font-weight: 700; }
      .tbl th:first-child { border-radius: 10px 0 0 10px; } .tbl th:last-child { border-radius: 0 10px 10px 0; }
      .tbl td { padding: 12px; border-bottom: 1px solid var(--c-bd); }
      .tbl tbody tr:last-child td { border-bottom: 0; }
      .empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 24px 16px; text-align: center; color: var(--c-mu); border: 1px dashed var(--c-bd); border-radius: 12px; font-size: 0.88rem; }
      .empty strong { color: var(--c-head); font-size: 0.95rem; }
      .ico.logo { background: #fff; border: 1px solid var(--c-bd); padding: 4px; width: 52px; height: 52px; }
      .ico.logo img { width: 100%; height: 100%; object-fit: contain; border-radius: 8px; }
      .logo-edit { display: flex; align-items: center; gap: 16px; }
      .logo-box { width: 76px; height: 76px; flex: none; display: grid; place-items: center; border: 1px dashed var(--c-bd); border-radius: 14px; background: #fff; overflow: hidden; color: #fff; font-weight: 800; font-size: 1.3rem; }
      .logo-box img { width: 100%; height: 100%; object-fit: contain; }
      .logo-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; min-width: 0; flex: 1; }
      .logo-actions .row-btns { display: flex; gap: 8px; flex-wrap: wrap; }
      input[type='file'].sr { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      fieldset[disabled] .input { background: var(--c-s2); color: var(--c-mu); cursor: not-allowed; }
      @media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
    `,
  ],
  template: `
    <div class="page">
      <app-page-hero title="Datos de mi empresa" subtitle="Información de la organización, su actividad y configuración en LoGyCO₂." />

      <app-org-required>
        <app-resource-state [status]="home.organization.status()" [error]="home.organization.error()" (retry)="home.reload()">
          @if (home.organization.data(); as org) {
            <div class="tabs" role="tablist" aria-label="Secciones de la empresa">
              @for (t of tabs; track t.id) {
                <button type="button" class="tab" role="tab" [id]="'tab-' + t.id" [attr.aria-selected]="tab() === t.id" [attr.aria-controls]="'panel-' + t.id" [attr.tabindex]="tab() === t.id ? 0 : -1" [attr.data-testid]="'tab-' + t.id" (click)="tab.set(t.id)" (keydown)="onTabKey($event)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="t.icon" /></svg>{{ t.label }}
                </button>
              }
            </div>

            @switch (tab()) {
              @case ('general') {
                <div class="cols" role="tabpanel" id="panel-general" aria-labelledby="tab-general">
                  <div class="col">
                    @if (missing().length > 0) {
                      <div class="alert alert-warning" role="status" data-testid="incomplete">
                        <span><strong>Datos incompletos.</strong> Falta: {{ missing().join(' y ') }}. Solo un administrador de la plataforma puede completarlos.</span>
                      </div>
                    }
                    <section class="card" aria-labelledby="gen-title">
                      <div class="head">
                        @if (logo.url(); as src) {
                          <span class="ico logo" data-testid="company-logo"><img [src]="src" [alt]="'Logo de ' + org.name" /></span>
                        } @else {
                          <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" /></svg></span>
                        }
                        <div class="txt"><h2 id="gen-title">Información general</h2><p>Datos básicos de la organización registrada en LoGyCO₂.</p></div>
                        @if (canEdit()) { <button type="button" class="btn btn-secondary btn-sm edit" data-testid="edit-profile" (click)="openEdit(org, 'name')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>Editar</button> }
                      </div>
                      <dl class="rows">
                        <div><dt>Nombre</dt><dd><strong>{{ org.name }}</strong></dd></div>
                        <div><dt>Razón social <svg viewBox="0 0 24 24" aria-label="Solo la plataforma lo modifica"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" /></svg></dt><dd [class.none]="!org.legalName">{{ org.legalName ?? 'No registrada' }}</dd></div>
                        <div><dt>NIT <svg viewBox="0 0 24 24" aria-label="Solo la plataforma lo modifica"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" /></svg></dt><dd class="num" [class.none]="!org.taxId">{{ org.taxId ?? 'No registrado' }}</dd></div>
                        <div><dt>Tipo de organización</dt><dd [class.none]="org.types.length === 0"><span class="chips">@for (t of org.types; track t.code) { <span class="badge">{{ t.name }}</span> } @empty { Sin tipo asignado }</span></dd></div>
                        <div><dt>Estado</dt><dd><span class="badge" [class.badge-success]="org.isActive" [class.badge-warning]="!org.isActive">{{ org.isActive ? '✓ Activa' : 'Inactiva' }}</span></dd></div>
                        <div><dt>Fecha de registro</dt><dd>{{ org.createdAt | date: 'd MMM y' }}</dd></div>
                      </dl>
                      <p class="lock" data-testid="lock-note">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" /></svg>
                        Razón social, NIT, estado y tipos de actividad los administra la plataforma.
                      </p>
                    </section>

                    <section class="card" aria-labelledby="contact-title">
                      <div class="head">
                        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /></svg></span>
                        <div class="txt"><h2 id="contact-title">Información de contacto</h2><p>Datos de contacto de la organización.</p></div>
                        @if (canEdit()) { <button type="button" class="btn btn-secondary btn-sm edit" data-testid="edit-contact" (click)="openEdit(org, 'contact')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>Editar</button> }
                      </div>
                      <ul class="contact">
                        <li [class.none]="!org.contactPhone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>{{ org.contactPhone ?? 'Teléfono no registrado' }}</li>
                        <li [class.none]="!org.contactEmail"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3zM3 7l9 6 9-6" /></svg>{{ org.contactEmail ?? 'Correo no registrado' }}</li>
                        <li [class.none]="!location(org)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></svg>{{ location(org) ?? 'Dirección no registrada' }}</li>
                        <li [class.none]="!org.website"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>@if (org.website) { <a [href]="org.website" target="_blank" rel="noopener noreferrer">{{ org.website }} <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 15px; height: 15px"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg></a> } @else { Sitio web no registrado }</li>
                      </ul>
                    </section>
                  </div>

                  <div class="col">
                    <section class="card" aria-labelledby="act-title">
                      <div class="head">
                        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20V4M4 20h16M8 15l3-4 3 2 5-6" /></svg></span>
                        <div class="txt"><h2 id="act-title">Actividad y sector</h2><p>Clasifica tu huella de carbono y resume qué tan completo está el perfil.</p></div>
                      </div>
                      @if (org.types.length > 0) {
                        <div class="types" data-testid="types">
                          @for (t of org.types; track t.code) {
                            <div class="type"><strong>{{ t.name }}</strong><small>{{ t.code }}</small>@if (typeDescription(t.code); as d) { <p>{{ d }}</p> }</div>
                          }
                        </div>
                      } @else {
                        <div class="empty" data-testid="types"><strong>Sin tipo asignado</strong>Un administrador de la plataforma debe asignarlo.</div>
                      }
                      <div class="profile" data-testid="profile-completeness">
                        <div class="pline"><strong>Perfil de la empresa</strong><span data-testid="completeness">{{ completed() }} de {{ checklist().length }} datos completos</span></div>
                        <div class="bar" role="progressbar" aria-label="Perfil completo" [attr.aria-valuenow]="percent()" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="percent()"></i></div>
                        @if (pendingMine().length > 0) {
                          <p class="pend" data-testid="pending-mine"><b>Puedes completar:</b> {{ pendingMine().join(', ') }}.</p>
                          @if (canEdit()) { <button type="button" class="btn btn-secondary btn-sm" (click)="openEdit(org, 'contact')">Completar datos de contacto</button> }
                        }
                        @if (pendingPlatform().length > 0) { <p class="pend" data-testid="pending-platform"><b>Lo completa la plataforma:</b> {{ pendingPlatform().join(', ') }}.</p> }
                        @if (pendingMine().length === 0 && pendingPlatform().length === 0) { <p class="pend">El perfil está completo.</p> }
                      </div>
                    </section>

                    <section class="card" aria-labelledby="links-title">
                      <div class="head">
                        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg></span>
                        <div class="txt"><h2 id="links-title">Empresas vinculadas</h2><p>Clientes y proveedores con relación comercial registrada.</p></div>
                      </div>
                      <app-resource-state [status]="profile.relationships.status()" [error]="profile.relationships.error()" (retry)="profile.load()">
                        @if (profile.relationships.data(); as rows) {
                          @if (rows.length === 0) {
                            <div class="empty" data-testid="links-summary-empty"><strong>Aún no hay empresas vinculadas</strong>Aquí verás a tus clientes y proveedores.</div>
                          } @else {
                            <div class="linkbox" data-testid="links-summary">
                              @for (r of rows.slice(0, 3); track r.id) {
                                <div class="link">
                                  <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 21h18M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M9 8h2M9 12h2M9 16h2" /></svg></span>
                                  <div class="nm"><strong>{{ r.counterpart.name }}</strong><span>{{ bond(r) }}</span></div>
                                  <span class="badge" [class.badge-success]="r.isActive" [class.badge-warning]="!r.isActive">{{ r.isActive ? 'Activa' : 'Inactiva' }}</span>
                                </div>
                              }
                            </div>
                            <button type="button" class="more" (click)="tab.set('links')">Ver todas las empresas vinculadas →</button>
                          }
                        }
                      </app-resource-state>
                    </section>
                  </div>
                </div>
              }

              @case ('links') {
                <section class="card" role="tabpanel" id="panel-links" aria-labelledby="tab-links"><app-company-links /></section>
              }

              @case ('config') {
                <div class="cols" role="tabpanel" id="panel-config" aria-labelledby="tab-config">
                  <section class="card" aria-labelledby="acc-title">
                    <div class="head">
                      <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg></span>
                      <div class="txt"><h2 id="acc-title">Acceso a la empresa</h2><p>Tu rol y las reglas de administración.</p></div>
                    </div>
                    <dl class="rows">
                      <div><dt>Tu rol</dt><dd data-testid="my-role">{{ myRoles() }}</dd></div>
                      <div><dt>Estado de la empresa</dt><dd><span class="badge" [class.badge-success]="org.isActive" [class.badge-warning]="!org.isActive">{{ org.isActive ? '✓ Activa' : 'Inactiva' }}</span></dd></div>
                      <div><dt>Administradores</dt><dd>Una empresa tiene un solo administrador.</dd></div>
                    </dl>
                    @if (canUsers()) { <p style="margin: 14px 0 0"><a class="btn btn-secondary btn-sm" routerLink="/usuarios">Gestionar usuarios y accesos</a></p> }
                  </section>
                  <section class="card" aria-labelledby="who-title">
                    <div class="head">
                      <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" /></svg></span>
                      <div class="txt"><h2 id="who-title">Quién puede cambiar qué</h2><p>Para proteger la identidad de la empresa.</p></div>
                    </div>
                    <dl class="rows" data-testid="who-changes">
                      <div><dt>Nombre y contacto</dt><dd>Administrador de la empresa</dd></div>
                      <div><dt>Razón social y NIT</dt><dd>Plataforma LoGyCO₂</dd></div>
                      <div><dt>Estado y tipos de actividad</dt><dd>Plataforma LoGyCO₂</dd></div>
                      <div><dt>Empresas vinculadas</dt><dd>Administrador de la empresa</dd></div>
                    </dl>
                  </section>
                </div>
              }
            }
          }
        </app-resource-state>
      </app-org-required>
    </div>

    <dialog #editDialog class="dialog dialog-pro" aria-labelledby="edit-title">
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <header class="dp-head">
          <span class="dp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M4 21h16" /></svg></span>
          <div><h2 id="edit-title">Editar datos de mi empresa</h2><p>Nombre y datos de contacto</p></div>
        </header>
        <div class="dialog-body">
          <fieldset class="dp-group">
            <legend>Logo de la empresa</legend>
            <div class="logo-edit">
              <span class="logo-box" data-testid="logo-preview" [style.background]="logoPreview() ? '#fff' : 'hsl(' + hue(current()?.name ?? '') + ' 45% 38%)'">
                @if (logoPreview(); as src) { <img [src]="src" alt="Vista previa del logo" /> } @else { {{ initials(current()?.name ?? '') }} }
              </span>
              <div class="logo-actions">
                <div class="row-btns">
                  <label class="btn btn-secondary btn-sm" for="pf-logo">{{ logoPreview() ? 'Cambiar imagen' : 'Subir imagen' }}</label>
                  <input id="pf-logo" class="sr" type="file" accept="image/png,image/jpeg,image/webp" data-testid="logo-input" (change)="onLogoPicked($event)" />
                  @if (logoPreview()) { <button type="button" class="btn btn-secondary btn-sm" data-testid="logo-remove" (click)="removeStaged()">Quitar logo</button> }
                </div>
                @if (logoError(); as e) { <span class="field-error" role="alert" data-testid="logo-error">{{ e }}</span> } @else { <span class="hint">PNG, JPG o WebP · hasta 512 KB. Se ve mejor con fondo transparente o claro.</span> }
              </div>
            </div>
          </fieldset>
          <fieldset class="dp-group">
            <legend>Identificación</legend>
            <div class="field">
              <label for="pf-name">Nombre de la empresa</label>
              <input id="pf-name" class="input" type="text" formControlName="name" maxlength="200" [attr.aria-invalid]="invalid('name')" />
              @if (invalid('name')) { <span class="field-error">El nombre es obligatorio.</span> }
            </div>
          </fieldset>
          <fieldset class="dp-group">
            <legend>Contacto</legend>
            <div class="dp-grid">
              <div class="field">
                <label for="pf-email">Correo de contacto</label>
                <input id="pf-email" class="input" type="email" formControlName="contactEmail" maxlength="254" autocomplete="off" [attr.aria-invalid]="invalid('contactEmail')" />
                @if (invalid('contactEmail')) { <span class="field-error">Escribe un correo válido.</span> }
              </div>
              <div class="field">
                <label for="pf-phone">Teléfono</label>
                <input id="pf-phone" class="input" type="tel" formControlName="contactPhone" maxlength="30" [attr.aria-invalid]="invalid('contactPhone')" />
                @if (invalid('contactPhone')) { <span class="field-error">Solo números, espacios y + ( ) - .</span> }
              </div>
              <div class="field"><label for="pf-address">Dirección</label><input id="pf-address" class="input" type="text" formControlName="address" maxlength="250" /></div>
              <div class="field"><label for="pf-city">Ciudad</label><input id="pf-city" class="input" type="text" formControlName="city" maxlength="100" /></div>
            </div>
            <div class="field">
              <label for="pf-web">Sitio web</label>
              <input id="pf-web" class="input" type="url" formControlName="website" maxlength="200" placeholder="https://" [attr.aria-invalid]="invalid('website')" />
              @if (invalid('website')) { <span class="field-error">Debe empezar por http:// o https://</span> } @else { <span class="hint">Deja un campo vacío para borrarlo.</span> }
            </div>
          </fieldset>
          <fieldset class="dp-group" disabled>
            <legend>Identidad legal · solo lectura</legend>
            <div class="dp-grid">
              <div class="field"><label for="pf-legal">Razón social</label><input id="pf-legal" class="input" type="text" [value]="current()?.legalName ?? ''" readonly /></div>
              <div class="field"><label for="pf-tax">NIT</label><input id="pf-tax" class="input" type="text" [value]="current()?.taxId ?? ''" readonly /></div>
            </div>
            <span class="hint" data-testid="legal-lock">Estos datos los administra la plataforma: no se modifican desde aquí.</span>
          </fieldset>
        </div>
        <div class="dialog-actions">
          @if (form.dirty || logoChanged()) { <span class="dp-dirty" data-testid="edit-dirty"><i></i>Cambios sin guardar</span> }
          <button type="button" class="btn btn-secondary" (click)="closeEdit()">Cancelar</button>
          <button type="submit" class="btn btn-primary" data-testid="save-profile" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar cambios' }}</button>
        </div>
      </form>
    </dialog>
  `,
})
export class CompanyProfileComponent {
  protected readonly home = inject(HomeFacade);
  protected readonly profile = inject(CompanyProfileFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('editDialog');

  protected readonly tabs = TABS;
  protected readonly tab = signal<TabId>('general');
  protected readonly logo = inject(OrganizationLogoStore);
  protected readonly busy = signal(false);
  /** Logo elegido en el formulario, aún sin guardar (la vista previa usa una URL local). */
  private readonly stagedFile = signal<File | null>(null);
  private readonly stagedUrl = signal<string | null>(null);
  private readonly removeFlag = signal(false);
  protected readonly logoError = signal<string | null>(null);
  protected readonly logoChanged = computed(() => this.stagedFile() !== null || this.removeFlag());
  protected readonly logoPreview = computed(() => this.stagedUrl() ?? (this.removeFlag() ? null : this.logo.url()));
  protected readonly canEdit = computed(() => this.access.can('organizations:manage'));
  protected readonly canUsers = computed(() => this.access.canAny(['users:read', 'memberships:manage']));
  protected readonly current = this.home.organization.data;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    contactEmail: ['', [Validators.email, Validators.maxLength(254)]],
    contactPhone: ['', [Validators.pattern(/^$|^[0-9+()\-\s.]{5,30}$/)]],
    address: ['', [Validators.maxLength(250)]],
    city: ['', [Validators.maxLength(100)]],
    website: ['', [Validators.pattern(/^$|^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i)]],
  });

  protected readonly missing = computed(() => {
    const org = this.home.organization.data();

    return org ? [org.legalName ? '' : 'la razón social', org.taxId ? '' : 'el NIT'].filter(Boolean) : [];
  });
  protected readonly myRoles = computed(() => {
    const roles = this.context.activeMembership()?.roles ?? [];

    return roles.map((r) => roleLabel(r.code)).join(' · ') || 'Sin rol';
  });
  /** Qué datos tiene la empresa y cuáles faltan (y quién los puede completar). */
  protected readonly checklist = computed(() => {
    const org = this.home.organization.data();

    if (!org) return [];

    return [
      { label: 'Nombre', done: !!org.name, editable: true },
      { label: 'Razón social', done: !!org.legalName, editable: false },
      { label: 'NIT', done: !!org.taxId, editable: false },
      { label: 'Tipo de actividad', done: org.types.length > 0, editable: false },
      { label: 'Correo de contacto', done: !!org.contactEmail, editable: true },
      { label: 'Teléfono', done: !!org.contactPhone, editable: true },
      { label: 'Dirección', done: !!org.address, editable: true },
      { label: 'Ciudad', done: !!org.city, editable: true },
      { label: 'Sitio web', done: !!org.website, editable: true },
    ];
  });
  protected readonly completed = computed(() => this.checklist().filter((c) => c.done).length);
  protected readonly percent = computed(() => (this.checklist().length ? Math.round((this.completed() / this.checklist().length) * 100) : 0));
  /** Datos que faltan y puede completar la propia empresa. */
  protected readonly pendingMine = computed(() => this.checklist().filter((c) => !c.done && c.editable).map((c) => c.label.toLowerCase()));
  /** Datos que faltan y solo completa la plataforma. */
  protected readonly pendingPlatform = computed(() => this.checklist().filter((c) => !c.done && !c.editable).map((c) => c.label.toLowerCase()));

  constructor() {
    // Enlaces directos (p. ej. desde la campana): `?tab=links` abre «Empresas vinculadas».
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('tab') === 'links') this.tab.set('links');

    reloadOnContextChange(() => {
      this.home.load();
      this.profile.load();
      this.logo.load();
    });
  }

  protected hue(name: string): number {
    return hueOf(name);
  }

  protected initials(name: string): string {
    return initialsOf(name);
  }

  protected location(org: Organization): string | null {
    return [org.address, org.city].filter(Boolean).join(', ') || null;
  }

  protected typeDescription(code: string): string | null {
    return this.profile.types.data()?.find((t) => t.code === code)?.description ?? null;
  }

  /** Qué es la OTRA empresa para la tuya: si tú eres proveedora, la otra es tu cliente, y al revés. */
  protected bond(relationship: CommercialRelationship): string {
    return relationship.role === 'PROVIDER' ? 'Cliente' : 'Proveedor';
  }

  protected onTabKey(event: KeyboardEvent): void {
    const index = this.tabs.findIndex((t) => t.id === this.tab());
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;

    if (event.key === 'Home' || event.key === 'End') {
      this.selectTab(event.key === 'Home' ? 0 : this.tabs.length - 1, event);

      return;
    }

    if (step !== 0) this.selectTab((index + step + this.tabs.length) % this.tabs.length, event);
  }

  private selectTab(index: number, event: Event): void {
    event.preventDefault();
    this.tab.set(this.tabs[index].id);
    queueMicrotask(() => document.getElementById(`tab-${this.tabs[index].id}`)?.focus());
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];

    return control.touched && control.invalid;
  }

  protected openEdit(org: Organization, focus: EditFocus = 'name'): void {
    this.form.reset({
      name: org.name,
      contactEmail: org.contactEmail ?? '',
      contactPhone: org.contactPhone ?? '',
      address: org.address ?? '',
      city: org.city ?? '',
      website: org.website ?? '',
    });
    this.clearStaged();
    this.dialog().nativeElement.showModal();
    queueMicrotask(() => this.dialog().nativeElement.querySelector<HTMLInputElement>(focus === 'contact' ? '#pf-email' : '#pf-name')?.focus());
  }

  protected closeEdit(): void {
    this.dialog().nativeElement.close();
    this.clearStaged();
  }

  protected onLogoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    input.value = ''; // permite volver a elegir el mismo archivo
    this.logoError.set(null);

    if (!file) return;

    if (!LOGO_TYPES.includes(file.type)) {
      this.logoError.set('El logo debe ser una imagen PNG, JPG o WebP.');

      return;
    }

    if (file.size > LOGO_MAX_BYTES) {
      this.logoError.set('El logo supera el máximo de 512 KB.');

      return;
    }

    this.revokeStaged();
    this.stagedFile.set(file);
    this.stagedUrl.set(URL.createObjectURL(file));
    this.removeFlag.set(false);
  }

  protected removeStaged(): void {
    this.logoError.set(null);
    this.revokeStaged();
    this.stagedFile.set(null);
    this.removeFlag.set(this.logo.url() !== null);
  }

  private revokeStaged(): void {
    const url = this.stagedUrl();

    if (url) URL.revokeObjectURL(url);

    this.stagedUrl.set(null);
  }

  private clearStaged(): void {
    this.revokeStaged();
    this.stagedFile.set(null);
    this.removeFlag.set(false);
    this.logoError.set(null);
  }

  protected save(): void {
    const org = this.home.organization.data();

    this.form.markAllAsTouched();

    if (this.form.invalid || !org || this.busy()) return;

    const value = this.form.getRawValue();
    const next = {
      name: value.name.trim(),
      contactEmail: value.contactEmail.trim() || null,
      contactPhone: value.contactPhone.trim() || null,
      address: value.address.trim() || null,
      city: value.city.trim() || null,
      website: value.website.trim() || null,
    };
    // Solo viaja lo que cambió.
    const changes: Record<string, string | null> = {};

    (Object.keys(next) as (keyof typeof next)[]).forEach((key) => {
      if (next[key] !== (org[key as keyof Organization] ?? (key === 'name' ? '' : null))) changes[key] = next[key];
    });

    const staged = this.stagedFile();
    const logoOp = staged ? this.profile.saveLogo(staged) : this.removeFlag() ? this.profile.removeLogo() : null;
    const profileChanged = Object.keys(changes).length > 0;

    if (!profileChanged && !logoOp) {
      this.closeEdit();

      return;
    }

    // Primero los datos y después el logo: si el logo falla, lo ya guardado se conserva.
    const steps: Observable<unknown>[] = [];

    if (profileChanged) steps.push(this.profile.saveProfile(changes as OrganizationProfileChanges));

    if (logoOp) steps.push(logoOp);

    this.busy.set(true);
    this.feedback.start('Guardando datos…');
    concat(...steps, of(null))
      .pipe(last(), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.feedback.finish('Datos de la empresa actualizados');
          this.closeEdit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.feedback.close();
          this.toast.error(toAppError(error));
        },
      });
  }
}
