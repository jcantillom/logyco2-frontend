import { DEFAULT_GRANULARITY, GRANULARITIES, GRANULARITY_TEXT, parseGranularity } from './granularity';

describe('granularity', () => {
  it('acepta las seis granularidades del servidor y la mensual es la de por defecto', () => {
    expect(GRANULARITIES).toEqual(['day', 'week', 'month', 'quarter', 'semester', 'year']);
    for (const g of GRANULARITIES) expect(parseGranularity(g)).toBe(g);
    expect(DEFAULT_GRANULARITY).toBe('month');
  });

  it('cualquier valor desconocido u hostil vuelve a la mensual', () => {
    for (const hostile of [null, undefined, '', 'WEEK', 'week ', 'weekly', '__proto__', 'constructor', '<script>alert(1)</script>', "day'; DROP TABLE", 7, {}, ['week']]) expect(parseGranularity(hostile)).withContext(String(hostile)).toBe('month');
  });

  it('cada granularidad tiene su texto en español', () => {
    expect(GRANULARITIES.map((g) => GRANULARITY_TEXT[g].option)).toEqual(['Diario', 'Semanal', 'Mensual', 'Trimestral', 'Semestral', 'Anual']);
    expect(GRANULARITIES.map((g) => GRANULARITY_TEXT[g].unit)).toEqual(['día', 'semana', 'mes', 'trimestre', 'semestre', 'año']);
  });
});
