import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { DEFAULT_TEAM_ROLE, INVITABLE_ROLES, ManagedUser, TEAM_ROLES, UserListFilter } from '../../domain/models/users';
import { INVITATION_LABELS, roleLabel } from '../../shared/ui/labels';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { OrgLogoComponent } from '../../shared/ui/org-logo.component';
import { DIRECTORY_STYLES } from '../../shared/ui/directory.styles';
import { PAGE_SIZES, PagerComponent } from '../../shared/ui/pager.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { PlatformOrganizationsFacade, PlatformUsersFacade } from './platform.facades';

type Tab = 'users' | 'invitations';
const SIZE_KEY = 'logyco2.platform.users.pageSize';
const SEARCH_DEBOUNCE_MS = 300;
const ACCOUNTS = ['all', 'active', 'inactive'] as const;
type Account = (typeof ACCOUNTS)[number];

function storedSize(): number {
  try {
    const size = Number(localStorage.getItem(SIZE_KEY));
    return PAGE_SIZES.includes(size) ? size : 25;
  } catch {
    return 25;
  }
}

@Component({
  selector: 'app-platform-users',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, OrgLogoComponent, PagerComponent, ResourceStateComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    DIRECTORY_STYLES,
    `
      :host { display: block; min-width: 0; }
      .page { min-width: 0; }
      .dt table { width: 100%; min-width: 1080px; table-layout: fixed; border-collapse: separate; border-spacing: 0; }
      .dt .c-mail { width: 250px; } .dt .c-org { width: 280px; } .dt .c-role { width: 200px; } .dt .c-acct { width: 120px; } .dt .c-go { width: 44px; }
      .dt td.c-mail { color: var(--c-mute2); font-size: 0.8rem; overflow-wrap: anywhere; }
      .role-line { display: flex; align-items: center; justify-content: center; min-height: 36px; font-size: 0.78rem; font-weight: 550; color: var(--c-text2); }
      .org-cell { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 36px; min-width: 0; }
      .org-logo { display: grid; place-items: center; width: 30px; height: 30px; flex: none; overflow: hidden; border-radius: 8px; background: var(--c-ok-soft); border: 1px solid var(--c-primary-200); color: var(--c-accent); font-size: 0.64rem; font-weight: 700; }
      .org-logo:has(img) { background: var(--c-sf); padding: 2px; }
      .org-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-head); font-size: 0.82rem; font-weight: 700; }
      .toolbar .type-filter { flex-basis: 168px; }
      .role-tag { display: inline-flex; align-items: center; gap: 6px; padding: 5px 6px 5px 12px; border-radius: 999px; background: var(--c-ok-soft); color: var(--c-accent); font-size: 0.78rem; font-weight: 650; }
      .role-tag button { display: grid; place-items: center; width: 20px; height: 20px; border: 0; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-accent); font-size: 0.95rem; line-height: 1; cursor: pointer; }
      .role-tag button:focus-visible { outline: 3px solid var(--c-secondary-soft); }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="head"><span class="head-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icons.users" /></svg></span><div>
          <h1>Usuarios</h1>
          <p>Personas con acceso a la plataforma, la empresa a la que pertenecen y sus invitaciones.</p>
        </div></div>
      </header>

      <div class="tabs" role="tablist" aria-label="Usuarios">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'users'" (click)="tab.set('users')">Usuarios</button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'invitations'" (click)="tab.set('invitations')">Invitaciones</button>
      </div>

      @switch (tab()) {
        @case ('users') {
          <div class="directory">
            <form class="toolbar" role="search" (submit)="$event.preventDefault()">
              <div class="search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.search" /></svg>
                <input id="u-q" class="input" type="search" aria-label="Buscar usuario por nombre, correo o empresa" placeholder="Buscar por nombre, correo o empresa" autocomplete="off" [value]="search()" (input)="onSearch($event)" />
                @if (search()) { <button type="button" class="x" aria-label="Borrar búsqueda" data-testid="clear-search" (click)="clearSearch()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button> }
              </div>
              <select id="u-acc" class="input type-filter" aria-label="Filtrar por estado" [value]="account()" (change)="setAccount($event)"><option value="all">Cualquier estado</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
              @if (role()) { <span class="role-tag" data-testid="role-tag">Rol: {{ roleTitle(role()) }}<button type="button" aria-label="Quitar el filtro de rol" data-testid="clear-role" (click)="clearRole()">×</button></span> }
              @if (companyId()) { <span class="role-tag" data-testid="company-tag">Empresa: {{ companyName() }}<button type="button" aria-label="Quitar el filtro de empresa" data-testid="clear-company" (click)="clearCompany()">×</button></span> }
              @if (hasFilters()) { <button type="button" class="btn btn-ghost btn-sm" data-testid="clear-filters" (click)="clearFilters()">Limpiar filtros</button> }
              <span class="result" role="status" [attr.title]="total() + (total() === 1 ? ' persona' : ' personas')"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.users" /></svg><b>{{ total() }}</b><span class="sr-only"> {{ total() === 1 ? 'persona' : 'personas' }}</span></span>
            </form>

            @if (facade.list.status() === 'error' && !facade.list.data()) {
              <div class="alert alert-danger" role="alert"><div>{{ facade.list.error()?.message ?? 'No se pudo cargar el listado.' }}</div><button type="button" class="btn btn-secondary btn-sm" (click)="reload()">Reintentar</button></div>
            } @else {
              <section class="dt" tabindex="0" aria-label="Listado de usuarios" [class.busy]="facade.list.status() === 'loading' && !!facade.list.data()" [attr.aria-busy]="facade.list.status() === 'loading'">
                <table>
                  <caption class="sr-only">Usuarios</caption>
                  <colgroup><col class="c-name" /><col class="c-mail" /><col class="c-org" /><col class="c-role" /><col class="c-acct" /><col class="c-go" /></colgroup>
                  <thead><tr><th scope="col"><button type="button" disabled>Usuario</button></th><th scope="col"><span>Correo electrónico</span></th><th scope="col"><span>Empresa a la que pertenece</span></th><th scope="col"><span>Tipo de usuario</span></th><th scope="col"><span>Estado</span></th><th scope="col"><span class="sr-only">Abrir</span></th></tr></thead>
                  <tbody>
                    @if (!facade.list.data()) {
                      @for (n of skeletonRows; track n) { <tr class="skel" aria-hidden="true"><td><div class="who"><i class="sa"></i><i style="width: 60%"></i></div></td><td><i style="width: 70%"></i></td><td><i style="width: 70%"></i></td><td><i style="width: 60%"></i></td><td><i style="width: 60%"></i></td><td></td></tr> }
                    } @else {
                      @for (u of items(); track u.id) {
                        <tr (click)="open(u.id, $event)">
                          <th scope="row">
                            <div class="who">
                              <span class="avatar" [class.off]="!u.isActive" [style.--h]="hueOf(u.fullName)" aria-hidden="true">{{ initialsOf(u.fullName) }}</span>
                              <div class="nm"><a [routerLink]="['/plataforma/usuarios', u.id]" [title]="u.fullName">{{ u.fullName }}</a></div>
                            </div>
                          </th>
                          <td class="c-mail">{{ u.email }}</td>
                          <td class="c-org">@for (m of places(u).shown; track m.id) { <div class="org-cell"><span class="org-logo" aria-hidden="true"><app-org-logo [id]="m.id" [version]="m.logoVersion">{{ initialsOf(m.organization) }}</app-org-logo></span><span class="org-name" [title]="m.organization">{{ m.organization }}</span></div> } @empty { <span class="muted">—</span> }@if (places(u).more) { <span class="muted small">+{{ places(u).more }}</span> }</td>
                          <td class="c-role">@for (m of places(u).shown; track m.id) { <span class="role-line">{{ m.role }}</span> } @empty { <span class="role-line">{{ globalRole(u) }}</span> }</td>
                          <td class="c-acct"><span class="pill" [class.on]="u.isActive" [class.off]="!u.isActive">{{ u.isActive ? 'Activo' : 'Inactivo' }}</span></td>
                          <td><svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg></td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
                @if (facade.list.data() && total() === 0) {
                  <div class="empty-state" data-testid="empty-state">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="hasFilters() ? icons.search : icons.users" /></svg>
                    @if (hasFilters()) {
                      <h2>Sin resultados</h2><p class="muted">Ninguna persona coincide con los criterios.</p>
                      <button type="button" class="btn btn-secondary btn-sm" (click)="clearFilters()">Limpiar filtros</button>
                    } @else {
                      <h2>Aún no hay personas</h2><p class="muted">Aparecerán aquí cuando se registren o acepten una invitación.</p>
                    }
                  </div>
                }
              </section>
              <app-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" (pageChange)="goToPage($event)" (sizeChange)="setPageSize($event)" />
            }
          </div>
        }
        @case ('invitations') {
          <div class="row between"><p class="muted small">La invitación no concede acceso: la persona la acepta autenticada y se aprueba su membresía.</p><button type="button" class="btn btn-primary" data-testid="new-invitation" (click)="openCreate()">Nueva invitación</button></div>
          <app-resource-state [status]="facade.invitations.status()" [error]="facade.invitations.error()" [empty]="invitations().length === 0" emptyTitle="Sin invitaciones" emptyMessage="Aún no hay invitaciones." (retry)="facade.loadInvitations()">
            <div class="table-wrap">
              <table class="table">
                <caption class="sr-only">Invitaciones</caption>
                <thead><tr><th scope="col">Invitado</th><th scope="col">Empresa</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Expira</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
                <tbody>
                  @for (i of invitations(); track i.id) {
                    <tr>
                      <td>{{ i.inviteeName ?? '—' }}<br /><span class="muted small">{{ i.email }}</span></td><td>{{ i.organization.name }}</td><td>{{ roleName(i.roleCode) }}</td>
                      <td><app-status-badge [label]="invitationLabels[i.status]" /></td><td>{{ i.expiresAt | date: 'mediumDate' }}</td>
                      <td class="right">@if (i.status === 'PENDING') { <button type="button" class="btn btn-danger btn-sm" (click)="revoke(i.id, i.email)">Revocar</button> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </app-resource-state>
        }
      }
    </div>

    <dialog #createDialog class="dialog" aria-labelledby="inv-title">
      <form [formGroup]="form" (ngSubmit)="create()" novalidate>
        <div class="dialog-body">
          <h2 id="inv-title">Nueva invitación</h2>
          <div class="field"><label for="i-org">Empresa</label>
            <select id="i-org" class="input" formControlName="organizationId"><option value="" disabled>Selecciona…</option>@for (o of orgOptions(); track o.id) { <option [value]="o.id">{{ o.name }}</option> }</select></div>
          <div class="field"><label for="i-mail">Correo</label><input id="i-mail" class="input" type="email" formControlName="email" />
            @if (form.controls.email.touched && form.controls.email.invalid) { <span class="field-error">Ingresa un correo válido.</span> }</div>
          <div class="field"><label for="i-role">Rol</label><select id="i-role" class="input" formControlName="roleCode">@for (r of roleOptions; track r.code) { <option [value]="r.code">{{ r.label }}</option> }</select></div>
        </div>
        <div class="dialog-actions"><button type="button" class="btn btn-secondary" (click)="closeCreate()">Cancelar</button><button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Creando…' : 'Crear invitación' }}</button></div>
      </form>
    </dialog>
    <dialog #codeDialog class="dialog" aria-labelledby="code-title" (close)="createdCode.set(null)">
      <div class="dialog-body"><h2 id="code-title">Código de invitación</h2>
        <div class="alert alert-warning" role="note">Se muestra <strong>una sola vez</strong>. Compártelo por un canal seguro.</div>
        <code data-testid="invitation-code" style="word-break: break-all; padding: 10px; background: var(--c-bg); border-radius: 6px; display: block">{{ createdCode() }}</code></div>
      <div class="dialog-actions"><button type="button" class="btn btn-primary" (click)="closeCode()">Cerrar</button></div>
    </dialog>
  `,
})
export class PlatformUsersComponent {
  protected readonly facade = inject(PlatformUsersFacade);
  protected readonly orgs = inject(PlatformOrganizationsFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  private readonly codeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('codeDialog');

  protected readonly tab = signal<Tab>('users');
  protected readonly search = signal('');
  private readonly appliedSearch = signal('');
  protected readonly account = signal<Account>('all');
  /** Rol por empresa (llega desde «Roles y permisos» → «Ver personas»); se muestra como una etiqueta que se puede quitar. */
  protected readonly role = signal('');
  /** Empresa elegida (`?empresa=<id>`, p. ej. desde «Ver todas las personas» de Empresas); el servidor filtra con `organization_id`. */
  protected readonly companyId = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(storedSize());
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly hueOf = hueOf;
  protected readonly initialsOf = initialsOf;
  protected readonly icons = {
    users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  } as const;
  protected readonly saving = signal(false);
  protected readonly createdCode = signal<string | null>(null);
  protected readonly roleOptions = TEAM_ROLES;
  protected readonly invitationLabels = INVITATION_LABELS;

  protected readonly filter = computed<UserListFilter>(() => ({
    search: this.appliedSearch(),
    isActive: this.account() === 'all' ? undefined : this.account() === 'active',
    role: this.role(),
    organizationId: this.companyId() || undefined,
    // Esta vista es solo de personas que pertenecen a una empresa: los superadministradores tienen su propia sección.
    personType: 'company',
    hasGlobalRole: false,
  }));
  /** Una invitación revocada deja de existir para quien administra: desaparece de la lista. */
  protected readonly invitations = computed(() => (this.facade.invitations.data()?.items ?? []).filter((i) => i.status !== 'REVOKED'));
  protected readonly items = computed(() => this.facade.list.data()?.items ?? []);
  protected readonly total = computed(() => this.facade.list.data()?.total ?? 0);
  protected readonly hasFilters = computed(() => !!(this.appliedSearch() || this.account() !== 'all' || !!this.role() || !!this.companyId()));
  protected readonly orgOptions = computed(() => (this.orgs.all.data()?.items ?? []).map((o) => ({ id: o.id, name: o.name })));
  protected readonly form = inject(FormBuilder).nonNullable.group({
    organizationId: ['', Validators.required],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
    roleCode: [DEFAULT_TEAM_ROLE, Validators.required],
  });

  constructor() {
    // Enlaces del resumen: `?tab=pendientes` / `?tab=invitaciones`.
    const params = this.route.snapshot.queryParamMap;
    const requested = params.get('tab');
    if (requested === 'invitaciones') this.tab.set('invitations');
    this.restore(params);

    // Una sola fuente de verdad: cualquier cambio de criterio, página, tamaño o pestaña pide UNA página al servidor.
    effect(() => {
      const filter = this.filter();
      const request = { page: this.page(), pageSize: this.pageSize() };
      this.tab();

      untracked(() => {
        this.facade.loadPage(request, filter);
        this.syncUrl();
      });
    });
    this.facade.loadInvitations();
    this.orgs.load();
    this.destroyRef.onDestroy(() => this.searchTimer !== null && clearTimeout(this.searchTimer));
  }

  protected reload(): void {
    this.facade.loadPage({ page: this.page(), pageSize: this.pageSize() }, this.filter());
  }
  protected setAccount(e: Event): void { this.account.set((e.target as HTMLSelectElement).value as Account); this.page.set(1); }
  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.search.set(value);

    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applySearch(value), SEARCH_DEBOUNCE_MS);
  }
  protected clearSearch(): void { this.search.set(''); this.applySearch(''); }
  protected clearFilters(): void {
    this.search.set('');
    this.appliedSearch.set('');
    this.account.set('all');
    this.role.set('');
    this.companyId.set('');
    this.page.set(1);
  }
  protected clearRole(): void { this.role.set(''); this.page.set(1); }
  protected clearCompany(): void { this.companyId.set(''); this.page.set(1); }
  /** Nombre de la empresa filtrada, tomado de las propias filas (la URL solo trae el id). */
  protected readonly companyName = computed(() => {
    const id = this.companyId();

    for (const user of this.facade.list.data()?.items ?? []) {
      const found = user.memberships.find((m) => m.organization.id === id);

      if (found) return found.organization.name;
    }

    return 'seleccionada';
  });
  protected roleTitle(code: string): string { return roleLabel(code); }
  private applySearch(value: string): void {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;

    if (value.trim() === this.appliedSearch()) return;

    this.appliedSearch.set(value.trim());
    this.page.set(1);
  }
  protected goToPage(page: number): void { this.page.set(page); }
  protected setPageSize(size: number): void {
    try { localStorage.setItem(SIZE_KEY, String(size)); } catch { /* la preferencia es opcional */ }

    this.pageSize.set(size);
    this.page.set(1);
  }

  /** La fila completa abre el detalle (el enlace del nombre sigue siendo el control accesible). */
  protected open(id: string, event: Event): void {
    if ((event.target as Element).closest('a, button')) return;

    void this.router.navigate(['/plataforma/usuarios', id]);
  }

  private restore(params: ParamMap): void {
    const page = Number(params.get('pagina'));
    const size = Number(params.get('tam'));
    const account = params.get('cuenta') as Account;
    const search = params.get('q') ?? '';

    if (Number.isInteger(page) && page > 1) this.page.set(page);
    if (PAGE_SIZES.includes(size)) this.pageSize.set(size);
    if (ACCOUNTS.includes(account)) this.account.set(account);
    const role = params.get('rol') ?? '';
    if (INVITABLE_ROLES.some((r) => r.code === role)) this.role.set(role);
    const company = params.get('empresa') ?? '';
    if (/^[0-9a-f-]{36}$/i.test(company)) this.companyId.set(company);
    this.search.set(search);
    this.appliedSearch.set(search.trim());
  }

  /** Refleja los criterios en la URL (conservando la pestaña) sin crear una entrada de historial por cada cambio. */
  private syncUrl(): void {
    const tab = this.tab();
    const entries: [string, string][] = [
      ['tab', tab === 'invitations' ? 'invitaciones' : ''],
      ['q', this.appliedSearch()],
      ['rol', this.role()],
      ['empresa', this.companyId()],
      ['cuenta', this.account() === 'all' ? '' : this.account()],
      ['pagina', this.page() > 1 ? String(this.page()) : ''],
      ['tam', this.pageSize() === 25 ? '' : String(this.pageSize())],
    ];
    const query = entries.filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

    this.location.replaceState(this.location.path().split('?')[0], query);
  }

  /**
   * Empresa y tipo de usuario (rol) por membresía no revocada, en el mismo orden para alinear ambas columnas.
   * Si lo buscado coincide con el nombre de alguna de sus empresas, solo se muestran esas; se ven dos y el resto como «+N».
   */
  protected places(user: ManagedUser): { shown: { id: string; organization: string; logoVersion: string | null; role: string }[]; more: number } {
    const term = this.appliedSearch().toLowerCase();
    const wanted = this.companyId();
    const current = user.memberships.filter((m) => m.status !== 'REVOKED' && (!wanted || m.organization.id === wanted));
    const matching = term ? current.filter((m) => m.organization.name.toLowerCase().includes(term)) : [];
    const all = (matching.length ? matching : current).map((m) => ({ id: m.organization.id, organization: m.organization.name, logoVersion: m.organization.logoVersion ?? null, role: m.roles.map(roleLabel).join(', ') || 'Sin rol' }));

    return { shown: all.slice(0, 2), more: Math.max(0, all.length - 2) };
  }
  /** Quien no tiene membresías puede ser superadministrador (rol global). */
  protected globalRole(user: ManagedUser): string {
    return user.globalRoles.map(roleLabel).join(', ') || '—';
  }
  protected roleName(code: string): string { return roleLabel(code); }

  protected async revoke(id: string, email: string): Promise<void> {
    const accepted = await this.confirm.confirm({ title: 'Revocar invitación', message: `¿Revocar la invitación pendiente de ${email}?`, confirmLabel: 'Revocar', danger: true });
    if (!accepted) return;
    this.feedback.start('Revocando invitación…');
    this.facade.revokeInvitation(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.feedback.finish('Invitación revocada'),
      error: (error: unknown) => { this.feedback.close(); this.toast.error(toAppError(error)); },
    });
  }

  protected openCreate(): void {
    this.form.reset({ organizationId: '', email: '', roleCode: DEFAULT_TEAM_ROLE });
    this.createDialog().nativeElement.showModal();
  }
  protected closeCreate(): void { this.createDialog().nativeElement.close(); }
  protected closeCode(): void { this.codeDialog().nativeElement.close(); }

  protected create(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.feedback.start('Creando invitación…');
    this.facade.createInvitation({ organizationId: v.organizationId, email: v.email.trim(), roleCode: v.roleCode }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (created) => { this.saving.set(false); this.feedback.finish('Invitación creada'); this.closeCreate(); this.createdCode.set(created.code); this.codeDialog().nativeElement.showModal(); },
      error: (error: unknown) => { this.saving.set(false); this.feedback.close(); this.toast.error(toAppError(error)); },
    });
  }
}
