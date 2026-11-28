# LoGyCO₂ · Frontend

Mide, analiza y reduce tu huella de carbono · Una plataforma de LOGYCA.

Angular 20 (standalone, signals) · TypeScript 5.9 · npm · SCSS · Karma/Jasmine · angular-eslint.

## Comandos

```bash
cp .env.example .env      # configuración por entorno (ver «Configuración»)
npm install
npm start                 # http://localhost:4200  (`ng serve` reenvía /api a http://127.0.0.1:8120 con proxy.conf.json)
npm run test:ci           # requiere Chrome (export CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
npm run lint
npm run build:prod        # exige APP_ENV=production y las demás variables (las define el pipeline); `npm run build` es el mismo bundle y tiene la misma guarda
```

## Configuración

La configuración por entorno sale de `.env` (local, ignorado por Git; plantilla en `.env.example`) o de variables del proceso (pipeline), que tienen prioridad. `scripts/generate-env.mjs` las valida y genera `src/environments/environment.ts` (también ignorado) antes de `start`, `build`, `build:prod`, `watch`, `test`, `test:ci` y `lint`.

| Variable | Valores |
|---|---|
| `APP_ENV` | `development` o `production` (`build:prod` exige `production`) |
| `API_BASE_URL` | vacío = mismo origen (recomendado; en desarrollo lo atiende el proxy `proxy.conf.json`). Si se define, origen absoluto sin ruta ni barra final y con el MISMO host que la página |
| `API_PREFIX` | prefijo de versión de la API, p. ej. `/api/v1` |

El backend debe tener el origen del frontend (p. ej. `http://localhost:4200`) en su variable `CORS_ALLOWED_ORIGINS`.

## Arquitectura

UI → Facades (`features/*/**.facade.ts`) → contratos (`domain/repositories`, clases abstractas como token DI)
→ implementaciones HTTP (`infrastructure/repositories`) → FastAPI. Los componentes no usan `HttpClient` ni URLs.
El enlace contrato↔implementación vive solo en `infrastructure/providers.ts`.

- `core/errors`: `AppError` + catálogo de mensajes por `error.code` (nunca se muestra el texto crudo del servidor).
- `core/org`: organización activa; `ContextResetRegistry` descarta todo el estado al cambiar de organización o cerrar sesión; `ScopedResource` descarta respuestas tardías.
- `core/auth`: sesión por cookie HttpOnly del backend; el estado (sin token) vive en memoria (ver «Sesión» abajo).
- `AccessPolicy` espeja la matriz rol→permiso solo para **mostrar/ocultar**; `/auth/me` devuelve roles, no permisos. El backend autoriza.

## Estado de los módulos

| Módulo | Estado |
|---|---|
| Login (`POST /auth/login`), usuario (`GET /auth/me`) | Real |
| Organizaciones: «Datos de mi empresa» (el administrador edita nombre, contacto y logo), vínculos comerciales y contrapartes externas; alta, datos sensibles, activar/desactivar, tipos y eliminación (`/organizations…`, `/organization-types`) | Real (alta, datos sensibles, estado, tipos y eliminación solo con rol global) |
| Dashboard de plataforma (`GET /platform/metrics`) | Real |
| Usuarios, invitaciones (crear/revocar/aceptar), estado de membresías | Real |
| Operaciones, cargas, conciliación, calidad, evidencias, emisiones, análisis, reportes, reducción | **Sin backend**: la ruta muestra «Próximamente» (`ComingSoonComponent`) y el menú los marca con la etiqueta «Próximamente». `/ayuda` (pie del menú) también usa esa pantalla |

Detalle en `docs/features/system.md`.

## Pendientes conocidos

- `LOGYCA_AUTH_IDENTITY_MODE=verified_email` es una decisión de riesgo transitoria del backend; no asumir como definitiva.

## Sesión: cookie HttpOnly

El backend entrega el token en una **cookie `HttpOnly`** (`POST /auth/login`); la aplicación nunca lo lee, lo guarda ni lo envía a mano: el navegador la adjunta a las peticiones a la API (`withCredentials`). Por eso la sesión **sobrevive a recargar, abrir pestañas nuevas y navegar por URL**, y un XSS no puede robar el token. La cookie caduca con el token corporativo.

