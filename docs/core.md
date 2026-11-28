# `src/app/core/` — núcleo de aplicación

> **[V]** verificado leyendo el código · **[?]** no comprobado. Ver visión general en [architecture.md](architecture.md).
> Todos los servicios son `@Injectable({ providedIn: 'root' })` salvo que se indique. `core/` solo importa de `domain/` (0 imports de `features`, `infrastructure` o `shared`). [V]

## Resumen

`core/` contiene todo lo transversal que no es UI ni acceso a datos concreto: configuración (`APP_CONFIG`), estado de sesión en memoria sin token (`SessionStore`), su restauración al arrancar (`SessionBootstrap`) y la sincronización entre pestañas (`CrossTabSession`), la fachada de autenticación (`AuthFacade`), la política de permisos de interfaz (`AccessPolicy`), la política de aterrizaje (`LandingPolicy`), la organización activa (`OrganizationContext`), el registro de estado reiniciable (`ContextResetRegistry` + `ScopedResource`), el modelo de errores (`AppError`, catálogo, mapper), los guards y los dos interceptors HTTP, las notificaciones (`ToastService`, `ConfirmService`, `ActionFeedbackService`) y las preferencias de apariencia (`ThemeService`). La idea central: **el cliente nunca autoriza**; solo oculta/ordena la UI, y todo error se normaliza a `AppError` con mensajes del catálogo. La sesión vive en memoria; el único almacenamiento del navegador relacionado con la sesión es `sessionStorage` (token, solo en dev).

## Tabla de contenidos

