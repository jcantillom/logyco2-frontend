# Feature `intelligence` (LoGyCO₂ Intelligence)

Leyenda: [V] verificado en código; [?] no comprobado.

Código: `src/app/features/intelligence/` (15 archivos, 2.217 l. medidas con `wc -l`), más el puerto, el adaptador, los DTO/mappers y los modelos que usa (sección 2). Contrato del backend: `../logyco2-backend/docs/modules/intelligence.md` (repo hermano; solo lectura desde aquí).

## 1. Propósito, rutas y permisos

Indicadores públicos y compartidos entre empresas (el backend filtra, agrega y autoriza; Angular solo presenta): precios de referencia de combustibles (ACPM y gasolina por ciudad, GNCV por departamento), Índice de Costos del Transporte de Carga por Carretera (ICTC) del DANE con sus grupos de costos, estado de las fuentes y, solo para administradores de la plataforma, actualización a demanda de cada fuente. [V]

### 1.1 Rutas [V]

| URL | Componente | Sección (`data.section`) | Guardas |
|---|---|---|---|
| `/intelligence` (espacio de empresa, bajo `ShellComponent`, `app.routes.ts`) | `IntelligenceComponent` | ninguna: se muestra el **Resumen** (`overview`) | `authGuard` del shell + `permissionGuard('sector_reports:read')` en la ruta padre `intelligence` |
| `/intelligence/energia` (espacio de empresa) | `IntelligenceComponent` | `energy` («Mercado energético») | ídem (hija de la anterior) |
| `/intelligence/costos` (espacio de empresa) | `IntelligenceComponent` | `costs` («Costos de transporte») | ídem |
| `/intelligence/**` (espacio de empresa) | redirige a `/intelligence` | | |
| `/plataforma/intelligence/energia` | `IntelligenceComponent` | `energy` («Mercado energético») | `platformMatch` + `authGuard` + `platformGuard` del padre `/plataforma` |
| `/plataforma/intelligence/costos` | `IntelligenceComponent` | `costs` («Costos de transporte») | ídem |
| `/plataforma/intelligence/fuentes` | `IntelligenceAdminComponent` | (sin sección) | ídem |
| `/plataforma/intelligence`, `.../sectorial`, `.../sostenibilidad`, `.../**` | redirigen a `energia` | | |

- En la consola, el menú «Herramientas complementarias» (`platform-nav.ts`) tiene «Referencias de combustibles» (`/plataforma/intelligence/energia`) e «Indicadores de costos» (`/plataforma/intelligence/costos`). No hay ítem para `fuentes`: se llega desde el botón «Administrar fuentes» (visible solo si `PlatformAccess.isSuperAdmin()`). [V]
- En el espacio de empresa **no hay ítem de menú** para `/intelligence` (`shared/layouts/nav-items.ts` no lo contiene): se llega desde el enlace «Ver detalle →» de la tarjeta «Precios de combustibles» del Resumen de la empresa (`dashboard.component.ts`, ver [dashboard.md](dashboard.md)). [V]
- Los enlaces de la vista general («Ver todas las ciudades →» y «Ver detalle del ICTC →») apuntan a `/intelligence/energia` y `/intelligence/costos`, dentro del espacio de la empresa: así un usuario con `sector_reports:read` los abre sin pasar por la consola, que es solo de `SUPER_ADMIN`. Solo el enlace «Administrar fuentes» va a `/plataforma/intelligence/fuentes` y se muestra únicamente a un `SUPER_ADMIN`. [V]
- La sección activa la define la ruta, no una pestaña: `IntelligenceComponent` lee `route.data['section']` (por defecto `overview`) y dibuja solo esa sección, dentro de `<section class="tab-panel" id="panel-<sección>">`; las otras no existen en el DOM. [V]

