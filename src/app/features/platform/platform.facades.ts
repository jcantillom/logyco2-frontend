import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, of, tap } from 'rxjs';
import { fetchAllPages, AllPages } from '../../core/http/fetch-all-pages';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { ScopedResource } from '../../core/org/scoped-resource';
import { CommercialRelationship, Organization, OrganizationChanges, OrganizationDeleted, OrganizationDeletionPlan, OrganizationListFilter, OrganizationTypeInfo } from '../../domain/models/organization';
import { Page, PageRequest } from '../../domain/models/pagination';
import {
  ActivityItem, AuditEventDetail, AuditFilter, AuditPage, AuditPageRequest, CreatedSuperAdminInvitation, NewSuperAdminInvitation, PlatformAttention, PlatformOperations, PlatformTrends, RbacCatalog,
  RoleAssignment, SuperAdminDetail, SuperAdminInvitation, SuperAdminOverview, SuperAdminRevocation, TrendRange,
} from '../../domain/models/platform-admin';
import { PlatformAdminMetrics, ServiceHealth } from '../../domain/models/platform';
import { CreatedInvitation, Invitation, ManagedUser, MembershipRecord, MembershipTargetStatus, NewInvitation, UserListFilter } from '../../domain/models/users';
import {
  InvitationsRepository, MembershipsRepository, OrganizationAdminRepository, OrganizationsRepository, UsersRepository,
} from '../../domain/repositories/identity.repositories';
import { YearData, toYearData, yearRange } from './platform-evolution';
import { InsightsRepository, RbacRepository, SuperAdminsRepository } from '../../domain/repositories/platform-admin.repositories';
import { AdminMetricsRepository, HealthRepository } from '../../domain/repositories/platform.repositories';

/**
 * Las fachadas de la consola NO dependen de la empresa activa: la consola
 * global y el espacio de una empresa son contextos separados. Todo su
 * estado se descarta al cerrar sesión.
 */

/** Empresas (API real; el alcance —global o por membresía— lo decide el backend según el rol). */
@Injectable({ providedIn: 'root' })
export class PlatformOrganizationsFacade {
  private readonly repository = inject(OrganizationsRepository);
  private readonly admin = inject(OrganizationAdminRepository);
  private readonly insights = inject(InsightsRepository);
  private readonly registry = inject(ContextResetRegistry);

  private listKey = '';

  readonly all = this.registry.track(new ScopedResource<AllPages<Organization>>());
  /** Página actual de la lista de empresas (paginación, búsqueda, filtros y orden en el servidor). */
  readonly list = this.registry.track(new ScopedResource<Page<Organization>>());
  readonly detail = this.registry.track(new ScopedResource<Organization>());
  /** Empresas eliminadas (borrado lógico): solo la plataforma las ve. */
  readonly deleted = this.registry.track(new ScopedResource<AllPages<Organization>>());
  readonly types = this.registry.track(new ScopedResource<readonly OrganizationTypeInfo[]>());
  readonly relationships = this.registry.track(new ScopedResource<readonly CommercialRelationship[]>());
  readonly activity = this.registry.track(new ScopedResource<readonly ActivityItem[]>());

  load(): void {
    this.all.load(fetchAllPages((request) => this.repository.list(request)));
  }
  /**
   * Pide UNA página al servidor. Si es la MISMA petición que la última ya cargada (p. ej. al volver a la pantalla o tras la
   * precarga), la lista se queda como está y se refresca en segundo plano, sin atenuarse; si cambia página, tamaño o criterio,
   * pasa por «cargando» (la tabla se atenúa mientras llegan datos distintos).
   */
  loadPage(request: PageRequest, filter: OrganizationListFilter): void {
    const key = JSON.stringify([request, filter]);
    this.list.load(this.repository.list(request, filter), { keepData: key === this.listKey && this.list.status() === 'ready' });
    this.listKey = key;
  }
  /** Calienta la primera página con los criterios por defecto de la lista, para que el primer clic ya la encuentre cargada. */
  prefetch(): void {
    if (this.list.status() !== 'idle') return;

    this.loadPage({ page: 1, pageSize: 25 }, { deleted: false, search: '', isActive: undefined, typeCode: '', focus: undefined, sort: 'name', order: 'asc' });
  }
  loadDeleted(): void {
    this.deleted.load(fetchAllPages((request) => this.repository.list(request, { deleted: true })), { keepData: true });
  }
  loadDetail(id: string): void {
    this.detail.load(this.repository.get(id));
  }
  loadTypes(): void {
    this.types.load(this.admin.listTypes());
  }
  loadRelationships(id: string): void {
    this.relationships.load(this.admin.relationships(id));
  }
  loadActivity(id: string): void {
    this.activity.load(this.insights.activity({ limit: 20, organizationId: id }));
  }