- **Arranque**: `provideAppInitializer` → `SessionBootstrap.restore()` consulta `GET /auth/me`; los guards ven la sesión ya resuelta (sin destello de login). Sin sesión, 401, error o 5 s sin respuesta = sin sesión.
- **CSRF**: toda petición a la API que cambia estado lleva `X-Requested-With: LoGyCO2` (`authInterceptor`); el backend la exige con cookie.
- **Cierre de sesión**: `POST /auth/logout` borra la cookie; se limpia el estado local aunque la llamada falle.
- **Entre pestañas**: `CrossTabSession` (BroadcastChannel; respaldo con el evento `storage`) avisa de login/logout; solo viaja la palabra `login` o `logout`.
- **Caducidad**: no hay refresh (el contrato del proveedor no está confirmado). Un 401 con sesión activa limpia el estado y lleva a `/login?reason=expired&returnUrl=…`. `GET /auth/me` informa `session_expires_at` (se muestra en Configuración).
- **Nada sensible en el navegador**: ni `localStorage` ni `sessionStorage` guardan token ni usuario.
- **Desarrollo**: `API_BASE_URL=` (vacío) y `ng serve`: el proxy `proxy.conf.json` reenvía `/api` a `127.0.0.1:8120`, así SPA y API son el MISMO origen (cookie de primera parte, sin CORS; igual que producción). Abra siempre `http://localhost:4200`. Evite `API_BASE_URL=http://127.0.0.1:8120`: `localhost` y `127.0.0.1` son sitios distintos y el navegador no envía la cookie (Brave/Chrome bloquean terceros). En el `.env` del backend, `CORS_ALLOWED_ORIGINS` debe incluir `http://localhost:4200` (la comprobación anti-CSRF compara el `Origin`); `AUTH_COOKIE_SECURE` se deduce de `APP_ENV` (false en development). Si el login responde pero la sesión no persiste, la pantalla dice «La sesión no se guardó…» (`SESSION_NOT_SAVED`). **Producción**: HTTPS, `AUTH_COOKIE_SECURE=true`, frontend y API en el mismo sitio. Detalle en el backend: `docs/modules/auth.md` §13 y `docs/tasks/persistent-session.md`.
- **Límites**: sin refresh; el logout no revoca en el proveedor (un token copiado vale hasta su `exp`).

## Identidad visual

- Isotipo original: anillo abierto (carbono) por el que sale una ruta hacia un nodo de medición. Wordmark y subtítulo son
  trazados de **Inter** (SIL OFL, `public/fonts/Inter-OFL-LICENSE.txt`); la tipografía de la UI es Museo Sans (300 y 700, `public/fonts/MuseoSans-*.otf`; Museo para titulares solo si está instalada en el equipo).
- Componentes: `app-logo` (`horizontal` · `compact` · `mark`; temas `light` · `dark` · `mono`) y `app-logyca-logo`
  (asset oficial `public/brand/logyca-logo.png`, sin recolorear; sobre fondo oscuro va en pastilla blanca).
- El logotipo LoGyCO₂ se dibuja en SVG nativo desde `src/app/shared/ui/logo-shapes.ts` (no hay variantes SVG estáticas); `public/brand/logo.png` es la imagen de origen de esa vectorización y `public/favicon.svg` el icono de la pestaña.
  Los trazados se generan a partir de la fuente y la geometría del isotipo.
- Por debajo de 32 px el isotipo usa trazos reforzados y sin halo. Anillo con degradado (esmeralda→lima sobre oscuro,
  verde profundo→esmeralda sobre claro); `app-logo [motion]` anima el logo (ver «Movimiento del logo»; respeta `prefers-reduced-motion`).
- Lema del logo: «Mide, analiza y reduce tu huella de carbono». Se cambia en una sola constante (`SLOGAN`) del generador y se regeneran
  `logo-shapes.ts` y los SVG de `public/brand/`.
- Transición de acceso: al autenticarse se muestra «Acceso verificado» (check animado, saludo y hitos) y luego se navega al destino que decide `LandingPolicy` (5 s; 0,9 s con `prefers-reduced-motion`; el botón «Entrar ahora» salta la espera). Se cancela si se sale de la pantalla.
- LOGYCA sin fondo: sobre fondos oscuros el texto se muestra en blanco (capa invertida) y el cuadrado conserva el naranja original.