### 1.2 Quién ve y quién edita [V]
- **Ver** (`/intelligence/**`): permiso `sector_reports:read`, que `access-policy.ts` asigna a `SUPER_ADMIN` (rol global), `ORG_ADMIN`, `ORG_ANALYST`, `ORG_VIEWER` y `GUILD_VIEWER`. Backend: `GET /intelligence/*` exige `sector_reports:read` (doc del backend).
- **Consola** (`/plataforma/intelligence/**`): solo `SUPER_ADMIN` global (`platformMatch` síncrono y `platformGuard` con `GET /auth/me` fresco; sin rol -> `/acceso-denegado`).
- **Administrar** (única mutación: `POST .../refresh`): el botón de acceso es una pista de interfaz (`PlatformAccess.isSuperAdmin`, no autoriza); el control real es la ruta bajo `/plataforma` y el backend (solo administrador de la plataforma, según su doc).
- No hay edición de datos ni carga de archivos: la importación manual de precios ya no existe (lo comprueba `http-intelligence.repository.spec.ts`).

## 2. Flujo de datos [V]

```
Componente -> IntelligenceFacade (ScopedResource, signals)
           -> IntelligenceRepository (puerto, domain/repositories/intelligence.repositories.ts, 21 l.)
           -> HttpIntelligenceRepository (infrastructure/repositories/http-intelligence.repository.ts, 40 l.; ApiClient)
           -> DTO + mappers (infrastructure/mappers/intelligence.mappers.ts, 106 l.) -> modelos (domain/models/intelligence.ts, 145 l.)
```
`providers.ts` enlaza `IntelligenceRepository` con `HttpIntelligenceRepository`. Los DTO (`SummaryDto`, `HistoryDto`, `AreasDto`, `GroupsDto`, `SourceStatusDto`, `IngestionDto`, …) viven en el mismo archivo de mappers (ver hallazgo H-D3 de [domain-infrastructure.md](../domain-infrastructure.md)).

### 2.1 Endpoints (prefijo `/api/v1` del `ApiClient`)

| Método del puerto | Llamada | Devuelve |
|---|---|---|
| `summary()` | `GET /intelligence/summary` | `IntelligenceSummary`: tarjetas destacadas (`featured: IndicatorCard[]`) y `generatedAt` |
| `history(code, query)` | `GET /intelligence/indicators/{code}/history` con `area_code` y `date_from` (omitidos si vacíos: `ApiClient.toParams` descarta `null`, `undefined` y `''`) | `IndicatorHistory`: serie (`points`), fuente, unidad, área y áreas disponibles |
| `areas(code)` | `GET /intelligence/indicators/{code}/areas` | `AreaComparison`: último valor por ciudad o departamento |
| `ictcGroups()` | `GET /intelligence/ictc/groups` | `GroupBreakdown`: total y grupos del ICTC en su último período |
| `sources()` | `GET /intelligence/sources` (respuesta `{ items }`) | `SourceStatus[]` |
| `refreshSource(code)` | `POST /intelligence/sources/{code}/refresh` (cuerpo `{}`) | `IngestionResult` (`SUCCESS`/`FAILED`, conteos y `errorCode`) |

`code` y `sourceCode` se codifican con `encodeURIComponent`. El backend acepta además `date_to`, que el frontend no envía. Todas las fechas de calendario se convierten con `toLocalDate` (`YYYY-MM-DD` a fecha local, sin el desfase de zona horaria de `new Date('YYYY-MM-DD')`); los instantes (`acquired_at`, `last_success_at`, …) con `new Date(...)`. [V]

