# Feature `auth` (login, activación de cuenta y aceptación de invitación)

Leyenda: [V] verificado leyendo el código de la feature; [?] no comprobado (depende de código fuera de `features/**`).

Ruta de código: `src/app/features/auth/`
Archivos: `login.component.ts` (398 l., estilos + template inline), `login-success.component.ts` (93 l., estado de éxito), `accept-invitation.component.ts` (139 l.), `activate-account.component.ts` (163 l.); specs `login.component.spec.ts`, `login-experience.spec.ts`, `accept-invitation.component.spec.ts`, `activate-account.component.spec.ts`. El estado de incorporación que usa la activación vive en `src/app/features/onboarding/` (ver sección 4).

## 1. Propósito y flujo de usuario

- **Login** (`/login`): formulario correo + contraseña contra el backend (`AuthFacade.login`). Panel izquierdo de marca (animaciones decorativas), panel derecho con el formulario y, al pie de la tarjeta, el logo del CLI (`public/brand/logo-cli.svg`, del manual de marca). Al autenticarse se muestra una transición animada de éxito (5 s; 0,9 s con `prefers-reduced-motion`) y luego se navega. [V]
- Destino tras login: lo decide `LandingPolicy.resolve(returnUrl)` (`core/auth/landing-policy.ts`): respeta `?returnUrl=` solo si es una ruta interna a la que la persona puede entrar; si no, un `SUPER_ADMIN` global va a `/plataforma/resumen`, quien tiene membresía a `/resumen` y quien no a `/acceso-pendiente`. [V]
- Si el backend responde `USER_NOT_REGISTERED` (identidad válida sin usuario local) se redirige a `/aceptar-invitacion`. [V]
- **Aceptar invitación** (`/aceptar-invitacion`): el usuario con token pero sin cuenta pega el código de invitación. Si el código empieza por `sa_` se trata como invitación de superadministrador (`SuperAdminsRepository.accept`); si no, como invitación de organización (`InvitationsRepository.accept`). Luego `AuthFacade.refreshUser()` y navegación a `/plataforma` (superadmin) o `/resumen`. La membresía normal queda PENDIENTE hasta aprobación de un admin. El código puede llegar prellenado desde el fragmento `#codigo=` de la URL o desde `sessionStorage` (clave `PENDING_INVITATION_KEY`, que guarda la activación de cuenta). [V]
- **Activar cuenta** (`/activar`): pública. La persona invitada abre el enlace del correo (el código viaja en el fragmento `#codigo=`, que se borra de la barra de direcciones), el backend valida el enlace (`checkActivation`), la persona elige su contraseña (8 a 128 caracteres, con confirmación) y el backend la fija en el directorio corporativo. Fases: `checking`, `blocked` (enlace expirado, ya usado, no aplicable o inválido), `form` y `done`; al terminar guarda el código en `sessionStorage` y lleva a `/login?returnUrl=/aceptar-invitacion`. [V]

## 2. Rutas (`app.routes.ts`) [V]

| Path | Guard | Carga | Componente |
|---|---|---|---|
| `login` | `canActivate: [guestGuard]` (si ya hay sesión -> `LandingPolicy.home()`) | `loadComponent` lazy | `LoginComponent` |
| `activar` | ninguno (pública) | lazy | `ActivateAccountComponent` |
| `aceptar-invitacion` | `canActivate: [tokenGuard]` (exige token; si no -> `/login`) | lazy | `AcceptInvitationComponent` |

Las tres están fuera del `ShellComponent` (pantalla completa, sin sidebar). `authGuard` (en `core/guards/auth.guards.ts`) redirige a `/aceptar-invitacion` cuando hay token pero no usuario local y a `/login?returnUrl=` si no hay token.

## 3. Árbol de componentes