  /** Tras cada mutación el backend devuelve la empresa final: se refleja el detalle y se recarga el listado. */
  update(id: string, changes: OrganizationChanges): Observable<Organization> {
    return this.admin.update(id, changes).pipe(tap((org) => this.refresh(org)));
  }
  deletionPreview(id: string): Observable<OrganizationDeletionPlan> {
    return this.admin.deletionPreview(id);
  }
  delete(id: string, confirmName: string): Observable<OrganizationDeleted> {
    return this.admin.delete(id, confirmName).pipe(tap(() => { this.load(); this.loadDeleted(); }));
  }
  restore(id: string): Observable<Organization> {
    return this.admin.restore(id).pipe(tap((org) => { this.refresh(org); this.loadDeleted(); }));
  }
  purge(id: string, confirmName: string): Observable<OrganizationDeleted> {
    return this.admin.purge(id, confirmName).pipe(tap(() => this.loadDeleted()));
  }
  setActive(id: string, isActive: boolean): Observable<Organization> {
    return this.admin.setActive(id, isActive).pipe(tap((org) => this.refresh(org)));
  }
  setTypes(id: string, typeCodes: readonly string[]): Observable<Organization> {
    return this.admin.setTypes(id, typeCodes).pipe(tap((org) => this.refresh(org)));
  }

  private refresh(org: Organization): void {
    this.detail.data.set(org);
    this.load();
    this.loadActivity(org.id);
  }
}

/** Cuántas personas se muestran al desplegar una empresa en el listado; el resto está en «Usuarios». */
export const TEAM_PREVIEW_SIZE = 10;

/** Usuarios, membresías e invitaciones (API real). */
@Injectable({ providedIn: 'root' })
export class PlatformUsersFacade {
  private readonly users = inject(UsersRepository);
  private readonly invitationsRepo = inject(InvitationsRepository);
  private readonly memberships = inject(MembershipsRepository);
  private readonly registry = inject(ContextResetRegistry);
  private lastPage: { request: PageRequest; filter: UserListFilter } | null = null;
  private listKey = '';

  readonly all = this.registry.track(new ScopedResource<AllPages<ManagedUser>>());
  /** Página actual de personas (paginación y filtros en el servidor). */
  readonly list = this.registry.track(new ScopedResource<Page<ManagedUser>>());
  readonly detail = this.registry.track(new ScopedResource<ManagedUser>());
  readonly invitations = this.registry.track(new ScopedResource<AllPages<Invitation>>());
  /** Todas las personas de UNA empresa (el servidor filtra con `organization_id`); alimenta el detalle de la empresa. */
  readonly orgPeople = this.registry.track(new ScopedResource<AllPages<ManagedUser>>());
  private lastOrganization: string | null = null;
  /** Vista previa del equipo por empresa (primera página): un recurso por empresa, que se pide al desplegar su fila. */
  private readonly teams = new Map<string, ScopedResource<Page<ManagedUser>>>();

