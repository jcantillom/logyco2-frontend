# Feature `users` («Usuarios y accesos» de la empresa)

Leyenda: [V] verificado en código; [?] no comprobado.
Código: `src/app/features/users/` -> `users.component.ts` (701 l.), `users.facade.ts` (104 l.). Specs: `users-view.spec.ts` (8 `it`) y `users-onboarding.spec.ts` (5 `it`). La administración global de personas vive en la feature `platform` (ver [platform.md](platform.md)).

## 1. Propósito y flujo [V]
Administración de las personas de la empresa activa y de sus invitaciones. Cuatro tarjetas de conteo (usuarios totales, activos, invitaciones pendientes, inactivos) y tres pestañas:
1. **Usuarios**: tabla paginada (6 por página) con búsqueda por nombre o correo (espera de 300 ms) y filtros de rol y estado; columnas Usuario, Correo, Rol, Estado, Último acceso y Acciones. El menú de acciones de cada fila ofrece Editar, las transiciones de estado de la membresía (Aprobar, Rechazar, Suspender, Revocar, Reactivar) y, si la membresía está revocada, Eliminar; todas piden confirmación.
2. **Roles**: tarjetas con lo que puede hacer cada rol de la empresa (una empresa tiene un solo administrador).
3. **Invitaciones**: tabla paginada (Invitado, Rol, Estado, Expira, Acciones) con «Revocar» para las `PENDING`.
«Invitar usuario» (solo con `memberships:manage`) abre el diálogo «Incorporar usuario» (correo, nombre completo y rol entre `TEAM_ROLES`); al enviarlo, `OnboardingFacade.onboardMember` crea la incorporación y se muestra el diálogo «Estado de la incorporación» (`OnboardingStatusComponent`) con los tres pasos reales (identidad, correo, activación) y reenvío. La persona activa su cuenta con el enlace del correo (ver [auth.md](auth.md)).

## 2. Ruta [V]
`app.routes.ts`: `path: 'usuarios'`, `data: { breadcrumb: 'Usuarios y accesos', wide: true }`, `canActivate: [permissionGuard('users:read', 'memberships:manage')]` (basta uno), lazy, bajo `ShellComponent`. Entrada de menú «Usuarios y accesos» (`nav-items.ts`). También se llega con `?tab=invitaciones` desde la campana, aunque el componente no lee ese parámetro [V: el constructor no consulta `ActivatedRoute`].

## 3. Componente `UsersComponent` (`app-users`) [V]
- Sin inputs/outputs. Inyecta `UsersFacade`, `OnboardingFacade`, `AccessPolicy`, `ConfirmService`, `ToastService`, `ActionFeedbackService`, `SessionStore`, `OrganizationContext`. `viewChild.required` de `#createDialog`, `#editDialog` y `#codeDialog`. Usa `PageHeroComponent`, `ResourceStateComponent`, `PaginationComponent`, `StatusBadgeComponent` y `OnboardingStatusComponent`.
- Tipos locales: `Tab = 'users'|'roles'|'invitations'`, `StatusView`, `MembershipAction {status,label,danger}`. Constante `ACTIONS` (mapa estado -> acciones; refleja `_TRANSITIONS` del backend: `PENDING` -> `ACTIVE`/`REVOKED`; `ACTIVE` -> `SUSPENDED`/`REVOKED`; `SUSPENDED` -> `ACTIVE`/`REVOKED`; `REVOKED` -> ninguna). El servidor revalida.
- Filtros: `roleOptions` (`ORG_ADMIN` más `TEAM_ROLES`) y estados Activo, Pendiente de aprobación e Inactivo (`SUSPENDED`); se aplican en el servidor mediante `facade.setFilter`.
- Formularios (`nonNullable.group`): invitación con `email` (obligatorio, `email`, máx. 320), `inviteeName` (obligatorio, máx. 255) y `roleCode` (obligatorio, por defecto `DEFAULT_TEAM_ROLE`); edición de usuario con `fullName` (obligatorio, máx. 255) y `email` (obligatorio, `email`, máx. 320; el correo propio queda bloqueado). La invitación se crea siempre en la empresa activa (`context.activeOrganizationId()`).
- Constructor: `reloadOnContextChange` carga `facade.loadUsers(1)`, `loadInvitations(1)` y `loadCounts()`; la búsqueda usa `debounceTime(300)`.
- Acciones: `changeStatus` (confirma y llama `facade.changeMembershipStatus`), `remove` (confirma «Eliminar usuario» y llama `facade.removeMembership`: la cuenta se conserva), `revoke` (invitación), `openEdit`/`saveEdit` (`facade.updateUser`, solo envía lo que cambia), `create` (`OnboardingFacade.onboardMember`), `resend` (`OnboardingFacade.resend`; el check de éxito solo aparece si el backend confirma el envío).