### 2.2 Estado, carga y errores [V]
- `IntelligenceFacade` (`providedIn: 'root'`, 162 l.) expone nueve `ScopedResource` (`summary`, `energy`, `costs`, `groups`, `sources`, `acpmAreas`, `gasolineAreas`, `gncvAreas`) más signals de selección (`energyCode`, `energyArea`, `energyMonths`, `costCode`, `costMonths`, `working`). Todos se registran en `ContextResetRegistry`.
- `loadAll()` hace **8 GET** (summary, sources, ictc/groups, areas de ACPM, gasolina y GNCV, history de energía, history de costos). Todas las cargas usan `{ keepData: true }`: si ya hay datos se refrescan en segundo plano, sin pasar por «cargando». `loadSummary()` pide solo el resumen (lo usan las tarjetas de combustibles de los dos resúmenes).
- Cargas: `IntelligenceComponent` y `IntelligenceAdminComponent` llaman `facade.loadAll()` en el **constructor**; ninguno usa `reloadOnContextChange` (los resúmenes de empresa y de consola sí llaman `loadSummary()`: el de empresa con `reloadOnContextChange`, el de consola en el constructor).
- Elegir combustible (`selectEnergy`), ciudad (`selectEnergyArea`), grupo de costos (`selectCost`) o ventana (`setEnergyMonths`, `setCostMonths`) vuelve a pedir `history` al backend con `date_from = monthsAgo(n)` (primer día del mes de hace `n` meses). Nada se agrega ni filtra en Angular. La comparación por ciudad se pide una vez por combustible (`acpmAreas`, `gasolineAreas`, `gncvAreas`; el getter `cities` devuelve la del combustible elegido).
- `useFirstFuelWithData`: si el combustible por defecto (ACPM) no tiene datos en el resumen y otro sí, y la persona aún no eligió, se cambia al primero con datos.
- `refresh(code)` pone `working`, hace el POST y, al responder bien, ejecuta `loadAll()`.
- Errores: `ResourceStateComponent` (`app-resource-state`, con `skeleton` `kpis`/`chart`) en el Resumen, el ranking de ciudades, el diálogo de fuentes, y la administración; `IntelligenceFacade.sharedError` (computed) junta en **un aviso general** (con `requestId` y «Reintentar» -> `loadAll()`) los fallos de `summary`, `energy`, `acpmAreas`, `costs` y `sources` cuando son al menos dos y todos tienen el mismo código; sin eso, cada sección muestra su estado. Las secciones «Mercado energético» y «Costos de transporte» no usan `app-resource-state` (ver H-I2).
- `ERROR_LABELS`/`errorLabel` (`intelligence.labels.ts`) traduce los códigos de error de ingesta (`ICTC_*`, `GNCV_*`, `PORT_*`, `CREG_*`, `DATABASE_ERROR`); los códigos de error HTTP (`SECTOR_DATA_FORBIDDEN`, `INDICATOR_NOT_FOUND`, `SOURCE_NOT_FOUND`, `SOURCE_NOT_AVAILABLE`) están en `core/errors/error-catalog.ts`.

## 3. Archivos y componentes

