# Feature `organizations` («Datos de mi empresa»)

Leyenda: [V] verificado en código; [?] no comprobado.
Código: `src/app/features/organizations/` -> `company-profile.component.ts`, `company-links.component.ts`, `company-profile.facade.ts`, `links.facade.ts`, `logo.store.ts`, `organizations.facade.ts`; specs: `company-profile.component.spec.ts`, `company-links.component.spec.ts`. La **administración** global de organizaciones (crear/editar/tipos/activar/eliminar) vive en la feature `platform` (ver [platform.md](platform.md)).

## 1. Propósito y flujo [V]
Pantalla única de la empresa activa: información general y de contacto (el administrador edita nombre, contacto y logo), actividad y sector, empresas vinculadas (solicitudes de vínculo y contrapartes externas) y configuración (rol propio y quién puede cambiar qué). No hay lista ni detalle de organizaciones en el espacio de empresa.

## 2. Rutas [V]
`app.routes.ts`, bajo `ShellComponent` + `authGuard`:
- `mi-empresa` (`breadcrumb: 'Datos de mi empresa'`, `permissionGuard('organizations:read')`) -> `CompanyProfileComponent` (lazy).
- `organizaciones` y `organizaciones/:id` redirigen a `mi-empresa`.
- Query params: `?tab=links` abre la pestaña «Empresas vinculadas»; dentro de ella `?sub=solicitudes|externas` y `?view=sent|history` eligen sub-pestaña y vista (los usa la campana: `HomeFacade.actions`, `home.facade.ts:34`).
- Entrada de menú: «Datos de mi empresa» (`shared/layouts/nav-items.ts:42`, grupo `admin`, `requires: ['organizations:read']`).

## 3. Componentes [V]
### `CompanyProfileComponent` (`app-company-profile`, OnPush, standalone, template y estilos inline)
- Sin inputs/outputs. Inyecta `HomeFacade`, `CompanyProfileFacade`, `OrganizationContext`, `AccessPolicy`, `ToastService`, `ActionFeedbackService`, `OrganizationLogoStore`.
- Envuelve el contenido en `<app-org-required>` y `<app-resource-state>` sobre `home.organization` (reintento -> `home.reload()`).
- Pestañas (`role="tablist"`, navegación con flechas, Home y End): `general` «Información general», `links` «Empresas vinculadas», `config` «Configuración».
  - **general**: tarjetas «Información general» (razón social y NIT con candado: solo la plataforma los modifica), «Información de contacto», «Actividad y sector» (tipos de actividad con su descripción del catálogo y barra de «Perfil completo» sobre 9 datos: nombre, razón social, NIT, tipo de actividad, correo, teléfono, dirección, ciudad, sitio web; separa lo que completa la empresa de lo que completa la plataforma) y «Empresas vinculadas» (solo lectura: `relationships`, muestra «Cliente»/«Proveedor» según `role`).
  - **links**: `<app-company-links />`.
  - **config**: «Acceso a la empresa» (rol propio, estado, enlace a `/usuarios` si `users:read` o `memberships:manage`) y «Quién puede cambiar qué» (nombre y contacto, y las empresas vinculadas: el administrador de la empresa; razón social y NIT, estado y tipos de actividad: la plataforma).
- Diálogo nativo «Editar datos de mi empresa» (visible solo con `organizations:manage`): formulario `nonNullable` con `name` (obligatorio, máx. 200), `contactEmail`, `contactPhone`, `address`, `city`, `website` (debe empezar por `http://` o `https://`) y logo (PNG, JPG o WebP, hasta 512 KB, con vista previa y «Quitar logo»). Aviso «Cambios sin guardar».
- Constructor: `reloadOnContextChange` carga `home.load()`, `profile.load()` y `logo.load()`.