Los tres son componentes standalone `OnPush` "container" autónomos (sin hijos propios de la feature; usan `LogoComponent` y, el login, `LogycaLogoComponent` de `shared/ui/logo.component`). No hay presentacionales separados: todo el markup/estilos viven en el mismo archivo (ver hallazgos).

### 3.1 `LoginComponent` (`selector: app-login`)
- **Inputs/outputs**: ninguno. Lee `ActivatedRoute.snapshot.queryParamMap` (`reason`, `returnUrl`). [V]
- **Servicios inyectados**: `AuthFacade` (`auth`, protected), `Router`, `ActivatedRoute`, `DestroyRef`, `ElementRef` host, `LandingPolicy`, `SessionStore` (`user()`), `FormBuilder`. [V]
- **Signals**: `error: AppError|null`, `showPassword`, `capsLock`, `phase: 'form'|'success'`, `successMs`, `firstName`, `destination: 'platform'|'workspace'`, `reason` (query `reason`), `hasReturnUrl`. `viewChild.required` de `#panel`. Constantes exportadas `SUCCESS_MS=5000`, `SUCCESS_REDUCED_MS=900`. La validación del `returnUrl` ya no está en el componente: la hace `LandingPolicy` (`resolve`). [V]
- **Formulario** (`nonNullable.group`): `email` (`required`, `email`), `password` (`required`). Mensajes: "Ingresa tu correo electrónico." / "El correo no tiene un formato válido." / "Ingresa tu contraseña." Atributos `aria-invalid` y `aria-describedby` enlazados a `#email-error`/`#password-error`. `autocomplete="username"` / `current-password`. [V]
- **`submit()`**: `markAllAsTouched`; si inválido enfoca el primer `[aria-invalid="true"]` (con `setTimeout`); evita doble envío con `auth.loading()`; limpia error, oculta contraseña, trim al email; `auth.login(...).pipe(takeUntilDestroyed)`. En éxito: resetea la contraseña y `startSuccessTransition()`. En error: `toAppError`, resetea contraseña, `USER_NOT_REGISTERED` -> navega `/aceptar-invitacion`; otro -> `error.set` y enfoca `#password`. [V]
- **Template**: sección `.brand-panel` (SVG decorativo `aria-hidden`, logo, titular, pasos "Registra / Mide / Compara / Reduce", lema, firma LOGYCA) con `(pointermove)` que actualiza variables CSS `--mx/--my/--px/--py` (parallax) vía `requestAnimationFrame`; sección `.form-panel` con el `<form>`: avisos (`data-testid="expired-notice"` si `reason==='expired'`, `continue-notice` si hay `returnUrl`), alert de error (`data-testid="login-error"`, muestra `message`, `retryAfterSeconds`, `requestId`), campos, botón mostrar/ocultar contraseña (`data-testid="toggle-password"`), aviso Bloq Mayús (`caps-lock`), botón enviar (`login-submit`, `aria-busy`). En `phase==='success'`: bloque `login-success` (check animado, saludo `login-greeting`, hitos, camión, botón "Entrar ahora" `login-skip`) y capa `.wipe` de transición. [V]
- **Éxito**: la fase `success` la pinta `LoginSuccessComponent` (`app-login-success`; inputs `firstName` y `destination`, output `skip` para «Entrar ahora»; sus animaciones `draw/pop/stepIn/fill/drive` y el check viven en su archivo y usan `--t` heredado del contenedor). [V]
- **Estilos**: CSS inline del formulario y del panel de marca (gradientes naranja, blobs, cuadrícula, hojas apiladas detrás de la tarjeta, pasos numerados con contador CSS, animaciones `drift/flow/travel/ping/reveal/lit/wipe`), media query `max-width: 860px` (una columna, oculta decorativos) y bloque `prefers-reduced-motion` que desactiva animaciones. Tiempo de éxito pasado a CSS por `--t` (`[style.--t.ms]="successMs()"`). Usa tokens globales `--c-*`. [V]
- **Limpieza**: `DestroyRef.onDestroy` cancela `navigationTimer` (setTimeout) y `requestAnimationFrame` pendiente; el spec comprueba que no navega si se sale durante la animación. [V]