  load(): void {
    this.all.load(fetchAllPages((request) => this.users.list(request)));
  }
  /** Personas de la empresa, pedidas con el filtro de servidor (no se descarga a toda la plataforma para filtrar en el cliente). */
  loadOrganization(organizationId: string): void {
    this.lastOrganization = organizationId;
    this.orgPeople.load(fetchAllPages((request) => this.users.list(request, { organizationId })));
  }
  team(organizationId: string): ScopedResource<Page<ManagedUser>> {
    let resource = this.teams.get(organizationId);

    if (!resource) {
      resource = this.registry.track(new ScopedResource<Page<ManagedUser>>());
      this.teams.set(organizationId, resource);
    }

    return resource;
  }
  loadTeam(organizationId: string): void {
    this.team(organizationId).load(this.users.list({ page: 1, pageSize: TEAM_PREVIEW_SIZE }, { organizationId }), { keepData: true });
  }
  /** Igual que en empresas: la misma petición ya cargada se refresca en segundo plano sin atenuar la tabla. */
  loadPage(request: PageRequest, filter: UserListFilter): void {
    this.lastPage = { request, filter };
    const key = JSON.stringify([request, filter]);
    this.list.load(this.users.list(request, filter), { keepData: key === this.listKey && this.list.status() === 'ready' });
    this.listKey = key;
  }
  /** Igual que en empresas: primera página con los criterios por defecto de la lista de personas. */
  prefetch(): void {
    if (this.list.status() !== 'idle') return;

    this.loadPage({ page: 1, pageSize: 25 }, { search: '', isActive: undefined, role: '', personType: 'company', hasGlobalRole: false });
  }
  loadDetail(id: string): void {
    this.detail.load(this.users.get(id));
  }
  loadInvitations(): void {
    this.invitations.load(fetchAllPages((request: PageRequest) => this.invitationsRepo.list(request)));
  }
  changeMembershipStatus(organizationId: string, membershipId: string, status: MembershipTargetStatus): Observable<MembershipRecord> {
    return this.memberships.changeStatus(organizationId, membershipId, status).pipe(tap(() => this.refresh()));
  }
  createInvitation(invitation: NewInvitation): Observable<CreatedInvitation> {
    return this.invitationsRepo.create(invitation).pipe(tap(() => this.loadInvitations()));
  }
  revokeInvitation(id: string): Observable<Invitation> {
    return this.invitationsRepo.revoke(id).pipe(tap(() => this.loadInvitations()));
  }

  /** Tras cambiar una membresía se actualizan el listado completo y la página que se está viendo. */
  private refresh(): void {
    this.load();
    if (this.lastPage) this.loadPage(this.lastPage.request, this.lastPage.filter);
    if (this.lastOrganization) this.loadOrganization(this.lastOrganization);
    this.teams.forEach((resource, organizationId) => resource.data() && this.loadTeam(organizationId));
  }
}

/** Una fila de «Acciones pendientes»: qué pasa, cuántas y dónde se resuelve. */
export interface PendingAction {
  readonly key: 'memberships' | 'expiring' | 'needs-admin' | 'without-type' | 'quota' | 'waiting-admin' | 'inactive';
  readonly label: string;
  readonly hint: string;
  readonly count: number;
  /** Nombres de ejemplo (p. ej. las primeras empresas afectadas). */
  readonly detail?: string;
  /** Texto del contador en lugar del número (p. ej. «4/5»). */
  readonly badge?: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly tone: 'action' | 'info';
}

/** El dashboard refresca en segundo plano si ya tiene datos (sin parpadeo de «cargando» al volver a él). */
const KEEP = { keepData: true } as const;

/** Dashboard ejecutivo: métricas acumuladas, tendencias del período, acciones pendientes y actividad (todo real). */
@Injectable({ providedIn: 'root' })
export class PlatformDashboardFacade {
  private readonly health = inject(HealthRepository);
  private readonly adminMetrics = inject(AdminMetricsRepository);
  private readonly insights = inject(InsightsRepository);
  private readonly registry = inject(ContextResetRegistry);