| Archivo | Líneas | Rol |
|---|---:|---|
| `intelligence.component.ts` | 115 | `IntelligenceComponent` (`app-intelligence`): contenedor de la ruta. Encabezado por sección, aviso general de error, pie y la sección que indica `data.section`; abre el diálogo de fuentes. |
| `intelligence-overview.component.ts` | 409 | `IntelligenceOverviewComponent` (`app-intelligence-overview`): Resumen (KPI, evolución de combustible e ICTC, precios por ciudad, grupos del ICTC y fuentes). |
| `intelligence-energy.component.ts` | 231 | `IntelligenceEnergyComponent` (`app-intelligence-energy`): Mercado energético. |
| `intelligence-costs.component.ts` | 170 | `IntelligenceCostsComponent` (`app-intelligence-costs`): Costos de transporte. |
| `intelligence-sources-dialog.component.ts` | 64 | `IntelligenceSourcesDialogComponent` (`app-intelligence-sources-dialog`): diálogo «Fuentes y actualización» (`open()`). |
| `intelligence-charts.ts` | 57 | `energyChart` y `costChart`: series, etiquetas, notas y marca de los gráficos que comparten el Resumen y las secciones. |
| `intelligence.format.ts` | 33 | `formatMoney`, `formatNumber`, `formatPct`, `formatMonth`, `shortDate`, `shortMonth`, `axisMonth`, `axisDate`. |
| `intelligence.styles.ts` | 35 | `PANEL_STYLES`: CSS de tarjetas, controles y estados vacíos que comparten las secciones. |
| `intelligence.facade.ts` | 162 | `IntelligenceFacade` (con `sharedError`), `ENERGY_INDICATORS`, `COST_INDICATORS`, `ENERGY_RANGES`, `COST_RANGES`, `monthsAgo`. |
| `intelligence-admin.component.ts` | 155 | `IntelligenceAdminComponent` (`app-intelligence-admin`): estado de fuentes y actualización a demanda. |
| `fuel-price-cards.component.ts` | 80 | `FuelPriceCardsComponent` (`app-fuel-price-cards`): tarjetas ACPM, gasolina y GNCV; las usan el Resumen de la empresa y el de la consola. |
| `intelligence.labels.ts` | 37 | `ERROR_LABELS`, `errorLabel`, `statusOf`, `statusLabel`. |
| `intelligence.component.spec.ts` | 499 | 39 `it`. |
| `intelligence-routes.spec.ts` | 91 | 6 `it`. |
| `intelligence-admin.component.spec.ts` | 79 | 5 `it`. |

Fuera de la carpeta: `http-intelligence.repository.ts` (40 l.), `http-intelligence.repository.spec.ts` (99 l., 7 `it`), `intelligence.mappers.ts` (106 l.), `domain/models/intelligence.ts` (145 l.), `intelligence.repositories.ts` (21 l.).

### 3.1 `IntelligenceComponent` y sus secciones [V]
`IntelligenceComponent` no tiene inputs ni outputs; inyecta `IntelligenceFacade`, `ActivatedRoute` y `PlatformAccess`, y carga todo con `loadAll()` en el constructor. Pinta el encabezado por sección (`SECTIONS`), el aviso general de error y, solo para `SUPER_ADMIN`, el enlace «Administrar fuentes» (`data-testid="intelligence-admin"`); la sección (un componente propio, ver la tabla) la elige con un `@switch` sobre `data.section`, y el resumen le pide abrir el diálogo de fuentes con su output `sources`. Cada sección inyecta la facade y declara sus estilos (`PANEL_STYLES` más los suyos).

