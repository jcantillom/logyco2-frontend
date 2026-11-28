// Lector de `.env` con las reglas habituales de dotenv.
// - Un valor sin comillas termina en ` #` (espacios + almohadilla) y se recortan los espacios finales.
// - Un valor entre comillas simples o dobles conserva `#` y espacios internos.
// - `KEY=` (o `KEY=   # comentario`) es el valor vacío.
export function parseDotEnv(text) {
  const values = {};

  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);

    if (!match) continue;

    const raw = match[2].trim();
    const quoted = /^(['"])(.*?)\1(?:\s+#.*)?$/.exec(raw);

    if (quoted) {
      values[match[1]] = quoted[2];
    } else {
      values[match[1]] = raw.replace(/^#.*$/, '').replace(/\s+#.*$/, '').trim();
    }
  }

  return values;
}
