Histórico: módulo eliminado el 2026-11-21

# Gobierno de metodologías y factores de emisión (frontend)
Contrato de la API, specs S1–S12 y decisiones D1–D7: **documento de tarea del backend** `logyco2-backend/docs/tasks/emissions-governance.md` (fuente única; aquí no se copia). Esta tarea es **T3** (S9, S4, S7, S12; D2, D5, D6). Sin Git. Pruebas: `ng test` (sin base de datos).

## Tareas
- [x] T3 Ruta y menú, puerto, adaptador HTTP, DTO/mappers, facade, pantalla con pestañas, paneles de detalle, formularios, errores, auditoría, permisos, pruebas y docs — route: delegada (escritor del frontend).

## Log
- Construido (ver [../features/emissions.md](../features/emissions.md)): `features/emissions/` (11 componentes, facade, etiquetas, validadores, estilos y datos de prueba), `domain/models/emissions.ts`, `domain/repositories/emissions.repositories.ts`, `infrastructure/{dto,mappers,repositories}`, enlace en `providers.ts`; ruta real en `platform.routes.ts`; grupo «Descarbonización» en `platform-nav.ts`; categoría `EMISSIONS` y textos `emissions.*` en la auditoría; permisos `methodologies:*`; ocho códigos de error nuevos.
- Evidencia (2026-11-21): `ng test` 729 de 729 (línea base 609); `ng build` y `ng build --configuration production` sin avisos; `npm run lint` sin errores (solo un aviso previo en `src/main.ts`).
- Supuestos (contrato ambiguo; se tomó la lectura más segura): el código de una metodología usa el mismo patrón que el de un factor (`^[A-Z0-9_]{3,60}$`); `POST /factors` y `POST /methodologies` devuelven el ítem de lista; `PATCH /sources/{id}` con la fuente sin uso admite todos los campos; al editar, los opcionales vacíos viajan como `null`; los textos de la versión de metodología son obligatorios en el formulario (aunque el servidor solo lo exige al publicar); no se usa `copy_from_version`.
- Pendiente: costura DTO ↔ esquemas Pydantic contra el backend real (T4) y la vista de solo lectura para empresa (D6).
- Fase 2 (2026-11-21): el formulario largo de versión de metodología, la franja de resumen y las pestañas se rediseñaron en [emissions-catalog.md](emissions-catalog.md) (T4: catálogo, calculadores y asistente). Esta bitácora conserva el estado de la fase 1.
