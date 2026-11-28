// Pruebas de la validación de `generate-env.mjs` (node --test scripts/generate-env.test.mjs).
// Se ejecuta con APP_ENV/API_* propios y restaura `environment.ts` al terminar.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDotEnv } from './dotenv.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'generate-env.mjs');
const run = (apiBaseUrl) =>
  spawnSync(process.execPath, [script], { env: { ...process.env, APP_ENV: 'development', API_PREFIX: '/api/v1', API_BASE_URL: apiBaseUrl }, encoding: 'utf8' });

describe('generate-env: API_BASE_URL', () => {
  after(() => run(''));

  for (const valid of ['', 'http://localhost:8120', 'https://api.empresa.com', 'http://127.0.0.1:8120']) {
    it(`acepta «${valid}»`, () => assert.equal(run(valid).status, 0));
  }

  for (const hostile of ["http://a'b", 'http://a"b', 'http://a\\b', 'http://u@h', 'http://h/path', 'http://h/', 'http://h:99999999', 'http://[::1]:80', 'javascript:alert(1)', 'http://h;x', 'http://h:80?x=1', 'http://h x']) {
    it(`rechaza «${hostile}»`, () => assert.notEqual(run(hostile).status, 0));
  }
});

describe('dotenv: valores y comentarios', () => {
  const value = (line) => parseDotEnv(line).API_BASE_URL;

  it('vacío con comentario en línea sigue vacío', () => assert.equal(value('API_BASE_URL=   # origen del backend, sin ruta'), ''));
  it('vacío sin comentario', () => assert.equal(value('API_BASE_URL='), ''));
  it('URL con comentario en línea', () => assert.equal(value('API_BASE_URL=http://localhost:8120   # api local'), 'http://localhost:8120'));
  it('recorta espacios finales', () => assert.equal(value('API_BASE_URL=http://localhost:8120   '), 'http://localhost:8120'));
  it('entre comillas conserva la almohadilla', () => assert.equal(value('API_BASE_URL="http://h#x"'), 'http://h#x'));
  it('entre comillas simples con comentario después', () => assert.equal(value("API_BASE_URL='http://h:80' # c"), 'http://h:80'));
  it('una almohadilla pegada (fragmento) NO es comentario y la regla de origen la rechaza', () => {
    assert.equal(value('API_BASE_URL=http://h#frag'), 'http://h#frag');
    assert.notEqual(run('http://h#frag').status, 0);
  });
  it('lee todas las claves y salta líneas ajenas', () => {
    assert.deepEqual(parseDotEnv('# c\nAPP_ENV=development # d\n\nAPI_PREFIX=/api/v1\nruido'), { APP_ENV: 'development', API_PREFIX: '/api/v1' });
  });
});
