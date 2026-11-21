# Feature `platform` (Consola global de plataforma, `/plataforma`)

Leyenda: [V] verificado en código; [?] no comprobado.

Código: `src/app/features/platform/`. Archivos (líneas medidas con `wc -l`, sin specs):
- Rutas y navegación: `platform.routes.ts` (45), `platform-nav.ts` (44), `platform-shell.component.ts` (181).
- Estado: `platform.facades.ts` (408, 6 facades).
- Utilidades: `platform-labels.ts` (169), `platform-evolution.ts` (97).
- Componentes de pantalla: `platform-dashboard` (454) y `platform-evolution-card` (165), `platform-organizations` (647), `platform-organization-detail` (666), `platform-users` (398), `platform-user-detail` (168), `platform-super-admins` (404), `platform-super-admin-detail` (168), `platform-rbac` (374), `platform-rbac-matrix` (131), `platform-rbac-tabs` (26), `platform-audit` (439), `platform-status` (282), `org-type-chip` (25).
- Specs (15 archivos, 220 `it`): `platform-routing`, `platform-shell.component`, `platform-dashboard.component`, `platform-evolution`, `platform-organizations.component`, `platform-organization-admin`, `platform-users.component`, `platform-user-detail.component`, `platform-super-admins.component`, `platform-super-admin-detail.component`, `platform-rbac.component`, `platform-rbac-matrix.component`, `platform-audit.component`, `platform-status.component`, `platform-labels`.

## 1. Propósito y flujo [V]
Consola de administración global para el rol global `SUPER_ADMIN`, separada del espacio de empresa (`ShellComponent`). Aterriza en `/plataforma/resumen`. Desde el menú se administran empresas, usuarios, superadministradores, roles, auditoría y estado de servicios; «Herramientas complementarias» enlaza a Intelligence (`features/intelligence`, ver [intelligence.md](intelligence.md)). Los módulos de descarbonización sin backend (vehículos, operaciones, cargas, calidad, metodologías, reportes) renderizan `ComingSoonComponent`.

## 2. Rutas [V]
`app.routes.ts`: `path: 'plataforma'`, `canMatch: [platformMatch]`, `canActivate: [authGuard, platformGuard]`, `loadComponent` `PlatformShellComponent`, `children: PLATFORM_ROUTES`.
- `platformMatch` / `platformGuard`: `core/guards/platform.guards.ts` (ver [core.md](../core.md)). Cualquier fallo -> denegado.
- Hijos (`platform.routes.ts`, todos lazy, `data.breadcrumb`):

| Path (`/plataforma/...`) | Componente | Breadcrumb |
|---|---|---|
| `''` | redirige a `resumen` | |
| `resumen` | `PlatformDashboardComponent` | Resumen |
| `organizaciones` / `organizaciones/:id` | `PlatformOrganizationsComponent` / `PlatformOrganizationDetailComponent` | Empresas / Detalle |
| `usuarios` / `usuarios/:id` | `PlatformUsersComponent` / `PlatformUserDetailComponent` | Usuarios / Detalle |
| `metricas` | redirige a `resumen` | |
| `configuracion` | `SettingsComponent` (`features/settings`, `data.platform: true`) | Mi cuenta |
| `estado` | `PlatformStatusComponent` | Estado de la plataforma |
| `superadministradores` / `.../:id` | `PlatformSuperAdminsComponent` / `PlatformSuperAdminDetailComponent` | Superadministradores / Detalle |
| `roles` / `roles/matriz` | `PlatformRbacComponent` / `PlatformRbacMatrixComponent` | Roles y accesos / Matriz técnica |
| `vehiculos`, `operaciones`, `cargas`, `calidad`, `metodologias`, `reportes` | `ComingSoonComponent` (con `title` y `description` en `data`) | Vehículos / Operaciones de transporte / Cargas masivas / Centro de calidad / Metodologías y factores / Reportes globales |
| `auditoria` | `PlatformAuditComponent` | Actividad y auditoría |
| `intelligence` (`energia`, `costos`, `fuentes`) | `IntelligenceComponent` (secciones `energy` y `costs`) / `IntelligenceAdminComponent`; `''`, `sectorial`, `sostenibilidad` y `**` redirigen a `energia` | LoGyCO₂ Intelligence / Mercado energético / Costos de transporte / Administración de fuentes |
| `**` | redirige a `resumen` | |