### Movimiento del logo
`app-logo [motion]`: `none` (estático) · `entrance` (el camión llega, la hoja brota, las barras suben) · `live` (entrada + movimiento continuo y sutil:
hoja que se mece, barras tipo ecualizador, nube que flota) · `hover` (reposo hasta pasar el cursor; usado en el sidebar). El isotipo está dividido en piezas
(`leaf`, `bar1-3`, `cloud`, `truck`, `swooshW/G`) vectorizadas desde `public/brand/logo.png`. Todo se desactiva con `prefers-reduced-motion`.
Wordmark y lema son trazados de Inter (ExtraBold y SemiBold) para máxima nitidez; el bloque de texto tiene la altura del isotipo.

## Consola de plataforma (`/plataforma`, rol global `SUPER_ADMIN`)

Contexto **separado** del espacio de organización. Para entrar se exige el rol GLOBAL `SUPER_ADMIN` informado por `GET /auth/me`
(`global_roles`) y confirmado con una **consulta fresca al entrar** (`platformGuard`). Cualquier fallo o respuesta incompleta se
interpreta como denegado; un `ORG_ADMIN` (rol por organización) nunca obtiene acceso global. El menú, el selector de contexto y el
aterrizaje tras el login son solo pistas de interfaz: la autorización real la aplica FastAPI en cada endpoint.
No se concedió ningún rol ni se tocaron datos de autorización.

### Secciones de la consola

| Sección | Ruta | Qué hace |
|---|---|---|
| Resumen ejecutivo | `/plataforma/resumen` | KPI del estado actual, evolución mensual por año, distribución por tipo, acciones pendientes, actividad reciente y precios de combustibles; selector de período (7/30/90 días o rango) para las variaciones |
| Empresas | `/plataforma/organizaciones[/:id]` | Lista paginada en el servidor con indicadores, filtros y orden; alta con primer administrador; detalle con edición, activar/desactivar, tipos, administrador y equipo, relaciones comerciales, actividad, eliminación lógica, restauración y eliminación definitiva |
| Usuarios | `/plataforma/usuarios[/:id]` | Personas de empresa (paginadas en el servidor) e invitaciones; detalle con la membresía |
| Superadministradores | `/plataforma/superadministradores[/:id]` | Cupos (máximo 5 activos), incorporación por invitación, revocación, detalle |
| Roles y accesos | `/plataforma/roles`, `/plataforma/roles/matriz` | Perfiles funcionales con capacidades y personas, y matriz técnica de solo lectura |
| Actividad y auditoría | `/plataforma/auditoria` | Auditoría persistente paginada por cursor, con filtros y panel de detalle |
| Estado de la plataforma | `/plataforma/estado` | Servicios (API, base de datos, SSO, directorio, procesamiento) y actualización de datos de referencia |
| Mi cuenta | `/plataforma/configuracion` | Cuenta y apariencia (`SettingsComponent`) |
| Herramientas complementarias | `/plataforma/intelligence/{energia,costos,fuentes}` | Intelligence: referencias de combustibles, costos de transporte y administración de fuentes |
| Descarbonización | `/plataforma/vehiculos`, `…/operaciones`, `…/cargas`, `…/calidad`, `…/reportes` | «Próximamente» (`ComingSoonComponent`); sin datos ni backend |
| Descarbonización → Cálculo de emisiones | `/plataforma/calculo-emisiones` | Funcional: guía de vehículos de carga, fórmulas, factor de emisión por combustible (desde `.env` del backend) y calculadora (`features/emissions`, ver `docs/features/emissions.md`) |

### Endpoints consumidos (reales)

