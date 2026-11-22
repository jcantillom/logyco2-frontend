import { findingDto } from '../../../testing/vehicles';
import { toFinding } from '../../infrastructure/mappers/vehicles.mappers';
import { conflictSentence, unreadableNote, hasIncomingValue, needsStructuralConfirmation, phaseLabel } from './analysis.labels';

const diff = (overrides: Record<string, unknown>) => ({ field: 'configuration_code', current: 'C2', incoming: 'C3S3', kind: 'STRUCTURAL', severity: 'HIGH', recommended_action: 'Revisar', ...overrides });

describe('analysis.labels', () => {
  it('traduce las fases del análisis', () => {
    expect(phaseLabel('READING')).toBe('Leyendo el archivo');
    expect(phaseLabel('COMPARING')).toBe('Comparando con tu inventario');
    expect(phaseLabel('DONE')).toBe('Análisis terminado');
    expect(phaseLabel('OTRA')).toBe('Procesando');
    expect(phaseLabel(null)).toBe('En cola, esperando su turno');
  });

  it('la frase de una configuración distinta se arma con los datos del hallazgo', () => {
    const f = toFinding(findingDto({ in_file_conflicts: [], differences: [diff({})] }));

    expect(conflictSentence(f)).toBe('Esta placa ya está registrada como C2, pero el archivo la identifica como C3S3. Revisa cuál información es correcta.');
  });

  it('un conflicto dentro del propio archivo lo dice sin inventar valores', () => {
    expect(conflictSentence(toFinding(findingDto()))).toBe('El archivo trae valores distintos para esta placa.');
  });

  it('una diferencia de severidad media o baja usa un texto más suave y traduce el combustible', () => {
    const f = toFinding(findingDto({ in_file_conflicts: [], differences: [diff({ field: 'fuel_type', current: 'DIESEL', incoming: 'GASOLINE', kind: 'CHANGEABLE', severity: 'MEDIUM' })] }));

    expect(conflictSentence(f)).toBe('El archivo trae un dato distinto al registrado: combustible Diésel → Gasolina. Puede ser un cambio real; decide cuál conservar.');
  });

  it('con varias diferencias comenta la más grave y sin diferencias comparables usa el texto general', () => {
    const f = toFinding(findingDto({ in_file_conflicts: [], differences: [diff({ field: 'model_year', current: '2018', incoming: '2019', kind: 'CHANGEABLE', severity: 'LOW' }), diff({})] }));

    expect(conflictSentence(f)).toContain('registrada como C2');
    expect(conflictSentence(toFinding(findingDto({ in_file_conflicts: [], differences: [diff({ current: null })] })))).toBe('El archivo trae información distinta a la registrada. Revisa cuál es correcta.');
  });

  it('la confirmación estructural solo aplica a configuración o tipo que ya tenían valor', () => {
    expect(needsStructuralConfirmation(toFinding(findingDto()))).toBeTrue();
    expect(needsStructuralConfirmation(toFinding(findingDto({ differences: [diff({ current: null, kind: 'MISSING', severity: 'INFO' })] })))).toBeFalse();
    expect(needsStructuralConfirmation(toFinding(findingDto({ differences: [diff({ field: 'fuel_type', kind: 'CHANGEABLE' })] })))).toBeFalse();
  });

  it('el aviso de valores ilegibles usa las etiquetas en español y no aparece sin campos', () => {
    expect(unreadableNote(toFinding(findingDto({ unreadable_fields: ['fuel_type', 'model_year'] })))).toBe('Valor ilegible en el archivo: Combustible, Modelo');
    expect(unreadableNote(toFinding(findingDto()))).toBeNull();
  });

  it('«usar la información del archivo» solo tiene sentido si hay un valor recibido', () => {
    expect(hasIncomingValue(toFinding(findingDto()))).toBeTrue();
    expect(hasIncomingValue(toFinding(findingDto({ differences: [diff({ incoming: null })] })))).toBeFalse();
  });
});