Los seis módulos «Próximamente» no tienen ítem de menú (no figuran en `PLATFORM_NAV`). Los `:id` llegan como `input.required<string>()` (router con `withComponentInputBinding`).

Query params consumidos [V]:
- `organizaciones`: `vista` (o el antiguo `filtro`; valores `todas|activas|inactivas|sin-admin|con-invitaciones|sin-tipo|eliminadas`), `q`, `tipo`, `orden`, `dir`, `pagina`, `tam`.
- `usuarios`: `tab=invitaciones`, `q`, `rol`, `empresa`, `cuenta`, `pagina`, `tam`.
- `auditoria`: `q`, `tipo`, `origen`, `periodo`, `desde`, `hasta`, `empresa`, `tam`.
- Todos se leen una sola vez al construir el componente (`snapshot`) y se reescriben con `Location.replaceState` al cambiar los criterios (sin entradas de historial extra).

## 3. Navegación: `PLATFORM_NAV` (`platform-nav.ts`) [V]
`PlatformNavItem { label, path, icon, soon?, exact? }`; `PlatformNavGroup { title, items, collapsible?, icon?, parent?, pinned? }`. Grupos reales:
1. **Panel general**: Resumen.
2. **Administración** (plegable): Empresas, Usuarios, Superadministradores.
3. **Herramientas complementarias** (plegable): Referencias de combustibles (`/plataforma/intelligence/energia`), Indicadores de costos (`/plataforma/intelligence/costos`).
4. **Seguridad** (plegable): Roles y accesos (`exact`), Matriz técnica.
5. **Sistema** (`pinned`, al pie): Actividad y auditoría, Estado de la plataforma.
Ningún ítem lleva hoy `soon: true`.

## 4. Componentes
Todos standalone y OnPush, con template y estilos inline. Contenedores que inyectan facades; reutilizan `shared/ui` (`ResourceStateComponent`, `StatusBadgeComponent`, `PagerComponent`, `CursorPagerComponent`, `OrgLogoComponent`, `LogoComponent`), `shared/layouts` (`BreadcrumbsComponent`, `ActionsBellComponent`, `UserMenuComponent`) y `shared/ui/charts` (`TrendChartComponent`, `DonutChartComponent`).

### 4.1 `PlatformShellComponent` (`app-platform-shell`) [V]
- Sin inputs/outputs. Inyecta `Router`, `SessionStore`, `PlatformDashboardFacade`, `DOCUMENT`.
- Signals: `collapsed`, `mobileOpen`, `folded` (grupos plegados), `url`. `hasOrganizations` (usuario con membresías), `pending` (= `dash.pendingActions`), `alerts` (= `dash.actionsRequired`), `isHome`.
- Constructor: carga métricas y atención si están `idle`; precarga la primera página de empresas y de usuarios (`PlatformOrganizationsFacade.prefetch()`, `PlatformUsersFacade.prefetch()`); suscribe `NavigationEnd` (cierra el menú móvil y despliega el grupo al que se entra).
- Plantilla: skip-link `#main-content`, barra lateral con `app-logo`, etiqueta «Superadmin», navegación `PLATFORM_NAV`, botón contraer y texto fijo «v1.0.0 (DEV)»; barra superior con hamburguesa, migas (`app-breadcrumbs`, ocultas en el resumen), enlace «Ir al espacio de empresa» (`data-testid="to-organization"`, solo con membresías), `app-actions-bell` y `app-user-menu` (`settingsLink="/plataforma/configuracion"`).

