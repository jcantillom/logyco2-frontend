/** Granularidades de la serie de huella que acepta el servidor (`granularity`); `month` es la de siempre. */
export const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'semester', 'year'] as const;

export type Granularity = (typeof GRANULARITIES)[number];

export const DEFAULT_GRANULARITY: Granularity = 'month';

/** Texto de cada granularidad: `option` para el control («Diario»), `unit` para el título («por semana») y `adjective` para frases («serie semanal»). */
export const GRANULARITY_TEXT: Readonly<Record<Granularity, { readonly option: string; readonly unit: string; readonly adjective: string }>> = {
  day: { option: 'Diario', unit: 'día', adjective: 'diaria' },
  week: { option: 'Semanal', unit: 'semana', adjective: 'semanal' },
  month: { option: 'Mensual', unit: 'mes', adjective: 'mensual' },
  quarter: { option: 'Trimestral', unit: 'trimestre', adjective: 'trimestral' },
  semester: { option: 'Semestral', unit: 'semestre', adjective: 'semestral' },
  year: { option: 'Anual', unit: 'año', adjective: 'anual' },
};

/** Valida un valor externo (URL, respuesta): solo una granularidad conocida; cualquier otra cosa (incluida una hostil) es la de por defecto. */
export function parseGranularity(value: unknown): Granularity {
  return typeof value === 'string' && (GRANULARITIES as readonly string[]).includes(value) ? (value as Granularity) : DEFAULT_GRANULARITY;
}
