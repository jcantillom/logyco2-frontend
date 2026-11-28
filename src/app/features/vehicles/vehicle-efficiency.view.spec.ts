import { remainingText } from './vehicle-efficiency.view';

describe('vehicle-efficiency.view', () => {
  it('lo que falta por revisar es una cota superior: «Hasta N viajes por revisar»', () => {
    expect(remainingText(4000)).toBe('Hasta 4.000 viajes por revisar. Continúa para terminar.');
    expect(remainingText(1)).toBe('Hasta 1 viaje por revisar. Continúa para terminar.');
  });
});