### 4.2 `PlatformDashboardComponent` (`app-platform-dashboard`) y `PlatformEvolutionCardComponent` (`app-platform-evolution-card`) [V]
- Dashboard: sin inputs/outputs; inyecta `PlatformDashboardFacade`, `SessionStore`, `IntelligenceFacade`; el constructor llama `dash.load()` e `intel.loadSummary()`.
- Selector de período (`#period`: últimos 7/30/90 días o «Personalizado» con rango, validado a máximo un año) que cambia `dash.range` y recarga tendencias.
- KPI (`data-testid="admin-cards"`): Empresas (con variación del período), Activas, Inactivas, Sin administrador activo, Usuarios (con variación) y Superadministradores (barra de cupo con reservas); enlazan a `organizaciones?filtro=...`, `usuarios` y `superadministradores`.
- Tarjetas: `app-platform-evolution-card`, «Empresas por tipo» (`app-donut-chart`), «Acciones pendientes» (`dash.actionsRequired` y «En seguimiento» con `dash.actionsFollowUp`; ancla `#acciones`), «Actividad reciente» (4 eventos, enlace a auditoría) y «Precios de combustibles» (`app-fuel-price-cards`).
- Evolución: `PlatformEvolutionCardComponent` (sin inputs) muestra altas por mes de Empresas o Usuarios (acumulado, usando el total actual) con navegación año a año (hasta 5 años atrás), independiente del selector de período; carga con `dash.loadEvolution`. La lógica pura está en `platform-evolution.ts` (`toYearData`, `yearRange`, `buildEvolution`, `MONTH_LABELS`, `MONTH_NAMES`).

### 4.3 Empresas [V]
**`PlatformOrganizationsComponent`** (`app-platform-organizations`):
- Inyecta `PlatformOrganizationsFacade`, `PlatformUsersFacade` (`people`), `PlatformDashboardFacade`, `OnboardingFacade`, `ToastService`, `ActionFeedbackService`, `Router`, `ActivatedRoute`, `Location`.
- Paginación, búsqueda (espera de 300 ms), filtros (`quick`, `typeCode`) y orden (`sort`: `name|created_at|status`, `order`) se resuelven en el servidor: un `effect` pide una página con `facade.loadPage`. Tamaños de página con `PagerComponent`, guardado en `localStorage` (`logyco2.platform.organizations.pageSize`).
- Indicadores superiores (`chips`) salen de `GET /platform/metrics` (`dash.admin`): Todas, Activas, Inactivas, Sin administrador activo, Con invitaciones pendientes, Sin tipo, Eliminadas.
- Tabla: avatar, `OrgTypeChipComponent`, estado (incluye «Eliminada»), fila desplegable «Equipo» (`people.team(orgId)`, primeras `TEAM_PREVIEW_SIZE = 10` personas, enlace a `usuarios?empresa=<id>`).
- «Nueva empresa»: formulario `nonNullable` (`name` obligatorio máx. 255, `legalName`, `taxId`, `adminFullName`, `adminEmail`, tipos con al menos uno) que llama `OnboardingFacade.onboardOrganization`; muestra «Empresa creada» con `app-onboarding-status` y reenvío de invitación (`OnboardingFacade.resend`).

**`PlatformOrganizationDetailComponent`** (`app-platform-organization-detail`):
- Input `id` (requerido). Inyecta `PlatformOrganizationsFacade`, `PlatformUsersFacade`, `OnboardingFacade`, `ConfirmService`, `ToastService`, `ActionFeedbackService`, `Router`.
- Pestañas (`summary` «Información general», `members` «Administrador y equipo», `relations` «Relaciones comerciales», `activity` «Actividad»).
- Información general: datos, editar (diálogo con `name`, `legalName`, `taxId` y tipos), activar/desactivar con confirmación, eliminar (borrado lógico) o, si ya está eliminada, restaurar o eliminar definitivamente; los diálogos de borrado piden escribir el nombre de la empresa tras ver `deletionPreview` (`confirmDelete` -> `facade.delete` o `facade.purge`).
- Administrador y equipo: una empresa tiene un solo administrador; «Asignar administrador» llama `OnboardingFacade.onboardMember` con `roleCode: 'ORG_ADMIN'`; equipo e invitaciones se derivan de `users.orgPeople` (personas de la empresa, filtradas en servidor) y `users.invitations`.
- Un `effect` carga detalle, relaciones, actividad y tipos al cambiar `id`.

