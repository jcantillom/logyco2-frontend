Histórico: módulo eliminado el 2026-11-21

# Rediseño funcional y UX · Metodologías y factores de emisión

Objetivo: que el Super Admin administre «las reglas y referencias que utiliza LoGyCO₂ para calcular las emisiones de las empresas» sin ser ingeniero ambiental, sin quitar ninguna validación técnica.
Ramas/Git: no se hacen operaciones Git. Entrega: ver `docs/CHANGELOG-dev.md`. Pruebas backend: `uv run pytest tests/test_emissions_*.py …`; frontend: `ng test --watch=false --browsers=ChromeHeadless`.
Este mismo archivo existe en el backend y en el frontend (`docs/tasks/emissions-ux.md`); el contrato de abajo es el mismo en ambos.

## Specs

- **S1** Una sola entrada de menú: «Descarbonización → Metodologías y factores». Dentro, tres preguntas: «¿Qué métodos puede utilizar LoGyCO₂?», «¿Qué necesita revisión?», «¿Qué cambió?».
- **S2** Encabezado «Configuración de cálculos de carbono»; subtítulo «Administra las reglas y referencias que utiliza LoGyCO₂ para calcular las emisiones de las empresas»; «Metodologías y factores de emisión» queda como nombre técnico secundario (breadcrumb).
- **S3** Resumen compacto: «Metodologías listas», «Factores disponibles», «Pendientes de revisión», «Estado de configuración» (`Lista para calcular` · `Configuración incompleta` · `Requiere atención`), derivado de capacidades reales; si la cobertura es limitada se informa su cobertura real y no se afirma que toda la plataforma está lista.
- **S4** Sección «Qué necesitas hacer ahora»: acciones agrupadas por objetivo («Revisar fuentes técnicas» → «Revisar fuentes»; «Aprobar factores de emisión» → «Revisar factores»; «Completar metodologías» → «Completar metodología»). Conteos del backend, nunca inventados; cada botón navega al filtro y a los registros que de verdad requieren esa acción. Cada mensaje explica qué ocurre, por qué importa, qué debe hacer el usuario y qué sucederá después. «Falta un factor compatible para CO₂» → «Esta metodología todavía no tiene un factor de CO₂ aprobado para calcular emisiones. Revisa los factores disponibles y selecciona uno compatible» con la acción «Seleccionar factor».
- **S5** Metodologías en lenguaje comprensible (nombre en lenguaje común como título, el código solo en el detalle técnico): «Consumo real de combustible» («Calcula las emisiones a partir del combustible consumido por un vehículo.») y «Estimación por distancia y tipo de vehículo» («Estima emisiones cuando no existe información de consumo real.»); cada una con «Para qué sirve», «Qué información necesita», «Estado» (p. ej. «En preparación»), «Qué falta» y una acción («Completar configuración» / «Ver requisitos»).
- **S6** Detalle de metodología en cuatro secciones: **Resumen**, **Configuración**, **Preparación para publicar** (checklist agrupado Fuentes / Factores / Cálculo; distingue «Bloqueo obligatorio», «Advertencia» y «Validación correcta»; estado y acción recomendada; no todo en rojo), **Historial**.
- **S7** Fuentes: «Una fuente es el documento técnico que respalda los valores utilizados para calcular emisiones». Cada fuente muestra institución, documento, año, edición, URL, qué factores respalda y estado de verificación. La aprobación presenta documento original, página o tabla, valor extraído, unidad, alcance, declaración de revisión, usuario responsable y fecha; nadie aprueba con solo pulsar un botón. No se aprueba nada automáticamente; no se inventan permisos.
- **S8** Factores: tabla con combustible, gas, valor, unidad, fuente, región, vigencia, estado. Detalle: «Qué significa», «De dónde viene», «Dónde aplica», «Qué falta», acción «Revisar factor». No se publica con evidencia incompleta ni los 29 en bloque.
- **S9** Asistente «Preparar metodología»: Paso 1 Revisar definición · Paso 2 Verificar factores · Paso 3 Confirmar fuentes · Paso 4 Validar y publicar. Si faltan factores lleva al lugar y se puede regresar sin perder el estado. «Publicar» no es la acción principal hasta cumplir los requisitos.
- **S10** Excel real (CARITRANS): la administración comunica qué datos necesita cada método, qué columnas del formato de levantamiento podrían suministrarlos y qué metodologías son aplicables; contrato y validación para que el futuro procesador elija una metodología compatible. No se asumen distancias entre municipios sin fuente verificable, no se inventan consumos, no se presentan estimaciones como mediciones. No se construye la ingesta del Excel.
- **S11** Tres niveles: **1 Metodología definida**, **2 Metodología disponible** (fuentes, factores y validaciones aprobadas para un ámbito concreto), **3 Operación calculable** (la empresa entrega los datos). Si no hay cobertura: «Todavía no hay metodologías disponibles para esta operación».
- **S12** Arquitectura: se conserva (FastAPI/SQLAlchemy/Alembic/Repository/Services/RBAC/auditoría; Angular Component → Facade → Repository Contract → HTTP Repository). El backend entrega estado, bloqueos, advertencias, requisitos cumplidos, acción recomendada y destino; Angular no replica reglas metodológicas.
- **S13** Inconsistencias a corregir: «No requiere factores» (no debe decirse cuando faltan factores por vincular), «Borrador · se define al publicar», los 58 avisos (agrupar por acciones, sin alarmismo), códigos técnicos fuera del primer plano, paneles largos, selecciones sin opciones (explicar si faltan factores, permisos, versiones publicadas o compatibilidad), botones sin resultado claro.
- **S14** Decisión A: los vectores sintéticos de `selfcheck()` salen del código de producción; los tests de calculadores quedan aislados en `tests/`. Decisión B: correcciones controladas de registros precargados solo cuando no estén verificados ni publicados y se demuestre seguro; nunca silenciosas; con versión, diferencias y evidencia. Decisión C: una fuente no se aprueba solo porque sus valores coincidan con un PDF (aplicabilidad, unidad, combustible, región, alcance).
- **S15** Precarga: bajo `seeds/`, idempotente, `alembic upgrade head` y luego `python -m seeds --apply`; no se ejecuta al arrancar; no sobrescribe verificado/publicado; no aprueba nada; no se escribe en DEV sin autorización. (No existe pipeline en el repositorio todavía: se documenta el paso, no se inventa uno.)

