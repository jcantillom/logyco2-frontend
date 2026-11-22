import { messageFor } from '../../core/errors/error-catalog';

describe('catálogo de errores de vehículos', () => {
  it('cada código nuevo del contrato tiene un mensaje en español que dice qué pasó y qué hacer', () => {
    const codes: Record<string, RegExp> = {
      VEHICLE_ALREADY_REGISTERED: /Esta placa ya está registrada en tu empresa/,
      VEHICLE_STRUCTURAL_CONFIRMATION_REQUIRED: /Marca la confirmación/,
      VEHICLE_NOT_FOUND: /Vuelve a la lista/,
      ANALYSIS_NOT_FOUND: /Vuelve a cargar el archivo/,
      FINDING_NOT_FOUND: /Actualiza la revisión/,
      ANALYSIS_NOT_COMPLETED: /Espera a que finalice/,
      FINDING_STALE: /^El vehículo cambió después del análisis\. Vuelve a analizar el archivo o revisa los datos actuales\.$/,
      FILE_TOO_LARGE: /Divídelo en partes/,
      UNSUPPORTED_FILE: /\.xlsx/,
    };

    for (const [code, expected] of Object.entries(codes)) expect(messageFor(code, 400)).withContext(code).toMatch(expected);
  });
});
