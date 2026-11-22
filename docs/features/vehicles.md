# Feature `vehicles` · «Datos operativos → Mis vehículos»

Inventario de vehículos de la **empresa activa** (espacio de empresa; no está en el menú Super Admin): lista, búsqueda, filtros, paginación, detalle con diagrama e historial, registro manual y edición. Alcance reducido el 2026-11-22: el análisis de archivos Excel y las notificaciones se eliminaron de punta a punta (ver `docs/tasks/vehicle-inventory.md`, L10). Marcas: [V] verificado en código/pruebas · [?] supuesto a verificar contra el backend real.

## 1. Ruta y permisos [V]
| Ruta | Guard | Menú | Componente |
|---|---|---|---|
| `/vehiculos` (`data: { breadcrumb: 'Mis vehículos', wide: true }`) | `permissionGuard('vehicles:read')` | «Datos operativos» → «Mis vehículos» (`soon: false`) | `VehiclesComponent` (lazy) |

- Permisos en el cliente: `vehicles:read` y `vehicles:manage` (`PERMISSION_CODES`, `labels.ts`, `AccessPolicy` y el grupo «Vehículos» de `platform-rbac`). ORG_ADMIN lee y administra; ORG_ANALYST y ORG_VIEWER solo leen; SUPER_ADMIN y GUILD_VIEWER ninguno. Es solo UX: el backend autoriza.
- `imports:create` no interviene aquí: «Cargar información» sigue siendo «Próximamente».

## 2. Capas
- Dominio: `domain/models/vehicles.ts` (vehículo, detalle, resumen `{registered, inactive}`, filtros, alta y cambios) y `domain/repositories/vehicles.repositories.ts` (`VehiclesRepository`: `summary`, `list`, `get`, `create`, `update`; `PlatformVehiclesRepository`: solo lectura).
- Infraestructura: `dto/vehicles.dto.ts`, `mappers/vehicles.mappers.ts`, `repositories/http-vehicles.repositories.ts`, enlazados en `providers.ts`. Las rutas de empresa llevan la empresa activa (`/organizations/{organization_id}/vehicles…`) y las de plataforma `/platform/organizations/{id}/vehicles…`.
- Mappers: la propiedad desconocida es `UNKNOWN` («Sin declarar», nunca se infiere); un estado desconocido es `INACTIVE`; `source` es siempre `MANUAL`; los cuerpos JSON omiten los campos no informados.
- Vocabulario: combustible `DIESEL | GASOLINE | NATURAL_GAS | ELECTRIC | HYBRID | OTHER` (etiquetas en `vehicles.labels.ts`; filtros y selectores salen de ahí); eventos del historial `CREATED` y `UPDATED`; `PATCH` admite `status` y `ownership`; el vehículo no trae fechas de aparición ni archivos de origen.
- Errores con mensaje propio (`error-catalog.ts`): `VEHICLE_ALREADY_REGISTERED`, `VEHICLE_STRUCTURAL_CONFIRMATION_REQUIRED`, `VEHICLE_NOT_FOUND`, `INVALID_PLATE`, `INVALID_VEHICLE_FIELD`. El mapper de errores no propaga el texto del servidor: en un 422 el campo se marca con un mensaje genérico.

## 3. Facade y estado [V]
`VehiclesFacade` (`providedIn: 'root'`, implementa `VehicleInventory`): `summary`, `list`, `detail`, `catalog` (`ScopedResource`, registrados en `ContextResetRegistry`) y las señales `filter` y `page` (también se restablecen al cambiar de empresa). La empresa sale de `OrganizationContext.activeOrganizationId`. `loadList({ filter })` vuelve a la página 1; `loadList({ page })` conserva el filtro. Crear/editar refrescan resumen y lista (y el detalle abierto). Página de 10 filas. El catálogo de configuraciones **no se duplica**: sale de `EmissionsRepository.vehicles()`.