## Contrato backend → frontend (acordado; ambos lados lo implementan tal cual)

Todos los textos de usuario salen del backend en español. Rutas bajo `/api/v1/emissions`. Los endpoints nuevos usan `ApiResponse[...]`, `Cache-Control: no-store`. Quien solo consulta recibe `actions: []` y nunca ve datos en revisión (misma regla que `summary`).

### 1. `GET /overview` (lectura; las `actions` solo para gestión)

```
data: {
  configuration_state: "READY" | "INCOMPLETE" | "ATTENTION",
  configuration_message: str,        // frase honesta con la cobertura real
  methodologies_ready: int,          // availability == READY
  methodologies_total: int,          // activas
  factors_available: int,            // elegibles hoy: publicado vigente + evidencia + fuente verificadas
  factors_total: int,
  pending_review: int,               // acciones humanas pendientes: ver «Definiciones»
  actions: [ {
     code: "REVIEW_SOURCES" | "REVIEW_FACTORS" | "COMPLETE_METHODOLOGIES",
     count: int, title: str, why: str, next: str,        // qué ocurre / por qué importa / qué sucederá después
     cta_label: str,
     target: { view: "sources" | "factors" | "methodologies", filters: { [param: str]: str } }  // param = query real del listado
  } ],                               // solo acciones con count > 0, ordenadas por prioridad
  coverage: [ { methodology_id, code, name, availability, fuels: [str], regions: [str], statement: str } ]
}
```
- `configuration_state`: `READY` si hay ≥1 metodología READY y ninguna acción bloqueante de gestión pendiente; `INCOMPLETE` si no hay ninguna READY; `ATTENTION` si hay READY pero hay problemas (p. ej. publicada sin fuente verificada/vencida, o conflictos del catálogo). El texto de `configuration_message` nunca dice «todas» salvo que sea verdad; con cobertura limitada lista los combustibles cubiertos.
- `coverage[].fuels/regions` salen de los factores elegibles vinculados a esa metodología (vacío si no está READY); `statement` p. ej. «Disponible para: Diésel, Gasolina (Colombia)» o «Todavía no hay cobertura válida».
- Definiciones: `REVIEW_SOURCES.count` = fuentes `PENDING` que respaldan alguna versión de factor `IN_REVIEW`/`DRAFT`/`PUBLISHED`; `REVIEW_FACTORS.count` = versiones de factor `IN_REVIEW` con evidencia sin verificar; `COMPLETE_METHODOLOGIES.count` = metodologías activas con availability distinta de READY. Targets: `sources` → `{review_status: "PENDING"}`; `factors` → `{evidence: "PENDING_REVIEW"}`; `methodologies` → `{availability: "<estado>"}` solo cuando una sola; si no, `{}`. `pending_review` = suma de los dos primeros conteos. Para elementos sin acción posible (p. ej. falta una fuente que ningún humano puede tener hoy) la acción lo dice en `why`, no se inventa un botón.
- `GET /summary` sigue existiendo (no se rompe).

