# Feature `settings` (Configuración)

Leyenda: [V] verificado en código; [?] no comprobado.
Código: `src/app/features/settings/settings.component.ts` (148 l.) y `settings.component.spec.ts` (2 `it`). Sin facade.

## 1. Propósito y flujo
Pantalla de cuenta y preferencias: **Mi cuenta** (nombre, correo, estado, roles globales, vigencia de sesión «hora de Bogotá»; la sesión vive solo en memoria de la pestaña), **Apariencia** (tema Claro, Oscuro o Automático; paleta «Marca LOGYCA» o «Clásica»; y «Reducir animaciones», vía `ThemeService`) y **Mis empresas** (botón «Usar esta empresa» cambia la organización activa). No hay interruptor de modo de datos ni lista de contratos de backend. [V]

## 2. Rutas [V]
- Espacio de empresa: `path: 'configuracion'`, `data.breadcrumb: 'Configuración'`, sin `permissionGuard`, lazy, bajo `ShellComponent`.
- Consola de plataforma: `path: 'configuracion'` en `platform.routes.ts`, `data: { breadcrumb: 'Mi cuenta', platform: true }`; con `platform: true` el componente solo muestra la cuenta y la apariencia (sin «Mis empresas»).

## 3. Componentes
### `SettingsComponent` (`app-settings`) - container [V]
- Sin inputs/outputs. Inyecta `SessionStore` (`session`), `OrganizationContext` (`context`), `ThemeService` (`theme`) y `ActivatedRoute` (lee `data['platform']`).
- Métodos: `roleName(code)`, `roleNames(roles)` (ambos con `roleLabel`).
- Template: secciones `.card` con `aria-labelledby`; `data-testid="palette-options"` y `reduce-motion` en Apariencia.

## 4. Servicios usados (core)
`ThemeService` (`core/preferences/theme.service.ts`): preferencia de tema, paleta y reducción de animaciones. `OrganizationContext.select(id)` cambia la organización activa (dispara `reloadOnContextChange` en las demás pantallas y `ContextResetRegistry.resetAll()`).

## 5. Endpoints
Ninguno (solo estado de sesión y preferencias locales).

## 6. Permisos
Ninguno específico.

## 7. Estados
Sin carga asíncrona. Vacíos: «Ninguno» (roles globales), «No perteneces a ninguna empresa.».

## 8. Hallazgos de calidad
| Sev. | Hallazgo | Ubicación | Sugerencia |
|---|---|---|---|
| Baja | `roleName` y `roleNames` son envoltorios de `labels.roleLabel` (también usado en dashboard/users). | `settings.component.ts` (final de la clase) | Usar `roleLabel` directamente en la plantilla o un pipe compartido. |
| Baja | Componente de 148 l. con CSS inline. | `settings.component.ts` | Extraer la sección de apariencia a un presentacional. |

## 9. Cómo extender
Nueva preferencia: añadir sección, estado en un servicio de `core` (no en el componente) y persistir de forma segura (no almacenar secretos).