| Endpoint | Uso en la consola | Nota de alcance |
|---|---|---|
| `GET /auth/me` | Confirmar rol global al entrar y restaurar la sesión | `global_roles` |
| `GET /organizations`, `GET /organizations/{id}` | Listado y detalle (incluye `active_admins` y `pending_invitations`) | Global con permiso global; si no, por membresía. 404 si no hay relación |
| `PATCH /organizations/{id}`, `PATCH /organizations/{id}/status` | Editar, activar/desactivar (con confirmación) | Exigen permiso GLOBAL; un `ORG_ADMIN` recibe 403 |
| `GET /organization-types`, `PUT /organizations/{id}/types`, `GET /organizations/{id}/relationships` | Tipos y relaciones comerciales | Las relaciones son de solo lectura; no son membresías |
| `GET /platform/metrics` | KPI acumulados (organizaciones, usuarios, membresías, invitaciones, cupos de superadministradores) | Agregados en PostgreSQL; rol global |
| `GET /platform/metrics/trends?days=\|date_from&date_to` | Movimiento de UN período (no acumulado), por día o por mes | Rangos de hasta 366 días; días de Colombia |
| `GET /platform/attention` | Acciones pendientes (sin administrador, membresías, invitaciones por vencer, inactivas, cupo) | Rol global |
| `GET /platform/activity?limit&days&organization_id` | Actividad reciente del resumen y del detalle de empresa | Sin secretos ni correos en claro |
| `GET /platform/audit`, `GET /platform/audit/{id}` | Auditoría por cursor con filtros y detalle de un evento | Total acotado en la primera página |
| `GET /platform/operations?days=`, `GET /platform/services` | Actualización de datos de referencia y SSO/directorio en «Estado» | Rol global |
| `POST /organizations/{id}/delete`, `/restore`, `/purge`, `GET /organizations/{id}/deletion-preview` | Eliminación lógica, restauración y eliminación definitiva de una empresa | Exigen escribir el nombre de la empresa |
| `POST /onboarding/organizations`, `/onboarding/members`, `/onboarding/invitations/{id}/resend`, `/onboarding/activation[/check]` | Alta de empresa con su primer administrador, incorporación de personas, reenvío y activación de cuenta | El código del correo es de un solo uso |
| `GET /platform/super-admins`, `GET /platform/super-admins/{id}` | Cupos, titulares, invitaciones, detalle | Solo un SUPER_ADMIN activo |
| `POST /platform/super-admins/invitations` | Incorporar (exige `confirm: true`); entrega el código UNA vez | 409 `SUPER_ADMIN_LIMIT_REACHED` si activos + reservas llegan a 5 |
| `POST /platform/super-admins/invitations/{id}/revoke` | Revocar una invitación pendiente | Libera el cupo reservado |
| `POST /platform/super-admins/invitations/accept` | La persona invitada acepta con su código (`sa_…`) estando autenticada | Verifica la identidad; vuelve a comprobar el cupo |
| `POST /platform/super-admins/{id}/revoke` | Revocar el rol global (exige `confirm: true`); la cuenta no se elimina | 422 `LAST_GLOBAL_ADMIN` si fuera el último activo |
| `GET /rbac/catalog`, `GET /rbac/roles/{code}/assignments` | Matriz de roles y permisos; quién tiene cada rol | Solo lectura |
| `GET /users` (con `global_roles`), `GET /users/{id}` | Usuarios; los roles globales solo se entregan a administradores de plataforma | |
| `GET/POST /users/invitations`, `POST /users/invitations/{id}/revoke`, `POST /users/invitations/accept` | Invitaciones de empresa (también «primer administrador» con `role_code: ORG_ADMIN`) | Código de un solo uso mostrado una vez |
| `PATCH /organizations/{org}/memberships/{id}` | Aprobar / rechazar / suspender / revocar | El backend valida la transición |
| `GET /health/live`, `GET /health` | Estado de servicios | Raíz del backend, sin sobre `{data}` |

### Alcance de la consola

Con backend: seguridad de acceso, organizaciones, tipos, relaciones, superadministradores, RBAC, métricas y tendencias, actividad y auditoría, usuarios, membresías, invitaciones, incorporación y estado de servicios.
Sin backend (la ruta muestra «Próximamente», sin entrada en el menú): `/plataforma/vehiculos`, `…/operaciones`, `…/cargas`, `…/calidad` y `…/reportes`.
Las listas de empresas, usuarios y auditoría se paginan y filtran en el servidor; `fetchAllPages` solo lo usan algunos selectores y detalles (ver `docs/features/platform.md`).