### 2. Filtros nuevos en listados (los usa `target.filters`)
- `GET /sources?review_status=PENDING|VERIFIED`
- `GET /methodologies?availability=<Availability>`
- (`GET /factors?evidence=PENDING_REVIEW|VERIFIED` ya existe.)

### 3. `GET /methodologies/{id}/guide` (lectura; gestión ve versiones no publicadas)

```
data: {
  methodology_id, code, name,
  title: str,            // nombre en lenguaje común (p. ej. «Consumo real de combustible»); del catálogo del calculador
  purpose: str,          // «Para qué sirve»
  when_to_use: str,
  level: "DEFINED" | "AVAILABLE" | "CALCULABLE_IN_SCOPE",   // los tres niveles; ver S11 (CALCULABLE solo lo decide `applicable`, aquí máximo AVAILABLE)
  status_label: str,     // «En preparación», «Disponible», «Pendiente de factores», …
  required_data: [ { code, label, units: [str], levantamiento_columns: [str], derivation: str | null } ],
  missing: [ { code, group: "SOURCES"|"FACTORS"|"CALCULATION"|"DEFINITION", message: str, action: Action | null } ],
  ready_for_use: bool
}
Action = { code: str, label: str, target: { view: "sources"|"factors"|"methodologies"|"wizard"|"version", id?: uuid, filters?: {…} } }
```
- `required_data[].levantamiento_columns`: nombres de columnas del formato oficial de levantamiento de información de huella de carbono (hoja «Formato») que podrían suministrar el dato. Mapa **en código** (`data_requirements.py`), documentado. Mapeo inicial: `FUEL`→«Tipo de combustible (Diesel, Gasolina, GNV, Eléctrico)»; `ACTIVITY_DATE`→«Fecha del Viaje (dd/mm/aaaa)»; `VEHICLE_CLASS`→«Tipo de Vehículo (Turbo, Sencillo, Tracto, etc)» y «Configuración (ej:C1, CC2, CC3SC3C3, etc)»; `DISTANCE_KM`→«Distancia (km)» y `derivation`: «Si la columna llega vacía, solo puede derivarse de origen y destino con una fuente verificada de distancias; hoy no existe en el catálogo»; `FUEL_QUANTITY`→ ninguna (`[]`) con `derivation`: «El formato de levantamiento no trae consumo por viaje; hace falta el dato de consumo o el rendimiento (km/gal) junto con la distancia»; `REGION`→«Origen - Departamento» y «Destino - Departamento». **No** se escribe en el contrato cuántas filas llegan vacías (eso depende de cada archivo).
- `missing` se deriva de los controles de readiness y de `availability` (misma lógica, sin duplicar reglas en Angular).

### 4. `GET /methodologies/{id}/versions/{version_id}/readiness` — se enriquece (sin quitar campos)
Cada check suma: `group: "DEFINITION"|"SOURCES"|"FACTORS"|"CALCULATION"`, `level: "BLOCKER"|"WARNING"|"OK"` (OK cuando `ok == true`), `why: str` (por qué importa) y `action: Action | null`. Se conservan `code`, `ok`, `message`, `severity`.
La compatibilidad de la selección de factores y la disponibilidad del calculador se mantienen; **desaparece** el control «pruebas de cálculo» (`selfcheck`, decisión A): la prueba de los calculadores vive en `tests/` y la pantalla no afirma «pruebas satisfactorias».

