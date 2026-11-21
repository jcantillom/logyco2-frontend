# LoGyCO₂ · Frontend (Angular)

> Las reglas globales (ODD, Engram, Skills, RDD, commits convencionales) viven en
> `~/.claude/CLAUDE.md` y no se repiten aquí.

## Documentación primero (obligatorio)

La documentación técnica completa está en `docs/`. **Antes de leer código de `src/`, lee
`docs/README.md`** y el doc de la pieza que vas a tocar. Abre el código solo si el doc marca `[?]`
o para verificar un detalle puntual. Esto evita releer todo el proyecto en cada sesión.

## Mantenimiento de la documentación (obligatorio)

Cada feature nueva, cambio de comportamiento, ruta, componente, servicio, endpoint consumido o
corrección de hallazgo actualiza la documentación **en el mismo trabajo** (detalle y lista en
`docs/README.md`, sección "Regla de mantenimiento"). Siempre:
- Actualizar el doc afectado y agregar una entrada en `docs/CHANGELOG-dev.md`.
- Feature nueva: crear `docs/features/<nombre>.md` y registrarla en `docs/features/README.md`.
- Un cambio sin su actualización de docs está incompleto.

## Reglas del responsable (obligatorias; mandan sobre cualquier otra instrucción)
1. **Sin código basura:** nada sin uso en el repositorio (componentes, utilidades, scripts, código de prueba o *dummy*). Lo que no sirve a la plataforma desplegada no se versiona.
2. **Sin datos quemados:** nada hardcodeado ni datos de ejemplo; todo lo que muestra la plataforma es **data real** del backend.
3. **Producción = ejecutar el código y desplegar**, sin pasos manuales ni nada propio de la máquina del desarrollador. El pipeline de Azure y el repositorio Git se trabajan más adelante.
4. **Documentación solo en `docs/`.** Ningún `.md` suelto fuera de `README.md` y `CLAUDE.md` de la raíz.

## Reglas de arquitectura (verificadas, ver `docs/architecture.md`)
- Capas: `domain` no importa nada · `core` solo importa de `domain` · `infrastructure/providers.ts`
  es el único lugar que enlaza puertos con adaptadores HTTP.
- Módulos sin backend: ruta con `ComingSoonComponent` + ítem de menú con `soon: true` (sin pantalla, facade, puerto ni datos); se construyen cuando exista la API.
- Tests: `provideTestApp()` y helpers de `src/` (ver `docs/tooling.md`).
- Nunca mostrar ni commitear secretos/tokens; de los `environment*.ts` solo nombres de clave.
- Código, comentarios y UI en inglés salvo que el proyecto ya use otro idioma; documentación en español.
- El repo aún no tiene commits: no commitear ni hacer push sin orden expresa; staging por rutas.
