# Feature `dashboard` (Resumen de la empresa)

Leyenda: [V] verificado en código de la feature; [?] no comprobado.

Código: `src/app/features/dashboard/` -> `dashboard.component.ts` (199 l.), `home.facade.ts` (68 l.), `dashboard.component.spec.ts`.

## 1. Propósito y flujo
Pantalla de inicio del espacio de organización. Solo muestra datos reales de la empresa activa: bienvenida por nombre, **acciones pendientes** (solicitudes de vinculación recibidas, invitaciones pendientes, datos de la empresa incompletos, empresa sin tipo de actividad), «Próximos pasos», tarjeta de **usuarios de la empresa** (solo con permiso) y **precios de combustibles** (Intelligence, ver [intelligence.md](intelligence.md)). Los indicadores de emisiones no existen todavía: un único aviso «Próximamente: indicadores de emisiones, intensidad y tendencia» (`data-testid="emissions-soon"`) los anuncia, sin cifras, gráficos ni selector de período. Al cambiar la organización activa se recarga solo. [V]

## 2. Rutas [V]
`app.routes.ts`: `path: 'resumen'` dentro de `ShellComponent`, `data: { breadcrumb: 'Resumen', wide: true }`, `canActivate: [workspaceGuard]` (si la persona no debe entrar al espacio de empresa, la envía a su inicio), lazy `loadComponent`. `inicio` redirige a `resumen`.

## 3. Componentes
### `DashboardComponent` (`app-dashboard`) - container [V]
- Inputs/outputs: ninguno.
- Inyecta: `HomeFacade` (`home`), `UsersFacade` (`users`), `SessionStore`, `IntelligenceFacade`, `AccessPolicy`.
- Constructor: `reloadOnContextChange(...)` carga `home.load()`, `intel.loadSummary()` y, si `canSeeTeam()` (`users:read` o `memberships:manage`), `users.loadPreview()` y `users.loadCounts()`.
- Template: `app-page-hero` con «Bienvenido, <nombre>»; todo dentro de `<app-org-required>`: aviso `emissions-soon`; tarjeta «Acciones pendientes» (`data-testid="todo"`, contador `todo-count`: «N pendiente(s)» o «Al día», lista de `home.actions()` con enlace, o «Todo en orden…») y «Próximos pasos» (enlaces a `/cargas` y `/reduccion`, cada uno con la etiqueta «Próximamente»); tarjeta «Usuarios de la empresa» (`data-testid="team-card"`, tres personas sorteadas con `sample()`, totales de `users.counts`) solo si `canSeeTeam()`; tarjeta «Precios de combustibles» (`data-testid="fuel-prices"`, `app-fuel-price-cards [compact]`, enlace a `/intelligence`).
- Componentes usados: `PageHeroComponent`, `OrgRequiredComponent`, `FuelPriceCardsComponent`, `RouterLink`.

## 4. Facade [V]
`HomeFacade` (`providedIn: 'root'`): `organization = ContextResetRegistry.track(new ScopedResource<Organization>())`; `actions` (computed, `BellAlert[]` con `label`, `hint`, `count`, `path`, `query`; solo las de `count > 0`), `pending` (suma de conteos); `load()` (sin organización resetea; si ya pidió esa organización no repite; si no, `organization.load(organizations.get(id))` y `links.loadSummary()`); `reload()` (reintento manual).

## 5. Endpoints
Todos reales, vía puertos: `OrganizationsRepository.get(id)` (`GET /organizations/{id}`), `LinksRepository.summary` (`GET /organizations/{id}/links/summary`, para las solicitudes recibidas), `UsersRepository.list` (vista previa y conteos por estado de membresía) e `IntelligenceRepository.summary` (`GET /intelligence/summary`). No hay llamadas para emisiones: el módulo no tiene backend (ver [system.md](system.md), «Módulos Próximamente»). [V]

## 6. Permisos
La ruta no exige permiso propio (solo `workspaceGuard`). La tarjeta de usuarios exige `users:read` o `memberships:manage`.

## 7. Estados
Sin organización activa (`app-org-required`), acciones vacías («Todo en orden…»), personas vacías («Aún no hay otras personas en tu empresa.»), aviso fijo de emisiones «Próximamente».

## 8. Hallazgos de calidad
| Sev. | Hallazgo | Ubicación | Sugerencia |
|---|---|---|---|
| Media | Componente grande (199 l.) con CSS inline y varias responsabilidades (acciones, pasos, equipo, combustibles). | `dashboard.component.ts` | Extraer tarjetas presentacionales (`PendingActionsCard`, `TeamCard`). |
| Baja | «Próximos pasos» enlaza a `/cargas` y `/reduccion`, que son pantallas «Próximamente» (consistente, pero hay que retirar la etiqueta al habilitarlas). | `dashboard.component.ts` | Derivar la etiqueta de `NAV_ITEMS[].soon`. |
| Baja | `sample()` sortea con `Math.random` al llegar los datos; el orden no es reproducible. | `dashboard.component.ts` | Aceptable; documentado en el código. |

## 9. Cómo extender
- **Habilitar emisiones**: cuando exista el backend, crear puerto + adaptador HTTP + `providers.ts` + facade (ver [../architecture.md](../architecture.md), «Cómo extender»), sustituir el aviso `emissions-soon` por la sección real y poner `soon: false` en `nav-items.ts`.
- **Nueva acción pendiente**: añadir un elemento al arreglo de `HomeFacade.actions` con su `count`, `path` y `query`.
- Tests: `dashboard.component.spec.ts` (aviso único de emisiones, saludo, acciones pendientes, solicitudes de vinculación, sin empresa activa).
