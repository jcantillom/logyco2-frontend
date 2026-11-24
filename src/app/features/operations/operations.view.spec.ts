import { countText, dayText, distanceText, fuelText, kgText, momentText, quantityText, routeText, sharedTone, statusTone, tonsText } from './operations.view';

describe('operations.view', () => {
  it('los conteos acotados llevan «+» y los vacíos no dicen nada', () => {
    expect(countText({ value: 254, capped: false })).toBe('254');
    expect(countText({ value: 10000, capped: true })).toBe('10.000+');
    expect(countText(null)).toBe('');
  });

  it('formatea es-CO: fecha del día sin zona horaria, kg con hasta 3 decimales y «—» sin dato (nunca 0)', () => {
    expect(dayText('2026-03-15')).toBe('15/03/2026');
    expect(dayText(null)).toBe('—');
    expect(kgText(50.745)).toBe('50,745');
    expect(kgText(1234.5)).toBe('1.234,5');
    expect(kgText(null)).toBe('—');
    expect(distanceText(40)).toBe('40');
    expect(distanceText(null)).toBe('—');
    expect(tonsText(18)).toBe('18,0');
    expect(tonsText(null)).toBe('—');
    expect(momentText(null)).toBe('—');
  });

  it('el trayecto usa los nombres legibles y dice «—» cuando falta un extremo; el combustible fuera del vocabulario se ve tal cual', () => {
    expect(routeText({ code: '1', label: 'CALI, VALLE DEL CAUCA' }, { code: '2', label: 'BUGA' })).toBe('Cali, Valle del Cauca → Buga');
    expect(routeText({ code: null, label: null }, { code: '2', label: 'BUGA' })).toBe('— → Buga');
    expect(fuelText('NATURAL_GAS')).toBe('Gas natural');
    expect(fuelText('BIODIESEL')).toBe('BIODIESEL');
    expect(fuelText(null)).toBe('—');
  });

  it('cantidades con su unidad y tonos por estado', () => {
    expect(quantityText({ quantity: 8, unit: 'km/gal' })).toBe('8 km/gal');
    expect(quantityText({ quantity: 5, unit: 'm3' })).toBe('5 m³');
    expect(quantityText({ quantity: null, unit: 'gal' })).toBe('—');
    expect(statusTone('CALCULATED')).toBe('success');
    expect(statusTone('PENDING')).toBe('warning');
    expect(statusTone('BLOCKED')).toBe('danger');
    expect(statusTone('DUPLICATE')).toBe('info');
    expect(sharedTone('CONFIRMED_MATCH')).toBe('success');
    expect(sharedTone('CONFLICTING_DATA')).toBe('danger');
    expect(sharedTone('POSSIBLE_MATCH')).toBe('warning');
  });
});