### 4.4 Usuarios [V]
**`PlatformUsersComponent`** (`app-platform-users`): inyecta `PlatformUsersFacade`, `PlatformOrganizationsFacade` (`orgs`), `Router`, `ActivatedRoute`, `Location`, `ConfirmService`, `ToastService`, `ActionFeedbackService`.
- Dos pestañas: «Usuarios» y «Invitaciones».
- Usuarios: página del servidor (`facade.loadPage`) con filtros `search`, `account` (todas/activas/inactivas), `role` y `companyId` (etiquetas quitables), siempre con `personType: 'company'` y `hasGlobalRole: false` (los superadministradores tienen su sección). `PagerComponent`.
- Invitaciones: tabla con revocación (`facade.revokeInvitation`, solo `PENDING`) y diálogo «Nueva invitación» (`organizationId`, `email`, `roleCode` entre `TEAM_ROLES`; el código se muestra una sola vez).
- Constructor: `facade.loadInvitations()` y `orgs.load()` (todas las empresas para el selector).

**`PlatformUserDetailComponent`** (`app-platform-user-detail`): input `id`; tarjetas «Identidad» y «Membresía». El estado se rotula igual en Identidad, en la tabla de membresías y en la lista (`memberStatus`: Activo, Pendiente, Suspendido, Revocado). El «Estado» de Identidad sale de `personStatus` (`platform-labels.ts`, el mismo criterio que la lista): cuenta inactiva → Inactivo; membresía vigente → su estado; solo revocadas → Revocado. Cada membresía tiene un menú de tres puntos (posición fija) con sus acciones según el estado (`PENDING`: Aprobar/Rechazar; `ACTIVE`: Suspender/Revocar; `SUSPENDED`: Reactivar/Revocar; `REVOKED`: Anular revocación y Eliminar), con confirmación, `facade.changeMembershipStatus` y `facade.removeMembership` (`DELETE` de la membresía revocada; la cuenta se conserva).

### 4.5 Superadministradores [V]
**`PlatformSuperAdminsComponent`** (`app-platform-super-admins`): inyecta `PlatformSuperAdminsFacade`, `ConfirmService`, `ToastService`, `ActionFeedbackService`, `AuthFacade`, `Router`. Exporta `LIMIT_MESSAGE`. Tarjeta de cupos (`slots`: en uso/reservado/libre), alertas (`limit-reached`, `pending-note`, `only-me`), tabla de miembros con «Revocar», tabla de invitaciones y diálogo «Incorporar superadministrador» (`fullName`, `email`, `expiresInDays` 7 por defecto, casilla `confirm` obligatoria; el código se muestra una sola vez).

**`PlatformSuperAdminDetailComponent`** (`app-platform-super-admin-detail`): input `id`; «Información», «Invitación asociada», «Actividad»; «Revocar rol global» con confirmación (mensaje distinto si es uno mismo; tras revocarse a sí mismo refresca el usuario y navega a `/resumen`).

### 4.6 Roles y accesos [V]
- `PlatformRbacComponent` (`app-platform-rbac`): tarjetas de los perfiles funcionales (`SUPER_ADMIN` seleccionado al inicio) del catálogo `GET /rbac/catalog`; panel con capacidades, límites y las primeras `PANEL_PEOPLE = 3` personas del perfil (`facade.loadAssignments`), con enlace a `Usuarios` o `Superadministradores`.
- `PlatformRbacMatrixComponent` (`app-platform-rbac-matrix`): matriz técnica roles x permisos.
- `PlatformRbacTabsComponent` (`app-rbac-tabs`): pestañas de navegación entre las dos rutas (`/plataforma/roles` y `/plataforma/roles/matriz`).

### 4.7 Auditoría: `PlatformAuditComponent` (`app-platform-audit`) [V]
- Inyecta `PlatformActivityFacade`, `ActivatedRoute`, `Location`, `DOCUMENT`. Sin inputs/outputs.
- Paginación por **cursor**: `CursorPagerComponent` (Anterior/Siguiente, 25/50/100 filas, `localStorage` `logyco2.platform.audit.pageSize`). El componente guarda una pila de cursores (`cursors`) y solo la página visible; cualquier cambio de filtro o de tamaño vuelve a la primera página y descarta el total conocido (`knownTotal`).
- Filtros en el servidor: búsqueda (espera de 350 ms), tipo de acción (`AuditCategory`: Empresas, Accesos de personas, Invitaciones, Superadministradores, Relaciones comerciales), origen (`AuditChannel`: Consola web, Operador), período (7, 30, 90 días, todo el historial o rango de fechas) y empresa (`?empresa=<id>`). El total llega con la primera página (se muestra como «10.000+» si está acotado).
- Panel de detalle (`aside` modal accesible, `data-testid="audit-detail"`): se abre al elegir una fila, pide `facade.loadEvent(id)` y muestra cuándo, quién, sobre qué, empresa, origen, código de la acción, identificador e «Información adicional» con los metadatos permitidos (etiquetas en `METADATA_LABELS`); devuelve el foco al cerrar.

