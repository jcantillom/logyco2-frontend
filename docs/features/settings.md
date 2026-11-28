# Feature `settings` (Configuración)

Leyenda: [V] verificado en código; [?] no comprobado.
Código: `src/app/features/settings/settings.component.ts` (148 l.) y `settings.component.spec.ts` (2 `it`). Sin facade.

## 1. Propósito y flujo
Pantalla de cuenta y preferencias: **Mi cuenta** (nombre, correo, estado, roles globales, vigencia de sesión «hora de Bogotá»; la sesión se mantiene con una cookie HttpOnly y su vigencia sale de `GET /auth/me`), **Apariencia** (tema Claro, Oscuro o Automático; paleta «Marca LOGYCA» o «Clásica»; y «Reducir animaciones», vía `ThemeService`) y **Mis empresas** (botón «Usar esta empresa» cambia la organización activa). No hay interruptor de modo de datos ni lista de contratos de backend. [V]

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

## 10. Importación de cargas (F3, 2026-11-26)
Nueva sección de la empresa activa (no en la consola de plataforma): `EfficiencySettingsComponent`, ver `features/vehicles.md` §10. Endpoints `GET/PUT /organizations/{id}/vehicles/efficiency/settings`.

## 11. Lugares de tu empresa (2026-11-26)
Tarjeta «Lugares de tu empresa» (solo empresa activa, con `imports:create`: ORG_ADMIN y ORG_ANALYST), junto a «Importación de cargas». `CompanyPlaceChoicesComponent` + `CompanyPlaceChoicesFacade` (`features/settings/`) leen `GET /organizations/{id}/places/choices` y muestran cada elección: texto → municipio (departamento, código), quién y cuándo y la nota. El servidor solo guarda el identificador de quien eligió: se dice «Elegido por ti», «Elegido por otra persona de tu empresa» o «Elegido por una persona que ya no está» (no se inventa un nombre). Contador «N de 1.000 lugares elegidos» (el tope `PLACE_CHOICES_LIMIT` es del contrato; la lista no lo devuelve). Lista de a 6 por página, sin scroll interno; vacío: «Tu empresa aún no ha elegido ningún lugar».
«Deshacer» pide confirmación (`ConfirmService`, acción peligrosa) y explica el alcance: vale para toda la empresa, los viajes guardados con esa elección vuelven a quedar sin municipio (y sin la distancia que salió de la ruta) hasta que se elija otro. Envía `DELETE …/places/choices/{id}`, muestra el resultado del servidor (viajes que volvieron atrás y los que se volvieron a evaluar) en una región `aria-live` y vuelve a leer la lista; un 404 (`PLACE_CHOICE_NOT_FOUND`) se anuncia con `role="alert"`. Ver [imports.md](imports.md) §9.

