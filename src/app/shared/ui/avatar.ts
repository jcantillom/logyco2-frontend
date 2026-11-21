/** Iniciales y tono estable por empresa (el mismo nombre siempre se ve igual): se reconoce de un vistazo en listas largas. */
export function initialsOf(name: string): string {
  const words = name.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[1]] : [words[0] ?? name]).map((w) => w[0]).join('');
  return (letters.trim() || '·').slice(0, 2).toUpperCase();
}
export function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  // Brand hues only: LOGYCA orange (Pantone 1655 C) or aquamarine (Pantone 3275 C).
  return hash % 2 === 0 ? 17 : 174;
}