- **Resumen (`overview`, `IntelligenceOverviewComponent`, solo `/intelligence`)**: tarjetas KPI de `summary.featured` (`data-testid="featured"`): valor y unidad, variaciones («vs. anterior» para precios CREG con vigencias irregulares; «Mensual», «Anual» y «Año corrido» para el resto), significado, período o vigencia, fuente con enlace, fechas de publicación y adquisición, y aviso si la última actualización falló; indicador sin datos: «Sin información disponible» y una pista, sin cifras. Debajo: gráfico de evolución del combustible elegido (selector ACPM/Gasolina/GNCV y ventana) y del ICTC (ventana), tabla «Precio de combustibles por ciudad» (ACPM y gasolina unidos por código de área, Bogotá primero, filtro por ciudad sin distinguir tildes, orden por ciudad/ACPM/gasolina/variación; si no hay ACPM ni gasolina, muestra el GNCV por departamento), «ICTC por grupo de costos» (barras de variación mensual), «Fuentes de datos» (estado por fuente) y enlaces «Ver todas las ciudades →» y «Ver detalle del ICTC →» (a `/plataforma/intelligence/energia` y `/costos`) y «Gestionar fuentes y actualizaciones →» (abre el diálogo).
- **Mercado energético (`energy`, `IntelligenceEnergyComponent`)**: histórico de precios (selector de combustible, ventana y, si hay más de una, ciudad o departamento), «lectura» (frase, precio actual, último cambio, cambio en el período y frente al promedio de ciudades), gráfico con eje ajustado al rango y aviso de que no parte de cero, y «Comparación entre ciudades» (más barata, más cara, diferencia, ranking con barras relativas; elegir una ciudad vuelve a pedir su histórico).
- **Costos de transporte (`costs`, `IntelligenceCostsComponent`)**: gráfico del ICTC por grupo (Total nacional, Combustibles, Insumos, Costos fijos y peajes, Mantenimiento y repuestos) y ventana (12, 24, 48 o 84 meses), y «Lectura del índice» (índice actual, distancia frente a la base dic. 2015 = 100, variación mensual y de 12 meses, mínimo, máximo, posición en la ventana y cambio en el período; se calcula con los puntos ya cargados).
- **Diálogo «Fuentes y actualización»** (`IntelligenceSourcesDialogComponent`; `<dialog>` nativo, `showModal()`): tabla de fuentes (adquisición, frecuencia, último éxito, estado, licencia).
- Pie: «Última actualización general» (máximo de `lastSuccessAt` de las fuentes).
- Formato (`intelligence.format.ts`): `formatMoney` (`$ ` + `Intl.NumberFormat('es-CO')` sin decimales), `formatNumber` (2 decimales), `formatPct` (flecha y signo), `formatMonth`, `shortDate`, `shortMonth`, `axisMonth`, `axisDate`; `ago` (`relativeTime` de `platform-labels`) en el Resumen.
- Gráficos: `TrendChartComponent` (`shared/ui/charts/trend-chart.component.ts`, 260 l.), con `kind="line"`, `area`, `fill`, `labelGap`, `labels`, `series` (`ChartSeries`, color `CHART_COLORS.green`), `fitRange`, `notes` (línea extra del tooltip: circular de origen y variación), `markLast` (valor actual sobre el último punto) y `ariaLabel`; incluye tabla equivalente `sr-only`.

### 3.2 `IntelligenceAdminComponent` [V]
Sin inputs ni outputs; inyecta `IntelligenceFacade`, `ToastService`, `ActionFeedbackService`. Una tarjeta por fuente (nombre, publicador con enlace, frecuencia, estado «Actualizado»/«Con error»/«Sin datos»/«Pendiente», último éxito, último intento, licencia, error traducido y notas). Con `providerAvailable`: «Actualizar ahora» (`POST /intelligence/sources/{code}/refresh`); sin proveedor automático: texto explicativo y sin botón. «Actualizar todas las automáticas» encadena (`concat`) un POST por fuente con proveedor. Resultado: `ActionFeedbackService` («Actualización completa: N nuevos, N revisados, N sin cambios») o `toast.warning` si alguna devolvió `FAILED` (se conservan los últimos datos válidos), o `toast.error` ante un error HTTP. Mientras actualiza deshabilita todos los botones (`busy`). Enlace «Volver a LoGyCO₂ Intelligence».

### 3.3 `FuelPriceCardsComponent` [V]
Input `compact` (booleano). Muestra tres tarjetas (ACPM, «Gasolina corriente», «Gas natural vehicular») con valor `$ …`, unidad, ciudad y vigencia, variación (frente a la publicación anterior o al mes anterior) y fuente con enlace; usa `app-resource-state` sobre `intel.summary` con reintento `loadSummary()`; sin dato: «—» y «Sin información disponible».

## 4. Modelos de dominio (`domain/models/intelligence.ts`) [V]
`IndicatorStatus`, `SourceRef`, `Variation`, `IndicatorCard`, `IntelligenceSummary`, `HistoryPoint`, `AreaOption`, `IndicatorHistory`, `AreaComparisonRow`, `AreaComparison`, `GroupVariation`, `GroupBreakdown`, `SourceStatus`, `IngestionResult`, `HistoryQuery`. Las variaciones las **calcula el backend** a partir de los valores guardados (no son cifras publicadas por la fuente).

