// Genera src/environments/environment.ts a partir de variables de entorno.
// Fuentes, de menor a mayor prioridad: archivo `.env` (desarrollo local) y variables del proceso (pipeline/despliegue).
// Falla con un mensaje claro si falta una variable o su valor no es válido; no hay valores por defecto en el código.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDotEnv } from './dotenv.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readDotEnv(path) {
  return existsSync(path) ? parseDotEnv(readFileSync(path, 'utf8')) : {};
}

const source = { ...readDotEnv(resolve(root, '.env')), ...process.env };
const NAMES = ['APP_ENV', 'API_BASE_URL', 'API_PREFIX'];
const missing = NAMES.filter((name) => source[name] === undefined);

if (missing.length > 0) fail(`faltan variables: ${missing.join(', ')}. Defínalas en .env (ver .env.example) o en el entorno.`);

const { APP_ENV, API_BASE_URL, API_PREFIX } = source;
const production = APP_ENV === 'production';
// `npm run build` y `npm run build:prod` (producción por defecto en Angular) exigen APP_ENV=production: así no se publica un bundle con configuración de desarrollo.
const requireProduction = process.argv.includes('--production');

if (!['development', 'production'].includes(APP_ENV)) fail(`APP_ENV debe ser «development» o «production» (recibido «${APP_ENV}»).`);
if (requireProduction && !production) fail(`los builds de producción (npm run build y build:prod) exigen APP_ENV=production (recibido «${APP_ENV}»).`);
if (!/^\/[\w\-/]*[\w-]$/.test(API_PREFIX)) fail(`API_PREFIX debe empezar por «/» y no terminar en «/» (recibido «${API_PREFIX}»).`);
if (API_BASE_URL !== '' && !/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(API_BASE_URL)) {
  fail(`API_BASE_URL debe estar vacío (mismo origen: recomendado, en desarrollo mediante proxy.conf.json) o ser un origen http(s) sin ruta ni barra final; recibido «${API_BASE_URL}».`);
}

const output = `// GENERADO por scripts/generate-env.mjs desde .env o el entorno. No editar ni versionar.
import { AppConfig } from '../app/core/config/app-config';

export const environment: AppConfig = {
  apiBaseUrl: '${API_BASE_URL}',
  apiPrefix: '${API_PREFIX}',
};
`;

writeFileSync(resolve(root, 'src/environments/environment.ts'), output);
console.log(`environment.ts generado (APP_ENV=${APP_ENV}, API_BASE_URL=${API_BASE_URL || '(mismo origen)'}).`);

function fail(message) {
  console.error(`generate-env: ${message}`);
  process.exit(1);
}