### 4.8 Estado: `PlatformStatusComponent` (`app-platform-status`) [V]
Tabla de servicios agrupados (Aplicación: `api`, `db`; Identidad corporativa: `sso`, `directory`; Procesamiento: `imports`), resumen global, botón de verificación (`dash.checkServices()`), sección «Actualización de datos de referencia» (`dash.operations`, `GET /platform/operations`) y «Cómo se verifica cada servicio». Se refresca cada 60 s (`REFRESH_MS`).

### 4.9 `OrgTypeChipComponent` (`app-org-type-chip`) [V]
Input `type` (`{ code, name }`, requerido); icono de caja para `SHIPPER`, de camión para el resto. Lo usan la lista y el detalle de empresas.

## 5. Facades y utilidades (`platform.facades.ts`) [V]
Todas `providedIn: 'root'`; estado en `ScopedResource` registrado en `ContextResetRegistry`. No dependen de la empresa activa.
- `PlatformOrganizationsFacade`: `all`, `list`, `detail`, `deleted`, `types`, `relationships`, `activity`; `load`, `loadPage` (mantiene los datos si repite la misma petición), `prefetch`, `loadDeleted`, `loadDetail`, `loadTypes`, `loadRelationships`, `loadActivity`, `update`, `deletionPreview`, `delete`, `restore`, `purge`, `setActive`, `setTypes`.
- `PlatformUsersFacade`: `all`, `list`, `detail`, `invitations`, `orgPeople`; `load`, `loadOrganization`, `team(orgId)`, `loadTeam`, `loadPage`, `prefetch`, `loadDetail`, `loadInvitations`, `changeMembershipStatus`, `createInvitation`, `revokeInvitation`. Exporta `TEAM_PREVIEW_SIZE`.
- `PlatformDashboardFacade`: `admin`, `trends`, `attention`, `activity`, `services`, `operations`, `yearly`, `range`; `actionItems`, `actionsRequired`, `actionsFollowUp`, `pendingActions` (computed); `load`, `loadAttention`, `loadMetrics`, `loadTrends`, `loadEvolution`, `setRange`, `loadOperations`, `checkServices`. Exporta `PendingAction`.
- `PlatformSuperAdminsFacade`: `overview`, `detail`; `load`, `loadDetail`, `invite`, `revokeInvitation`, `revoke`.
- `PlatformRbacFacade`: `catalog`, `assignments`; `load`, `loadAssignments(code)`. Exporta `PANEL_PEOPLE`.
- `PlatformActivityFacade`: `list` (página de auditoría), `detail`; `loadPage(request, filter)`, `loadEvent(id)`, `closeEvent()`.
- `platform-labels.ts`: `PERSON_STATUS_LABELS`, `SERVICE_LABELS`, `activityText(item)`, `activityLine(item)`, `relativeTime`, tipos `ActivityText`, `ActivityIcon`, `ActivityLine`. Cubre acciones `organization.*` (create, update, activate, deactivate, set_types, logo_update, logo_remove, profile_update, delete, restore, purge), `invitation.*`, `membership.*`, `global_role.*`, `super_admin.*`, `user.update`, `organization_link.*`, `external_counterpart.*` y `audit.retention_purge`.