## 4. Facade `UsersFacade` [V]
`providedIn: 'root'`. Inyecta `UsersRepository`, `InvitationsRepository`, `MembershipsRepository`, `ContextResetRegistry`. Recursos registrados: `userList`, `invitationList`, `counts` (`UsersCounts`: activos, pendientes, suspendidos e invitaciones pendientes; cuatro consultas de una fila que leen `total`) y `preview` (hasta 20 personas, para el resumen); signals `usersPage`, `invitationsPage`, `filter`; `usersPageSize = 6`. Métodos: `loadPreview`, `setFilter`, `loadUsers`, `loadCounts`, `loadInvitations`, `revokeInvitation`, `updateUser`, `removeMembership`, `changeMembershipStatus`.  La pantalla incorpora personas con `OnboardingFacade`. También lo usa `DashboardComponent` (`loadPreview`, `loadCounts`).

## 5. Endpoints [V]
| Acción | Método y ruta |
|---|---|
| Listar usuarios | `GET /users` (paginado; `search`, `membership_status`, `role`, …) |
| Editar usuario | `PATCH /users/{id}` |
| Listar invitaciones | `GET /users/invitations` (paginado; `status`) |
| Revocar invitación | `POST /users/invitations/{id}/revoke` |
| Cambiar estado de membresía | `PATCH /organizations/{organizationId}/memberships/{membershipId}` `{status}` |
| Eliminar membresía | `DELETE /organizations/{organizationId}/memberships/{membershipId}` |
| Incorporar usuario | `POST /onboarding/members` |
| Reenviar el correo de incorporación | `POST /onboarding/invitations/{id}/resend` (el estado inicial de la incorporación viene en la respuesta de `POST /onboarding/members`) |

## 6. Permisos [V]
Ruta: `users:read` o `memberships:manage`. «Invitar usuario» y las acciones de membresía e invitación: `memberships:manage` (`canManage()`). El backend autoriza.

## 7. Estados [V]
Por pestaña: cargando, error con reintento y vacío («Sin usuarios» / «Sin invitaciones»); `saving` en los botones de los diálogos; avisos de éxito con `ActionFeedbackService` y errores con `toast.error`.

## 8. Hallazgos de calidad
| Sev. | Hallazgo | Ubicación |
|---|---|---|
| Media | Componente grande (701 l.) con template y CSS inline: tarjetas, tres pestañas, tabla, tres diálogos y confirmaciones. | `users.component.ts` |
| Media | `ACTIONS` duplica las reglas de transición del backend y el mapa equivalente de `platform-user-detail`. | `users.component.ts`, `features/platform/platform-user-detail.component.ts` |
| Baja | Paginación manual (`pageNumbers`) además de `PaginationComponent` y `PagerComponent` en otras pantallas. | `users.component.ts` |
| Baja | Pestañas con `role="tab"` sin navegación por flechas. | `users.component.ts` |

## 9. Cómo extender
- Nueva acción de membresía: añadir al mapa `ACTIONS` y asegurarse de que el backend la permita.
- Nuevo rol invitable: `INVITABLE_ROLES`/`TEAM_ROLES` (`domain/models/users`) y `roleLabel` (`shared/ui/labels`).
