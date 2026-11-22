import { ROUTE_PIN_ICON, TRUCK_ICON } from './icons';

describe('íconos compartidos', () => {
  it('el camión tiene caja, cabina con parabrisas, dos ruedas con buje (círculos) y línea de suelo', () => {
    expect(TRUCK_ICON.match(/M/g)!.length).toBeGreaterThanOrEqual(7);
    expect((TRUCK_ICON.match(/a2 2 0 1 1-4 0 2 2 0 0 1 4 0z/g) ?? []).length).toBe(2);
    expect((TRUCK_ICON.match(/a\.6\.6 0 1 1-1\.2 0 \.6\.6 0 0 1 1\.2 0z/g) ?? []).length).toBe(2);
    expect(TRUCK_ICON).toContain('M3 20.5h18');
  });

  it('el pin sobre la carretera es un único glifo con subtrazados cerrados dentro del lienzo de 24', () => {
    const subpaths = ROUTE_PIN_ICON.split('M').filter(Boolean);

    expect(subpaths.length).toBeGreaterThanOrEqual(8);
    expect(subpaths.every((p) => p.trim().endsWith('z'))).toBeTrue();
    const numbers = (ROUTE_PIN_ICON.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(24);
  });
});