## 4. Pantalla [V]
- **Cabecera**: `app-page-hero` «Mis vehículos» + una línea de subtítulo.
- **Resumen**: dos tarjetas (Registrados e Inactivos, `GET /vehicles/summary`) que filtran la tabla. Carga con esqueleto; si falla, alerta con «Reintentar».
- **Tabla** (`VehicleInventoryComponent`, semántica de `table`): Placa, Configuración («No reconocida» si el catálogo no la conoce), Tipo, Combustible, Modelo, Estado, Fecha de registro, «Ver detalle». Búsqueda por placa con *debounce* de 300 ms; «Más filtros» (estado, combustible, configuración, en el servidor) con contador; paginación con `PaginationComponent`; región `aria-live` con el total; bajo 768 px cada fila pasa a tarjeta.
- **Estado vacío**: «Aún no tienes vehículos registrados.» y, con `vehicles:manage`, «Registra el primero con «Registrar vehículo».». Con filtros activos: «Sin resultados» y «Quitar filtros».
- **Detalle** (`VehicleDetailComponent`, `<dialog>` nativo): placa normalizada y original, diagrama centrado con el nombre de la configuración (esquema neutro si no está en el catálogo), características, propiedad («Sin declarar» si no está declarada), origen, fecha de registro e historial compacto (evento, actor, fecha, campo antes → después). «Editar» solo con `vehicles:manage`.
- **Registro y edición** (`VehicleFormComponent`, `<dialog class="dialog-pro">`): placa, configuración (catálogo), combustible, tipo, modelo, tecnología, capacidad (solo punto decimal) y propiedad. En edición la placa es fija y solo se envía lo que cambió; cambiar la configuración o el tipo que ya tenían valor exige marcar la confirmación (`confirm_structural: true`). Los límites del servidor se reflejan en `vehicles.limits.ts` (configuración ≤ 20, textos ≤ 80, año 1900–9999, capacidad > 0 con ≤ 10 dígitos y ≤ 3 decimales). 409 `VEHICLE_ALREADY_REGISTERED` bajo la placa.
- **Foco**: `showModal()` lleva el foco al diálogo y, al cerrarse, vuelve al botón que lo abrió (también en el paso detalle → edición).
- **Diagrama compartido**: `VehicleDiagramComponent` vive en `shared/ui/vehicle-diagram/` (con `vehicle-layout.ts` y `vehicle-label.ts`); la guía de emisiones lo importa desde allí.
- **Tarjetas de indicador**: `KpiTileComponent` y `KPI_TILE_STYLES` (`shared/ui/`) se comparten con el Resumen de la empresa.

## 5. Diseño [V]
Tokens de la plataforma (sin hexadecimales ni `rgb()`), naranja al frente, íconos planos, clases `.btn`. El chip de las tarjetas declara su propio centrado y el trazo del svg porque la regla global `.ico` solo aplica a la estructura del Resumen de plataforma. Una prueba verifica la paleta.

## 6. Pruebas [V]
`vehicles.mappers.spec.ts`, `http-vehicles.repositories.spec.ts` (empresa en la ruta, parámetros; también el repositorio de plataforma), `vehicles.facade.spec.ts` (reinicio al cambiar de empresa), `vehicles.component.spec.ts` (dos tarjetas, tabla, filtros, búsqueda, paginación, vacíos, errores, permisos, registro, 409, edición con confirmación estructural, paleta y **ausencia de cualquier función de analizar archivos**), `vehicle-detail.component.spec.ts`, `vehicles.errors.spec.ts` (códigos vigentes y ausencia de los eliminados), y las de navegación/permisos en `shell.component.spec.ts`, `access-policy.spec.ts` y `auth.guards.spec.ts`.

## 7. Supervisión desde la plataforma [V]
En el detalle de una empresa de la consola Super Admin (`/plataforma/organizaciones/:id`) la pestaña «Vehículos» muestra el inventario de esa empresa **solo para consulta** (aviso «Vista de solo lectura para supervisión. Cada empresa administra su propio inventario de vehículos.»). Nada cambia para usuarios de empresa y `/vehiculos` sigue siendo solo de empresa.
- **API** (contrato acordado con el backend [?]): `GET /platform/organizations/{id}/vehicles/summary`, `GET /platform/organizations/{id}/vehicles` (`search`, `status`, `configuration`, `fuel`, `page`, `page_size`) y `GET /platform/organizations/{id}/vehicles/{vehicle_id}`, con las mismas formas que las de empresa (DTO y mappers reutilizados). Puerto `PlatformVehiclesRepository` (solo `summary`, `list`, `get`) y `HttpPlatformVehiclesRepository`, enlazado en `providers.ts`.
- **Estado**: `PlatformOrganizationVehiclesFacade` toma la empresa de la pantalla de detalle (`open(id)`), no de `OrganizationContext`; cambiar de empresa descarta resumen, lista, detalle y filtros. La pestaña pide los datos solo al abrirse; la insignia con el total de registrados aparece después.
- **Reutilización sin copiar**: la tabla, las tarjetas y los filtros salieron de `VehiclesComponent` a `VehicleInventoryComponent` y leen de la interfaz `VehicleInventory` (la implementan `VehiclesFacade` y la facade de plataforma); `VehicleDetailComponent` acepta `source` y `readOnly`. Con `readOnly` las tarjetas son `div` (no botones) y no hay «Registrar vehículo» ni «Editar»; el estado vacío dice «Esta empresa aún no tiene vehículos registrados.».