  readonly admin = this.registry.track(new ScopedResource<PlatformAdminMetrics>());
  readonly trends = this.registry.track(new ScopedResource<PlatformTrends>());
  readonly attention = this.registry.track(new ScopedResource<PlatformAttention>());
  readonly activity = this.registry.track(new ScopedResource<readonly ActivityItem[]>());
  readonly services = this.registry.track(new ScopedResource<readonly ServiceHealth[]>());
  /** Funcionamiento de los trabajos de actualización de datos de referencia (reales); se consulta desde «Estado de la plataforma». */
  readonly operations = this.registry.track(new ScopedResource<PlatformOperations>());
  /** Altas por mes de los años consultados para la evolución (el año elegido y los posteriores hasta hoy). */
  readonly yearly = this.registry.track(new ScopedResource<ReadonlyMap<number, YearData>>());
  private readonly yearCache = new Map<number, YearData>();
  readonly range = signal<TrendRange>({ kind: 'days', days: 30 });
  /**
   * Fuente única de «acciones pendientes» (tarjeta del Resumen y campana del encabezado), ordenada por urgencia.
   * `action`: alguien tiene que hacer algo; `info`: solo seguimiento (no se cuenta como pendiente).
   */
  readonly actionItems = computed<readonly PendingAction[]>(() => {
    const m = this.admin.data();
    const a = this.attention.data();
    const items: PendingAction[] = [];

    if (m && m.memberships.pending > 0) {
      items.push({ key: 'memberships', label: 'Membresías por aprobar', hint: 'Solicitudes de acceso que esperan tu aprobación.', count: m.memberships.pending, path: '/plataforma/usuarios', query: { tab: 'pendientes' }, tone: 'action' });
    }

    if (a && a.invitationsExpiring.count > 0) {
      items.push({ key: 'expiring', label: 'Invitaciones por vencer', hint: `Vencen en los próximos ${a.expiringWithinDays} días: reenvíalas para no perder el acceso.`, count: a.invitationsExpiring.count, path: '/plataforma/usuarios', query: { tab: 'invitaciones' }, tone: 'action' });
    }

    // Sin administrador activo y SIN invitación de administrador vigente: nadie la va a aceptar, hay que volver a invitar.
    const needsInvite = a ? a.organizationsWithoutAdmin.count - a.organizationsWaitingAdmin : (m?.organizations.withoutActiveAdmin ?? 0);

    if (needsInvite > 0) {
      const names = (a?.organizationsWithoutAdmin.items ?? []).filter((o) => !o.hasPendingInvitation).map((o) => o.name);
      const shown = names.slice(0, 2).join(', ');

      items.push({
        key: 'needs-admin', label: 'Empresas sin administrador activo', hint: 'Su invitación venció o se revocó, o su administrador ya no está activo: vuelve a invitar a uno.',
        detail: shown ? (needsInvite > 2 ? `${shown} y ${needsInvite - 2} más` : shown) : undefined,
        count: needsInvite, path: '/plataforma/organizaciones', query: { filtro: 'sin-admin' }, tone: 'action',
      });
    }

    if (m && m.organizations.withoutType > 0) {
      items.push({ key: 'without-type', label: 'Empresas sin tipo asignado', hint: 'Asígnales un tipo para clasificarlas.', count: m.organizations.withoutType, path: '/plataforma/organizaciones', query: { filtro: 'sin-tipo' }, tone: 'action' });
    }

    if (a?.superAdminNearLimit) {
      items.push({
        key: 'quota', label: 'Cupo de superadministradores', hint: a.superAdmins.available === 0 ? 'Límite alcanzado: no se pueden incorporar más.' : 'Queda un solo cupo.',
        count: 1, badge: `${a.superAdmins.active}/${a.superAdmins.maxActive}`, path: '/plataforma/superadministradores', tone: 'action',
      });
    }

    if (a && a.organizationsWaitingAdmin > 0) {
      items.push({ key: 'waiting-admin', label: 'Empresas esperando a su administrador', hint: 'Ya tienen una invitación vigente: solo falta que la acepten.', count: a.organizationsWaitingAdmin, path: '/plataforma/organizaciones', query: { filtro: 'sin-admin' }, tone: 'info' });
    }

    if (a && a.inactiveOrganizations.count > 0) {
      items.push({ key: 'inactive', label: 'Empresas inactivas', hint: 'Desactivadas: sus personas no pueden operar.', count: a.inactiveOrganizations.count, path: '/plataforma/organizaciones', query: { filtro: 'inactivas' }, tone: 'info' });
    }

    return items;
  });
  /** Lo que requiere que alguien haga algo. */
  readonly actionsRequired = computed(() => this.actionItems().filter((item) => item.tone === 'action'));
  /** Solo seguimiento: no cuenta como pendiente. */
  readonly actionsFollowUp = computed(() => this.actionItems().filter((item) => item.tone === 'info'));
  /** Total de acciones que requieren intervención (insignia del encabezado y de la campana). */
  readonly pendingActions = computed(() => this.actionsRequired().reduce((sum, item) => sum + item.count, 0));

