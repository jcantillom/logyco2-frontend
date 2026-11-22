Histórico: módulo eliminado el 2026-11-21

# Catálogo, calculadores y asistente de metodologías (frontend)
Contrato de la API, specs S1–S8 y decisiones D1–D8: **documento de tarea del backend** `logyco2-backend/docs/tasks/emissions-catalog.md` (fuente única; aquí no se copia). Esta tarea es **T4** (S7, S8; D1, D2, D5, D7). Fase anterior: [emissions-governance.md](emissions-governance.md). Sin Git. Pruebas: `ng test` (no usa base).

## Tareas
- [x] T4 Centro de administración rediseñado, detalle de metodología, asistente de cuatro pasos con selector explicativo, factores y fuentes con verificación, estado del catálogo, errores, auditoría, pruebas y docs — route: delegada (escritor del frontend, en paralelo con el backend).

## Log
- Construido (ver [../features/emissions.md](../features/emissions.md)): franja del catálogo, tabla de metodologías con disponibilidad del servidor, detalle ancho con validaciones, asistente de cuatro pasos (`EmissionWizardComponent`), flujo guiado de «+ Nueva metodología», filtros `region`/`origin`/`evidence`, verificación de fuentes y de evidencia, textos de auditoría y errores nuevos.
- Evidencia (2026-11-21): `ng test` 799 de 799 (línea base 730); `ng build` y `ng build --configuration production` sin avisos; `npm run lint` sin errores (solo un aviso previo en `src/main.ts`).
- Lecturas del contrato (ambiguo; se tomó la más segura): `verify-evidence` de metodologías simétrico al de factores; contadores de `eligible-factors` en `meta.eligible|in_review|incompatible`; `current` de un factor elegible con la forma del `current` de la lista; catálogo nunca cargado = `applied_at` nulo; la lista de factores no trae indicador de evidencia (el marcador por fila solo aparece con el filtro «evidencia pendiente» y, por versión, en el detalle); `required_inputs`/`expected_units`/`boundary` se envían derivados del calculador en lugar de omitirse.
- Correcciones del revisor independiente (2026-11-21): guard de salida (`canDeactivate` + `beforeunload`) con el asistente sucio, `EMISSION_CATALOG_INVALID` eliminado, `*.fixtures.ts` fuera de la compilación de producción, cuatro mensajes de error nuevos, `readiness` solo para administradores (403 degrada a nota), avisos y rechazo 409 `EMISSION_SOURCE_IN_USE` en fuentes, textos de lista/paso 2. Evidencia: `ng test` 813 de 813, `ng build` y producción sin avisos, `npm run lint` 0 errores. Detalle en [../CHANGELOG-dev.md](../CHANGELOG-dev.md).
- Pendiente: costura DTO ↔ esquemas contra el backend real (T5) y comprobación en el navegador; la vista de solo lectura para empresa (D6) sigue sin construirse.
