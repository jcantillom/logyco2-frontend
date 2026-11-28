# `src/app/domain/` e `src/app/infrastructure/`

> **[V]** verificado leyendo el código · **[?]** no comprobado. Visión general: [architecture.md](architecture.md). Núcleo: [core.md](core.md).

## Resumen

`domain/` es el centro hexagonal: interfaces `readonly` (modelos, camelCase) y **puertos** como clases abstractas (`domain/repositories/*.ts`) que sirven a la vez de tipo y de token de inyección. No importa nada fuera de `domain/` [V] (grep de imports a `core`, `infrastructure`, `shared` y `features` sin resultados). `infrastructure/` contiene los **adaptadores**: HTTP (`ApiClient` + DTOs en snake_case + mappers `toXxx` + `Http*Repository`). El único lugar que enlaza puerto con adaptador es `infrastructure/providers.ts` (`provideRepositories()`). Los 15 puertos declarados tienen un adaptador HTTP.

## Tabla de contenidos

1. [Dominio: modelos](#1-dominio-modelos)
2. [Dominio: puertos y adaptadores](#2-dominio-puertos-y-adaptadores)
3. [ApiClient](#3-apiclient)
4. [DTOs](#4-dtos)
5. [Mappers](#5-mappers)
6. [Repositorios HTTP y endpoints](#6-repositorios-http-y-endpoints)
7. [providers.ts](#7-providersts)
8. [Specs y utilidades de test](#8-specs-y-utilidades-de-test)
9. [Hallazgos de calidad](#9-hallazgos-de-calidad)
10. [Cómo extender](#10-cómo-extender)

---

## 1. Dominio: modelos

Archivos de `src/app/domain/models/` y lo que exporta cada uno [V]. Todos los campos son `readonly`; `Date` ya parseado; `null` = «no informado» (no se inventa).

| Archivo | Exporta |
|---|---|
| `identity.ts` | `RoleRef`, `OrganizationRef`, `Membership`, `CurrentUser`, `LoginCredentials`, `PERMISSION_CODES` (tupla de códigos: `organizations:read\|manage`, `relationships:manage`, `memberships:read\|manage`, `users:read`, `catalogs:manage`, `imports:create`, `indicators:read`, `reports:read\|download`, `sector_reports:read`, `methodologies:read\|manage`) y `PermissionCode` |
| `pagination.ts` | `PageRequest { page; pageSize }`, `Page<T>`, `DEFAULT_PAGE_REQUEST = { page: 1, pageSize: 20 }`, `emptyPage` |
| `organization.ts` | `OrganizationTypeRef`, `OrganizationTypeInfo` (con `description`), `OrganizationFocus` (`without_admin\|with_invitations\|without_type`), `OrganizationSort`, `SortOrder`, `OrganizationListFilter` (`deleted`, `search`, `isActive`, `typeCode`, `focus`, `sort`, `order`), `Organization` (incluye `contactEmail`, `contactPhone`, `address`, `city`, `website`, `logoVersion`, `deletedAt`, `types`, `activeAdmins`, `pendingInvitations`), `OrganizationChanges` (nombre, razón social, NIT), `OrganizationProfileChanges` (nombre y contacto, lo que edita la propia empresa), `CommercialRelationship`, `OrganizationDeletionPlan`, `OrganizationDeleted` |
| `users.ts` | `MembershipStatus`, `MembershipTargetStatus` (sin `PENDING`), `InvitationStatus`, `ManagedMembership`, `PersonType`, `UserListFilter`, `ManagedUser` (incluye `lastLoginAt`), `UserUpdate`, `Invitation`, `CreatedInvitation` (con `code`, de un solo uso), `NewInvitation`, `InvitationFilter`, `AcceptedInvitation`, `MembershipRecord`, `INVITABLE_ROLES`, `TEAM_ROLES` (sin `ORG_ADMIN`), `DEFAULT_TEAM_ROLE` (`ORG_VIEWER`) |
| `links.ts` | `LinkStatus`, `LinkType`, `OurRole`, `LinkView`, `CounterpartType`, `LINK_TYPES`, `LinkCounterpart`, `Link`, `LinkEvent`, `LinkDetail`, `LinkSummary`, `LinkCandidate`, `NewLink`, `LinkListFilter`, `ExternalCounterpart`, `NewExternalCounterpart`, `ExternalCounterpartChanges` |
| `onboarding.ts` | `OnboardingNextStep`, `OnboardingStatus`, `NewMemberOnboarding`, `NewOrganizationOnboarding`, `OrganizationOnboarded`, `ActivationState`, `ActivationCheck`, `ActivationResult` |
| `platform.ts` | `SuperAdminQuotaSummary`, `PlatformAdminMetrics` (de `GET /platform/metrics`), `ServiceStatus` (`UP\|DEGRADED\|DOWN\|UNVERIFIED`), `ServiceHealth` |
| `platform-admin.ts` | Superadmins: `SuperAdminQuota`, `SuperAdminMember`, `SuperAdminInvitation`, `CreatedSuperAdminInvitation`, `NewSuperAdminInvitation`, `SuperAdminOverview`, `SuperAdminDetail`, `AcceptedSuperAdmin`, `SuperAdminRevocation`. Actividad y auditoría: `ActivityItem`, `AuditCategory`, `AuditChannel`, `AuditFilter`, `AuditPage`, `AuditPageRequest`, `AuditEventDetail`. Tendencias y atención: `TrendGranularity`, `TrendMetrics`, `TrendPoint`, `PlatformTrends`, `TrendRange`, `AttentionList`, `PlatformAttention`. RBAC: `RoleScopeKind`, `RbacRole`, `PermissionImplementation`, `RbacPermission`, `RbacCatalog`, `RoleAssignment`. Operación: `OperationsPeriod`, `ProcessingCounts`, `ProcessingPoint`, `SourceStatus`, `SourceHealth`, `PlatformOperations` |
| `emissions.ts` | Guía de cálculo de emisiones: `FreightVehicle` (ejes, grupos de ejes, disposiciones, PBV), `VehicleCatalog` (norma, dimensiones generales, tolerancia, guía de códigos), `EmissionFactor` (por combustible; decimal como texto, unidades y `FactorVerification`), `SimulationInput` y `Simulation`. |
| `intelligence.ts` | `IndicatorStatus`, `SourceRef`, `Variation`, `IndicatorCard`, `IntelligenceSummary`, `HistoryPoint`, `AreaOption`, `IndicatorHistory`, `AreaComparisonRow`, `AreaComparison`, `GroupVariation`, `GroupBreakdown`, `SourceStatus`, `IngestionResult`, `HistoryQuery` |

## 2. Dominio: puertos y adaptadores

Clases abstractas; las facades las inyectan por token. Todos los métodos devuelven `Observable`. Tabla completa (14 puertos, 14 adaptadores, todos enlazados en `providers.ts`) [V]:

| Archivo de puerto | Puerto → métodos | Adaptador (archivo en `infrastructure/repositories/`) |
|---|---|---|
| `identity.repositories.ts` | `AuthRepository`: `login`, `getCurrentUser` | `HttpAuthRepository` (`http-identity.repositories.ts`) |
| | `OrganizationsRepository`: `list(PageRequest, filter?)`, `get`, `relationships`, `updateProfile`, `logo`, `uploadLogo`, `removeLogo` | `HttpOrganizationsRepository` (idem) |
| | `UsersRepository`: `list(PageRequest, filter?)`, `get`, `update` | `HttpUsersRepository` (idem) |
| | `InvitationsRepository`: `list`, `create`, `revoke`, `accept` | `HttpInvitationsRepository` (idem) |
| | `MembershipsRepository`: `changeStatus`, `remove` | `HttpMembershipsRepository` (idem) |
| | `OrganizationAdminRepository`: `listTypes`, `update`, `setActive`, `setTypes`, `relationships`, `deletionPreview`, `delete`, `restore`, `purge` | `HttpOrganizationAdminRepository` (idem) |
| `onboarding.repositories.ts` | `OnboardingRepository`: `onboardOrganization`, `onboardMember`, `status`, `resend`, `checkActivation`, `activate` | `HttpOnboardingRepository` (`http-onboarding.repository.ts`) |
| `links.repository.ts` | `LinksRepository`: `summary`, `list`, `get`, `search`, `request`, `respond`, `listExternal`, `createExternal`, `updateExternal`, `removeExternal` | `HttpLinksRepository` (`http-links.repository.ts`) |
| `platform-admin.repositories.ts` | `SuperAdminsRepository`: `overview`, `detail`, `invite`, `revokeInvitation`, `revoke`, `accept` | `HttpSuperAdminsRepository` (`http-platform-admin.repositories.ts`) |
| | `InsightsRepository`: `trends`, `attention`, `operations`, `activity`, `audit`, `auditEvent` | `HttpInsightsRepository` (idem) |
| | `RbacRepository`: `catalog`, `assignments` | `HttpRbacRepository` (idem) |
| `emissions.repositories.ts` | `EmissionsRepository`: `vehicles`, `fuels`, `simulate` (solo lectura y simulación; nada se guarda). |
| `footprint.repositories.ts` | `FootprintRepository`: `footprint(orgId, period?, granularity?)` (huella de la empresa en un periodo y, opcionalmente, su serie por granularidad; modelos en `domain/models/footprint.ts`: `Footprint` (con `granularity`, `series`, `seriesTotalKg`), `FootprintBucket`, y `domain/models/granularity.ts`: `Granularity`, `parseGranularity`; `FootprintTotals`, `FootprintByFuel`, `FootprintMonthly`, `FootprintPeriod`, `ImportFootprint`; unidad kg CO₂, no CO₂e). |
| `platform.repositories.ts` | `HealthRepository`: `check` | `HttpHealthRepository` (`http-health.repository.ts`) |
| | `AdminMetricsRepository`: `get` | `HttpAdminMetricsRepository` (`http-admin-metrics.repository.ts`) |
| `operations.repositories.ts` | `OperationsRepository`: `list(orgId, filter, {view, limit, cursor})` (página por cursor con total acotado), `summary(orgId, filter)` (conteos de pestañas), `detail(orgId, tripId)`; modelos en `domain/models/operations.ts` | `HttpOperationsRepository` (`http-operations.repositories.ts`; mapper `operations.mappers.ts`, DTO `operations.dto.ts`) |
| `vehicle-efficiency.repositories.ts` | `VehicleEfficiencyRepository`: `view(orgId, vehicleId, page)` (vigente, historia y `compatible_units`), `declare` (PUT idempotente; `applied_to_pending` con `remaining`), `template` (blob), `previewFicha(file)` (multipart) y `applyFicha(file, token)`; modelos en `domain/models/vehicle-efficiency.ts` | `HttpVehicleEfficiencyRepository` (`http-vehicle-efficiency.repositories.ts`; mapper `vehicle-efficiency.mappers.ts`, DTO `vehicle-efficiency.dto.ts`) |
| `manual-trips.repositories.ts` | `ManualTripsRepository`: `options`, `vehicles(q)`, `places(q)`, `routeDistance`, `register(input, idempotencyKey)` (409 `MANUAL_TRIP_REPEATED` con candidatos en `AppError.data`), `voidTrip`, `template(mode)`; modelos en `domain/models/manual-trips.ts` | `HttpManualTripsRepository` (`http-manual-trips.repositories.ts`; mapper `manual-trips.mappers.ts`, DTO `manual-trips.dto.ts`) |
| `intelligence.repositories.ts` | `IntelligenceRepository`: `summary`, `history`, `areas`, `ictcGroups`, `sources`, `refreshSource` | `HttpIntelligenceRepository` (`http-intelligence.repository.ts`) |

## 3. `ApiClient`

`infrastructure/http/api-client.ts` — `@Injectable({providedIn:'root'})`, inyecta `HttpClient` y `APP_CONFIG`. Único que conoce la URL base y el sobre `{data, meta}`. `type QueryParams = Readonly<Record<string, string|number|boolean|undefined|null>>`.

| Método | Firma | Detalle |
|---|---|---|
| `get<T>` | `(path, params?) => Observable<T>` | `GET apiBaseUrl+apiPrefix+path`, devuelve `response.data` |
| `getBody<T>` | `(path, params?) => Observable<T>` | cuerpo completo (`data` y `meta`), p. ej. auditoría por cursor |
| `getPage<T>` | `(path, params?) => Observable<PaginatedResponseDto<T>>` | sin desenvolver (el mapper lee `meta.pagination`) |
| `post/put/patch<T>` | `(path, body: unknown) => Observable<T>` | desenvuelve `data` |
| `getBlob` | `(path) => Observable<Blob>` | archivo (logo) pedido con la sesión |
| `putBinary<T>` | `(path, body: Blob, contentType) => Observable<T>` | PUT binario (sin `multipart`), desenvuelve `data` |
| `delete` | `(path) => Observable<void>` | |
| `getRoot<T>` | `(path) => Observable<T>` | `GET apiBaseUrl+path` sin prefijo ni sobre (p. ej. `/health`) |
Sin timeout ni retry propios en `ApiClient`. [V]

## 4. DTOs

Interfaces `readonly` en snake_case con la forma del backend. Ubicación [V]:
- `dto/identity.dto.ts`: `RoleReferenceDto`, `OrganizationReferenceDto`, `MembershipContextDto`, `MeResponseDto`, `LoginRequestDto`, `LoginResponseDto`, `OrganizationDto`, `OrganizationTypeDto`, `OrganizationRelationshipDto`, `PlatformMetricsDto`, `MembershipViewDto`, `UserSummaryDto`, `InvitationDto`, `InvitationCreatedDto`, `InvitationCreateDto`, `InvitationAcceptedDto`, `MembershipDto`.
- `dto/links.dto.ts`: `LinkCounterpartDto`, `LinkDto`, `LinkEventDto`, `LinkDetailDto`, `LinkSummaryDto`, `LinkCandidateDto`, `ExternalCounterpartDto`.
- `dto/platform-admin.dto.ts`: `QuotaDto`, `SuperAdminMemberDto`, `SuperAdminInvitationDto`, `SuperAdminInvitationCreatedDto`, `ActivityItemDto`, `AuditEventDetailDto`, `AuditPageDto`, `SuperAdminOverviewDto`, `SuperAdminDetailDto`, `TrendMetricsDto`, `TrendPointDto`, `PlatformTrendsDto`, `PlatformAttentionDto`, `RbacCatalogDto`, `RoleAssignmentDto`, `ProcessingCountsDto`, `PlatformOperationsDto`.
- `dto/emissions.dto.ts`: `VehicleCatalogDto`, `FreightVehicleDto`, `EmissionFactorDto`, `SimulationRequestDto`, `SimulationDto` (contrato del backend sin campos inventados).
- Definidos junto a su mapper o adaptador (no en `dto/`): `LiveDto`, `ReadinessDto`, `CorporateServicesDto` (`mappers/health.mappers.ts`); `SourceRefDto`, `VariationDto`, `IndicatorCardDto`, `SummaryDto`, `HistoryDto`, `AreasDto`, `GroupsDto`, `SourceStatusDto`, `IngestionDto` (`mappers/intelligence.mappers.ts`); `OnboardingStatusDto` y otros tres internos (`http-onboarding.repository.ts`); `DeletionPlanDto` y `DeletedDto` internos (`http-identity.repositories.ts`).

## 5. Mappers

- `mappers/identity.mappers.ts`: `toPage(response, mapItem)` (genérico, usado también por links y platform-admin), `toCurrentUser`, `toOrganization`, `toOrganizationType`, `toRelationship`, `toPlatformMetrics`, `toManagedUser`, `toInvitation`, `toCreatedInvitation`, `toAcceptedInvitation`, `toMembershipRecord`.
- `mappers/links.mappers.ts`: `toLink`, `toLinkDetail`, `toLinkSummary`, `toCandidate`, `toExternal`.
- `mappers/platform-admin.mappers.ts`: `toQuota`, `toSuperAdminMember`, `toSuperAdminInvitation`, `toCreatedSuperAdminInvitation`, `toActivityItem`, `toAuditPage`, `toAuditEventDetail`, `toSuperAdminOverview`, `toSuperAdminDetail`, `toAcceptedSuperAdmin`, `toPlatformTrends`, `toPlatformAttention`, `toRbacCatalog`, `toRoleAssignment`, `toPlatformOperations`.
- `mappers/emissions.mappers.ts`: `toVehicleCatalog`, `toFreightVehicle`, `toEmissionFactor`, `toSimulation`, `simulationBody`.
- `mappers/health.mappers.ts`: `toApiHealth(live, now)` (UP si `status === 'alive'`), `toDatabaseHealth(ready, apiReachable, now)` (API caída -> `UNVERIFIED`; UP si `database === 'connected'`), `toCorporateServices(dto)` (SSO y directorio; si la consulta falló o el servicio no figura queda `UNVERIFIED`), `unverifiedServices()` y `UNVERIFIABLE_SERVICES` (hoy solo «Procesamiento de archivos»).
- `mappers/intelligence.mappers.ts`: `toLocalDate`, `toCard`, `toSummary`, `toHistory`, `toAreas`, `toGroups`, `toSourceStatus`, `toIngestion`.
- `toOnboardingStatus` vive en `repositories/http-onboarding.repository.ts` (no en `mappers/`).

## 6. Repositorios HTTP y endpoints

Prefijo `apiBaseUrl` + `apiPrefix` salvo indicación. Ids con `encodeURIComponent`. Respuestas en sobre `{data, meta}`. Paginación: query `page`, `page_size` (`pageParams`). Todos los adaptadores son `@Injectable()` (no root): se registran en `providers.ts`.

| Adaptador | Método -> HTTP |
|---|---|
| `HttpAuthRepository` | `login` -> `POST /auth/login`; `getCurrentUser` -> `GET /auth/me` |
| `HttpOrganizationsRepository` | `list` -> `GET /organizations` (paginado; `deleted`, `search`, `is_active`, `type_code`, `attention`, `sort`, `order`); `get` -> `GET /organizations/{id}`; `relationships` -> `GET /organizations/{id}/relationships`; `updateProfile` -> `PATCH /organizations/{id}/profile`; `logo` -> `GET /organizations/{id}/logo` (Blob; 404 -> `null`); `uploadLogo` -> `PUT /organizations/{id}/logo`; `removeLogo` -> `DELETE /organizations/{id}/logo` |
| `HttpUsersRepository` | `list` -> `GET /users` (paginado; `search`, `organization_id`, `membership_status`, `role`, `classification`, `has_global_role`, `status`); `get` -> `GET /users/{id}`; `update` -> `PATCH /users/{id}` |
| `HttpInvitationsRepository` | `list` -> `GET /users/invitations` (paginado; `organization_id`, `status`); `create` -> `POST /users/invitations`; `revoke` -> `POST /users/invitations/{id}/revoke`; `accept` -> `POST /users/invitations/accept` |
| `HttpMembershipsRepository` | `changeStatus` -> `PATCH /organizations/{org}/memberships/{id}` `{status}`; `remove` -> `DELETE /organizations/{org}/memberships/{id}` |
| `HttpOrganizationAdminRepository` | `listTypes` -> `GET /organization-types`; `update` -> `PATCH /organizations/{id}`; `setActive` -> `PATCH /organizations/{id}/status` `{is_active}`; `setTypes` -> `PUT /organizations/{id}/types` `{type_codes}`; `relationships` -> `GET /organizations/{id}/relationships`; `deletionPreview` -> `GET /organizations/{id}/deletion-preview`; `delete` -> `POST /organizations/{id}/delete` `{confirm_name}`; `restore` -> `POST /organizations/{id}/restore`; `purge` -> `POST /organizations/{id}/purge` `{confirm_name}` |
| `HttpOnboardingRepository` | `onboardOrganization` -> `POST /onboarding/organizations`; `onboardMember` -> `POST /onboarding/members`; `status` -> `GET /onboarding/invitations/{id}`; `resend` -> `POST /onboarding/invitations/{id}/resend`; `checkActivation` -> `POST /onboarding/activation/check`; `activate` -> `POST /onboarding/activation` |
| `HttpLinksRepository` (base `/organizations/{id}`) | `summary` -> `GET links/summary`; `list` -> `GET links` (paginado; `view`, `search`, `relationship_type`); `get` -> `GET links/{linkId}`; `search` -> `GET links/candidates?q=`; `request` -> `POST links`; `respond` -> `POST links/{linkId}/{accept\|reject\|cancel\|end}`; `listExternal` -> `GET external-counterparts`; `createExternal` -> `POST external-counterparts`; `updateExternal` -> `PATCH external-counterparts/{id}`; `removeExternal` -> `DELETE external-counterparts/{id}` |
| `HttpAdminMetricsRepository` | `get` -> `GET /platform/metrics` |
| `HttpFootprintRepository` | `footprint` -> `GET /organizations/{org}/emissions/footprint?from=&to=&granularity=` (sin periodo, sin `from`/`to`; sin granularidad, sin `granularity`); DTO `footprint.dto.ts`, mappers `footprint.mappers.ts` (`toFootprint`, `toImportFootprint`) |
| `HttpEmissionsRepository` (base `/emissions`) | `vehicles` -> `GET /vehicles`; `fuels` -> `GET /reference/fuels`; `simulate` -> `POST /simulate` con `{ fuel_code, distance_km, efficiency }` |
| `HttpSuperAdminsRepository` (base `/platform/super-admins`) | `overview` -> `GET`; `detail` -> `GET /{userId}`; `invite` -> `POST /invitations`; `revokeInvitation` -> `POST /invitations/{id}/revoke`; `revoke` -> `POST /{userId}/revoke`; `accept` -> `POST /invitations/accept` |
| `HttpInsightsRepository` | `trends` -> `GET /platform/metrics/trends` (`days` o `date_from`+`date_to`); `operations` -> `GET /platform/operations?days=`; `attention` -> `GET /platform/attention`; `activity` -> `GET /platform/activity` (`limit`, `days`, `organization_id`); `audit` -> `GET /platform/audit` (`getBody`; `page_size`, `cursor`, `days`, `date_from`, `date_to`, `organization_id`, `category`, `channel`, `q`); `auditEvent` -> `GET /platform/audit/{id}` |
| `HttpRbacRepository` | `catalog` -> `GET /rbac/catalog`; `assignments` -> `GET /rbac/roles/{code}/assignments` (paginado) |
| `HttpHealthRepository` | `check` -> en `forkJoin`: `GET {base}/health/live` y `GET {base}/health` (raíz, `getRoot`, sin token) y `GET /platform/services`; cada fallo -> `null` (nunca UP) |
| `HttpIntelligenceRepository` | `summary` -> `GET /intelligence/summary`; `history` -> `GET /intelligence/indicators/{code}/history`; `areas` -> `GET /intelligence/indicators/{code}/areas`; `ictcGroups` -> `GET /intelligence/ictc/groups`; `sources` -> `GET /intelligence/sources`; `refreshSource` -> `POST /intelligence/sources/{code}/refresh` |

## 7. `providers.ts`

`provideRepositories(): EnvironmentProviders` (`makeEnvironmentProviders`): una lista de `{ provide: Puerto, useClass: Http* }` agrupada en: identidad, organizaciones, onboarding y vínculos (`AuthRepository`, `OrganizationsRepository`, `UsersRepository`, `InvitationsRepository`, `MembershipsRepository`, `OnboardingRepository`, `OrganizationAdminRepository`, `LinksRepository`); consola de plataforma (`HealthRepository`, `AdminMetricsRepository`, `SuperAdminsRepository`, `InsightsRepository`), `IntelligenceRepository`, `RbacRepository`, `EmissionsRepository` y `FootprintRepository`. Son los mismos 15 puertos de la tabla de la sección 2; no hay proxys ni selección en tiempo de ejecución. [V]

## 8. Specs y utilidades de test

Specs bajo `infrastructure/` [V]: `mappers/emissions.mappers.spec.ts` (catálogo, factor, simulación y cuerpo de la simulación), `repositories/http-emissions.repositories.spec.ts` (un caso por endpoint), `mappers/identity.mappers.spec.ts` (7 `it`), `repositories/http-identity.repositories.spec.ts` (10), `http-admin.repositories.spec.ts` (7), `http-platform-admin.repositories.spec.ts` (10), `http-health.repository.spec.ts` (10), `http-intelligence.repository.spec.ts` (7). No hay spec propio de `links.mappers`, `platform-admin.mappers`, `intelligence.mappers`, `ApiClient`, `HttpLinksRepository` ni `HttpOnboardingRepository`; `domain/` no tiene specs. Utilidades: `src/testing/providers.ts` y `src/testing/builders.ts` (ver [tooling.md](tooling.md)).

## 9. Hallazgos de calidad

| ID | Sev. | Archivo | Hallazgo | Sugerencia |
|---|---|---|---|---|
| H-D1 | Baja | `mappers/identity.mappers.ts` / `dto/identity.dto.ts` | `toPlatformMetrics`, `PlatformMetricsDto` y el helper genérico `toPage` viven en «identity» aunque pertenecen a plataforma o son comunes. | Mover a `platform.*` / `mappers/page.mapper.ts` |
| H-D2 | Baja | `http-platform-admin.repositories.ts` | `revoke` y `accept` de `HttpSuperAdminsRepository` usan tipos inline en lugar de DTO y mapper. | Crear DTOs y mappers |
| H-D3 | Baja | `http-onboarding.repository.ts`, `http-identity.repositories.ts`, `mappers/intelligence.mappers.ts`, `mappers/health.mappers.ts` | DTOs definidos fuera de `dto/` (ver sección 4), inconsistente con el resto. | Mover a `dto/` |
| H-D4 | Baja | `infrastructure/http/api-client.ts` | Sin timeout ni retry; `post(body: unknown)` sin tipado de request. | `timeout` configurable y genéricos de body |
| H-D5 | Baja | `mappers/*` | `new Date(dto.x)` sin validar; las fechas `YYYY-MM-DD` se parsean como UTC y pueden mostrarse un día antes en UTC-5 si se formatean localmente [?] (formateo en features no revisado). | Parsear fechas «solo día» como local |

Seguridad: los `details` de `ActivityItem`/`AuditEventDetail` llegan como `Record<string, unknown>`; `PlatformAuditComponent` los muestra con interpolación (`{{ }}`), no con `innerHTML` [V] (`platform-audit.component.ts`, `metadata`).

## 10. Cómo extender

1. Modelo en `domain/models/`, puerto en `domain/repositories/` (`export abstract class XRepository`).
2. DTO (snake_case) en `infrastructure/dto/`, mapper `toX` en `infrastructure/mappers/` (degradar enums desconocidos al valor más restrictivo; `new Date` para fechas).
3. `Http*Repository` con `@Injectable()`, `inject(ApiClient)` y `.pipe(map(toX))`; `encodeURIComponent` en ids de ruta.
4. Registrar en `provideRepositories()` (`{ provide: XRepository, useClass: HttpXRepository }`).
5. Si aún no hay backend no se crea nada de lo anterior: la ruta usa `ComingSoonComponent` y el menú `soon: true` (ver [architecture.md](architecture.md)).
6. Test: `provideTestApp()` + `HttpTestingController`; para mappers, specs puras.

## Lugares por empresa (2026-11-26)
Puerto `PlacesRepository` (`domain/repositories/places.repositories.ts`; `pending`, `choices`, `choose`, `undo`) con `HttpPlacesRepository`, enlazado en `providers.ts`. Modelos en `domain/models/places.ts`, DTO en `infrastructure/dto/places.dto.ts` y mappers en `places.mappers.ts` (decimales como texto → número o `null`; `toPlaceChoiceBody` omite nota y carga si no existen). `ApiClient.deleteData<T>` es el DELETE que devuelve `data`. Detalle de pantalla: [features/imports.md](features/imports.md) §9 y [features/settings.md](features/settings.md) §11.

