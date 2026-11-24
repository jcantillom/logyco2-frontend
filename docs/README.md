# Documentación técnica · Frontend LoGyCO₂ (Angular)

> **Léelo primero.** Esta documentación existe para no tener que releer el código fuente en cada
> sesión. Antes de abrir archivos de `src/`, busca aquí la pieza y lee su doc. Solo abre el código
> cuando el doc marque `[?]` o necesites verificar un detalle puntual.
>
> Marcas: **[V]** verificado en código · **[?]** no comprobado. Referencias como `ruta:línea`.
> Línea base del análisis: 2026-11-17; revisión de coherencia con el código el 2026-11-21 (934 specs correctas tras añadir «Mis vehículos»; antes 745).

## Mapa de documentos

| Necesitas saber… | Lee |
|---|---|
| Capas, dependencias, bootstrap, rutas, estado, errores, auth, SOLID | [architecture.md](architecture.md) |
| Sesión, organización, http, errores, guards (incluye aterrizaje), interceptors, notificaciones, preferencias (tema) | [core.md](core.md) |
| Modelos, puertos, adaptadores, ApiClient, DTO, mappers, `providers.ts` | [domain-infrastructure.md](domain-infrastructure.md) |
| Layouts, componentes UI (paginadores, logos, campana), gráficos | [shared.md](shared.md) |
| Scripts, dependencias, build/lint/test, tsconfig | [tooling.md](tooling.md) |
| Cualquier pantalla/feature | [features/README.md](features/README.md) (índice) → `features/<feature>.md` (p. ej. [features/intelligence.md](features/intelligence.md), [features/emissions.md](features/emissions.md)) |
| Historial de cambios del desarrollo | [CHANGELOG-dev.md](CHANGELOG-dev.md) |
| Bitácora de tareas de cambios grandes (specs, tareas, log) | `docs/tasks/` (un archivo por cambio grande) |

Features documentadas: auth (incluye `onboarding`), calidad-de-datos, dashboard, emissions, imports, intelligence, operaciones-logisticas, organizations, platform, settings, system, users, vehicles.

## Resumen de arquitectura

Capas: `domain` (no importa nada) ← `core` (solo importa de `domain`) ← `infrastructure`
(`providers.ts` es el único punto que enlaza puertos con adaptadores HTTP) ← `shared` ← `features`.
Facades singleton con `ScopedResource` que se limpia al cambiar organización o cerrar sesión. Los
módulos sin backend no tienen pantalla, facade ni puerto: su ruta muestra `ComingSoonComponent`
("Próximamente") y su ítem de menú lleva `soon: true`.

## Hallazgos críticos abiertos (resumen; detalle en cada doc)

| # | Hallazgo | Dónde |
|---|---|---|
| 1 | Bearer en `sessionStorage` con `sessionPersistence: 'tab'`; sin CSP; logout no revoca token | core.md |
| 2 | `.badge-info` / `.alert-info` no definidas en `styles.scss` | shared.md, tooling.md |
| 3 | `platform`: empresas, usuarios y auditoría ya se paginan en el servidor; quedan cargas completas (`fetchAllPages`) en el selector de empresas de usuarios y en el detalle de empresa | features/platform.md |
| 4 | Componentes enormes con template/CSS inline; duplicación `users`/`platform` | features/README.md |
| 5 | Accesibilidad: rects de gráficos focusables sin nombre; `UserMenu` sin teclado | shared.md |
| 6 | Sin CI, sin cobertura, sin reglas ESLint de límites de capa; `prettier` no instalado | tooling.md |

## Regla de mantenimiento (obligatoria)

Toda feature, cambio de comportamiento, ruta, componente, servicio, endpoint consumido o corrección
de hallazgo **debe actualizar la documentación en el mismo trabajo**:

1. Actualizar el doc de la feature (`features/<feature>.md`) o de la capa afectada.
2. Si cambian rutas/guards: `architecture.md`. Si cambian puertos/adaptadores/DTO:
   `domain-infrastructure.md`. Si cambian componentes compartidos: `shared.md`.
3. Si cambian scripts/dependencias: `tooling.md`.
4. Si se cierra un hallazgo: marcarlo resuelto en su doc y en la tabla de arriba.
5. Una feature nueva: crear `features/<nombre>.md` y agregarla a `features/README.md` y a este mapa.
6. Añadir una entrada en [CHANGELOG-dev.md](CHANGELOG-dev.md).

Un cambio sin su actualización de docs se considera incompleto.
