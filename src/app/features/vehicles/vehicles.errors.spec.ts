import { ERROR_MESSAGES, messageFor } from '../../core/errors/error-catalog';

describe('catálogo de errores de vehículos', () => {
  it('cada código del contrato tiene un mensaje en español que dice qué pasó y qué hacer', () => {
    const codes: Record<string, RegExp> = {
      VEHICLE_ALREADY_REGISTERED: /Esta placa ya está registrada en tu empresa/,
      VEHICLE_STRUCTURAL_CONFIRMATION_REQUIRED: /Marca la confirmación/,
      VEHICLE_NOT_FOUND: /Vuelve a la lista/,
      INVALID_PLATE: /formato correcto/,
      INVALID_VEHICLE_FIELD: /Revisa los campos marcados/,
    };

    for (const [code, expected] of Object.entries(codes)) expect(messageFor(code, 400)).withContext(code).toMatch(expected);
  });

  it('no quedan mensajes de análisis de archivos, hallazgos ni notificaciones', () => {
    expect(Object.keys(ERROR_MESSAGES).filter((code) => /^(ANALYSIS_|FINDING_|NOTIFICATION_)|INVALID_FIELDS/.test(code))).toEqual([]);
  });
});
