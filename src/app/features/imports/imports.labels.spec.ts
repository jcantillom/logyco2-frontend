import { formatSize, pendingAction, sampleRowsShort, tripsCount, share, hasVehiclesToReview, percent, phaseLabel, sampleRows, skippedReasonLabel, vehiclesSummary } from './imports.labels';

describe('imports.labels', () => {
  it('traduce las fases de la revisión y usa un texto neutro para las que no conoce', () => {
    expect(phaseLabel('READING')).toBe('Leyendo el archivo');
    expect(phaseLabel('REVIEWING')).toBe('Revisando los datos');
    expect(phaseLabel('DONE')).toBe('Revisión terminada');
    expect(phaseLabel('OTRA')).toBe('Procesando');
    expect(phaseLabel(null)).toBe('En cola, esperando su turno');
  });

  it('el avance sale de las filas procesadas y el total del servidor; sin total es indeterminado', () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(300, 200)).toBe(100);
    expect(percent(10, null)).toBeNull();
    expect(percent(10, 0)).toBeNull();
  });

  it('describe las filas de muestra en singular y plural', () => {
    expect(sampleRows([2])).toBe('fila 2');
    expect(sampleRows([2, 9])).toBe('filas 2, 9');
    expect(sampleRows([])).toBe('');
  });

  it('resume los vehículos detectados en singular y plural y solo ofrece revisar si hay nuevos o con cambios', () => {
    expect(vehiclesSummary({ new: 1, changed: 3, unchanged: 0, pendingDecision: 4 })).toBe('1 vehículo nuevo · 3 con cambios');
    expect(vehiclesSummary({ new: 2, changed: 0, unchanged: 0, pendingDecision: 2 })).toBe('2 vehículos nuevos · 0 con cambios');
    expect(hasVehiclesToReview({ new: 0, changed: 1, unchanged: 5, pendingDecision: 1 })).toBeTrue();
    expect(hasVehiclesToReview({ new: 0, changed: 0, unchanged: 5, pendingDecision: 0 })).toBeFalse();
    expect(hasVehiclesToReview(undefined)).toBeFalse();
  });

  it('un motivo de «sin aplicar» desconocido se muestra con un texto neutro', () => {
    expect(skippedReasonLabel('ALREADY_DECIDED')).toBe('Ya tenían una decisión');
    expect(skippedReasonLabel('NUEVO')).toBe('Otro motivo');
  });

  it('el porcentaje no redondea a 0 % lo que existe ni a 100 % lo que no es todo, y el todo es 100 %', () => {
    expect(share(1, 1_000_000)).toBe(1);
    expect(share(2_999_999, 3_000_000)).toBe(99);
    expect(share(200, 200)).toBe(100);
    expect(share(0, 200)).toBe(0);
    expect(share(5, 0)).toBe(0);
  });

  it('el tamaño del archivo se lee en B, KB, MB o GB con la coma decimal de es-CO', () => {
    expect(formatSize(900)).toBe('900 B');
    expect(formatSize(20480)).toBe('20 KB');
    expect(formatSize(3_500_000)).toBe('3,3 MB');
    expect(formatSize(612_000_000)).toBe('584 MB');
    expect(formatSize(5 * 1024 ** 3)).toBe('5 GB');
  });

  it('cada código de motivo conocido tiene una acción en lenguaje llano y uno desconocido no inventa ninguna', () => {
    expect(pendingAction('MISSING_DISTANCE_WITH_ROUTE')).toBe('Agrega la distancia en km de cada viaje.');
    expect(pendingAction('DISTANCE_WITHOUT_EFFICIENCY')).toBe('Agrega el rendimiento del vehículo (km por galón, litro o m³).');
    expect(pendingAction('MISSING_ENERGY_DATA')).toBe('Agrega el consumo de combustible, o la distancia y el rendimiento.');
    expect(pendingAction('MISSING_UNIT')).toBe('Indica la unidad correcta (gal, l, m3 o kWh).');
    expect(pendingAction('UNSUPPORTED_UNIT')).toBe(pendingAction('MISSING_UNIT'));
    expect(pendingAction('ELECTRIC_NEEDS_KWH')).toBe('Registra el consumo eléctrico en kWh.');
    expect(pendingAction('NO_EMISSION_FACTOR')).toBe('Este combustible aún no tiene factor de emisión verificado: no se puede calcular por ahora.');
    expect(pendingAction('INVALID_VALUES')).toBe('Corrige los valores que no son números o están fuera de rango.');
    expect(pendingAction('OTRO_CODIGO')).toBeNull();
  });

  it('las filas de ejemplo se leen cortas: una, dos o varias', () => {
    expect(sampleRowsShort([])).toBe('');
    expect(sampleRowsShort([4])).toBe('Ej.: fila 4');
    expect(sampleRowsShort([4, 9])).toBe('Ej.: filas 4 y 9');
    expect(sampleRowsShort([4, 9, 12])).toBe('Ej.: filas 4, 9 y 12');
  });

  it('los viajes se cuentan con separador de miles y plural correcto', () => {
    expect(tripsCount(1)).toBe('1 viaje');
    expect(tripsCount(2_645_000)).toBe('2.645.000 viajes');
  });
});