## 6. Endpoints [V]
Detalle completo en [../domain-infrastructure.md](../domain-infrastructure.md), sección 6. Resumen por pantalla:
- Resumen: `GET /platform/metrics`, `/platform/metrics/trends`, `/platform/attention`, `/platform/activity`, y los de Intelligence.
- Empresas: `GET /organizations` (paginado), `GET /organizations/{id}`, `GET /organization-types`, `PATCH /organizations/{id}`, `PATCH .../status`, `PUT .../types`, `GET .../relationships`, `GET .../deletion-preview`, `POST .../delete`, `POST .../restore`, `POST .../purge`, `POST /onboarding/organizations`, `POST /onboarding/members`, `POST /onboarding/invitations/{id}/resend`.
- Usuarios: `GET /users`, `GET /users/{id}`, `GET /users/invitations`, `POST /users/invitations`, `POST /users/invitations/{id}/revoke`, `PATCH /organizations/{org}/memberships/{id}`.
- Superadministradores: `/platform/super-admins` (GET, `/{userId}`, `/invitations`, revocaciones).
- Roles: `GET /rbac/catalog`, `GET /rbac/roles/{code}/assignments`.
- Auditoría: `GET /platform/audit`, `GET /platform/audit/{id}`.
- Estado: `GET /health/live`, `GET /health` (raíz del backend), `GET /platform/services`, `GET /platform/operations`.

## 7. Permisos [V]
Toda la consola exige rol GLOBAL `SUPER_ADMIN` (`platformMatch` + `platformGuard`). Dentro de la consola la UI no vuelve a comprobar permisos finos (salvo `PlatformRbacComponent`, que usa `AccessPolicy.canAny(['memberships:manage'])`); el backend autoriza cada operación.

## 8. Errores y estados [V]
`ResourceStateComponent` en las secciones con carga (cargando, error con reintento, vacío). Las mutaciones usan `busy`/`saving`, `ActionFeedbackService` y `toast.error(toAppError(e))`. Los códigos de invitación solo se muestran en un diálogo tras crearse.

## 9. Hallazgos de calidad
| Sev. | Hallazgo | Ubicación |
|---|---|---|
| Media | Código sin uso: `PlatformUsersFacade.all` (solo se refresca en segundo plano). | `platform.facades.ts` |
| Media | Algunas pantallas aún cargan todas las páginas en cliente (`fetchAllPages`): `orgs.all` en `PlatformUsersComponent` (selector de empresa), `users.orgPeople` e `invitations` en el detalle de empresa. | `platform.facades.ts`, `platform-users.component.ts:254` |
| Media | Componentes grandes con template y estilos inline (ver líneas arriba). | varios |
| Media | Los criterios por query param solo se leen al construir (`snapshot`): navegar a la misma pantalla con otros parámetros no los reaplica. | `platform-organizations.component.ts`, `platform-users.component.ts`, `platform-audit.component.ts` |
| Baja | Barra de cupo del resumen divide por `m.superAdmins.maxActive` sin proteger el cero. | `platform-dashboard.component.ts` (KPI Superadministradores) |
| Baja | Inconsistencia de fecha: el resumen usa `toISOString()` (UTC) para `today`, la tarjeta de evolución usa `localToday()` (hora local). | `platform-dashboard.component.ts`, `platform-evolution-card.component.ts` |
| Baja | `$any($event.target)` en los inputs de fecha del rango personalizado. | `platform-dashboard.component.ts` |
| Baja | Texto fijo `v1.0.0 (DEV)` en el menú lateral; el estado `collapsed` no persiste. | `platform-shell.component.ts` |
| Baja | Pestañas con `role="tab"` en el detalle de empresa y en usuarios sin `tabpanel` ni navegación por flechas. | `platform-organization-detail.component.ts`, `platform-users.component.ts` |
| Baja | Duplicación del diálogo de código de invitación y del mapa de acciones de membresía (también en `users`). | `platform-users`, `platform-super-admins`, `platform-user-detail`, `features/users` |

## 10. Cómo extender
- **Nueva pantalla de consola**: `platform-<x>.component.ts` (OnPush, inyectar una facade y cargarla en el constructor), ruta en `platform.routes.ts` con `data.breadcrumb` e ítem en `PLATFORM_NAV`.
- **Módulo sin backend**: sin puerto, facade ni pantalla; la ruta en `platform.routes.ts` carga `ComingSoonComponent` con `data: { breadcrumb, title, description }`.
- **Conectar un backend real**: puerto en `domain/repositories`, adaptador HTTP, binding en `infrastructure/providers.ts` (ver [../architecture.md](../architecture.md)), facade con `registry.track(new ScopedResource<...>())` y reemplazar la ruta `ComingSoonComponent`.