### 3.2 `AcceptInvitationComponent` (`selector: app-accept-invitation`)
- Inputs/outputs: ninguno.
- Servicios: `AuthFacade` (`auth`), `InvitationsRepository`, `SuperAdminsRepository`, `Router`, `ToastService`, `DestroyRef`, `FormBuilder`. [V]
- Signals: `loading`, `error`, `accepted`, `superAdmin`. [V]
- Formulario: `code` con `required`, `minLength(20)`, `maxLength(200)` (mismos límites que `InvitationAccept.code` del backend). Mensaje: "El código debe tener al menos 20 caracteres." Campo `type="password"` (oculta el código), `autocomplete="off"`. [V]
- `submit()`: valida, `trim`, detecta prefijo `SUPER_ADMIN_CODE_PREFIX='sa_'` (exportado), elige repositorio, `switchMap` a `auth.refreshUser()`; éxito -> toast "Invitación aceptada." y navegación; error -> `toAppError`; si `accepted()` y el código es `USER_NOT_REGISTERED` se ignora (la membresía queda pendiente: aún no hay usuario activo). Botón "Cancelar sesión" llama `auth.logout()`. [V]
- Template: `<main>` con tarjeta, estilos inline `style="..."`; `role="alert"` para error y `role="status"` (`data-testid="accepted"`) para éxito (texto distinto superadmin / membresía pendiente). [V]

## 4. Servicios/stores
La feature no define servicios propios; usa `AuthFacade`, `SessionStore`, `LandingPolicy` (core), `OnboardingFacade` (`features/onboarding/onboarding.facade.ts`, casos de uso de incorporación: `onboardOrganization`, `onboardMember`, `status`, `resend`, `checkActivation`, `activate`) y los repositorios del dominio. `features/onboarding/` contiene además `OnboardingStatusComponent` (`app-onboarding-status`, input `status`, input `busy`, output `resend`; estado en tres pasos —identidad, correo y activación— con reenvío; lo usan `platform-organizations` y `platform-organization-detail`) y `onboarding.labels.ts` (`onboardingError`, `NEXT_STEP_HINT`, `ROLE_NAMES`).

## 5. Endpoints HTTP consumidos (indirectos, vía repositorios) [V por `infrastructure/repositories`]
| Acción | Método y ruta | Repositorio |
|---|---|---|
| Login | `POST /auth/login` (`LoginResponseDto` -> `AuthToken`) | `HttpAuthRepository.login` |
| Usuario actual | `GET /auth/me` (`MeResponseDto` -> `CurrentUser`) | `getCurrentUser` (vía `AuthFacade`) |
| Aceptar invitación org | `POST /users/invitations/accept` body `{ code }` | `HttpInvitationsRepository.accept` |
| Aceptar invitación superadmin | `POST /platform/super-admins/invitations/accept` body `{ code }` | `HttpSuperAdminsRepository.accept` |
| Validar enlace de activación | `POST /onboarding/activation/check` body `{ code }` | `HttpOnboardingRepository.checkActivation` (vía `OnboardingFacade`) |
| Activar cuenta | `POST /onboarding/activation` body `{ code, password }` | `HttpOnboardingRepository.activate` (vía `OnboardingFacade`) |

## 6. Permisos / roles
Sin permisos: login es público (`guestGuard`), la activación es pública y la aceptación de invitación requiere sólo token (`tokenGuard`). El destino tras el login lo decide `LandingPolicy` (rol global `SUPER_ADMIN`, membresías).

