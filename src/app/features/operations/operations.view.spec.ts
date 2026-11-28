import { countText, dayText, distanceText, efficiencyDisplay, fuelText, kgText, momentText, quantityText, routeText, sharedTone, statusTone, tonsText } from './operations.view';

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

  describe('efficiencyDisplay: de dónde salió el rendimiento del viaje', () => {
    const base = { efficiency: { quantity: 8, unit: 'km/gal' }, efficiencyLabel: null, vehicleEfficiency: null, methodLabel: 'Estimado' };
    const record = { value: 6.9, unit: 'km/gal', origin: 'DECLARED' as const, basis: 'THEORETICAL' as const, note: 'Ficha del fabricante', measuredOn: null, declaredByName: 'Ana Prueba', declaredAt: '2026-11-20T15:00:00Z', isCurrent: true };

    it('sin etiqueta del servidor conserva lo de siempre: el rendimiento de la fila y el método de cálculo', () => {
      expect(efficiencyDisplay(base)).toEqual({ value: '8 km/gal', hint: 'Estimado', tip: null });
    });

    it('lo que la fila declaró se dice con la etiqueta del servidor («Declarado en la fila»)', () => {
      expect(efficiencyDisplay({ ...base, efficiencyLabel: 'Declarado en la fila' })).toEqual({ value: '8 km/gal', hint: 'Declarado en la fila', tip: null });
    });

    it('con el del vehículo muestra el valor del registro (la fila no trae rendimiento), su origen y base, la fecha y, como ayuda, la nota y quién lo declaró', () => {
      const display = efficiencyDisplay({ ...base, efficiency: { quantity: null, unit: null }, efficiencyLabel: 'Declarado para el vehículo', vehicleEfficiency: record });

      expect(display.value).toBe('6,9 km/gal');
      expect(display.hint).toBe('Declarado para el vehículo (Teórico) · 20/11/2026');
      expect(display.tip).toBe('Ficha del fabricante · Declarado el 20/11/2026 · por Ana Prueba');
    });

    it('sin etiqueta del servidor no inventa «Declarado para el vehículo»: usa el origen del registro', () => {
      expect(efficiencyDisplay({ ...base, vehicleEfficiency: record }).hint).toBe('Declarado (Teórico) · 20/11/2026');
      expect(efficiencyDisplay({ ...base, vehicleEfficiency: { ...record, origin: 'MEASURED', basis: null } }).hint).toBe('Medido · 20/11/2026');
    });

    it('un estimado por referencia dice la etiqueta del servidor «Estimado (referencia UPME)» y la base teórica, sin que la pantalla la infiera', () => {
      const estimated = { ...record, origin: 'ESTIMATED' as const, note: 'Tabla 2.8, PDF p. 32', declaredByName: null };

      expect(efficiencyDisplay({ ...base, efficiencyLabel: 'Estimado (referencia UPME)', vehicleEfficiency: estimated }).hint).toBe('Estimado (referencia UPME) (Teórico) · 20/11/2026');
      expect(efficiencyDisplay({ ...base, vehicleEfficiency: estimated }).hint).toBe('Estimado (Teórico) · 20/11/2026');
    });

    it('un registro medido usa la fecha de la medición, y uno reemplazado avisa que el viaje usó un valor anterior', () => {
      const display = efficiencyDisplay({ ...base, efficiencyLabel: 'Medido', vehicleEfficiency: { ...record, origin: 'MEASURED', basis: 'REAL', measuredOn: '2026-11-01', note: null, declaredByName: null, isCurrent: false } });

      expect(display.hint).toBe('Medido (Real) · valor anterior · 01/11/2026');
      expect(display.tip).toBe('Medido el 01/11/2026 · El vehículo tiene ahora otro rendimiento; este viaje no se recalcula solo');
    });
  });
});