## 5. Pruebas [V]
Conteo con `grep -c "^\s*it("`; ejecución real: `ng test --watch=false --browsers=ChromeHeadless` sobre `features/intelligence/**` y `shared/ui/charts/**`: **64 correctas** (39 + 6 + 5 + 14).

| Spec | `it` | Cubre |
|---|---:|---|
| `intelligence.component.spec.ts` | 39 | KPI con y sin datos, actualización fallida, gráficos y estados vacíos, lectura de precio y ranking de ciudades, lectura del índice, formatos, aviso general único de error (y reintento, 403), una ruta por sección (solo se dibuja la activa), enlaces del resumen, tabla por ciudad (orden, filtro, GNCV de respaldo), enlace de administración solo para administradores. |
| `intelligence-admin.component.spec.ts` | 5 | Lista de fuentes, fuente sin proveedor, «Actualizar ahora» (POST y recarga), fallo conservando datos, «Actualizar todas» solo automáticas. |
| `intelligence-routes.spec.ts` | 6 | Configuración de las rutas de empresa (permiso en la ruta padre, hijas `energia`/`costos`, redirección) y navegación real: un usuario con permiso abre el detalle de energía y de costos, uno sin permiso es rechazado, la consola sigue siendo solo de `SUPER_ADMIN`, una dirección desconocida vuelve a la vista general. |
| `http-intelligence.repository.spec.ts` | 7 | Mapeo del resumen, precios CREG, indicador sin datos, parámetros de `history`, grupos del ICTC, POST de `refresh`, inexistencia de la importación manual. |
| `shared/ui/charts/charts.spec.ts` | 14 | Gráficos SVG propios (ejes, líneas, barras, dona, modo `fill`, etiquetas de dos líneas); compartido con `platform`. |

Las tarjetas de combustibles de la consola se prueban en `platform-dashboard.component.spec.ts`, y las rutas en `platform-routing.spec.ts`.

## 6. Hallazgos de calidad

| ID | Severidad | Hallazgo | Ubicación |
|---|---|---|---|
| H-I1 | Media [V] | `/intelligence` no tiene ítem de menú en el espacio de empresa; solo se llega por el enlace «Ver detalle →» del Resumen. | `shared/layouts/nav-items.ts`, `features/dashboard/dashboard.component.ts` |
| H-I2 | Media [V] | En «Mercado energético» y «Costos de transporte» los gráficos y la lectura no pasan por `app-resource-state`: mientras carga, o si falla solo ese recurso, se ve «Sin información disponible» (sin skeleton, error ni «Reintentar»); solo ≥2 errores con el mismo código muestran el aviso general. | `intelligence-energy.component.ts`, `intelligence-costs.component.ts` |
| H-I3 | Media [?] | `IntelligenceFacade` se registra en `ContextResetRegistry` (se vacía al cambiar de empresa) aunque los datos son públicos y no dependen de la empresa; `IntelligenceComponent` carga solo en el constructor (sin `reloadOnContextChange`), de modo que, al cambiar de empresa desde el shell estando en `/intelligence`, los recursos vuelven a `idle` sin recargarse. El efecto visible (skeletons) se deduce del código, no se probó en pantalla. | `intelligence.facade.ts`, `core/org/organization-context.ts`, `intelligence.component.ts` |
| H-I4 | Baja [V] | «Actualizar todas» llama `facade.refresh` por fuente y cada una termina en `loadAll()` (8 GET): N recargas completas. Además, abrir la administración llama `loadAll()` aunque solo usa `sources`. Con `concat`, un error HTTP en una fuente aborta las siguientes. | `intelligence.facade.ts`, `intelligence-admin.component.ts` |
| H-I5 | Baja [V] | `IntelligenceFacade.working` se escribe pero no se lee fuera de la facade. | `intelligence.facade.ts` |
| H-I6 | Baja [V] | Código trivial: `unitLabel` solo devuelve `card.unit`. | `intelligence-overview.component.ts` |
| H-I7 | Baja [V] | Textos y reglas fijos en el cliente: catálogos de indicadores (`ENERGY_INDICATORS`, `COST_INDICATORS`), `KPI_TITLES`, `SOURCE_BRIEF`, `NO_DATA_HINTS`, `BOGOTA = '11001'` (orden de la tabla) y base `100` del ICTC en `baseDelta` y `meaning`. El frontend no consulta un catálogo de indicadores. No son cifras de datos. | `intelligence.facade.ts`, `intelligence-overview.component.ts`, `intelligence-energy.component.ts`, `intelligence-costs.component.ts` |
| H-I8 | Baja [V] | Duplicación: formateadores `Intl.NumberFormat('es-CO')` también en `fuel-price-cards.component.ts` y `meaning()` del Resumen (aparte de `intelligence.format.ts`), rutas SVG de iconos (la de combustible también en `platform-nav.ts`), títulos de combustibles en `fuel-price-cards.component.ts`, `KPI_TITLES` y `ENERGY_INDICATORS`, y `statusOf`/`statusLabel` en `intelligence.labels.ts` y `state`/`label` en la administración (con textos distintos). | `intelligence-overview.component.ts`, `fuel-price-cards.component.ts`, `intelligence-admin.component.ts` |
| H-I9 | Baja [V] | Títulos de pruebas desactualizados: «la importación manual figura como tal» y «solo el administrador ve actualizar e importar» (el modelo solo admite `acquisition: 'AUTOMATIC'` y no existe importación). | `intelligence.component.spec.ts` |

