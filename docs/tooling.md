# Tooling, build, lint y test

> **[V]** verificado leyendo los archivos · **[?]** no comprobado (no se ejecutó nada). Visión general: [architecture.md](architecture.md).

## Resumen

Proyecto Angular 20 (`@angular/build:application`, esbuild) con npm como gestor, SCSS, Karma/Jasmine para pruebas y ESLint flat config con `angular-eslint`. Hay 8 scripts npm más `env` y sus hooks `pre*`; `npm start` sirve en `http://localhost:4200` contra el backend en `http://127.0.0.1:8120` (prefijo `/api/v1`). El build de producción es la configuración por defecto de `ng build`; la configuración por entorno sale de `.env` o de variables del proceso (`scripts/generate-env.mjs`, sin `fileReplacements`). No hay dependencias de UI, estado ni gráficos de terceros: solo Angular, RxJS, zone.js y tslib. No hay CI, e2e, Prettier instalado ni cobertura configurada. El repositorio aún no tiene commits.

## Tabla de contenidos

1. [Cómo correr](#1-cómo-correr)
2. [Scripts de package.json](#2-scripts)
3. [Dependencias y propósito](#3-dependencias)
4. [angular.json](#4-angularjson)
5. [TypeScript](#5-typescript)
6. [ESLint](#6-eslint)
7. [Tests](#7-tests)
8. [Estilos y assets](#8-estilos-y-assets)
9. [Entornos](#9-entornos)
10. [Editor](#10-editor)
11. [Hallazgos de calidad](#11-hallazgos-de-calidad)
12. [Cómo extender](#12-cómo-extender)

---

## 1. Cómo correr

```bash
npm install
npm start                 # ng serve, configuración development, http://localhost:4200
npm run lint              # ng lint (ESLint sobre src/**/*.ts y src/**/*.html)
npm run test:ci           # Karma + ChromeHeadless, una sola pasada
npm run build:prod        # dist/logyco2-frontend; exige APP_ENV=production
```

- Antes de nada: `cp .env.example .env` (y ajuste los valores). El backend FastAPI debe estar en `API_BASE_URL` (por defecto `http://127.0.0.1:8120`) y tener el origen del frontend en su `CORS_ALLOWED_ORIGINS`. [V]
- Para tests: Chrome requerido; en macOS el README sugiere `export CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. [V]
- En producción el pipeline define `APP_ENV=production`, `API_BASE_URL`, `API_PREFIX` y `SESSION_PERSISTENCE=memory` como variables de entorno; `npm run build:prod` falla si falta alguna, si `APP_ENV` no es `production` o si la sesión no es `memory`. [V]

## 2. Scripts

| Script | Comando | Descripción |
|---|---|---|
| `ng` | `ng` | CLI de Angular |
| `start` | `ng serve` | dev-server (`defaultConfiguration: development`) |
| `build` | `ng build` | `defaultConfiguration: production` |
| `watch` | `ng build --watch --configuration development` | build incremental |
| `test` | `ng test` | Karma en modo watch |
| `lint` | `ng lint` | `@angular-eslint/builder:lint` |
| `test:ci` | `ng test --watch=false --browsers=ChromeHeadless` | pasada única para CI |
| `build:prod` | `ng build --configuration production` | build de producción explícito |

Config de Prettier embebida en `package.json`: `printWidth: 100`, `singleQuote: true`, parser `angular` para `*.html`. No hay script `format` ni dependencia `prettier`. [V]

## 3. Dependencias

`private: true`, `version: 0.0.0`, nombre `logyco2-frontend`.

| Paquete | Versión | Propósito |
|---|---|---|
| `@angular/common`, `compiler`, `core`, `forms`, `platform-browser`, `router` | `^20.3.0` | framework (`forms`: `ReactiveFormsModule`/`FormBuilder` en `company-profile`, `company-links`, `accept-invitation`, `activate-account` y otras features [V]) |
| `rxjs` | `~7.8.0` | observables en puertos/facades/interceptors |
| `tslib` | `^2.3.0` | helpers TS (`importHelpers: true`) |
| `zone.js` | `~0.15.0` | change detection con Zone (polyfill en `build` y `test`) |
| `@angular/build` | `^20.3.43` | builders `application`, `dev-server`, `karma`, `extract-i18n` |
| `@angular/cli` | `^20.3.43` | CLI |
| `@angular/compiler-cli` | `^20.3.0` | compilador AOT |
| `typescript` | `~5.9.2` | |
| `eslint` | `^9.39.1` | |
| `angular-eslint` | `20.7.0` (fijada) | reglas Angular (TS + templates + accesibilidad) |
| `typescript-eslint` | `8.46.4` (fijada) | reglas TS |
| `karma`, `karma-chrome-launcher`, `karma-coverage`, `karma-jasmine`, `karma-jasmine-html-reporter` | `~6.4.0`, `~3.2.0`, `~2.2.0`, `~5.1.0`, `~2.1.0` | runner de pruebas |
| `jasmine-core`, `@types/jasmine` | `~5.9.0`, `~5.1.0` | framework de pruebas |

Ausentes (confirmado en `package.json`): Angular Material/CDK, NgRx, librerías de gráficos, `@angular/animations`, `prettier`, Playwright/Cypress, husky/lint-staged. [V]

## 4. `angular.json`

Proyecto único `logyco2-frontend` (`projectType: application`, `prefix: app`, `sourceRoot: src`, `schematics` de componente con estilo `scss`; `cli.packageManager: npm`; `schematicCollections: ["angular-eslint"]`).

| Target | Builder | Opciones clave |
|---|---|---|
| `build` | `@angular/build:application` | `browser: src/main.ts`, `polyfills: [zone.js]`, `tsConfig: tsconfig.app.json`, `inlineStyleLanguage: scss`, `assets: public/**/*`, `styles: [src/styles.scss]` |
| `build:production` (default) | | `outputHashing: all`; budgets: `initial` warn 700 kB / error 1.2 MB; `anyComponentStyle` warn 12 kB / error 16 kB |
| `build:development` | | `optimization: false`, `extractLicenses: false`, `sourceMap: true` |
| `serve` | `@angular/build:dev-server` | `development` por defecto; `production` disponible |
| `extract-i18n` | `@angular/build:extract-i18n` | sin uso (la UI está en español fijo) |
| `test` | `@angular/build:karma` | `polyfills: [zone.js, zone.js/testing]`, `tsconfig.spec.json`, mismos `assets` y `styles`; sin `karma.conf.js` propio |
| `lint` | `@angular-eslint/builder:lint` | `lintFilePatterns: src/**/*.ts, src/**/*.html` |

[V]. Salida de build en `dist/logyco2-frontend/` (ignorada por git: `/dist`). No hay SSR/prerender.

## 5. TypeScript

`tsconfig.json` (raíz): `strict`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `skipLibCheck`, `isolatedModules`, `experimentalDecorators`, `importHelpers`, `target: ES2022`, `module: preserve`. `angularCompilerOptions`: `strictInjectionParameters`, `strictInputAccessModifiers`, `typeCheckHostBindings`, `strictTemplates`, `enableI18nLegacyMessageIdFormat: false`. `files: []` con referencias a `tsconfig.app.json` (incluye `src/**/*.ts`, excluye specs, `types: []`) y `tsconfig.spec.json` (`src/**/*.d.ts`, `src/**/*.spec.ts`, `types: [jasmine]`). Nota: `src/testing/*.ts` (helpers) entran en el build de app porque `tsconfig.app.json` incluye `src/**/*.ts` y solo excluye `*.spec.ts`; no se importan desde código de aplicación, por lo que no entran en el bundle. [V para tsconfig; el no-bundle se infiere de los imports]

## 6. ESLint

`eslint.config.js` (CommonJS, flat config, `tseslint.config`):
- `**/*.ts`: `eslint.configs.recommended` + `tseslint.configs.recommended` + `tseslint.configs.stylistic` + `angular.configs.tsRecommended`; `processor: angular.processInlineTemplates` (lintea los templates inline).
- Reglas propias: `@typescript-eslint/no-unused-vars: error` con `argsIgnorePattern: '^_'` (parámetros obligatorios sin usar); `@angular-eslint/directive-selector` (atributo, prefijo `app`, camelCase); `@angular-eslint/component-selector` (elemento, prefijo `app`, kebab-case).
- `**/*.html`: `templateRecommended` + `templateAccessibility`.
- No hay reglas de límites entre capas (ver H-T3).

## 7. Tests

- Runner: Karma + Jasmine, builder `@angular/build:karma`; sin `karma.conf.js` (configuración por defecto del builder). [V]
- 85 archivos `*.spec.ts` (38 fuera de `features/`, 47 en `features/`), conteo con `find`. Convención: spec junto al archivo. [V]
- Ejecución completa (`ng test --watch=false --browsers=ChromeHeadless`): 935 specs correctos el 2026-11-21 (745 antes de «Mis vehículos») (ver [CHANGELOG-dev.md](CHANGELOG-dev.md)). [V]
- Utilidades: `src/testing/providers.ts` — `provideTestApp({ routes? })` (HttpClient + `provideHttpClientTesting`, `APP_CONFIG` de prueba con `apiBaseUrl: 'http://api.test'`, `provideRepositories()` real y `StubAuthRepository` que no emite), `signInAs(user, session)`; `src/testing/builders.ts` — `buildUser`, `buildSuperAdmin`, `membership`, `ORG_ENVIA`, `ORG_COORDINADORA`, `FAKE_TOKEN`.
- `karma-coverage` está instalado pero no hay script ni configuración de cobertura/umbrales. `test:ci` usa `ChromeHeadless` sin `--no-sandbox` (puede fallar en contenedores Linux/CI como root) [?].

## 8. Estilos y assets

- `src/styles.scss` (675 líneas): `@font-face` de Museo Sans 300 y 700 (`/fonts/MuseoSans-300.otf`, `/fonts/MuseoSans-700.otf`) y de Museo vía `local()` (la fuente de titulares es comercial y no está en el repo); tokens `:root` de la marca LOGYCA 2025 (por ejemplo `--c-primary`, `--c-secondary`, `--c-accent`, `--c-gray*`, `--c-text`, `--c-bg`, `--c-sf`, `--c-bd`, `--c-focus`, parejas `*-bg`/color para success/warning/danger/info, `--c-chart-1..8`, `--sb-*` del menú lateral, `--radius`, `--shadow`, `--sidebar-w`, `--sidebar-w-collapsed`, `--header-h`, `--font`) con variante oscura y paleta `classic`; foco visible global, `.sr-only`, `.skip-link`, layout (`.page`, `.page-header`, `.grid*`, `.row`, `.stack`), `.card`, `.btn*`, formularios (`.field`, `.input`), `.table`/`.table-wrap`, `.badge*` (success, warning, danger, neutral), `.alert*` (success, warning, danger), `.skeleton`, `dialog.dialog`, `.progress`, `.tabs`, `dl.facts`, reglas `.platform-console main …` y media queries `prefers-reduced-motion`, 640 px y 900 px. `.badge-info` y `.alert-info` no están definidas [V]. Sin fuentes remotas. [V]
- `public/` (copiado tal cual por el glob de assets): `favicon.svg`; `fonts/` (`MuseoSans-300.otf`, `MuseoSans-700.otf` y `Inter-OFL-LICENSE.txt`: la licencia se conserva como atribución porque las formas del logo se vectorizaron a partir de Inter bajo OFL; `styles.scss` no referencia Inter [V]); `brand/` (`logo-cli.svg` y `logyca-logo.png` en el login y el pie de marca, `resumen-paisaje.webp` en `PageHeroComponent`, y `logo.png`, imagen de origen de la vectorización del logo que solo se cita en comentarios). [V por listado]

## 9. Entornos

`src/environments/environment.ts` lo **genera** `scripts/generate-env.mjs` desde `.env` o el entorno (valida valores; sin valores por defecto en el código) y exporta `environment: AppConfig` con `apiBaseUrl`, `apiPrefix` y `sessionPersistence`. Variables: `APP_ENV` (`development`/`production`), `API_BASE_URL` (origen sin barra final; vacío solo en producción), `API_PREFIX`, `SESSION_PERSISTENCE` (`tab` solo en desarrollo; `memory` obligatorio en producción). Se inyecta como `APP_CONFIG` (`app.config.ts`). El frontend no debe contener secretos: solo URLs públicas.

## 10. Editor

`.editorconfig`: UTF-8, 2 espacios, final de línea, trim de espacios (excepto `.md`), comillas simples en `.ts`. `.vscode/`: `extensions.json`, `launch.json`, `tasks.json` (tareas `npm start`/`npm test` en segundo plano). `.gitignore` excluye `/dist`, `/tmp`, `/out-tsc`, `/node_modules`, IDEs; conserva `.vscode/{settings,tasks,launch,extensions}.json`. [V]

## 11. Hallazgos de calidad

| ID | Sev. | Archivo | Hallazgo | Sugerencia |
|---|---|---|---|---|
| H-T1 | Media | `package.json` | Config `prettier` presente pero `prettier` no está en devDependencies ni hay script `format`; el formato depende del editor. | Añadir `prettier` + script `format`/`format:check` (y `eslint-config-prettier` si hace falta) |
| H-T2 | Media | `package.json` / repo | Sin pipeline de CI (no hay `.github/`, ni otros archivos de CI visibles en la raíz listada), sin e2e, sin cobertura ni umbrales aunque `karma-coverage` está instalado. | Añadir workflow con `lint` + `test:ci` + `build:prod`; `ng test --code-coverage` y umbral |
| H-T3 | Media | `eslint.config.js` | Sin reglas de límites de capas (domain ↛ infrastructure, core ↛ features). Hoy se cumple por disciplina. | `no-restricted-imports` por carpeta o `eslint-plugin-boundaries` |
| H-T4 | Baja | `package.json` | Versiones de `angular-eslint` y `typescript-eslint` fijadas exactas mientras el resto usa `^`/`~`; coherente con compatibilidad pero requiere actualización manual. | Documentar la política de actualización |
| H-T5 | Baja | `package.json:test:ci` | `ChromeHeadless` sin flags de sandbox: puede fallar en runners Linux como root. | Launcher personalizado `ChromeHeadlessCI` con `--no-sandbox` en un `karma.conf.js` |
| H-T6 | Baja | `angular.json` | Budgets `initial` 700 kB/1.2 MB; `localeEsCo` cuenta en el bundle inicial. | Revisar el tamaño del build de producción cuando crezca [?] |
| H-T7 | Baja | `tsconfig.app.json` | `src/testing/**` queda en el programa de compilación de la app (solo se excluyen `*.spec.ts`). | Excluir `src/testing/**` en `tsconfig.app.json` y añadirlo a `tsconfig.spec.json` |
| H-T8 | Baja | `angular.json` (`extract-i18n`) | Target i18n declarado sin uso; UI hardcodeada en español. | Eliminarlo o planificar i18n (el catálogo de errores ya está "preparado") |
| H-T9 | Baja | `angular.json:cli.analytics` | Contiene un identificador de analítica del CLI (no es un secreto de la app). | Opcional: `ng analytics disable` |
| H-T10 | Info | repo | `CLAUDE.md` indica que el repositorio aún no tiene commits (no se ejecutó `git` al documentar [?]); `dist/` y `.angular/` existen localmente (`/dist` figura en `.gitignore`). | Primer commit como línea base |

SOLID/limpieza: configuración mínima y estándar de Angular CLI; sin duplicación. Seguridad: sin dependencias de terceros fuera del ecosistema Angular (superficie de supply-chain pequeña); `npm audit` no se ejecutó [?].

## 12. Cómo extender

- **Nuevo entorno** (p. ej. staging): no requiere código; el pipeline define las variables (`APP_ENV`, `API_BASE_URL`, …) de ese entorno y ejecuta `npm run build:prod` (si `APP_ENV` admitiera más valores, ampliar `scripts/generate-env.mjs`).
- **Nuevo script**: agregar a `package.json > scripts` (p. ej. `"format": "prettier --write ."` tras instalar `prettier`).
- **Nueva regla de lint**: añadir a `rules` en el bloque `**/*.ts` o `**/*.html` de `eslint.config.js`.
- **Cobertura**: `ng test --code-coverage --watch=false --browsers=ChromeHeadless` (usa `karma-coverage`).
- **Nuevo asset estático**: colocarlo en `public/` (se sirve en la raíz, p. ej. `brand/x.svg` → `/brand/x.svg`; referenciar sin `/` inicial por el `<base href="/">`).
- **Nuevo test**: `*.spec.ts` junto al archivo; usar `provideTestApp()` de `src/testing/providers.ts`.
