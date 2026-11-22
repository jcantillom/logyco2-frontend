# Feature `system` (páginas de sistema: 403, 404, acceso pendiente y «Próximamente»)

Leyenda: [V] verificado en código.
Código: `src/app/features/system/system-pages.component.ts` (48 l.) y `src/app/features/system/coming-soon.component.ts` (31 l.). Sin specs propios.

## 1. Propósito
Tres componentes mínimos en `system-pages.component.ts`: `ForbiddenComponent` (`app-forbidden`, «Acceso denegado», `role="alert"`), `NotFoundComponent` (`app-not-found`, «Página no encontrada»), ambos con botón «Ir al inicio» a `/resumen` (`routerLink`), y `PendingAccessComponent` (`app-pending-access`, «Acceso pendiente»: cuenta activa sin rol ni empresa; botón «Cerrar sesión» con `AuthFacade.logout()`). [V]

## 2. Rutas [V]
Hijos de `ShellComponent` en `app.routes.ts`: `path: 'acceso-denegado'` (`breadcrumb: 'Acceso denegado'`) -> `ForbiddenComponent`; `path: '**'` (`breadcrumb: 'No encontrada'`) -> `NotFoundComponent`. Fuera del shell: `path: 'acceso-pendiente'` (`canActivate: [authGuard]`) -> `PendingAccessComponent`; es el destino de `LandingPolicy.home()` para quien no tiene membresía ni rol global. Todos lazy desde el mismo archivo. `permissionGuard(...)` redirige aquí cuando falta permiso.
Nota: la consola `/plataforma` NO usa estas páginas para sus rutas inexistentes [?] (ver `platform.md`).

## 3. Componentes
Los tres `OnPush` y standalone, sin inputs/outputs; plantilla inline con `.card` centrada. Solo `PendingAccessComponent` inyecta un servicio (`AuthFacade`).

## 4. Endpoints / permisos / estados
Ninguno.

## 5. Hallazgos de calidad
| Sev. | Hallazgo | Ubicación | Sugerencia |
|---|---|---|---|
| Baja | Tres componentes en un archivo (convención de un componente por archivo). | `system-pages.component.ts` | Separar si crecen. |
| Baja | Estilos inline y sin `<main>`/foco al título al navegar (a11y de enrutado SPA). | `system-pages.component.ts` | Enfocar `h1` al activar la ruta. |
| Baja | El 404 para usuarios no autenticados no aplica (`**` está bajo `authGuard`): redirige a login. | `app.routes.ts` | OK/documentar. |
| Info | Sin `any`. | — | — |

## 6. Cómo extender
Nueva página de error (p. ej. 500): añadir componente y ruta hija en `app.routes.ts`.

## 7. Anexo: comportamiento de navegación [V]
- `ForbiddenComponent` se alcanza vía `permissionGuard(...)` (`router.createUrlTree(['/acceso-denegado'])`) y vía `platformMatch`/`platformGuard` (`DENIED = ['/acceso-denegado']`). Al estar bajo `ShellComponent` conserva sidebar y breadcrumbs.
- `NotFoundComponent` captura `**` dentro del shell; para el árbol `/plataforma/**` el comodín propio redirige a `resumen` (ver `platform.md`), por lo que el 404 no se muestra allí.
- `ForbiddenComponent` y `NotFoundComponent` enlazan con `routerLink="/resumen"` (clase `btn btn-primary`), sin inputs, servicios ni estado.

## 8. Módulos «Próximamente» (sin backend) [V]
`ComingSoonComponent` (`app-coming-soon`, `features/system/coming-soon.component.ts`, OnPush, sin servicios propios) es la pantalla de todo módulo cuyo backend no existe. Lee `title`, `description` (y `breadcrumb` como título de respaldo) de `ActivatedRoute.snapshot.data` y muestra: `h1` con el título, «Esta capacidad todavía no está habilitada.», la etiqueta «Próximamente», la sección `data-testid="coming-soon"` («Qué ofrecerá» + descripción, nota «Cuando esté lista se habilitará aquí, en este mismo lugar del menú.») y un enlace «Volver al resumen» (`/resumen`). No tiene datos, cifras, endpoints, facades ni puertos. Cada módulo se declara solo con una ruta y, si va en el menú de la empresa, un `NavItem` con `soon: true` (`shared/layouts/nav-items.ts`: texto atenuado y `aria-label` «<etiqueta> · Próximamente»); en la consola de plataforma el menú (`platform-nav.ts`) no los lista. Cuando el backend exista, se reemplaza la ruta por la pantalla real y se pone `soon: false`.

Espacio de empresa (`app.routes.ts`; `permissionGuard` indicado):

| Ruta | Permiso | Título que muestra |
|---|---|---|
| `/operaciones` (`/operaciones/:id` redirige a `/operaciones`) | `indicators:read` | Operaciones de transporte |
| `/conciliacion` | `indicators:read` | Conciliación y calidad de datos |
| `/calidad` | `indicators:read` | Calidad de datos |
| `/analisis` | `indicators:read` | Análisis de emisiones |
| `/ayuda` | — | Ayuda y soporte |
| `/evidencias` | `indicators:read` | Evidencias y trazabilidad |
| `/emisiones` | `indicators:read` | Emisiones |
| `/reportes` | `reports:read` | Reportes y versiones |
| `/reduccion` | `indicators:read` | Planes de reducción |

Consola de plataforma (`platform.routes.ts`, bajo `/plataforma`, sin ítem de menú; solo el rol global `SUPER_ADMIN` llega a ellas):

| Ruta | Título que muestra |
|---|---|
| `/plataforma/vehiculos` | Vehículos |
| `/plataforma/operaciones` | Operaciones de transporte (viajes y envíos) |
| `/plataforma/cargas` | Cargas masivas (vista administrativa) |
| `/plataforma/calidad` | Centro de calidad y conciliación |
| `/plataforma/reportes` | Reportes globales |

El resumen de la empresa (`/resumen`) no usa esta pantalla: conserva sus secciones reales y muestra un único aviso «Próximamente: indicadores de emisiones, intensidad y tendencia» (ver [dashboard.md](dashboard.md)).
