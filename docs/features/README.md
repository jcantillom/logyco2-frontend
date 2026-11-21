# Índice de features del frontend (`src/app/features/`)

Documentación de lectura rápida: cada archivo describe una feature (rutas, componentes, formularios, facades, endpoints, permisos, estados, hallazgos de calidad y "Cómo extender"). Marcas: [V] verificado en código, [?] no comprobado.

| Feature | Ruta(s) URL | Propósito (una línea) | Doc |
|---|---|---|---|
| auth | `/login`, `/activar`, `/aceptar-invitacion` | Inicio de sesión con transición animada, activación de cuenta con el enlace del correo y aceptación de código de invitación (org o `sa_` superadmin). | [auth.md](auth.md) |
| dashboard | `/resumen` (`/inicio` redirige) | Bienvenida, acciones pendientes, usuarios de la empresa y precios de combustibles de la organización activa; aviso «Próximamente» para emisiones. | [dashboard.md](dashboard.md) |
| organizations | `/mi-empresa` (`/organizaciones` y `/organizaciones/:id` redirigen) | «Datos de mi empresa»: datos y contacto editables, actividad, empresas vinculadas (solicitudes y contrapartes externas) y configuración. | [organizations.md](organizations.md) |
| users | `/usuarios` | «Usuarios y accesos» de la empresa activa: personas, roles, membresías (aprobar/suspender/revocar/eliminar) e incorporación de usuarios por correo. | [users.md](users.md) |
| settings | `/configuracion` | Cuenta, apariencia (tema, paleta, animaciones) y empresas propias. | [settings.md](settings.md) |
| system | `/acceso-denegado`, `/acceso-pendiente`, `**`, y las rutas «Próximamente» | Páginas 403, 404 y acceso pendiente, y la pantalla «Próximamente» de los módulos sin backend. | [system.md](system.md) |
| platform | `/plataforma/**` | Consola global SUPER_ADMIN: resumen, empresas, usuarios, superadministradores, roles y accesos, auditoría por cursor, estado, configuración y herramientas de Intelligence; las secciones de descarbonización muestran «Próximamente». | [platform.md](platform.md) |
| intelligence | `/intelligence` (empresa) y `/plataforma/intelligence/**` | Indicadores y precios de combustibles, costos de transporte y administración de fuentes (`src/app/features/intelligence/`). | [intelligence.md](intelligence.md) |
| onboarding | (sin ruta propia) | `OnboardingFacade` y `OnboardingStatusComponent`, usados por `users`, `platform` y `auth` (`src/app/features/onboarding/`). | descrito en [auth.md](auth.md), sección 4 |

## Patrones comunes (aplican a casi todas las features) [V]

1. **Rutas**: `app.routes.ts` (todo `loadComponent` lazy). Bajo `ShellComponent` + `authGuard`; `permissionGuard(...codes)` por ruta (cualquiera de la lista); `data.breadcrumb`. `/plataforma` usa `canMatch: platformMatch` + `platformGuard` (confirma `GET /auth/me`); `/resumen` usa `workspaceGuard` y `''` usa `homeGuard` (`LandingPolicy`). Parámetros `:id` llegan por `input.required<string>()` (router con `withComponentInputBinding`).
2. **Container-facade**: el componente (OnPush, standalone, template inline) inyecta una *facade* `providedIn: 'root'` que expone `ScopedResource<T>` (signals `status: 'idle'|'loading'|'ready'|'error'`, `data`, `error`; descarta respuestas obsoletas con un contador de generación) y métodos `load*()` / mutaciones que devuelven `Observable` y recargan con `tap`. Las facades se registran en `ContextResetRegistry.track(...)`, que se vacía al cambiar de organización (`OrganizationContext.select`) o al cerrar sesión.
3. **Recarga reactiva**: `reloadOnContextChange(load)` (efecto sobre `activeOrganizationId`) en pantallas de organización; la consola de plataforma carga en el constructor (no depende de la organización activa); los detalles usan `effect` manual sobre `id()`.
4. **`ResourceStateComponent`** (`app-resource-state`): inputs `status` (requerido), `error`, `empty`, `grow`, `fill`, `skeleton`, `emptyTitle`, `emptyMessage`, `emptyIcon`; output `retry`. Vista: `idle|loading` -> skeleton; `error` -> alerta con `requestId` y "Reintentar"; `empty` -> tarjeta vacía; si no, proyecta el contenido. `app-org-required` muestra "Sin organización activa" si no hay organización.
5. **Módulos sin backend**: no tienen pantalla, facade, puerto ni datos. Su ruta carga `ComingSoonComponent` (`features/system/coming-soon.component.ts`) y, en el menú de la empresa, su ítem lleva `soon: true` (ver [system.md](system.md)). Todo puerto declarado en `domain/repositories` tiene un `Http*Repository` (`ApiClient`) enlazado en `infrastructure/providers.ts`.
6. **Formularios**: reactive forms `nonNullable.group`; `markAllAsTouched()` al enviar; errores visibles solo con `touched`; trim de strings antes de enviar; mutaciones con `takeUntilDestroyed(destroyRef)`; errores -> `toast.error(toAppError(e))`; confirmaciones destructivas con `ConfirmService.confirm({title,message,confirmLabel,danger})`; diálogos con `<dialog>` nativo (`showModal()`).
7. **Etiquetas**: `shared/ui/labels.ts` (`Label {text, tone}`, `roleLabel`, mapas `*_LABELS`) + `StatusBadgeComponent`; plataforma tiene `platform-labels.ts`.
8. **Paginación**: `Page<T>` (`items, page, pageSize, total, totalPages, hasNext, hasPrevious`), `DEFAULT_PAGE_REQUEST {page:1,pageSize:20}`, `PaginationComponent` (`page` input, `pageChange` output); en plataforma las listas de empresas, usuarios y auditoría se paginan y filtran en el servidor (`PagerComponent`, `CursorPagerComponent`); `fetchAllPages` se conserva para selectores y detalles.

## Hallazgos transversales (resumen)
- Duplicación entre `users` y `platform` (diálogo de código de invitación, mapa `ACTIONS` de membresía, paginación manual, `roleLabel` envuelto en métodos).
- Componentes grandes con template+CSS inline (líneas medidas con `wc -l`): `users.component.ts` (701 l.), `platform-organization-detail.component.ts` (666 l.), `platform-organizations.component.ts` (647 l.), `company-links.component.ts` (732 l.), `company-profile.component.ts` (585 l.), `platform-dashboard.component.ts` (454 l.), `login.component.ts` (445 l.).
- Estado público mutable en facades (signals escribibles, `selectedId`, `search`, `status`).