Accesibilidad: no se auditó de forma sistemática [?]. Se observó: selectores con `aria-label`, botones de combustible con `aria-pressed`, gráfico con tabla `sr-only`, `role="alert"`/`role="status"` en avisos.

## 7. Cómo extender

- **Un indicador nuevo de precio o índice ya servido por el backend**: añadirlo a `ENERGY_INDICATORS` o `COST_INDICATORS` (`intelligence.facade.ts`); si necesita comparación geográfica, un `ScopedResource` y su carga en `loadAll()`; títulos e iconos de KPI en `KPI_TITLES`/`KPI_ICONS`/`NO_DATA_HINTS` de `intelligence.component.ts`. Si es destacado, lo devuelve `GET /intelligence/summary` y aparece solo.
- **Un endpoint nuevo**: método en `IntelligenceRepository` (puerto), implementación en `HttpIntelligenceRepository`, DTO y mapper en `intelligence.mappers.ts`, modelo en `domain/models/intelligence.ts` y un caso en `http-intelligence.repository.spec.ts`.
- **Una sección nueva**: componente propio (con `PANEL_STYLES`), ruta con `data.section`, entrada en `SECTIONS` y en `TabId`, un `@case` en el `@switch` de `IntelligenceComponent` y, si va en el menú, ítem en `platform-nav.ts`.
- **Una fuente nueva con proveedor automático**: la define el backend; aparece en administración con `providerAvailable`; añadir sus códigos de error a `ERROR_LABELS` y su rótulo a `SOURCE_BRIEF`.
- Pruebas: `HttpTestingController` con `provideTestApp()` y `buildSuperAdmin()`/`buildUser()` como en `intelligence.component.spec.ts`.

## 8. Referencias
- Backend: `../logyco2-backend/docs/modules/intelligence.md` (endpoints, autorización `can_read_sector_data`, modelo de datos, vigencias CREG, tráfico portuario).
- [platform.md](platform.md) (rutas y menú de la consola), [dashboard.md](dashboard.md) (tarjeta de precios de combustibles), [domain-infrastructure.md](../domain-infrastructure.md) (puerto, adaptador, mappers), [shared.md](../shared.md) (gráficos).