### `CompanyLinksComponent` (`app-company-links`, OnPush, standalone, template y estilos inline)
- Sin inputs/outputs. Inyecta `LinksFacade`, `AccessPolicy`, `ToastService`, `ConfirmService`, `ActionFeedbackService`, `ActivatedRoute`. Solo se renderiza dentro de `CompanyProfileComponent`.
- Cuatro tarjetas de conteo (vinculadas activas, solicitudes recibidas pendientes, enviadas pendientes, contrapartes externas) y sub-pestañas «Vinculadas», «Solicitudes» (vistas Recibidas, Enviadas, Historial) y «Contrapartes externas».
- Búsqueda con retardo, `<app-pagination>` (página de 10), panel lateral de detalle (empresa, relación, historial) y diálogo «Vincular empresa» (empresa registrada o contraparte externa; edición de contrapartes externas).
- Aceptar, rechazar, cancelar y finalizar piden confirmación con `ConfirmService`; quitar una contraparte externa también. Un conflicto del backend (p. ej. `COUNTERPART_REGISTERED`) se muestra en el diálogo.
- Las acciones de gestión (vincular, responder, contrapartes) solo se ofrecen con el permiso `relationships:manage`.
- Exporta `TYPE_LABELS`, `STATUS_LABELS` y `roleText` (textos de tipo de vínculo, estado y rol propio).

## 4. Facades y store [V]
- `CompanyProfileFacade` (root): `relationships` y `types` (`ScopedResource`, registrados en `ContextResetRegistry`), `load()` (catálogo `listTypes` una sola vez; relaciones de la empresa activa), `saveProfile(changes)` (actualiza `home.organization.data`), `saveLogo(file)`, `removeLogo()`. Los tipos se leen con `OrganizationAdminRepository.listTypes`.
- `LinksFacade` (root): `summary`, `list`, `detail`, `candidates`, `external` (`ScopedResource`, registrados) y signals `view`, `search`, `page`, `externalSearch`, `externalPage`; métodos `loadSummary`, `loadList`, `loadExternal`, `openDetail`, `searchCandidates`, `clearCandidates`, `request`, `respond`, `createExternal`, `updateExternal`, `removeExternal`. Cada acción refresca conteos, lista y detalle (`{ keepData: true }`). La usa también `HomeFacade` (conteo de solicitudes pendientes).
- `OrganizationLogoStore` (root, `Resettable`): `url` (signal con URL `blob:`), `load()` (una vez por empresa), `set(blob)`, `reset()`. El logo se pide con la sesión porque un `<img>` no envía el token. Lo usan `CompanyProfileComponent` y `ShellComponent`.

## 5. Endpoints [V]
Todos vía `ApiClient`, en `infrastructure/repositories/`:
- `HttpOrganizationsRepository` (`http-identity.repositories.ts`): `GET /organizations/{id}` (datos de la empresa, vía `HomeFacade`), `GET /organizations/{id}/relationships`, `PATCH /organizations/{id}/profile`, `GET|PUT|DELETE /organizations/{id}/logo` (el 404 de `logo` se traduce a `null`).
- `HttpOrganizationAdminRepository` (mismo archivo): `GET /organization-types` (catálogo de tipos).
- `HttpLinksRepository` (`http-links.repository.ts`), base `/organizations/{id}`: `GET links/summary`, `GET links` (paginado; `view`, búsqueda), `GET links/{linkId}`, `GET links/candidates?q=`, `POST links`, `POST links/{linkId}/{accept|reject|cancel|end}`, `GET|POST external-counterparts`, `PATCH|DELETE external-counterparts/{id}`.

## 6. Permisos [V]
`organizations:read` (ruta), `organizations:manage` (editar datos y logo), `relationships:manage` (gestionar vínculos), `users:read`/`memberships:manage` (enlace a usuarios). `AccessPolicy` es solo presentación; el backend decide.

## 7. Pruebas [V]
`company-profile.component.spec.ts` (18 `it`) y `company-links.component.spec.ts` (21 `it`).

## 8. Hallazgos de calidad
| Sev. | Hallazgo | Ubicación |
|---|---|---|
| Baja | Componentes grandes con template y CSS inline (`company-links.component.ts` 732 l., `company-profile.component.ts` 585 l.). | ver archivos |

## 9. Cómo extender
Datos editables nuevos: añadir el campo a `OrganizationProfileChanges` (`domain/models/organization.ts`), a `updateProfile` en `HttpOrganizationsRepository` y al formulario del diálogo. Acciones de vínculo nuevas: puerto `LinksRepository` -> `HttpLinksRepository` -> `LinksFacade`.
