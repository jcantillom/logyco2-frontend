import { decodeCode, axlesLabel, factorValue, formatFixed2, formatReceived, pbvMax, safeHttpUrl, unitLabel, volumeTitle } from './emissions.format';
import { MAX_DISTANCE_KM, parseDecimal, positiveDecimal } from './emissions.validators';
import { FormControl } from '@angular/forms';
import { toEmissionFactor } from '../../infrastructure/mappers/emissions.mappers';
import { CODE_GUIDE, factorDto, vehicleDto } from './emissions.fixtures';
import { toFreightVehicle } from '../../infrastructure/mappers/emissions.mappers';

describe('formato y validación de la guía de emisiones', () => {
  it('safeHttpUrl solo acepta http(s)', () => {
    expect(safeHttpUrl('https://example.test/a')).toBe('https://example.test/a');
    expect(safeHttpUrl('http://example.test')).toBe('http://example.test/');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,x')).toBeNull();
    expect(safeHttpUrl('no es una url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });

  it('los decimales del servidor se muestran con coma y sin inventar valor', () => {
    expect(formatReceived('1.980')).toBe('1,980');
    expect(formatReceived('10.149')).toBe('10,149');
    expect(formatReceived('30.0000')).toBe('30,0000');
    expect(formatReceived('8')).toBe('8');
    expect(formatReceived('1234.5')).toBe('1.234,5');
    expect(formatReceived(null)).toBeNull();
    expect(formatReceived('abc')).toBeNull();
    expect(formatReceived('-1.5')).toBeNull();
    expect(unitLabel('kg_CO2/gal')).toBe('kg CO₂/gal');
  });

  it('los ejes se rotulan «N ejes (a + b)» solo cuando hay tractor y remolque', () => {
    expect(axlesLabel({ truckAxles: 3, trailerAxles: 3, totalAxles: 6 })).toBe('6 ejes (3 + 3)');
    expect(axlesLabel({ truckAxles: 2, trailerAxles: 0, totalAxles: 2 })).toBe('2 ejes');
    expect(axlesLabel({ truckAxles: 0, trailerAxles: 1, totalAxles: 1 })).toBe('1 eje');
  });

  it('el valor del factor solo se muestra en los estados que lo permiten', () => {
    expect(factorValue(toEmissionFactor(factorDto()))).toBe('10,1000');
    expect(factorValue(toEmissionFactor(factorDto({ verification_status: 'PENDING_VALIDATION', usable_for_calculation: false })))).toBe('10,1000');
    expect(factorValue(toEmissionFactor(factorDto({ verification_status: 'INVALID_CONFIGURATION', value: '5' })))).toBeNull();
  });

  it('parseDecimal acepta coma o punto y rechaza letras, signos y notación científica', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 300 ')).toBe(300);
    for (const bad of ['-5', '1e3', 'abc', '', '1,2,3', '+4']) expect(parseDecimal(bad)).withContext(bad).toBeNull();
  });

  it('positiveDecimal informa required, number, positive y max', () => {
    const validator = positiveDecimal(MAX_DISTANCE_KM);
    const check = (value: string) => validator(new FormControl(value));

    expect(check('')).toEqual({ required: true });
    expect(check('abc')).toEqual({ number: true });
    expect(check('0')).toEqual({ positive: true });
    expect(check('100001')).toEqual({ max: true });
    expect(check('100000')).toBeNull();
    expect(check('0,5')).toBeNull();
  });

  it('formatFixed2 muestra siempre dos decimales con coma', () => {
    expect(formatFixed2('30.0000')).toBe('30,00');
    expect(formatFixed2('304.5780')).toBe('304,58');
    expect(formatFixed2(null)).toBeNull();
    expect(formatFixed2('x')).toBeNull();
  });

  it('pbvMax usa el mayor PBV verificado: único, el más alto de las variantes, o nada si no está verificado', () => {
    const variants = [{ gross_weight_kg: 31000, tolerance_kg: 500, note: 'A' }, { gross_weight_kg: 36000, tolerance_kg: 500, note: 'B' }, { gross_weight_kg: 32000, tolerance_kg: 500, note: 'C' }];

    expect(pbvMax(toFreightVehicle(vehicleDto()))).toBe(17000);
    expect(pbvMax(toFreightVehicle(vehicleDto({ gross_weight_kg: null, pbv_variants: variants })))).toBe(36000);
    expect(pbvMax(toFreightVehicle(vehicleDto({ verified: false })))).toBeNull();
    expect(pbvMax(toFreightVehicle(vehicleDto({ gross_weight_kg: null })))).toBeNull();
  });

  it('decodeCode parte el código en piezas con el significado de la guía', () => {
    const guide = { letters: CODE_GUIDE.letters, digitRule: CODE_GUIDE.digit_rule, source: null };

    expect(decodeCode('C2S1', guide)).toEqual([{ symbol: 'C', meaning: 'Camión' }, { symbol: '2', meaning: 'El número indica los ejes de esa parte.' }, { symbol: 'S1', meaning: 'Semirremolque' }]);
    expect(decodeCode('R2', guide)).toEqual([{ symbol: 'R2', meaning: 'Remolque' }]);
    expect(decodeCode('C3', guide).map((c) => c.symbol)).toEqual(['C', '3']);
    expect(decodeCode('C2B1', guide).map((c) => c.symbol)).toEqual(['C', '2', 'B1']);
    expect(decodeCode('???', guide)).toEqual([]);
    expect(decodeCode('C2S1', { letters: [], digitRule: '', source: null })[0].meaning).toBeNull();
  });

  it('volumeTitle y unitLabel siguen la unidad del combustible', () => {
    expect(volumeTitle('gal')).toBe('Galones estimados');
    expect(volumeTitle('m3')).toBe('Metros cúbicos estimados');
    expect(volumeTitle(null)).toBe('Volumen estimado');
    expect(unitLabel('kg_CO2/m3')).toBe('kg CO₂/m³');
    expect(unitLabel('km/m3')).toBe('km/m³');
    expect(unitLabel('kg_CO2/gal')).toBe('kg CO₂/gal');
  });
});