1. [config/app-config.ts](#1-configapp-configts)
2. [auth/](#2-auth)
3. [org/](#3-org)
4. [http/](#4-http)
5. [errors/](#5-errors)
6. [guards/](#6-guards)
7. [interceptors/](#7-interceptors)
8. [notifications/](#8-notifications)
9. [preferences/](#9-preferences)
10. [Specs existentes](#10-specs-existentes)
11. [Hallazgos de calidad](#11-hallazgos-de-calidad)
12. [Cómo extender](#12-cómo-extender)

---

## 1. `config/app-config.ts`

| Símbolo | Firma / forma | Notas |
|---|---|---|
| `AppConfig` | `{ production: boolean; apiBaseUrl: string; apiPrefix: string}` | todos `readonly`. `apiBaseUrl` sin barra final ni versión; `apiPrefix` p. ej. `/api/v1` |
| `APP_CONFIG` | `InjectionToken<AppConfig>('APP_CONFIG')` | provisto en `app.config.ts` con el objeto `environment` |

Configuración por entorno: `.env` (ignorado por Git; plantilla en `.env.example`) o variables del proceso en el pipeline, con `APP_ENV`, `API_BASE_URL` y `API_PREFIX`. `scripts/generate-env.mjs` las valida y genera `src/environments/environment.ts` (ignorado por Git) antes de `start`, `build`, `build:prod`, `watch`, `test`, `test:ci` y `lint` (hooks `pre*` de npm). Claves del objeto `environment` (`AppConfig`): `apiBaseUrl`, `apiPrefix`, `sessionPersistence` [V]. Usado por: `authInterceptor`, `SessionPersistence`, `ApiClient`.

## 2. `auth/`

### `session.store.ts` — `SessionStore`
Estado de sesión **solo en memoria y SIN token** (signals privadas `identityState`, `userState`). La credencial es una cookie HttpOnly que el navegador envía sola; la aplicación nunca la lee.

| Miembro | Firma | Descripción |
|---|---|---|
| `user` | `Signal<CurrentUser \| null>` | readonly |
| `hasIdentity` | `Signal<boolean>` | identidad corporativa válida (aunque no haya usuario local) |
| `isAuthenticated` | `Signal<boolean>` | hay usuario local cargado |
| `expiresAt` | `Signal<Date \| null>` | caducidad de la sesión (`user.sessionExpiresAt`, el `exp` del token) |
| `markIdentity()`, `setUser(u)`, `clear()` | `void` | |

Usado por: `AuthFacade`, `AccessPolicy`, `PlatformAccess`, `OrganizationContext`, guards, `SessionExpiryHandler`, `SessionBootstrap`, `settings`, `login`, `platform-shell`, `dashboard`, `UserMenuComponent`.

### `auth.facade.ts` — `AuthFacade`
Inyecta: `AuthRepository` (puerto), `SessionStore`, `OrganizationContext`, `Router`, `CrossTabSession`.

| Miembro | Firma | Comportamiento |
|---|---|---|
| `loading` | `WritableSignal<boolean>` | true durante `login` |
| `pendingRegistration` | `WritableSignal<boolean>` | identidad válida sin usuario local (`USER_NOT_REGISTERED`) |
| `login(credentials)` | `Observable<CurrentUser>` | `repository.login` (el backend fija la cookie) → `tap`: `session.clear()`, `context.clear()`, `markIdentity` → `switchMap(loadUser)` → avisa `login` a las demás pestañas; `finalize` apaga `loading` |
| `refreshUser()` | `Observable<CurrentUser>` | vuelve a `GET /auth/me` (tras aceptar invitación, en `platformGuard`, en `SessionBootstrap.restore`) |
| `logout()` | `void` | `POST /auth/logout` (borra la cookie); en `finalize` (también si falla): limpia sesión y contexto, `pendingRegistration=false`, navega a `/login` y avisa `logout` a las demás pestañas. **No revoca** el token en el proveedor |
| `applyRemoteLogout()` | `void` | otra pestaña cerró sesión: limpia y navega a `/login` sin llamar al backend |
| `loadUser()` (privado) | | `getCurrentUser` → `setUser`; en error: `toAppError`; si `code==='USER_NOT_REGISTERED'` → `markIdentity()` + `pendingRegistration=true`; si no y no autenticado → `session.clear()`; relanza `AppError` |

Endpoints (vía el puerto): `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`. Usado por: `login`, `accept-invitation`, `platform-super-admins`, `platform-super-admin-detail`, `platformGuard`, `SessionBootstrap`, `UserMenuComponent`.

### `access-policy.ts` — `AccessPolicy`
Constantes privadas `GLOBAL_ROLE_PERMISSIONS` (`SUPER_ADMIN`: `organizations:read|manage`, `memberships:read|manage`, `users:read`, `catalogs:manage`, `sector_reports:read`) y `ORGANIZATION_ROLE_PERMISSIONS` (`ORG_ADMIN` —incluye `relationships:manage`—, `ORG_ANALYST`, `ORG_VIEWER`, `GUILD_VIEWER`) que **espejan** el seed RBAC del backend. Comentario de contrato: NO es autorización.

| Miembro | Firma |
|---|---|
| `permissions` | `Signal<ReadonlySet<PermissionCode>>` = unión de permisos de roles globales del usuario + roles de la **membresía activa** (`OrganizationContext.activeMembership()`) |
| `can(code)` | `boolean` |
| `canAny(codes)` | `boolean` — lista vacía ⇒ `true` |

Usado por: `permissionGuard`, `ShellComponent` (filtra `NAV_ITEMS`), `DashboardComponent`, `CompanyProfileComponent`, `CompanyLinksComponent`, `PlatformRbacComponent` y `users.component`.
Nota: `SUPER_ADMIN` global no incluye `indicators:read`/`reports:read`/`imports:create`; esos ítems solo aparecen con una membresía de organización. [V]

### `landing-policy.ts` — `LandingPolicy`
Única fuente de verdad sobre dónde aterriza un usuario autenticado. Constantes exportadas: `PLATFORM_HOME = '/plataforma/resumen'`, `WORKSPACE_HOME = '/resumen'`, `PENDING_ACCESS = '/acceso-pendiente'`. Inyecta `PlatformAccess` y `OrganizationContext`.

| Miembro | Descripción |
|---|---|
| `home()` | `PLATFORM_HOME` si es superadministrador; si no, `WORKSPACE_HOME` con membresía o `PENDING_ACCESS` sin ella |
| `canEnterWorkspace()` | `OrganizationContext.hasOrganizations()` (el rol global por sí solo no basta) |
| `resolve(requested)` | destino tras autenticarse: solo respeta rutas internas (rechaza vacías, `//…` y `/login…`), ignora la portada genérica (`/`, `/resumen`, `/inicio`, `/acceso-pendiente`) y exige acceso al contexto de la ruta pedida (`/plataforma*` solo para superadministradores) |

Usado por: `guestGuard`, `homeGuard`, `workspaceGuard` y `LoginComponent`.

### `session-bootstrap.ts` — `SessionBootstrap`
`export const RESTORE_TIMEOUT_MS = 5000`. Inyecta: `AuthFacade`, `SessionStore`, `CrossTabSession`, `Router`, `LandingPolicy`.

| Miembro | Descripción |
|---|---|
| `restore(): Promise<void>` | registra el oyente entre pestañas y consulta `GET /auth/me` (`refreshUser` con `timeout(5000)`); 401, error o tiempo agotado = sin sesión; `USER_NOT_REGISTERED` conserva la identidad. **Nunca lanza.** Se ejecuta en `provideAppInitializer`: las rutas no se evalúan hasta que termina (sin destello de login) |
| oyente entre pestañas | `logout` remoto → `AuthFacade.applyRemoteLogout()` (solo si había identidad); `login` remoto sin sesión local → `refreshUser()` y, si la pestaña está en `/login`, navega a `LandingPolicy.home()` |

### `cross-tab-session.ts` — `CrossTabSession`
`publish('login'\|'logout')` y `listen(handler)`. `BroadcastChannel('logyco2.session')`; sin él, el evento `storage` sobre la clave de señalización `logyco2.session.signal` (valor `<señal>:<epoch>`). Solo viaja la palabra; nunca datos ni credenciales. El emisor no recibe su propio aviso.

### `session-expiry.handler.ts` — `SessionExpiryHandler`
`handle(): void` — si `!session.isAuthenticated()` no hace nada (p. ej. 401 durante el login); si no: guarda `router.url`, `session.clear()`, `context.clear()` y navega a `/login?reason=expired&returnUrl=<url>`. Llamado solo desde `errorInterceptor`.

### `platform-access.ts`
| Símbolo | Firma |
|---|---|
| `SUPER_ADMIN_ROLE` | `'SUPER_ADMIN'` (solo usado dentro de este archivo) |
| `hasSuperAdminRole(user)` | `(CurrentUser \| null \| undefined) => boolean` — `!!user && user.isActive && globalRoles.some(code===SUPER_ADMIN)` |
| `PlatformAccess.isSuperAdmin` | `Signal<boolean>` — pista de UI. Usado por `platformMatch`, `ContextSwitchComponent`, `login` |

## 3. `org/`

### `context-reset.ts`
- `interface Resettable { reset(): void }`
- `ContextResetRegistry`: `track<R extends Resettable>(item: R): R` (añade a un `Set`, devuelve el mismo objeto) y `resetAll(): void`. Los items **nunca se eliminan** del set (viven mientras viva el root injector; los facades son singletons).

### `organization-context.ts` — `OrganizationContext`
Inyecta `SessionStore`, `ContextResetRegistry`. Estado: `selectedId`, `lostAccess: Set<string>` (privados).

| Miembro | Descripción |
|---|---|
| `memberships` | `Signal<readonly Membership[]>` de `session.user().memberships` |
| `activeMembership` | la seleccionada o, si no, la primera |
| `activeOrganizationId` | `string \| null` |
| `hasOrganizations` | `boolean` |
| `activeAccessLost` | `true` si el backend negó acceso a la org activa (marcado por `errorInterceptor`) |
| `select(id): boolean` | cambia org si existe y es distinta → `registry.resetAll()`; devuelve si cambió |
| `markAccessLost(id)` | añade id al set |
| `clear()` | resetea selección, accesos perdidos y llama `resetAll()` |

Función exportada `reloadOnContextChange(load: () => void): void` — **debe llamarse en contexto de inyección** (constructor): `effect` que lee `activeOrganizationId()` y ejecuta `untracked(load)` (carga inicial + cada cambio). Usado por `dashboard`, `users`, `company-profile`, `company-links` y `ShellComponent` (y definido en `organization-context.ts`).

### `scoped-resource.ts`
`type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error'`.
`class ScopedResource<T> implements Resettable`:
- señales públicas: `status`, `data: signal<T \| null>`, `error: signal<AppError \| null>`.
- `load(source$: Observable<T>, options: { keepData?: boolean } = {}): void` — cancela suscripción previa, incrementa `generation`, `status='loading'` (salvo `keepData` con datos ya cargados: recarga en segundo plano sin pasar por «cargando»), `error=null`; `next`/`error` se ignoran si `generation` cambió (respuesta tardía de otro contexto); error pasa por `toAppError`. **No limpia `data` al recargar** (se conserva el dato anterior mientras `loading`).
- `reset()` — invalida en vuelo, desuscribe, `idle`, `data=null`, `error=null`.
Uso típico en un facade: `readonly list = inject(ContextResetRegistry).track(new ScopedResource<Page<X>>());` luego `this.list.load(this.repository.list(...))`.

## 4. `http/`

### `api-envelope.ts` (solo tipos, formas del backend)
`ResponseMetaDto { request_id? }`, `PaginationMetaDto { page, page_size, total, total_pages, has_next, has_previous }`, `ApiResponseDto<T> { data: T; meta }`, `PaginatedResponseDto<T> { data: readonly T[]; meta: meta & { pagination } }`, `ErrorDetailDto { field?, message?, type? }`, `ErrorResponseDto { error: { code, message?, details?, request_id? } }`. Usado por `ApiClient`, mappers y `toAppError`.

### `fetch-all-pages.ts`
```ts
interface AllPages<T> { items: readonly T[]; total: number; truncated: boolean }
fetchAllPages<T>(load: (r: PageRequest) => Observable<Page<T>>, maxPages = 20, pageSize = 100): Observable<AllPages<T>>
```
Lee páginas secuencialmente con `expand` + `reduce`, hasta `maxPages`; `truncated = page.hasNext` de la última leída. Usado solo por `features/platform/platform.facades.ts` (recursos `all`, `deleted`, `orgPeople` e `invitations`; hasta `maxPages` x `pageSize` = 2.000 registros).

## 5. `errors/`

### `app-error.ts`
- `type AppErrorKind = 'network' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'validation' | 'rate-limited' | 'server' | 'unknown'`
- `interface FieldIssue { field: string; type: string \| null; message?: string \| null }`
- `class AppError extends Error` — `constructor(kind, code, status, message, requestId = null, details: readonly FieldIssue[] = [], retryAfterSeconds: number | null = null)`; `name='AppError'`.

### `error-catalog.ts`
`SUPER_ADMIN_LIMIT_MESSAGE` (mensaje acordado con backend, usado por `platform-super-admins`), `ERROR_MESSAGES: Record<string,string>` (77 entradas, contadas con grep: auth/sesión, organizaciones/membresías, invitaciones, superadmins, directorio, genéricos), `NETWORK_ERROR_MESSAGE`, `GENERIC_ERROR_MESSAGE`, `STATUS_FALLBACKS` (400,401,403,404,409,422,429,502,503), `kindForStatus(status): AppErrorKind` (0→network, 401, 403, 404, 409, 400/422→validation, 429, ≥500→server, otro→unknown), `messageFor(code, status): string` (código → estado → genérico). Preparado para i18n.

### `http-error-mapper.ts`
`toAppError(error: unknown): AppError` — `AppError` pasa sin cambios; `HttpErrorResponse` → `AppError` con `kindForStatus`, `code ?? HTTP_<status>`, mensaje del catálogo, `request_id`, `details` filtrados con `field`, `Retry-After` (segundos, techo, solo si >0); cualquier otro → `AppError('unknown','UNKNOWN',0, genérico)`. **Nunca propaga el texto crudo del servidor.**

## 6. `guards/`

| Guard | Tipo | Firma | Resultado |
|---|---|---|---|
| `authGuard` | `CanActivateFn` | `(_route, state)` | `isAuthenticated` → `true`; `hasIdentity` → `/aceptar-invitacion`; si no → `/login?returnUrl=<state.url>` |
| `guestGuard` | `CanActivateFn` | | autenticado → `LandingPolicy.home()`; si no `true` |
| `tokenGuard` | `CanActivateFn` | | `hasIdentity` → `true`; si no `/login` |
| `permissionGuard(...codes)` | fábrica → `CanActivateFn` | `(...codes: PermissionCode[])` | `AccessPolicy.canAny(codes)` → `true`; si no `/acceso-denegado` |
| `platformMatch` | `CanMatchFn` | | sin sesión → `true` (deja que `authGuard` redirija); con sesión: `PlatformAccess.isSuperAdmin()` ? `true` : `/acceso-denegado` |
| `platformGuard` | `CanActivateFn` | | `AuthFacade.refreshUser()` → `hasSuperAdminRole(user) ? true : /acceso-denegado`; `catchError` → denegado (fallo = denegado) |

Guards de aterrizaje (`guards/landing.guards.ts`, ambos `CanActivateFn`, sin parámetros):

| Guard | Resultado |
|---|---|
| `homeGuard` | portada `/`: redirige a `LandingPolicy.home()` |
| `workspaceGuard` | `/resumen`: `true` si `LandingPolicy.canEnterWorkspace()`; si no redirige a `LandingPolicy.home()` (nunca devuelve `/resumen`, no genera bucles) |

Archivos: `guards/auth.guards.ts`, `guards/platform.guards.ts`, `guards/landing.guards.ts`. Usados en `app.routes.ts`.

## 7. `interceptors/`

| Interceptor | Archivo | Comportamiento |
|---|---|---|
| `authInterceptor` | `auth.interceptor.ts` | `apiRoot = apiBaseUrl + apiPrefix` (con `apiBaseUrl` vacío es `/api/v1`, mismo origen); si `request.url` **no** es `apiRoot` ni continúa con `/`, `?` o `#` → pasa sin tocar; si no, clona con `withCredentials: true` y, en métodos distintos de GET/HEAD/OPTIONS, la cabecera `X-Requested-With: LoGyCO2` (CSRF). Nunca adjunta token ni toca peticiones a otros orígenes |
| `errorInterceptor` | `error.interceptor.ts` | `catchError` → `toAppError`; `status===401` → `SessionExpiryHandler.handle()`; `403` con código ∈ {`ORGANIZATION_ACCESS_DENIED`,`ORGANIZATION_INACTIVE`} y URL con `/organizations/<uuid36>` → `markAccessLost(uuid)`; relanza `AppError`. `inject()` se resuelve de forma síncrona antes del callback |

Orden en `provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))`. Endpoints sin prefijo de API (p. ej. `/health` vía `ApiClient.getRoot`) **no** llevan token. [V]

## 8. `notifications/`

### `toast.service.ts` — `ToastService`
`ToastKind = 'success'|'info'|'warning'|'error'`; `Toast { id; kind; message; requestId: string|null }`. API: `toasts: Signal<readonly Toast[]>`, `success(msg)` 4 s, `info(msg)` 5 s, `warning(msg)` 6 s, `error(error: AppError | string)` 8 s (muestra `requestId` si es `AppError`), `dismiss(id)`. Auto-descarte con `setTimeout`. Renderizado por `ToastHostComponent`. Usado por los componentes de `features` con acciones y por `ToastHostComponent`.

### `confirm.service.ts` — `ConfirmService`
`ConfirmRequest { title; message; confirmLabel?; cancelLabel?; danger? }`, `PendingConfirm extends ConfirmRequest { resolve(accepted: boolean) }`. API: `pending: Signal<PendingConfirm|null>`, `confirm(request): Promise<boolean>` (una nueva confirmación cancela —resuelve `false`— la pendiente). Renderizado por `ConfirmDialogHostComponent`. Usado por `CompanyLinksComponent`, `users.component` y las pantallas de `platform` con acciones destructivas.

### `action-feedback.service.ts` — `ActionFeedbackService`
Aviso de acciones: estado `working` (etiqueta; se muestra el camión) y `done` (mensaje de éxito). Tipo `ActionFeedbackState`; constantes exportadas `MIN_WORKING_MS = 2200` (el aviso `working` se ve al menos ese tiempo) y `DONE_VISIBLE_MS = 3200`.

| Miembro | Descripción |
|---|---|
| `state` | `Signal<ActionFeedbackState \| null>` (readonly) |
| `start(label)` | pasa a `working` |
| `finish(message)` | pasa a `done` (esperando el tiempo mínimo de `working`) y se cierra solo |
| `close()` | cierra sin mensaje (el error se avisa aparte con un toast) |

Renderizado por `ActionFeedbackHostComponent` (`shared/ui/action-feedback-host.component.ts`). Lo usan `company-profile`, `company-links`, `intelligence-admin`, `users` y las pantallas de `platform` con mutaciones.

## 9. `preferences/`

### `theme.service.ts` — `ThemeService`
Preferencias de apariencia por navegador (no sensibles), guardadas en `localStorage` con `try/catch` (claves `logyco2.theme`, `logyco2.palette`, `logyco2.reducedMotion`). Tipos: `ThemePreference = 'system' | 'light' | 'dark'` y `PaletteName = 'brand' | 'classic'`.

| Miembro | Descripción |
|---|---|
| `preference`, `palette`, `reducedMotion` | signals readonly con lo elegido |
| `resolved` | `Signal<'light' \| 'dark'>`: tema aplicado (`system` sigue `prefers-color-scheme`) |
| `setTheme(theme)`, `setPalette(palette)`, `setReducedMotion(reduced)` | guardan y aplican |

Aplica los atributos `data-theme`, `data-palette` y `data-motion="reduced"` al elemento raíz del documento. Lo instancia `app.ts` y lo usa `SettingsComponent`.

## 10. Specs existentes

`access-policy.spec`, `auth.facade.spec`, `landing-policy.spec`, `platform-access.spec`, `session-lifecycle.spec`, `session-persistence.spec`, `organization-context.spec`, `scoped-resource.spec`, `fetch-all-pages.spec`, `http-error-mapper.spec`, `auth.guards.spec`, `landing.guards.spec`, `platform.guards.spec`, `interceptors.spec`, `action-feedback.service.spec`, `theme.service.spec`. Faltan specs de `ToastService`, `ConfirmService` y `error-catalog`. [V por listado de archivos; contenido de specs no leído]

## 11. Hallazgos de calidad

| ID | Sev. | Archivo | Hallazgo | Sugerencia |
|---|---|---|---|---|
| H-C1 | Media | `core/interceptors/auth.interceptor.ts` | `request.url.startsWith(apiRoot)` sin separador: `http://host/api/v1evil` también coincide; improbable (origen fijado por config) pero frágil. | Comparar con `apiRoot + '/'` o con `new URL()` y origen exacto |
| H-C2 | Baja | `core/auth/auth.facade.ts` | `logout()` llama `POST /auth/logout` (borra la cookie) pero el proveedor corporativo no revoca: un token copiado antes sigue válido hasta su `exp`. | Revocación en servidor si LOGYCA la exige (tabla de sesiones en el backend) |
| H-C3 | Media | `core/auth/access-policy.ts` | Duplicación de la matriz RBAC del backend; deriva silenciosa posible (solo UX). | `/auth/me` con permisos efectivos |
| H-C4 | Baja | `core/auth/session-expiry.handler.ts` | Con identidad pero sin usuario (flujo de invitación) un 401 no limpia la identidad (`isAuthenticated()` es false). | Limpiar también si `hasIdentity()` |
| H-C5 | Baja | `core/org/context-reset.ts` | `ContextResetRegistry` nunca desregistra; fuga potencial si se registrara estado de componentes transitorios (hoy solo facades y stores root, p. ej. `OrganizationLogoStore`). | Devolver un `unregister` o ligar a `DestroyRef` |
| H-C6 | Baja | `core/org/scoped-resource.ts` | `load()` mantiene `data` previo en estado `loading`; si la UI no distingue `status`, muestra datos obsoletos (de otro filtro/página) sin indicador. `ResourceStateComponent` muestra skeleton en `loading`, por lo que en la práctica no se ve. | Documentar el contrato (la opción `keepData` ya cubre la recarga silenciosa) |
| H-C7 | Baja | `core/http/fetch-all-pages.ts` | `reduce` con `[...acc.items, ...page.items]` es O(n²) (≤ 20 págs.); peticiones secuenciales (`expand`). | Acumular en un array mutable local; considerar paginación/filtro en servidor |
| H-C8 | Baja | `core/notifications/toast.service.ts` | `setTimeout` no se cancela en `dismiss` manual (inocuo: filtra por id) y no hay tope de toasts apilados; `.alert-info` y `.badge-info` no están definidas en `styles.scss` (ni en otro `.scss`) [V]. | Añadir `.alert-info` y límite máximo |
| H-C9 | Baja | `core/notifications/confirm.service.ts` | La confirmación no atrapa foco más allá de `<dialog>` modal nativo; sin `aria-describedby` en el host (ver [shared.md](shared.md)). | Añadir `aria-describedby` |
| H-C10 | Info | `core/auth/auth.facade.ts` vs `features/*/*.facade.ts` | `AuthFacade` vive en `core` y depende de `Router` (framework) mientras el resto de facades vive en `features`; la capa "aplicación" queda repartida. | Documentarlo o mover a `features/auth` |
| H-C11 | Info | `core/errors/error-catalog.ts` | Mezcla mensajes y constante específica de negocio (`SUPER_ADMIN_LIMIT_MESSAGE`), duplicada con el backend. | Mantener en sincronía vía `error.code` y evitar texto duplicado |

SOLID rápido: SRP bien respetado; DIP excelente (`AuthFacade` depende del puerto `AuthRepository`); OCP bien en el catálogo de errores; ISP y LSP sin problemas.

## 12. Cómo extender

- **Nuevo código de error del backend**: añadir `CODIGO: 'mensaje'` en `ERROR_MESSAGES` (`core/errors/error-catalog.ts`). No hace falta tocar nada más.
- **Nuevo permiso**: añadir a `PERMISSION_CODES` (`domain/models/identity.ts`) y a las matrices de `access-policy.ts`; proteger la ruta con `permissionGuard('x:y')` y/o un `NavItem.requires`.
- **Nuevo estado dependiente de la organización**: en un facade `root`, `readonly x = inject(ContextResetRegistry).track(new ScopedResource<T>())`.
- **Nueva pantalla que recarga con la org**: en el constructor `reloadOnContextChange(() => this.facade.load())`.
- **Nuevo interceptor**: crear `core/interceptors/x.interceptor.ts` (`HttpInterceptorFn`, `inject()` solo síncrono) y añadirlo a `withInterceptors([...])` en `app.config.ts`, respetando el orden.
- **Nueva variable de entorno**: ampliar `AppConfig`, `scripts/generate-env.mjs` (validación y salida), `.env.example` y el pipeline.
- **Nuevo módulo sin backend**: no toca `core`: ruta con `ComingSoonComponent` + ítem de menú `soon: true` (ver [architecture.md](architecture.md), sección «Cómo extender»).