### 5. `POST /methodologies/applicable` (lectura) — contrato para el futuro procesador
Body: `{ available_inputs: [str] (códigos de entrada, p. ej. FUEL, FUEL_QUANTITY, DISTANCE_KM, VEHICLE_CLASS, ACTIVITY_DATE, REGION), fuel?: str, on_date?: date, region?: str }`.
Respuesta `data`: `{ outcome: "CALCULABLE" | "AVAILABLE_MISSING_DATA" | "NOT_AVAILABLE", message: str, methodologies: [ { methodology_id, code, title, level: "DEFINED"|"AVAILABLE"|"CALCULABLE", missing_inputs: [{code,label}], reasons: [{code,message}], covers_operation: bool } ] }`.
- `CALCULABLE` solo si hay metodología READY, la fecha/región/combustible están cubiertos por factores elegibles y están todas las entradas obligatorias. `AVAILABLE_MISSING_DATA`: READY pero faltan datos. `NOT_AVAILABLE`: mensaje exacto «Todavía no hay metodologías disponibles para esta operación». Nunca estima ni completa datos.

### 6. Verificación con declaración (cambia endpoints existentes)
`POST /sources/{id}/verify`, `POST /factors/{factor_id}/versions/{version}/verify-evidence` y `POST /methodologies/{id}/versions/{version}/verify-evidence` pasan a **exigir body**:
```
{ document_reference: str (3..300; página o tabla del documento original),
  scope_statement: str (10..1000; aplicabilidad/alcance: combustible, región, unidad),
  extracted_value: str | null  (factor: obligatorio; debe ser igual (Decimal) al valor guardado; si no, 422 EMISSION_REVIEW_MISMATCH),
  extracted_unit: str | null   (factor: obligatorio; debe ser igual a la unidad de actividad guardada),
  declaration: true            (obligatorio; false/omitido → 422 VALIDATION_ERROR) }
```
Se persiste `review_declaration` (JSONB nullable) en `emission_sources`, `emission_factor_versions` y `emission_methodology_versions` (migración nueva, aditiva); se limpia al devolver a borrador / al editar una fuente verificada; el evento de auditoría la lleva. Los detalles devuelven `review_declaration: { document_reference, scope_statement, extracted_value, extracted_unit, declared_by (uuid o nombre), declared_at } | null` (solo gestión). Idempotencia: repetir la verificación con la misma persona no cambia nada. Error nuevo `EMISSION_REVIEW_MISMATCH` (422).

### 7. Precarga (decisión B)
`python -m seeds --apply` conserva su comportamiento por defecto (los CONFLICT se rechazan). Nueva opción **explícita** `--correct-unreviewed`: solo corrige un registro cargado cuando está **sin revisión humana** (fuente `PENDING` sin respaldo publicado; versión de factor/metodología `IN_REVIEW`/`DRAFT` con evidencia sin verificar) y el cambio es **solo de contenido** del catálogo; registra versión del catálogo, diferencia campo a campo (antes/después) y huellas en la ejecución (`emission_catalog_runs`, sin DDL) y en auditoría; `--dry-run` la muestra como `CORRECT`. Todo lo verificado o publicado sigue siendo CONFLICT. Nada se aprueba.

## Tasks

- [ ] **T1** (S3-S6, S10-S13, S14A) Backend guía: `GET /overview`, filtros nuevos, `GET …/guide`, readiness enriquecido, `POST /methodologies/applicable`, `data_requirements.py`, retirar `selfcheck` de producción · inline→delegado (writer B1: ruta paralela)
- [ ] **T2** (S7-S8, S14C) Backend verificación con declaración + migración `review_declaration` + error `EMISSION_REVIEW_MISMATCH` · writer B1 (misma unidad; comparte `schema.py`/`controller.py`)
- [ ] **T3** (S14B, S15) Precarga `--correct-unreviewed` · writer B2 (superficie disjunta: `seeds/`, `catalog_seed.py`, `catalog_loader.py`)
- [ ] **T4** (S1-S13) Frontend: vista principal, acciones, metodologías, detalle en 4 secciones, fuentes/factores con revisión, asistente, textos · writer F (consume el contrato; sin acceso a la base)
- [ ] **T5** Verificación independiente (migración + cambio de contrato = ítems 1 y 3 de alto riesgo), pruebas, lint, build, navegador, docs, informe

## Log

