# `src/app/shared/` — UI reutilizable

> **[V]** verificado leyendo el código · **[?]** no comprobado. Visión general: [architecture.md](architecture.md). Servicios usados: [core.md](core.md).
> Todos los componentes son standalone, `ChangeDetectionStrategy.OnPush`, con template inline y selector `app-*`. Estilos globales (clases `.btn`, `.card`, `.badge`, `.alert`, `.stack`, `.row`, `.muted`, `.small`, `.sr-only`, `.skeleton`, `dialog.dialog`, `.table-wrap`, `dl.facts`, `.tabs`, `.progress`) están en `src/styles.scss` y son parte del contrato visual de estos componentes.

## Resumen

`shared/` agrupa cuatro cosas: **layouts** (shell de la app de empresa, barra lateral compartida, migas, campana de acciones pendientes, menú de usuario, enlace a la consola), **ui** (componentes presentacionales y hosts globales: estado de recurso, paginadores, cabecera de página, badge de estado, «org requerida», logos de la marca y de las empresas, directiva de cierre por fondo, toasts, diálogo de confirmación y aviso de acciones; etiquetas de enumeraciones; estilos compartidos), **charts** propios en SVG sin dependencias (`ui/charts`: tendencia y dona) y utilidades (`ui/avatar.ts`). Los componentes de `ui/` son presentacionales (`input()`/`output()`); los de `layouts/` y los hosts inyectan servicios de `core` o de `features`. Accesibilidad cuidada en general (skip-link, `aria-live`, tabla alternativa en gráficos, `prefers-reduced-motion`), con huecos puntuales (ver hallazgos).

## Tabla de contenidos