  load(): void {
    this.admin.load(this.adminMetrics.get(), KEEP);
    this.attention.load(this.insights.attention(), KEEP);
    this.activity.load(this.insights.activity({ limit: 8 }), KEEP);
    this.loadTrends();
  }
  loadAttention(): void {
    this.attention.load(this.insights.attention(), KEEP);
  }
  /** Solo las métricas acumuladas (para vistas que no necesitan el resto del dashboard). */
  loadMetrics(): void {
    this.admin.load(this.adminMetrics.get(), KEEP);
  }
  loadTrends(): void {
    this.trends.load(this.insights.trends(this.range()), KEEP);
  }
  /**
   * Evolución mensual de un año. El acumulado exige también los años posteriores hasta hoy, así que se piden
   * todos; los años ya consultados se reutilizan al navegar; `force` vuelve a pedirlos (recarga o cambio de modo).
   */
  loadEvolution(year: number, today: string, force = false): void {
    const currentYear = Number(today.slice(0, 4));
    const wanted = Array.from({ length: currentYear - year + 1 }, (_, i) => year + i);
    const missing = wanted.filter((y) => force || !this.yearCache.has(y));
    const requests = missing.map((y) =>
      this.insights.trends({ kind: 'custom', ...yearRange(y, today) }).pipe(map((trends) => toYearData(y, trends))),
    );

    this.yearly.load(
      (requests.length ? forkJoin(requests) : of([] as YearData[])).pipe(
        tap((fresh) => fresh.forEach((data) => this.yearCache.set(data.year, data))),
        map(() => new Map(wanted.map((y) => [y, this.yearCache.get(y)!] as const))),
      ),
      KEEP,
    );
  }
  setRange(range: TrendRange): void {
    this.range.set(range);
    this.loadTrends();
  }
  loadOperations(days = 30): void {
    this.operations.load(this.insights.operations(days), KEEP);
  }
  checkServices(): void {
    this.services.load(this.health.check());
  }
}

/** Superadministradores: cupos, invitaciones y revocación (todas las reglas las aplica el backend). */
@Injectable({ providedIn: 'root' })
export class PlatformSuperAdminsFacade {
  private readonly repository = inject(SuperAdminsRepository);
  private readonly registry = inject(ContextResetRegistry);

  readonly overview = this.registry.track(new ScopedResource<SuperAdminOverview>());
  readonly detail = this.registry.track(new ScopedResource<SuperAdminDetail>());

  load(): void {
    this.overview.load(this.repository.overview());
  }
  loadDetail(userId: string): void {
    this.detail.load(this.repository.detail(userId));
  }
  invite(invitation: NewSuperAdminInvitation): Observable<CreatedSuperAdminInvitation> {
    return this.repository.invite(invitation).pipe(tap(() => this.load()));
  }
  revokeInvitation(id: string): Observable<SuperAdminInvitation> {
    return this.repository.revokeInvitation(id).pipe(tap(() => this.load()));
  }
  revoke(userId: string): Observable<SuperAdminRevocation> {
    return this.repository.revoke(userId).pipe(tap(() => this.load()));
  }
}

/** Catálogo RBAC (solo lectura) y quién tiene cada rol. */
/** Cuántas personas muestra el panel de un perfil. */
export const PANEL_PEOPLE = 3;

@Injectable({ providedIn: 'root' })
export class PlatformRbacFacade {
  private readonly repository = inject(RbacRepository);
  private readonly registry = inject(ContextResetRegistry);

  readonly catalog = this.registry.track(new ScopedResource<RbacCatalog>());
  /** Primeras personas del perfil elegido (el panel muestra pocas; el listado completo está en Usuarios). */
  readonly assignments = this.registry.track(new ScopedResource<Page<RoleAssignment>>());

  load(): void {
    this.catalog.load(this.repository.catalog());
  }
  loadAssignments(code: string | null): void {
    if (code) this.assignments.load(this.repository.assignments(code, { page: 1, pageSize: PANEL_PEOPLE }));
    else this.assignments.reset();
  }
}

/** Actividad administrativa (auditoría persistente). */
@Injectable({ providedIn: 'root' })
export class PlatformActivityFacade {
  private readonly insights = inject(InsightsRepository);
  private readonly registry = inject(ContextResetRegistry);
  /** Una página de auditoría por cursor: los filtros y la paginación se resuelven en el servidor; solo se guarda la página visible. */
  readonly list = this.registry.track(new ScopedResource<AuditPage>());
  /** Detalle del evento abierto (metadatos permitidos): se pide solo cuando se abre. */
  readonly detail = this.registry.track(new ScopedResource<AuditEventDetail>());

  loadPage(request: AuditPageRequest, filter: AuditFilter): void {
    this.list.load(this.insights.audit(request, filter));
  }

  loadEvent(id: string): void {
    this.detail.load(this.insights.auditEvent(id));
  }

  closeEvent(): void {
    this.detail.reset();
  }
}
