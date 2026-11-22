import { monthLabel, monthSlots, periodKind, periodMonths, periodRangeLabel } from './period';

describe('periodo de los viajes (lógica pura)', () => {
  describe('periodKind: por meses calendario que abarcan las fechas', () => {
    it('1 mes es «Mensual», 3 «Trimestral», 6 «Semestral» y 12 «Anual»', () => {
      expect(periodKind('2026-03-01', '2026-03-31')).toBe('Mensual');
      expect(periodKind('2026-01-05', '2026-03-28')).toBe('Trimestral');
      expect(periodKind('2026-01-01', '2026-06-30')).toBe('Semestral');
      expect(periodKind('2026-01-01', '2026-12-31')).toBe('Anual');
    });

    it('cualquier otra cantidad es «N meses»', () => {
      expect(periodKind('2026-01-10', '2026-02-20')).toBe('2 meses');
      expect(periodKind('2026-01-10', '2026-04-20')).toBe('4 meses');
      expect(periodKind('2026-01-10', '2026-05-20')).toBe('5 meses');
      for (const months of [7, 8, 9, 10, 11]) expect(periodKind('2026-01-01', `2026-${String(months).padStart(2, '0')}-15`)).toBe(`${months} meses`);
      expect(periodKind('2025-01-01', '2026-06-30')).toBe('18 meses');
    });

    it('no supone trimestres calendario: feb–abr también es trimestral', () => {
      expect(periodKind('2026-02-03', '2026-04-27')).toBe('Trimestral');
    });

    it('cuenta bien el cruce de año: nov–ene son 3 meses', () => {
      expect(periodMonths('2025-11-15', '2026-01-10')).toBe(3);
      expect(periodKind('2025-11-15', '2026-01-10')).toBe('Trimestral');
      expect(periodKind('2025-07-01', '2026-06-30')).toBe('Anual');
    });

    it('un solo día o el mismo mes es «Mensual»', () => {
      expect(periodKind('2026-05-17', '2026-05-17')).toBe('Mensual');
      expect(periodKind('2026-05-02', '2026-05-30')).toBe('Mensual');
    });

    it('si from es posterior a to se intercambian', () => {
      expect(periodKind('2026-03-28', '2026-01-05')).toBe('Trimestral');
      expect(periodRangeLabel('2026-03-28', '2026-01-05')).toBe('Ene 2026 a Mar 2026');
    });

    it('con fechas inválidas devuelve null', () => {
      expect(periodKind('', '2026-03-01')).toBeNull();
      expect(periodKind('2026-03-01', 'no es fecha')).toBeNull();
      expect(periodKind('2026-13-01', '2026-03-01')).toBeNull();
      expect(periodKind('2026-02-31', '2026-03-01')).toBeNull();
      expect(periodMonths('x', 'y')).toBeNull();
    });
  });

  describe('periodRangeLabel', () => {
    it('«Ene 2026 a Mar 2026»: mes abreviado en español con mayúscula inicial y año', () => {
      expect(periodRangeLabel('2026-01-05', '2026-03-28')).toBe('Ene 2026 a Mar 2026');
      expect(periodRangeLabel('2025-11-01', '2026-01-31')).toBe('Nov 2025 a Ene 2026');
    });

    it('si desde y hasta caen en el mismo mes (o el mismo día) es solo «Nov 2026»', () => {
      expect(periodRangeLabel('2026-11-03', '2026-11-27')).toBe('Nov 2026');
      expect(periodRangeLabel('2026-11-15', '2026-11-15')).toBe('Nov 2026');
    });

    it('la zona horaria no mueve el día ni el mes: el 1 y el 31 se quedan en su mes', () => {
      expect(periodRangeLabel('2026-03-01', '2026-03-31')).toBe('Mar 2026');
      expect(periodRangeLabel('2026-01-01T00:00:00Z', '2026-03-31T23:59:59Z')).toBe('Ene 2026 a Mar 2026');
      expect(periodRangeLabel('2026-12-31', '2027-01-01')).toBe('Dic 2026 a Ene 2027');
    });

    it('los doce meses salen con su abreviatura en español (sin punto)', () => {
      const labels = Array.from({ length: 12 }, (_, m) => periodRangeLabel(`2026-${String(m + 1).padStart(2, '0')}-10`, `2026-${String(m + 1).padStart(2, '0')}-10`)!);

      expect(labels.every((l) => /^[A-Z][a-zé]{2,3} 2026$/.test(l))).toBeTrue();
      expect(labels[0]).toBe('Ene 2026');
      expect(labels[7]).toBe('Ago 2026');
    });

    it('con fechas inválidas devuelve null', () => {
      expect(periodRangeLabel('', '')).toBeNull();
      expect(periodRangeLabel('2026-03-01', '')).toBeNull();
    });
  });

  describe('monthSlots: una ranura por mes calendario del periodo', () => {
    it('un mes', () => {
      expect(monthSlots('2026-03-05', '2026-03-28')).toEqual(['2026-03']);
    });

    it('un trimestre', () => {
      expect(monthSlots('2026-01-05', '2026-03-28')).toEqual(['2026-01', '2026-02', '2026-03']);
    });

    it('cruza el año', () => {
      expect(monthSlots('2025-11-15', '2026-02-10')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    });

    it('si from es posterior a to se intercambian; con fechas inválidas devuelve vacío', () => {
      expect(monthSlots('2026-03-28', '2026-01-05')).toEqual(['2026-01', '2026-02', '2026-03']);
      expect(monthSlots('x', '2026-01-01')).toEqual([]);
    });

    it('limita a los 24 meses más recientes (y acepta otro límite)', () => {
      const slots = monthSlots('2023-01-01', '2026-06-30');

      expect(slots.length).toBe(24);
      expect(slots[0]).toBe('2024-07');
      expect(slots[23]).toBe('2026-06');
      expect(monthSlots('2026-01-01', '2026-12-31', 3)).toEqual(['2026-10', '2026-11', '2026-12']);
    });
  });

  describe('monthLabel', () => {
    it('«Ene 2026» para un mes YYYY-MM; null si no es válido', () => {
      expect(monthLabel('2026-01')).toBe('Ene 2026');
      expect(monthLabel('2026-12-15')).toBe('Dic 2026');
      expect(monthLabel('nope')).toBeNull();
      expect(monthLabel('2026-13')).toBeNull();
    });
  });
});