1. [Layouts](#1-layouts)
2. [UI](#2-ui)
3. [Gráficos](#3-gráficos)
4. [Quién usa qué](#4-quién-usa-qué)
5. [Specs](#5-specs)
6. [Hallazgos de calidad](#6-hallazgos-de-calidad)
7. [Cómo extender](#7-cómo-extender)

---

## 1. Layouts

### `layouts/shell.component.ts` — `ShellComponent` · `app-shell`
Contenedor de la app de empresa (ruta `''`, eager). Sin inputs/outputs. Inyecta `AccessPolicy`, `Router`, `ToastService`, `OrganizationContext`, `HomeFacade`, `OrganizationLogoStore` y `DOCUMENT`. Estado: `collapsed`, `mobileOpen`, `wide` (se activa con `data: { wide: true }` de la ruta más profunda), `companyOpen` (selector de empresa del encabezado, se cierra con Esc o clic fuera), `multiple` (más de una membresía), `roleText`, y `groups` (computed: `NAV_GROUPS` con los ítems de `NAV_ITEMS` que cumple `access.canAny(item.requires)`; se omiten los grupos vacíos). El constructor fija `--dlg-left`, y `reloadOnContextChange` llama `home.load()` y `logo.load()`. Se suscribe a `NavigationEnd` (`takeUntilDestroyed`) para cerrar el menú móvil y el selector, y recalcular `wide`. Plantilla: skip-link «Saltar al contenido principal» -> `<main id="main-content" tabindex="-1">`; sidebar con `app-logo` (variante `mark` si colapsado, `compact` si no), `<nav aria-label="Navegación principal">` con `routerLinkActive` (los ítems con `soon: true` llevan la clase `soon-item` y `aria-label` «<etiqueta> · Próximamente»); encabezado con `app-breadcrumbs` (`rootLabel="Mi empresa"`, `rootLink="/resumen"`), `app-context-switch`, `app-actions-bell` (`home.actions()` y `home.pending()`) y `app-user-menu`; avisos `data-testid="access-lost"` (`activeAccessLost`) y `no-orgs` (`!hasOrganizations`); `<router-outlet />`. Breakpoint móvil 900 px. Estilos del menú en `layouts/sidebar.styles.ts` (`SIDEBAR_STYLES`, compartidos con `platform-shell`, tokens `--sb-*`).

### `layouts/nav-items.ts`
`interface NavItem { label; path; icon (path SVG viewBox 24); requires: readonly PermissionCode[] (vacío = siempre); soon: boolean; group: NavGroupId }`. `soon: true` = la capacidad aún no tiene backend (su ruta muestra `ComingSoonComponent`). `NAV_GROUPS` (Inicio, Datos operativos, Huella de carbono, Resultados, Administración) y `NAV_ITEMS` (10 ítems): Resumen `/resumen`; con `soon: true`: Cargar información `/cargas` (`imports:create`), Calidad de datos `/calidad`, Operaciones logísticas `/operaciones`, Mis emisiones `/emisiones`, Análisis de emisiones `/analisis`, Plan de reducción `/reduccion` (todos `indicators:read`), Reportes `/reportes` (`reports:read`); con backend: Usuarios y accesos `/usuarios` (`users:read`|`memberships:manage`), Datos de mi empresa `/mi-empresa` (`organizations:read`). `HELP_ITEM` (`/ayuda`, pie del menú) no depende de permisos. `/conciliacion` y `/evidencias` no tienen ítem de menú (solo ruta «Próximamente»). Solo lo usa `ShellComponent`.

### `layouts/breadcrumbs.component.ts` — `BreadcrumbsComponent` · `app-breadcrumbs`
- Inputs: `rootLabel = input('LoGyCO₂')`, `rootLink = input('/resumen')`. Sin outputs.
- Inyecta `Router`. Señal `crumbs` actualizada en cada `NavigationEnd` (+`startWith(null)`).
- Exporta `interface Crumb { label; url }` y `buildCrumbs(root: ActivatedRouteSnapshot): Crumb[]`: recorre `firstChild`, acumula URL y toma `data['breadcrumb']`; evita duplicar la miga cuando una ruta hija con path vacío hereda `data`.
- A11y: `<nav aria-label="Ruta de navegación">`, última miga con `aria-current="page"`.
- Uso: `ShellComponent` y `platform-shell` (`<app-breadcrumbs rootLabel="Plataforma" rootLink="/plataforma" />`, [V] en `platform-shell`).

### `layouts/context-switch.component.ts` — `ContextSwitchComponent` · `app-context-switch`
Sin inputs. Inyecta `PlatformAccess`. Muestra `<a routerLink="/plataforma" data-testid="to-platform">Consola de plataforma</a>` solo si `isSuperAdmin()`. Es una comodidad (no autoriza; lo hace `platformGuard`).

### `layouts/actions-bell.component.ts` — `ActionsBellComponent` · `app-actions-bell`
Inputs: `alerts: readonly BellAlert[]` (requerido) y `pending = input(0)` (contador de la insignia). Sin outputs. Exporta `interface BellAlert { label; hint; count; path; query? }`. Campana con panel desplegable que lista solo lo que requiere acción y enlaza al lugar donde se resuelve (`routerLink` con `queryParams`); se cierra con Esc, clic fuera o `NavigationEnd`. Usado por `ShellComponent` (alertas de `HomeFacade.actions`) y `PlatformShellComponent` (`PlatformDashboardFacade.actionsRequired`).

### `layouts/sidebar.styles.ts`
`SIDEBAR_STYLES`: CSS del menú lateral compartido por `ShellComponent` y `PlatformShellComponent`.

### `layouts/user-menu.component.ts` — `UserMenuComponent` · `app-user-menu`
Inputs: `identity = input(false)` (muestra nombre y rol junto al avatar) y `settingsLink = input('/configuracion')` (destino de «Configuración»; la consola usa `/plataforma/configuracion`). Inyecta `SessionStore`, `AuthFacade`, `OrganizationContext`, `ElementRef`. Señales: `open`, computed `primaryRole`, `initials`, `roles` (usa `roleLabel`). `@HostListener('document:keydown.escape')` y `('document:click', ['$event'])` cierran el menú. Acciones: enlace a `settingsLink()` y botón "Cerrar sesión" (`data-testid="logout"` → `auth.logout()`). A11y: `aria-haspopup`, `aria-expanded`, `role="menu"`/`menuitem`.

## 2. UI

| Componente (archivo) | Selector | Inputs | Outputs | Inyecta | Uso típico |
|---|---|---|---|---|---|
| `ResourceStateComponent` (`ui/resource-state.component.ts`) | `app-resource-state` | `status: ResourceStatus` (required), `error: AppError\|null=null`, `empty=false`, `grow=false`, `fill=false`, `skeleton: 'default'\|'kpis'\|'chart'='default'`, `emptyTitle='Sin resultados'`, `emptyMessage='No hay información…'`, `emptyIcon: string\|null=null` | `retry` (`output()`) | — | `<app-resource-state [status]="f.list.status()" [error]="f.list.error()" [empty]="…" (retry)="f.load()"> …contenido… </app-resource-state>` |
| `PaginationComponent` (`ui/pagination.component.ts`) | `app-pagination` | `page: Page<unknown>\|null` (required) | `pageChange: number` | — | `<app-pagination [page]="data()" (pageChange)="facade.loadList($event)" />` |
| `PagerComponent` (`ui/pager.component.ts`) | `app-pager` | `page` (req), `pageSize` (req), `total` (req), `sizes=PAGE_SIZES` (10, 25, 50, 100) | `pageChange: number`, `sizeChange: number` | — | listas paginadas en el servidor (empresas y usuarios de plataforma); exporta `PAGE_SIZES` y `pageWindow()` |
| `CursorPagerComponent` (`ui/cursor-pager.component.ts`) | `app-cursor-pager` | `from`, `to` (req), `totalLabel=''`, `pageSize` (req), `sizes=CURSOR_PAGE_SIZES` (25, 50, 100), `hasPrevious`, `hasNext` (req), `busy=false` | `previous`, `next`, `sizeChange: number` | — | paginación por cursor (auditoría); exporta `CURSOR_PAGE_SIZES` |
| `PageHeroComponent` (`ui/page-hero.component.ts`) | `app-page-hero` | `title` (req), `subtitle=''` | — | — | cabecera con ilustración de las vistas de empresa (`dashboard`, `company-profile`, `users`) |
| `OrgLogoComponent` (`ui/org-logo.component.ts`) | `app-org-logo` | `id` (req), `version: string\|null=null` | — | `OrgLogoCache` | logo de una empresa dentro del avatar (proyecta las iniciales si no hay logo); `OrgLogoCache` (`ui/org-logo.cache.ts`, root) guarda el `blob:` por empresa y versión |
| `CloseOnBackdropDirective` (`ui/close-on-backdrop.directive.ts`) | `dialog[appCloseOnBackdrop]` | — | — | — | cierra un `<dialog>` modal al hacer clic en el fondo (paneles de consulta, p. ej. `company-links`) |
| `ActionFeedbackHostComponent` (`ui/action-feedback-host.component.ts`) | `app-action-feedback-host` | — | — | `ActionFeedbackService` | único, en `App`; aviso con camión mientras se ejecuta una acción y check verde aguamarina (`--c-secondary`) al terminar |
| `StatusBadgeComponent` (`ui/status-badge.component.ts`) | `app-status-badge` | `label: Label` (req) | — | — | `<app-status-badge [label]="MEMBERSHIP_LABELS[m.status]" />` |
| `OrgRequiredComponent` (`ui/org-required.component.ts`) | `app-org-required` | — | — | `OrganizationContext` | envolver contenido que requiere org activa (`<ng-content/>`; si no, tarjeta `data-testid="org-required"`) |
| `ToastHostComponent` (`ui/toast-host.component.ts`) | `app-toast-host` | — | — | `ToastService` | único, en `App`; contenedor `aria-live="polite"`, `role=alert` para errores |
| `ConfirmDialogHostComponent` (`ui/confirm-dialog-host.component.ts`) | `app-confirm-dialog-host` | — | — | `ConfirmService` | único, en `App`; `<dialog>` nativo con `showModal()`, `cancel`/`close` → `resolve(false)` |
| `LogoComponent` (`ui/logo.component.ts`) | `app-logo` | `variant: 'horizontal'\|'compact'\|'mark'='horizontal'`, `theme: 'light'\|'dark'\|'mono'='light'`, `size=40` (alto px), `motion: 'none'\|'entrance'\|'live'\|'hover'='none'` | — | — | sidebar `variant="compact" theme="dark" motion="hover"`; login |
| `LogycaLogoComponent` (mismo archivo) | `app-logyca-logo` | `height=24`, `theme: 'light'\|'dark'='light'` | — | — | logo institucional LOGYCA (`brand/logyca-logo.png`); en `dark` capa texto invertida + cuadrado naranja |

Detalles:
- `ResourceStateComponent.view` (computed): `idle|loading`→skeleton (`role=status aria-busy`), `error`→`alert` con `error.message`, `requestId` y botón "Reintentar", `ready`+`empty`→tarjeta vacía, si no→`<ng-content/>`. `:host{display:contents}`.
- `PaginationComponent`: solo se pinta si `totalPages > 1`; botones deshabilitados según `hasPrevious/hasNext`; texto `aria-live="polite"`.
- `LogoComponent`: `shape` computed; para `mark` elige `LOGO_MARK` (≥56 px), `LOGO_MARK_SIMPLE` (36–55) o `LOGO_MARK_TINY` (<36). Accesible: `role="img"` + `<title>`. Animaciones CSS desactivadas con `prefers-reduced-motion`.
- `ui/logo-shapes.ts`: constantes generadas (`LOGO_HORIZONTAL`, `LOGO_COMPACT`, `LOGO_MARK`, `LOGO_MARK_SIMPLE`, `LOGO_MARK_TINY`) y tipos `LogoRole`, `LogoPiece`, `LogoPart`, `LogoShape`. Se regenera con un generador externo (no incluido en el repo [?]).
- `ui/avatar.ts`: `initialsOf(name)` y `hueOf(name)` (iniciales y tono estable por nombre, solo tonos de marca). `ui/directory.styles.ts`: `DIRECTORY_STYLES`, CSS de las listas de plataforma (empresas, usuarios, auditoría).
- `ui/labels.ts`: `type Tone = 'success'|'warning'|'danger'|'info'|'neutral'`, `interface Label { text; tone }`; diccionarios `MEMBERSHIP_LABELS`, `INVITATION_LABELS`, `ROLE_LABELS`, `PERMISSION_LABELS`, y las funciones `roleLabel(code): string` (fallback al código) y `permissionLabel(code, fallback)`. `StatusBadgeComponent` aplica `class="badge badge-<tone>"` (tono `info` usa `.badge-info`: ver hallazgo H-S1).

## 3. Gráficos

### `ui/charts/chart-model.ts`
`ChartSeries { name; color; values: readonly number[] }`, `DonutSegment { label; detail?; value; color }`, `CHART_COLORS { green, emerald, lime, petrol, blue, amber, slate }`, `axisFor(peak): { step; top }` (paso 1/2/5×10ⁿ, ≈4 divisiones, mínimo 1), `axisFit(low, high)` (eje que no parte de cero), `hasData(series): boolean`.

### `ui/charts/trend-chart.component.ts` — `TrendChartComponent` · `app-trend-chart` 
Inputs: `labels: readonly string[]` (req), `series: readonly ChartSeries[]` (req), `kind: 'line'|'bar'='line'`, `height=210`, `area=false`, `fill=false` (ocupa el alto del contenedor y se redibuja con `ResizeObserver`), `labelGap=90`, `markLast: string\|null=null`, `fitRange=false`, `notes: readonly (string\|null)[]=[]`, `ariaLabel='Gráfico de evolución'`. Sin outputs. Hover/foco muestran tooltip (`role="status"`); tabla `sr-only` con los mismos datos; leyenda si `!fill || series>1`; animación de dibujo solo con `prefers-reduced-motion: no-preference`. Usado por `features/platform/platform-evolution-card.component.ts` y `features/intelligence/intelligence.component.ts`.

### `ui/charts/donut-chart.component.ts` — `DonutChartComponent` · `app-donut-chart`
Inputs: `segments: readonly DonutSegment[]` (req), `centerLabel='total'`, `centerTotal: number\|null=null`, `ariaLabel='Distribución'`, `size=150`, `fluid=false`. Sin outputs. Leyenda con valor y porcentaje. Usado por `platform-dashboard`.

Test: `ui/charts/charts.spec.ts` (cubre el modelo y los componentes [?: contenido no leído]).

## 4. Quién usa qué

(Resumen por `grep` de selectores y clases en `src/app`, sin specs.) `ResourceStateComponent`: organizaciones, usuarios, dashboard, intelligence y las pantallas de plataforma. `PaginationComponent`: `users`, `company-links`. `PagerComponent`: `platform-organizations`, `platform-users`. `CursorPagerComponent`: `platform-audit`. `StatusBadgeComponent`: `users`, `platform-organizations`, `platform-organization-detail`, `platform-user-detail`. `OrgRequiredComponent`: `dashboard`, `company-profile`. `PageHeroComponent`: `dashboard`, `company-profile`, `users`. `OrgLogoComponent`: `platform-organizations`, `platform-organization-detail`. `CloseOnBackdropDirective`: `company-links`. `TrendChartComponent`: `platform-evolution-card`, `intelligence`. `DonutChartComponent`: `platform-dashboard`. `LogycaLogoComponent`: `login`. `ActionsBellComponent`: `ShellComponent`, `PlatformShellComponent`. `ContextSwitchComponent`: `ShellComponent`. `BreadcrumbsComponent`/`UserMenuComponent`: ambos shells. `ToastHost`, `ConfirmDialogHost` y `ActionFeedbackHost`: solo `App`. `DIRECTORY_STYLES`: `platform-organizations`, `platform-users`, `platform-audit`. `SIDEBAR_STYLES`: ambos shells.

## 5. Specs

Con spec [V] (`it` contados con grep): `layouts/shell.component.spec.ts` (11), `layouts/navigation.spec.ts` (5), `ui/resource-state.component.spec.ts` (6), `ui/logo.component.spec.ts` (15), `ui/org-logo.component.spec.ts` (4), `ui/pager.component.spec.ts` (7), `ui/cursor-pager.component.spec.ts` (4), `ui/close-on-backdrop.directive.spec.ts` (4), `ui/charts/charts.spec.ts` (14). Sin spec propio: `pagination`, `status-badge`, `org-required`, `page-hero`, `toast-host`, `confirm-dialog-host`, `action-feedback-host`, `user-menu`, `actions-bell`, `breadcrumbs`, `context-switch`, `avatar`.

## 6. Hallazgos de calidad

| ID | Sev. | Archivo | Hallazgo | Sugerencia |
|---|---|---|---|---|
| H-S2 | Media (a11y) | `shared/ui/charts/trend-chart.component.ts` | Los `<rect class="hit" tabindex="0">` son focusables sin nombre accesible ni rol (un lector anuncia "elemento"); la tabla `sr-only` mitiga el contenido, no el foco. | Añadir `role="img"`/`aria-label` por punto o quitar `tabindex` y dejar solo la tabla |
| H-S3 | Media (a11y) | `shared/layouts/user-menu.component.ts` | `role="menu"` sin navegación por flechas, sin foco inicial en el primer ítem ni retorno de foco al botón al cerrar (Esc). Roles ARIA `menu` prometen ese comportamiento. | Quitar `role="menu"/menuitem` (patrón disclosure con `aria-expanded`) o implementar roving focus |
| H-S4 | Baja (a11y) | `shared/layouts/shell.component.ts` | Con sidebar colapsado `.label{display:none}` elimina el texto del enlace; el nombre accesible depende solo de `title`. | Usar `aria-label` en el enlace o ocultar visualmente con `.sr-only` en vez de `display:none` |
| H-S5 | Baja (a11y) | `shared/ui/confirm-dialog-host.component.ts` | `aria-labelledby` presente pero sin `aria-describedby` para el mensaje; el foco inicial lo decide el navegador (normalmente el primer botón, "Cancelar", correcto para acciones peligrosas). | Añadir `aria-describedby="confirm-message"` |
| H-S1 | Baja | `shared/ui/toast-host.component.ts`, `src/styles.scss` | `toast.kind==='info'` no tiene clase de estilo (no hay `.alert-info`); además `StatusBadge` usa `badge-info` con `Tone='info'`: **[V] `.badge-info` no está definida en `styles.scss`** (solo success/warning/danger/neutral), pese a que `platform-rbac`, `platform-rbac-matrix`, `platform-super-admins`, `platform-super-admin-detail` y `platform-user-detail` usan la clase: esos badges salen sin color de tono. | Definir `.alert-info` y `.badge-info` con los tokens `--c-info*` ya existentes |
| H-S6 | Baja | `shared/ui/status-badge.component.ts` | `[class]="'badge-' + toneClass()"` junto a `class="badge"` estático: `[class]` con cadena reemplaza clases dinámicas pero conserva las estáticas; funciona, pero es frágil. | `[class]="'badge badge-' + tone()"` o `ngClass` |
| H-S7 | Baja | `shared/layouts/*` | Los layouts son contenedores (inyectan `core`) dentro de `shared/`; `shared → core` es una dependencia hacia dentro permitida, pero rompe la pureza "presentacional" de `shared`. | Mover `layouts/` a `core/layout` o `features/shell` |
| H-S8 | Baja (resuelto 2026-11-20) | `shared/layouts/shell.component.ts` | ≈40 líneas de CSS inline, colores hex y valores repetidos (`#dbe7f0`, `#9fb0bf`) fuera de los tokens; presupuesto `anyComponentStyle` warn 12 kB. | Extraer a tokens (`--c-sidebar-text`) |
| H-S9 | Baja | `org-required.component.ts` | Estilos en línea (`style="…"`) en plantillas: difícil de tematizar. | Clases utilitarias en `styles.scss` |
| H-S10 | Baja | `shared/ui/toast-host.component.ts` | Botón de cierre usa "✕" como contenido; tiene `aria-label`, correcto. Toast no pausa el temporizador al pasar el cursor/foco (WCAG 2.2.1). | Pausar en `mouseenter`/`focusin` |
| H-S11 | Baja | `shared/ui/pagination.component.ts` | Texto "registros" fijo (no pluralización) y números sin pipe de formato es-CO. | Usar `number` pipe |
| H-S12 | Baja | `shared/ui/labels.ts` | Diccionarios `Record<EnumDominio, Label>` acoplan `shared/ui` al dominio (aceptable) y el texto en español está hardcodeado (sin i18n). | Preparar claves i18n si se internacionaliza |
| H-S13 | Info | `shared/ui/logo.component.ts` | `LogycaLogoComponent` usa `<img src="brand/logyca-logo.png">` (ruta relativa a `<base href="/">`) con recorte CSS por porcentajes mágicos (`139.31%`, `-19.66%`, `74%`). | Recortar el asset una vez y quitar el CSS mágico |

SOLID: `ResourceStateComponent` cumple SRP/OCP (nuevo estado = nuevo `@case`); `ShellComponent` concentra varias responsabilidades; DIP correcto (solo inyecta servicios de `core`).

## 7. Cómo extender

- **Nuevo ítem de menú**: añadir a `NAV_ITEMS` (`label`, `path`, `icon`, `requires`, `soon`, `group`) y la ruta en `app.routes.ts`; con `soon: true` mientras la ruta sea `ComingSoonComponent`.
- **Nueva etiqueta de estado**: agregar `Record<Enum, Label>` en `ui/labels.ts` y usar `<app-status-badge [label]="X_LABELS[v]" />`.
- **Nuevo componente presentacional**: `shared/ui/<nombre>.component.ts`, standalone, `OnPush`, `input()`/`output()`, selector `app-<kebab>`, sin inyectar servicios de `core` (salvo hosts globales).
- **Nuevo gráfico**: reutilizar `chart-model.ts` (`axisFor`, `CHART_COLORS`), incluir `aria-label` y tabla `sr-only`, respetar `prefers-reduced-motion`.
- **Nueva pantalla con estados**: envolver el contenido en `<app-resource-state>` y, si requiere org, en `<app-org-required>`.
- **Notificaciones**: `ToastService` para feedback, `ConfirmService.confirm({...danger: true})` antes de acciones destructivas.