## 7. Errores y estados
- Login: loading (`auth.loading()` deshabilita botón, `aria-busy`, spinner "Iniciando sesión…"); error con mensaje del catálogo, "Reintenta en N s." (rate-limit `retryAfterSeconds`), id de solicitud; sesión expirada (`reason=expired`); aviso de ruta protegida.
- Invitación: "Validando…" durante la petición; error del catálogo; éxito con dos textos.
- `LandingPolicy.resolve` rechaza URLs externas, `//host` y `/login*` (anti open-redirect). [V]
- Activación: «Validando tu enlace…», bloqueos con mensajes (`EXPIRED`, `USED`, `NOT_APPLICABLE`, `INVALID`), error del backend traducido con `onboardingError`, éxito «Cuenta activada».

## 8. Hallazgos de calidad

| Sev. | Hallazgo | Ubicación | Sugerencia |
|---|---|---|---|
| Media | **Componente grande / SRP** (parcialmente resuelto): el estado de éxito ya es `LoginSuccessComponent`; `login.component.ts` (398 líneas) aún mezcla el CSS y la plantilla del panel de marca, la lógica del formulario y el efecto parallax. | `login.component.ts` | Extraer `LoginBrandPanelComponent` (presentacional, solo marca y animación). |
| Baja | **Destino duplicado**: el destino del login lo decide `LandingPolicy`, pero `AcceptInvitationComponent` fija el suyo (`superAdmin ? '/plataforma' : '/resumen'`). | `accept-invitation.component.ts` | Usar `LandingPolicy` también tras aceptar la invitación. |
| Media | **Acoplamiento a prefijo mágico**: el componente decide el tipo de invitación por `startsWith('sa_')`; es una regla de backend filtrada a UI. | `accept-invitation.component.ts` | Mover a un único `InvitationRouter`/repositorio fachada o que el backend devuelva el tipo (OCP: añadir nuevos tipos hoy exige editar el componente). |
| Baja | **DIP**: `AcceptInvitationComponent` inyecta dos repositorios directamente en vez de pasar por una fachada (el resto de features usa facade). | `accept-invitation.component.ts` | Crear `InvitationFacade.accept(code)`. |
| Baja | `import` de `LogoComponent` colocado tras la constante exportada (orden de imports). | `accept-invitation.component.ts` | Reordenar. |
| Baja | **Estilos inline** (`style="..."`) en el template de invitación en lugar de clases. | `accept-invitation.component.ts` | Usar clases utilitarias/`styles`. |
| Baja | **setTimeout para foco** sin cancelar al destruirse (inofensivo pero no limpio). | `login.component.ts` | `afterNextRender` o `queueMicrotask`; o cancelar en `onDestroy`. |
| Baja | `matchMedia` accedido directamente (no SSR-safe; sin servicio inyectable). | `login.component.ts` | Servicio `MotionPreference` inyectable (también facilita tests). |
| Info | A11y correcta: `aria-invalid`, `aria-describedby`, `role=alert/status`, `aria-live`, decorativos `aria-hidden`, `prefers-reduced-motion`, foco al primer inválido. Falta `aria-live` en aviso Bloq Mayús (tiene `role=status`). [V] | — | — |
| Info | Seguridad: contraseña reseteada tras cada intento; el código de invitación va en `type=password`; `safeReturnUrl` evita redirección abierta. La contraseña no se persiste. [V] | — | — |
| Info | Suscripciones: todas con `takeUntilDestroyed`; no hay `any`. [V] | — | — |

## 9. Cómo extender
- **Nuevo tipo de invitación**: añadir prefijo/ruta de aceptación y repositorio; idealmente refactorizar `submit()` a un mapa `prefijo -> {repo, destino}`.
- **Nuevo destino post-login por rol**: modificar `startSuccessTransition` (`login.component.ts`) o, mejor, extraer la política de redirección.
- **Nuevos mensajes de error**: se agregan en `core/errors/error-catalog.ts`; el componente sólo muestra `AppError.message`.
- Pruebas: specs existentes cubren validación, transición animada (fakeAsync), `returnUrl`, roles y a11y; usar `data-testid` listados arriba.