- **L1** (2026-11-21) Petición original del usuario, mensaje «Rediseño funcional y UX del módulo Metodologías y factores de emisión» (texto completo en la transcripción de la sesión): «Quiero que transformes el módulo Metodologías y factores de emisión de LoGyCO₂ en una experiencia profesional, intuitiva y orientada al negocio.» · «No quiero eliminar las validaciones técnicas. Quiero que la plataforma oculte la complejidad innecesaria y explique claramente las acciones necesarias.» · «LoGyCO₂ debe ser fácil de utilizar, aunque su funcionamiento interno sea científicamente rigurosa.» (sic: «riguroso») · «Implementa los cambios seguros directamente. Cuando una acción requiera autorización, prepara el plan sin ejecutarla.»
- **L2** (2026-11-21) Inspección del Excel real (`CARITRANS_Formato Levantamiento de Info HC + Diccionario - Data 2025 1.xlsx`, hojas «Formato», «Diccionario», «Listas»; solo lectura): 63 433 filas con datos. Columnas con datos al 100 %: ID del viaje, fecha, naturaleza de carga, tipo de flota, placa, modelo, tipo de vehículo, configuración, tipo de combustible (Diesel 62 682, GASOLINA 527, GNV 224), capacidad (t), origen/destino departamento y municipio, carga transportada (t). **0 %**: Rendimiento (km/gal), Distancia (km), Carga (m³), duraciones, direcciones, tipo de viaje/operación, tecnología vehicular. No existe columna de consumo por viaje. Consecuencia: hoy ninguna metodología (consumo ni distancia) puede calcular con ese archivo tal como llegó; GNV exigiría factor por m³/energía que el catálogo no tiene verificado.
- **L3** (2026-11-21) Estado verificado antes de empezar: 293 pruebas de emisiones pasan, `seeds --dry-run` 0 CREATE/0 CONFLICT (6 fuentes, 29 factores, 2 metodologías, todo IN_REVIEW/DRAFT, 0 publicados). El texto «No requiere factores.» está en `emission-methodology-sections.component.ts:57`. No existe pipeline de CI/CD en el repositorio (README: se trabaja más adelante).
- **L4** Decisión: el control de «pruebas de cálculo» de readiness (`selfcheck`) se elimina de producción (S14A) en lugar de moverlo, porque la pantalla no puede afirmar «pruebas satisfactorias» sin ejecutarlas; la evidencia de pruebas la dan los tests aislados.
- **L5** (2026-11-21) Writer F (T4): frontend entregado contra el contrato, solo con fixtures (sin backend real). Cubre S1-S13 y S10 (datos necesarios con columnas del formato de levantamiento y derivación en Resumen; `applicable` implementado en repositorio/fachada con prueba, sin UI). Decisión: la revisión de factores y fuentes durante el asistente se abre en un diálogo dentro del asistente (estado en memoria, sin navegar) para volver sin perder el borrador; el resumen `GET /summary` deja de consumirse. Pendiente fuera de la superficie permitida: `src/app/features/platform/platform-routing.spec.ts:154` aún espera el h1 «Metodologías y factores de emisión» y debe esperar «Configuración de cálculos de carbono» (única falla de la suite completa); por eso T4 queda sin marcar hasta cerrar ese ajuste y la verificación independiente (T5).
- **L6** (2026-11-21) Cambio de contrato del backend: `GET /sources?backs_factor=true|false`; el destino de `REVIEW_SOURCES` pasa a `{review_status: PENDING, backs_factor: true}` (el total del listado iguala el conteo de la acción); `applicable` suma `VERSION_NOT_IN_FORCE`; `configuration_state` es igual para lectores y gestores. Frontend: `backs_factor` soportado como `review_status` (dirección, repositorio, fachada) con la nota visible «Solo fuentes que respaldan factores» que se puede quitar; sin otros cambios de interfaz.
- **L7** (2026-11-21) Revisión en navegador real del coordinador: (1) tabla de fuentes con columnas Institución/Documento colapsadas por `overflow-wrap: anywhere`; (2) factores con el código como línea principal, «Gas» partido y filtros apretados; (3) la lista mostraba «Sin versión publicada» y «—» para factores en revisión. Acuerdo: el backend agrega `reference` (`FactorCurrent` + `status` + `evidence_verified`; vigente publicada o la más reciente no retirada) a cada ítem de la lista; el frontend lo lee opcional (sin él, `current`). Corregido: anchos por columna y notas plegadas, nombre como línea principal, «Más filtros», una línea de estado y a lo sumo una pista. Sin ejecutar acciones de confirmar/verificar/publicar en la aplicación real.
