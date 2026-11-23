import { formatClock, formatDuration } from './duration';

describe('duration', () => {
  it('formatDuration: segundos, minutos y horas', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(59_999)).toBe('59 s');
    expect(formatDuration(72_000)).toBe('1 min 12 s');
    expect(formatDuration(120_000)).toBe('2 min');
    expect(formatDuration(110_000)).toBe('1 min 50 s');
    expect(formatDuration(3_900_000)).toBe('1 h 05 min');
    expect(formatDuration(7_200_000 + 59_000)).toBe('2 h 00 min');
  });

  it('formatClock: mm:ss y h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(72_000)).toBe('01:12');
    expect(formatClock(3_599_999)).toBe('59:59');
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('un valor negativo, NaN o infinito se muestra como cero', () => {
    for (const bad of [-5_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatDuration(bad)).toBe('0 s');
      expect(formatClock(bad)).toBe('00:00');
    }
  });
});
