import { vehicleKind } from './vehicle-label';

describe('vehicle-label', () => {
  it('el tipo distingue remolques solos de camiones con remolque', () => {
    expect(vehicleKind({ family: 'TRAILER', truckAxles: 0 })).toBe('Remolque');
    expect(vehicleKind({ family: 'TRAILER', truckAxles: 2 })).toBe('Camión con remolque');
    expect(vehicleKind({ family: 'BALANCED_TRAILER', truckAxles: 0 })).toBe('Remolque balanceado');
  });
});
