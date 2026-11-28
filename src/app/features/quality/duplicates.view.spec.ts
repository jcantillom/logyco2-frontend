import { toPossibleDuplicate } from '../../infrastructure/mappers/duplicates.mappers';
import { duplicateTripDto, originalTripDto, possibleDuplicateDto } from '../../../testing/duplicates';
import { comparisonFields, groupLine, idMismatchLine, hasResult, differingLabels, fuelText, isAutoResolved, lineageLine, placeText, qualityNoteLines, vehicleDifferenceViews, resolutionMessage, ruleSentence, tripDateText } from './duplicates.view';

const pair = (overrides = {}) => toPossibleDuplicate(possibleDuplicateDto(overrides));
const field = (item: ReturnType<typeof pair>, key: string) => comparisonFields(item).find((f) => f.key === key)!;

describe('duplicates.view', () => {
  it('muestra solo lo necesario para decidir, en el mismo orden para A y B', () => {
    expect(comparisonFields(pair()).map((f) => f.label)).toEqual(['Fecha', 'Placa', 'Identificador', 'Origen y destino', 'Combustible', 'Consumo', 'Distancia', 'Emisiones calculadas', 'Archivo de origen']);
  });

  it('da formato es-CO: fecha corta, lugares legibles, miles, unidad y archivo con su fila', () => {
    const item = pair({ a: duplicateTripDto({ distance_km: '1234.5000', kg_co2: '12345.6700' }) });

    expect(field(item, 'date').a).toMatch(/14 de oct\.? de 2026/);
    expect(field(item, 'route').a).toBe('Bogotá, D.C. → Medellín');
    expect(field(item, 'fuel').a).toBe('Diésel');
    expect(field(item, 'consumption').a).toBe('300 gal');
    expect(field(item, 'distance').a).toBe('1.234,5 km');
    expect(field(item, 'emissions').a).toBe('12.345,67 kg CO₂');
    expect(field(item, 'file').a).toBe('operaciones-octubre.xlsx · fila 14');
    expect(field(item, 'file').b).toBe('operaciones-septiembre.xlsx · fila 9');
  });

  it('destaca lo que el servidor marca como distinto y también lo que realmente difiere (placa, fecha, identificador, archivo)', () => {
    const item = pair({ a: duplicateTripDto({ plate: 'XYZ789', trip_id: 'V-9', trip_date: '2026-10-15' }), differences: ['distance_km'] });
    const differing = differingLabels(comparisonFields(item));

    expect(differing).toEqual(['Fecha', 'Placa', 'Identificador', 'Distancia', 'Archivo de origen']);
    expect(field(item, 'fuel').differs).toBeFalse();
    expect(field(item, 'emissions').differs).toBeFalse();
  });

  it('dos valores que difieren en un decimal que la pantalla redondea igual se destacan igual', () => {
    const item = pair({ a: duplicateTripDto({ distance_km: '400.0001' }), differences: [] });

    expect(field(item, 'distance').a).toBe(field(item, 'distance').b);
    expect(field(item, 'distance').differs).toBeTrue();
  });

  it('combustible distinto se destaca con el servidor y con los valores', () => {
    const item = pair({ a: duplicateTripDto({ fuel_type: 'GASOLINE' }), differences: ['fuel_type'] });

    expect(field(item, 'fuel').differs).toBeTrue();
    expect(field(item, 'fuel').a).toBe('Gasolina');
    expect(field(item, 'fuel').b).toBe('Diésel');
  });

  it('sin original (B null) no hay nada que destacar y B muestra «—»', () => {
    const fields = comparisonFields(pair({ b: null }));

    expect(fields.every((f) => !f.differs && f.b === '—')).toBeTrue();
  });

  it('un dato sin valor se muestra «—», nunca 0', () => {
    const item = pair({ a: duplicateTripDto({ trip_id: null, distance_km: null, kg_co2: null, consumption: null }), b: originalTripDto({ trip_id: null, distance_km: null, kg_co2: null, consumption: null }), differences: [] });

    expect(['tripId', 'distance', 'emissions', 'consumption'].map((k) => field(item, k).a)).toEqual(['—', '—', '—', '—']);
  });

  it('los lugares en mayúsculas se leen con inicial mayúscula; un combustible desconocido se muestra legible', () => {
    expect(placeText('SANTA MARTA')).toBe('Santa Marta');
    expect(placeText('CARTAGENA DE INDIAS')).toBe('Cartagena de Indias');
    expect(placeText('SAN ANDRÉS-PROVIDENCIA')).toBe('San Andrés-Providencia');
    expect(fuelText('BIOETHANOL_E85')).toBe('Bioethanol e85');
    expect(tripDateText('no-es-fecha')).toBe('no-es-fecha');
  });

  const rulePair = (rule: string, kind: string | null, over = {}) =>
    toPossibleDuplicate(possibleDuplicateDto({ rule, evidence: kind ? { identical: false, matches: [], differs: [], kind } : null, ...over }));

  it('cada regla se explica en una frase clara; R4 distingue el id con placa inválida del que no trae id', () => {
    expect(ruleSentence(rulePair('R2', null))).toContain('mismo identificador');
    expect(ruleSentence(rulePair('R3', null))).toContain('mismo archivo');
    expect(ruleSentence(rulePair('R4', 'identical'))).toContain('Trae identificador, pero su placa no es válida');
    expect(ruleSentence(rulePair('R4', 'identical', { a: duplicateTripDto({ trip_id: null }) }))).toContain('No trae identificador y coincide en fecha, placa y ruta');
  });

  it('R5 y R6 se explican según la clase de caso del servidor, y siempre dicen que está retenido y no suma hasta decidir', () => {
    expect(ruleSentence(rulePair('R5', 'correction'))).toBe('Misma fecha, placa y ruta que un viaje de una carga anterior, pero con valores distintos: parece una corrección. Está retenido y no suma hasta que decidas.');
    expect(ruleSentence(rulePair('R5', 'identical'))).toContain('no hay seguridad suficiente de que sea un reenvío de las mismas filas');
    expect(ruleSentence(rulePair('R5', 'ambiguous'))).toContain('Hay varios viajes iguales ese día y no se pueden emparejar con seguridad');
    expect(ruleSentence(rulePair('R6', 'extra_row'))).toContain('Hay una fila más de la que había para esa fecha, placa y ruta');

    for (const [rule, kind] of [['R5', 'correction'], ['R5', 'identical'], ['R5', 'ambiguous'], ['R6', 'extra_row'], ['R4', 'identical']]) expect(ruleSentence(rulePair(rule, kind))).toContain('Está retenido y no suma hasta que decidas.');
  });

  it('sin evidencia o con una clase desconocida no falla: R6 es fila adicional, R5 es una frase general y una regla nueva, una frase neutra', () => {
    expect(ruleSentence(rulePair('R6', null))).toContain('fila más');
    expect(ruleSentence(rulePair('R5', null))).toContain('no se puede emparejar con seguridad');
    expect(ruleSentence(rulePair('R5', 'futuro'))).toContain('no se puede emparejar con seguridad');
    expect(ruleSentence(rulePair('R9', null))).toBe('Podría ser el mismo viaje contado dos veces y no hay datos suficientes para confirmarlo. Está retenido y no suma hasta que decidas.');
  });

  const lineageOf = (over = {}) => toPossibleDuplicate(possibleDuplicateDto({ evidence: { identical: false, matches: [], differs: [], kind: 'correction', lineage: { established: true, mutual: false, rows: 27, new_pct: 90, previous_pct: 100, ...over }, group: { existing: 3, new: 4 } } })).evidence;

  it('la línea de linaje solo usa porcentajes, no afirma identidad y distingue linaje establecido, mutuo y débil', () => {
    expect(lineageLine(lineageOf())).toBe('La carga se parece a una anterior: 90 % de sus filas ya estaban en ella y 100 % de las de ella están aquí.');
    expect(lineageLine(lineageOf({ mutual: true, new_pct: 97.5, previous_pct: 96.2 }))).toBe('La carga se parece a una anterior: 97,5 % de sus filas ya estaban en ella y 96,2 % de las de ella están aquí; se repiten casi por completo entre sí.');
    expect(lineageLine(lineageOf({ established: false, new_pct: 10 }))).toBe('Las dos cargas se parecen poco: 10 % de las filas de esta ya estaban en la anterior.');
    expect(lineageLine(lineageOf())).not.toMatch(/misma carga|mismo archivo/);
    expect(lineageLine(null)).toBeNull();
    expect(lineageLine(toPossibleDuplicate(possibleDuplicateDto()).evidence)).toBeNull();
  });

  it('el grupo dice cuántos viajes había y cuántos hay, en singular y plural', () => {
    expect(groupLine(lineageOf())).toBe('Para esa fecha, placa y ruta: antes 3 viajes, ahora 4.');
    expect(groupLine(toPossibleDuplicate(possibleDuplicateDto({ evidence: { identical: false, matches: [], differs: [], kind: 'extra_row', group: { existing: 1, new: 2 } } })).evidence)).toBe('Para esa fecha, placa y ruta: antes 1 viaje, ahora 2.');
    expect(groupLine(null)).toBeNull();
  });

  it('el mensaje de éxito dice qué pasó con los totales, en singular y plural, y avisa de los ya resueltos', () => {
    expect(resolutionMessage('SAME_TRIP', 'EXISTING', { resolved: 1, skipped: 0, withoutResult: 0 })).toBe('Listo. Se conservó el viaje vigente; el retenido queda en el historial y no suma.');
    expect(resolutionMessage('SAME_TRIP', 'NEW', { resolved: 3, skipped: 2, withoutResult: 0 })).toBe('Listo. En 3 viajes se conservó el retenido y quedó vigente; los otros quedan en el historial y ya no suman. 2 no se pudieron resolver porque ya estaban resueltos o su carga no terminó de procesarse.');
    expect(resolutionMessage('DIFFERENT_TRIPS', undefined, { resolved: 1, skipped: 0, withoutResult: 0 })).toBe('Listo. El viaje quedó como un viaje independiente.');
    expect(resolutionMessage('DIFFERENT_TRIPS', undefined, { resolved: 1200, skipped: 0, withoutResult: 0 })).toBe('Listo. 1.200 viajes quedaron como viajes independientes.');
    expect(resolutionMessage('KEEP_PENDING', undefined, { resolved: 1, skipped: 0, withoutResult: 0 })).toBe('Quedó pendiente. Sigue fuera de los totales hasta que se decida.');
    expect(resolutionMessage('KEEP_PENDING', undefined, { resolved: 4, skipped: 0, withoutResult: 0 })).toBe('Quedaron pendientes 4 operaciones. Siguen fuera de los totales hasta que se decida.');
    expect(resolutionMessage('DIFFERENT_TRIPS', undefined, { resolved: 0, skipped: 1, withoutResult: 0 })).toBe('No hubo cambios: 1 no se pudo resolver porque ya estaba resuelto o su carga no terminó de procesarse.');
  });

  it('un viaje tiene resultado calculado solo si trae kg CO₂ (0 es un resultado, vacío no)', () => {
    expect(hasResult(toPossibleDuplicate(possibleDuplicateDto()).a)).toBeTrue();
    expect(hasResult(toPossibleDuplicate(possibleDuplicateDto({ a: duplicateTripDto({ kg_co2: '0.0000' }) })).a)).toBeTrue();
    expect(hasResult(toPossibleDuplicate(possibleDuplicateDto({ a: duplicateTripDto({ kg_co2: null }) })).a)).toBeFalse();
    expect(hasResult(null)).toBeFalse();
  });

  it('si hay viajes vigentes sin resultado calculado el mensaje lo dice (singular y plural) y «Dejar pendiente» no lo agrega', () => {
    expect(resolutionMessage('DIFFERENT_TRIPS', undefined, { resolved: 3, skipped: 0, withoutResult: 1 })).toBe('Listo. 3 viajes quedaron como viajes independientes. 1 de los viajes que dejaste como independientes todavía no tiene resultado calculado, así que no suma emisiones hasta que corrijas sus datos.');
    expect(resolutionMessage('DIFFERENT_TRIPS', undefined, { resolved: 3, skipped: 0, withoutResult: 2 })).toContain('2 de los viajes que dejaste como independientes todavía no tienen resultado calculado, así que no suman emisiones hasta que corrijas sus datos.');
    expect(resolutionMessage('SAME_TRIP', 'NEW', { resolved: 1, skipped: 0, withoutResult: 1 })).toContain('1 de los viajes que dejaste como vigentes todavía no tiene resultado calculado');
    expect(resolutionMessage('KEEP_PENDING', undefined, { resolved: 1, skipped: 0, withoutResult: 0 })).not.toContain('resultado calculado');
  });

  it('la frase del id distinto solo sale con `idMismatch`, no afirma identidad y deja coherente el final de la regla', () => {
    const withMismatch = toPossibleDuplicate(possibleDuplicateDto({ rule: 'R5', evidence: { identical: false, matches: [], differs: [], kind: 'correction', id_mismatch: true } }));

    expect(idMismatchLine(withMismatch.evidence)).toBe('Una de las dos versiones trae el id del viaje y la otra no, por eso se comparan por fecha, placa y ruta.');
    expect(idMismatchLine(withMismatch.evidence)).not.toMatch(/mismo viaje|es el mismo/);
    expect(ruleSentence(withMismatch)).toContain('Está retenido y no suma hasta que decidas.');
    expect(idMismatchLine(rulePair('R5', 'correction').evidence)).toBeNull();
    expect(idMismatchLine(null)).toBeNull();
  });

  describe('resolución automática (R3a)', () => {
    const auto = pair({
      rule: 'R3a',
      evidence: { identical: false, matches: [], differs: [], classification: 'SAME_PHYSICAL_TRIP', auto: true, resolved_by: 'SYSTEM', decided_by_rule: 'R3a', anchor_trip_id: 'trip-b1', vehicle_differs: { tipo_flota: { anchor: 'Propia', this: 'Tercero' }, campo_nuevo: { anchor: null, this: 'x' } }, notes: ['FUEL_CONFLICT_ANCHOR_FUEL_USED', 'OTRA_NOTA'] },
    }).evidence;

    it('mapea los campos opcionales y los omitidos quedan en su valor neutro', () => {
      expect(auto!.auto).toBeTrue();
      expect(auto!.notes).toEqual(['FUEL_CONFLICT_ANCHOR_FUEL_USED']);
      expect(auto!.vehicleDiffers.length).toBe(2);
      expect(pair().evidence).toEqual(jasmine.objectContaining({ auto: false, vehicleDiffers: [], otherDiffers: [], notes: [] }));
      expect(isAutoResolved(auto)).toBeTrue();
      expect(isAutoResolved(pair().evidence)).toBeFalse();
      expect(isAutoResolved(null)).toBeFalse();
    });

    it('traduce los atributos y una clave desconocida se muestra legible, nunca cruda', () => {
      expect(vehicleDifferenceViews(auto)).toEqual([
        { label: 'Tipo de flota', anchor: 'Propia', repeated: 'Tercero' },
        { label: 'Campo nuevo', anchor: '—', repeated: 'x' },
      ]);
      expect(vehicleDifferenceViews(null)).toEqual([]);
    });

    it('la nota de combustible se explica en español y una nota desconocida no se muestra', () => {
      expect(qualityNoteLines(auto)).toEqual(['El combustible no coincide entre los dos registros del archivo. Para el cálculo se usó el combustible del primer registro; conviene revisar el dato en el archivo de origen.']);
      expect(qualityNoteLines(null)).toEqual([]);
    });
  });
});
